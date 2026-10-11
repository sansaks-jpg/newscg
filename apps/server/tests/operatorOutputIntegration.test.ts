import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { Server } from "node:http";
import type { OverlayEvent, OverlayPlaybackState } from "@newscg/shared";
import { createOverlayPlayback } from "../../web/src/overlayPlayback";

let temporaryDirectory: string;
let server: Server;
let baseUrl: string;
let database: typeof import("../src/db.js");

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(method === "POST" && path.startsWith("/api/live/") ? { "Idempotency-Key": randomUUID() } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const value = await response.json();
  expect(response.ok).toBe(true);
  return value;
}

function readEvents(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  return async (): Promise<OverlayEvent> => {
    while (true) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split("\n").find(line => line.startsWith("data: "));
        if (data) return JSON.parse(data.slice(6)) as OverlayEvent;
        continue;
      }
      const next = await reader.read();
      if (next.done) throw new Error("Sambungan SSE terputus sebelum event berikutnya");
      buffer += decoder.decode(next.value, { stream: true });
    }
  };
}

beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "newscg-operator-output-"));
  vi.stubEnv("DATABASE_PATH", join(temporaryDirectory, "output.db"));
  vi.stubEnv("UPLOADS_PATH", join(temporaryDirectory, "uploads"));
  vi.stubEnv("NODE_ENV", "test");
  vi.resetModules();
  const { default: app } = await import("../src/index.js");
  database = await import("../src/db.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done, reject) => { server.once("listening", done); server.once("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port server integrasi tidak tersedia");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
  if (database?.db.open) database.db.close();
  vi.unstubAllEnvs();
  if (temporaryDirectory) {
    const target = relative(resolve(tmpdir()), resolve(temporaryDirectory));
    if (isAbsolute(target) || target.startsWith("..") || !basename(temporaryDirectory).startsWith("newscg-operator-output-")) {
      throw new Error("Lokasi pembersihan tes integrasi tidak aman");
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

describe("operator to output through real HTTP, SQLite and SSE", () => {
  it("isolates a draft, updates Program explicitly, and clears the output via SSE", async () => {
    const rundown = await request("/api/rundowns", "POST", {
      programName: "PROGRAM TES", title: "Edisi tes", items: [{
        slug: "NEWS-01", title: "Judul awal", format: "READER", cgRequired: true,
        graphics: [{ templateType: "HEADLINE", draftFields: {
          headline: "JUDUL PERTAMA", kicker: "EKONOMI", showKicker: "true",
          showLocation: "false", layoutStyle: "single", contentMode: "headline"
        } }]
      }]
    });
    const graphicId: string = rundown.items[0].graphics[0].id;
    const abort = new AbortController();
    const states: OverlayPlaybackState[] = [];
    const playback = createOverlayPlayback(next => states.push(next));
    try {
      const stream = await fetch(`${baseUrl}/api/live/stream?role=output`, { signal: abort.signal });
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      const nextEvent = readEvents(stream.body!.getReader());
      const sync = await nextEvent();
      expect(sync).toMatchObject({ type: "SYNC", onAir: false });
      playback.receive(sync);

      const take = await request("/api/live/take", "POST", { graphicId });
      expect(take.commandStatus).toBe("confirmed");
      const takeEvent = await nextEvent();
      expect(takeEvent.type).toBe("TAKE");
      playback.receive(takeEvent);
      expect(states.at(-1)?.fields?.headline).toBe("JUDUL PERTAMA");
      expect(states.at(-1)?.graphic?.id).toBe(graphicId);

      const draft = await request(`/api/graphics/${graphicId}`, "PATCH", { draftFields: { headline: "JUDUL HASIL EDIT" } });
      expect(draft.draftFields.headline).toBe("JUDUL HASIL EDIT");
      const beforeUpdate = await request("/api/live/state");
      expect(beforeUpdate.onAirSnapshot.headline).toBe("JUDUL PERTAMA");
      expect(states.at(-1)?.fields?.headline).toBe("JUDUL PERTAMA");

      const updated = await request("/api/live/update", "POST", { graphicId });
      expect(updated.commandStatus).toBe("confirmed");
      const updateEvent = await nextEvent();
      expect(updateEvent).toMatchObject({ type: "UPDATE", graphicId, fields: { headline: "JUDUL HASIL EDIT" } });
      playback.receive(updateEvent);
      expect(states.at(-1)?.fields?.headline).toBe("JUDUL HASIL EDIT");

      // A reconnecting monitor must receive the exact persisted Program
      // snapshot, even when draft and output were edited in separate requests.
      const reconnectAbort = new AbortController();
      try {
        const reconnect = await fetch(`${baseUrl}/api/live/stream?role=monitor`, { signal: reconnectAbort.signal });
        expect(reconnect.status).toBe(200);
        const reconnectedSync = await readEvents(reconnect.body!.getReader())();
        expect(reconnectedSync).toMatchObject({ type: "SYNC", onAir: true,
          graphic: { id: graphicId }, fields: { headline: "JUDUL HASIL EDIT" } });
        expect((await request("/api/live/state")).overlayClientsCount).toBe(1);
      } finally { reconnectAbort.abort(); }

      const cleared = await request("/api/live/clear", "POST");
      expect(cleared.commandStatus).toBe("confirmed");
      const clearEvent = await nextEvent();
      expect(clearEvent.type).toBe("CLEAR");
      playback.receive(clearEvent);
      expect(states.at(-1)?.exiting).toBe(true);
      expect((await request("/api/live/state")).onAirGraphicId).toBeNull();
    } finally {
      playback.dispose();
      abort.abort();
    }
  }, 10000);
});
