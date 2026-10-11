import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  apiErrorSchema, broadcastLogoUploadSpec, graphicFieldLimits, graphicRecordSchema, headlineBulletinPreset,
  liveCommandResultSchema, rundownRecordSchema, templateTypes
} from "@newscg/shared";
import type { OverlayEvent } from "@newscg/shared";

let tempRoot: string;
let server: Server;
let baseUrl: string;
let dbModule: typeof import("../src/db.js");
let liveModule: typeof import("../src/live.js");

async function request(path: string, method = "GET", body?: unknown, headers?: Record<string, string>) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  return { status: response.status, headers: response.headers, body: raw ? JSON.parse(raw) : undefined };
}
const graphicInput = { templateType: "HEADLINE", sortOrder: 0, draftFields: { headline: "JUDUL SUMBER", location: "JAKARTA", kicker: "TOPIK", showLocation: "false", showKicker: "false", showDetail: "false", layoutStyle: "single", contentMode: "headline" } };
async function createMaterial() {
  const created = await request("/api/rundowns", "POST", {
    programName: "NEWS TEST", title: "Edisi API agent", items: [
      { slug: "NEWS-01", title: "Berita pertama", format: "PKG", cgRequired: true, sortOrder: 0, estimatedDurationSeconds: 120, graphics: [graphicInput] }
    ]
  });
  expect(created.status).toBe(201);
  return { rundown: created.body, item: created.body.items[0], graphic: created.body.items[0].graphics[0] };
}

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "newscg-agent-api-"));
  const databasePath = join(tempRoot, "agent.db");
  vi.stubEnv("DATABASE_PATH", databasePath);
  vi.stubEnv("UPLOADS_PATH", join(tempRoot, "uploads"));
  vi.stubEnv("NODE_ENV", "test");
  vi.resetModules();
  const { default: app } = await import("../src/index.js");
  dbModule = await import("../src/db.js");
  liveModule = await import("../src/live.js");
  const databases = dbModule.db.pragma("database_list") as Array<{ file: string }>;
  expect(resolve(databases[0]!.file)).toBe(resolve(databasePath));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done, reject) => { server.once("listening", done); server.once("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port server API pengujian tidak tersedia");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  await liveModule.clearAllLive(randomUUID());
  dbModule.db.exec("DELETE FROM on_air_state; DELETE FROM action_logs; DELETE FROM rundowns; DELETE FROM settings;");
});
afterAll(async () => {
  if (server) await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
  if (dbModule?.db.open) dbModule.db.close();
  vi.unstubAllEnvs();
  if (tempRoot) {
    const location = relative(resolve(tmpdir()), resolve(tempRoot));
    if (isAbsolute(location) || location.startsWith("..") || !basename(tempRoot).startsWith("newscg-agent-api-")) throw new Error("Direktori pengujian tidak aman untuk dibersihkan");
    await rm(tempRoot, { recursive: true, force: true });
  }
});

describe("agent discovery and shared API contract", () => {
  it("discovers the API and reads both Markdown guides without changing material or Program", async () => {
    const { rundown } = await createMaterial();
    const beforeState = liveModule.getLiveState();
    const beforeMaster = dbModule.getMasterOverlay();
    const result = await request("/api/agent");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ service: "NewsCG", safety: { materialApprovalRequired: false, materialEditsChangeProgram: false, serverConfirmationProvesRenderedFrame: false } });
    expect(result.body.logo).toMatchObject(broadcastLogoUploadSpec);
    const spec = await request(result.body.links.openapi);
    expect(spec.body.openapi).toBe("3.1.0");
    for (const [name, filename] of [["guide", "AI_AGENT_API.md"], ["rundownGuide", "AI_RUNDOWN_GUIDE.md"], ["cgGuide", "CG_GUIDE.md"]]) {
      const response = await fetch(`${baseUrl}${result.body.links[name]}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      expect(await response.text()).toBe(await readFile(new URL(`../../../docs/${filename}`, import.meta.url), "utf8"));
    }
    expect(dbModule.getRundown(rundown.id)).toEqual(rundown);
    expect(liveModule.getLiveState()).toEqual(beforeState);
    expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
  });

  it("catalogs every real API route and resolves all schema references", async () => {
    const discovery = (await request("/api/agent")).body;
    const spec = (await request(discovery.links.openapi)).body;
    const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    const routes = [...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*"(\/api\/[^\"]+)"/g)]
      .map(match => `${match[1]!.toUpperCase()} ${match[2]!.replace(/:([\w]+)/g, "{$1}")}`).sort();
    expect(discovery.operations.map((operation: any) => `${operation.method} ${operation.path}`).sort()).toEqual(routes);
    expect(new Set(discovery.operations.map((operation: any) => operation.operationId)).size).toBe(routes.length);
    for (const operation of discovery.operations) {
      const declared = spec.paths[operation.path][operation.method.toLowerCase()];
      expect(declared.operationId).toBe(operation.operationId);
      expect(declared["x-newscg-effect"]).toBe(operation.effect);
      expect(declared["x-newscg-requires-live-instruction"]).toBe(operation.effect === "on-air");
    }
    const references = [...JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)];
    expect(references.length).toBeGreaterThan(30);
    for (const [, name] of references) expect(spec.components.schemas[name!]).toBeDefined();
    expect(spec.paths["/api/live/stage"].post["x-newscg-effect"]).toBe("on-air");
    expect(spec.paths["/api/live/stream"].get.parameters[0].example).toBe("monitor");
    expect(spec.paths["/api/live/take"].post.parameters.find((value: any) => value.name === "Idempotency-Key").schema)
      .toMatchObject({ type: "string", minLength: 1, maxLength: 200 });
  });

  it("exposes template-specific required fields and limits while PATCH remains partial", async () => {
    const spec = (await request("/api/agent/openapi.json")).body;
    const schemas = spec.components.schemas;
    expect(schemas.GraphicInput.oneOf).toHaveLength(templateTypes.length);
    for (const type of templateTypes) {
      const required = type === "REPORTER" ? ["name"] : type === "LOCATION" ? ["location"] : type === "SOT" ? ["headline", "name"] : ["headline"];
      expect(schemas[`${type}Fields`].required).toEqual(required);
      for (const [key, limit] of Object.entries(graphicFieldLimits[type])) expect(schemas[`${type}Fields`].properties[key].maxLength).toBe(limit);
      expect(schemas[`${type}Fields`].additionalProperties).toEqual({ type: "string" });
      expect(schemas[`${type}Fields`].properties.visualTemplate.anyOf[0].const).toBe("cnn");
    }
    expect(schemas.GraphicPatch.required).toBeUndefined();
    expect(schemas.GraphicPatch.minProperties).toBe(1);
    expect(schemas.MasterPatch.minProperties).toBe(1);
    expect(schemas.GraphicPatch.anyOf).toContainEqual({ required: ["draftFields"], properties: { draftFields: { minProperties: 1 } } });
    expect(schemas.HEADLINEFields.properties.headlinePresentation).toMatchObject({ enum: ["story", "bulletin"], default: "story" });
    expect(schemas.GraphicPatch.properties.draftFields.additionalProperties).toEqual({ type: "string" });
    expect(JSON.stringify(schemas.GraphicInput)).not.toContain('"status"');
    expect(schemas.RundownInput.properties.items.items.properties.graphics.items.oneOf).toHaveLength(templateTypes.length);
    expect(schemas.StorySave.properties.itemId).toBeDefined();
    expect(schemas.LiveClearAll.properties.immediate.default).toBe(true);
  });

  it("documents accepted legacy graphic metadata in direct and nested create/import requests", async () => {
    const spec = (await request("/api/agent/openapi.json")).body;
    const branches = [
      spec.components.schemas.GraphicInput.oneOf,
      spec.components.schemas.RundownInput.properties.items.items.properties.graphics.items.oneOf,
      spec.components.schemas.StorySave.properties.graphics.items.oneOf,
      spec.components.schemas.RundownImport.anyOf[1].properties.rundown.properties.items.items.properties.graphics.items.oneOf
    ];
    for (const branch of branches) {
      expect(branch).toHaveLength(templateTypes.length);
      const headline = branch.find((entry: any) => entry.properties.templateType.const === "HEADLINE");
      expect(headline).toBeDefined();
      // Older exported payloads can contain status; Zod strips it at runtime.
      expect(headline.additionalProperties).not.toBe(false);
    }
  });
});

describe("rundown schedule and isolated ticker through real HTTP", () => {
  const schedule = { date: "2026-10-11", time: "18:00", timezone: "WIB" };
  const source = { headline: "HEADLINE HASIL RISET", sourceName: "SUMBER TEST", url: "https://example.com/news-test",
    publishedAt: "2026-10-09T17:30:00Z", eventDate: "2026-10-09", accessedAt: "2026-10-10T10:00:00+07:00" };
  const ticker = { text: source.headline, forDate: schedule.date, sources: [source] };
  async function scheduledMaterial() {
    const material = await createMaterial();
    const saved = await request(`/api/rundowns/${material.rundown.id}`, "PATCH", { broadcastSchedule: schedule, ticker });
    expect(saved.status).toBe(200);
    return { ...material, rundown: saved.body };
  }

  it("stores calculated speed per rundown, keeps live speed isolated, and applies auto/manual speed with its ticker", async () => {
    const { rundown, graphic } = await scheduledMaterial();
    const before = dbModule.getMasterOverlay();
    const edit = await request(`/api/rundowns/${rundown.id}`, "PATCH", {
      ticker: { ...ticker, text: "HARGA BERAS NAIK 5 PERSEN", speedMode: "auto", speed: 200, sources: [] }
    });
    expect(edit.status).toBe(200);
    expect(edit.body.ticker).toMatchObject({ speedMode: "auto", speed: 82 });
    expect(dbModule.getMasterOverlay()).toEqual(before);
    await request("/api/live/take", "POST", { graphicId: graphic.id });
    expect(dbModule.getMasterOverlay()).toMatchObject({ tickerRundownId: rundown.id, tickerSpeed: 82 });
    const manual = { ...edit.body.ticker, speedMode: "manual", speed: 95 };
    expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", { ticker: manual })).status).toBe(200);
    expect(dbModule.getMasterOverlay().tickerSpeed).toBe(82);
    const applied = await request("/api/live/ticker", "POST", { rundownId: rundown.id });
    expect(applied.body.master.tickerSpeed).toBe(95);
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    expect(events[0]).toMatchObject({ type: "SYNC", master: { tickerSpeed: 95, tickerRundownId: rundown.id } });
    unsubscribe();
    const exported = (await request(`/api/rundowns/${rundown.id}/export`)).body;
    const imported = await request("/api/rundowns/import", "POST", exported);
    expect(imported.body.ticker).toMatchObject({ speedMode: "manual", speed: 95 });
    expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", { ticker: { ...manual, speed: 251 } })).status).toBe(400);
    expect((await request("/api/live/master", "PATCH", { tickerSpeed: 70 })).status).toBe(400);
    const auto = { ...manual, text: "2026 2027 2028", speedMode: "auto" };
    const saved = await request(`/api/rundowns/${rundown.id}`, "PATCH", { ticker: auto });
    expect(saved.body.ticker).toMatchObject({ speedMode: "auto", speed: 70 });
    expect(dbModule.getMasterOverlay().tickerSpeed).toBe(95);
    expect((await request("/api/live/ticker", "POST", { rundownId: rundown.id, immediate: true })).body.master.tickerSpeed).toBe(70);
  });

  it("saves and exports per-rundown ticker sources without changing Program, and preserves them on import", async () => {
    const beforeMaster = dbModule.getMasterOverlay();
    const beforeProgram = liveModule.getLiveState();
    const { rundown } = await scheduledMaterial();
    expect((await request(`/api/rundowns/${rundown.id}`)).body).toMatchObject({ broadcastSchedule: schedule, ticker });
    expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
    expect(liveModule.getLiveState()).toEqual(beforeProgram);
    const exported = (await request(`/api/rundowns/${rundown.id}/export`)).body;
    const imported = await request("/api/rundowns/import", "POST", exported);
    expect(imported.status).toBe(201);
    expect(imported.body.id).not.toBe(rundown.id);
    expect(imported.body).toMatchObject({ broadcastSchedule: schedule, ticker });
    expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
  });

  it("rejects wrong dates, invalid schedules and sources outside H−2/H−1 without overwriting saved data", async () => {
    const { rundown } = await scheduledMaterial();
    for (const patch of [
      { broadcastSchedule: { ...schedule, date: "2026-10-12" } },
      { broadcastSchedule: { ...schedule, time: "25:00" } },
      { broadcastSchedule: { ...schedule, date: "2026-02-30" } },
      { broadcastSchedule: null },
      { ticker: { ...ticker, forDate: "2026-10-10" } },
      { ticker: { ...ticker, sources: [{ ...source, publishedAt: "2026-10-08T10:00:00+07:00" }] } },
      { ticker: { ...ticker, sources: [{ ...source, publishedAt: "2026-10-10T17:00:00Z" }] } }
    ]) {
      expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", patch)).status).toBe(400);
      expect(dbModule.getRundown(rundown.id)).toEqual(rundown);
    }
    expect((await request("/api/rundowns", "POST", { programName: "TEST", title: "TEST", ticker })).status).toBe(400);
    expect((await request("/api/rundowns/import", "POST", { programName: "TEST", title: "TEST", broadcastSchedule: schedule,
      ticker: { ...ticker, sources: [{ ...source, publishedAt: "2026-10-11T12:00:00+07:00" }] } })).status).toBe(400);
  });

  it("uses the schedule timezone for publication dates across midnight and month boundaries", async () => {
    const { rundown } = await scheduledMaterial();
    const nextSchedule = { date: "2026-11-01", time: "00:30", timezone: "WIT" };
    const nextTicker = { ...ticker, forDate: nextSchedule.date, sources: [{ ...source, publishedAt: "2026-10-29T15:30:00Z" }] };
    expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", { broadcastSchedule: nextSchedule, ticker: nextTicker })).status).toBe(200);
  });

  it("applies only the targeted rundown, keeps edits isolated, retries idempotently, and restores the snapshot on reconnect", async () => {
    const { rundown } = await scheduledMaterial();
    const key = randomUUID();
    const before = (await request("/api/live/state")).body;
    const applied = await request("/api/live/ticker", "POST", { rundownId: rundown.id }, { "Idempotency-Key": key });
    expect(applied.status).toBe(200);
    expect(applied.body.master).toMatchObject({ tickerRundownId: rundown.id, tickerText: ticker.text, tickerForDate: schedule.date });
    expect((await request("/api/live/state")).body).toEqual(before);
    await request(`/api/rundowns/${rundown.id}`, "PATCH", { ticker: { ...ticker, text: "TEKS REVISI", sources: [] } });
    expect(dbModule.getMasterOverlay().tickerText).toBe(ticker.text);
    expect((await request("/api/live/ticker", "POST", { rundownId: rundown.id }, { "Idempotency-Key": key })).body).toEqual(applied.body);
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    expect(events[0]).toMatchObject({ type: "SYNC", master: { tickerText: ticker.text, tickerRundownId: rundown.id } });
    unsubscribe();
    const updated = await request("/api/live/ticker", "POST", { rundownId: rundown.id, immediate: true });
    expect(updated.body.master.tickerText).toBe("TEKS REVISI");
    expect(updated.body.master.tickerRevision).toBeGreaterThan(applied.body.master.tickerRevision);
    expect((await request(`/api/rundowns/${rundown.id}`, "DELETE")).status).toBe(409);
    await request("/api/live/clear-all", "POST", { immediate: true });
    expect(dbModule.getMasterOverlay()).toMatchObject({ tickerText: "", tickerRundownId: null });
    expect((await request(`/api/rundowns/${rundown.id}`, "DELETE")).status).toBe(204);
  });

  it("TAKE switches ticker ownership and never carries another rundown or a legacy global ticker into Program", async () => {
    const first = await scheduledMaterial();
    const second = await createMaterial();
    await request("/api/live/take", "POST", { graphicId: first.graphic.id });
    expect(dbModule.getMasterOverlay()).toMatchObject({ tickerRundownId: first.rundown.id, tickerText: ticker.text });
    expect((await request("/api/live/ticker", "POST", { rundownId: second.rundown.id })).status).toBe(409);
    await request("/api/live/take", "POST", { graphicId: second.graphic.id });
    expect(dbModule.getMasterOverlay()).toMatchObject({ tickerRundownId: second.rundown.id, tickerText: "" });
    const snapshot = dbModule.getMasterOverlay();
    expect((await request("/api/live/master", "PATCH", { tickerText: "GLOBAL TERLARANG", showTicker: true })).status).toBe(400);
    expect((await request("/api/live/master", "PATCH", { tickerRundownId: first.rundown.id })).status).toBe(400);
    expect(dbModule.getMasterOverlay()).toEqual(snapshot);
    expect((await request("/api/live/ticker", "POST", { rundownId: "MISSING" })).status).toBe(409);
    await request("/api/live/clear", "POST");
    expect((await request("/api/live/ticker", "POST", { rundownId: "MISSING" })).status).toBe(404);
    expect((await request("/api/live/ticker", "POST", { rundownId: second.rundown.id }, { "Idempotency-Key": "x".repeat(201) })).status).toBe(400);
  });

  it("ignores legacy global ticker storage and rolls back ticker snapshot when TAKE fails to save", async () => {
    dbModule.db.prepare("INSERT INTO settings(key,value) VALUES ('master_overlay',?)").run(JSON.stringify({ tickerText: "LEGACY GLOBAL" }));
    expect(dbModule.getMasterOverlay().tickerText).toBe("");
    const { graphic } = await scheduledMaterial();
    const beforeMaster = dbModule.getMasterOverlay();
    dbModule.db.exec("CREATE TRIGGER reject_ticker_program BEFORE INSERT ON on_air_state BEGIN SELECT RAISE(ABORT, 'Program test failed'); END");
    try {
      const result = await request("/api/live/take", "POST", { graphicId: graphic.id });
      expect(result.body.commandStatus).toBe("failed");
      expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
      expect(dbModule.getGraphic(graphic.id)?.lastPushedFields).toBeNull();
    } finally { dbModule.db.exec("DROP TRIGGER reject_ticker_program"); }
  });
});

describe("agent material editing through real HTTP", () => {
  it("converts the legacy side label into editable topic fields while leaving Program isolated", async () => {
    const { item } = await createMaterial();
    const created = await request(`/api/items/${item.id}/graphics`, "POST", { templateType: "HEADLINE", draftFields: {
      headline: "HIGHLIGHT LAMA", headlinePresentation: "bulletin", headlineLabel: "HEADLINE", showKicker: "false"
    } });
    expect(created.status).toBe(201);
    const result = await request(`/api/graphics/${created.body.id}`, "PATCH", { draftFields: { headline: "HIGHLIGHT REVISI" } });
    expect(result.status).toBe(200);
    expect(result.body.draftFields).toMatchObject({ kicker: "HIGHLIGHT", showKicker: "true" });
    expect(result.body.draftFields).not.toHaveProperty("headlineLabel");
    const hidden = await request(`/api/graphics/${created.body.id}`, "PATCH", { draftFields: { kicker: "", showKicker: "false" } });
    expect(hidden.body.draftFields).toMatchObject({ kicker: "", showKicker: "false" });
    expect((await request(`/api/graphics/${created.body.id}`)).body).toEqual(hidden.body);
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();
  });
  it("discovers, creates, edits and reorders opening headlines without changing Program until UPDATE", async () => {
    const discovery = (await request("/api/agent")).body;
    const preset = discovery.graphicPresets.find((value: any) => value.id === "headline-bulletin");
    expect(preset.draftFields).toEqual(headlineBulletinPreset);
    const { rundown, item } = await createMaterial();
    const created = await request(`/api/items/${item.id}/graphics`, "POST", {
      templateType: preset.templateType, sortOrder: 1, draftFields: { ...preset.draftFields, headline: "HEADLINE PEMBUKA PERTAMA" }
    });
    expect(created.status).toBe(201);
    const graphic = created.body;
    expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(graphic);
    await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": randomUUID() });
    const before = (await request("/api/live/state")).body;
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      const patch = await request(`/api/graphics/${graphic.id}`, "PATCH", {
        draftFields: { headline: "HEADLINE PEMBUKA REVISI", kicker: "BERITA UTAMA" }
      });
      expect(patch.status).toBe(200);
      expect(patch.body.draftFields).toMatchObject({ ...preset.draftFields, headline: "HEADLINE PEMBUKA REVISI", kicker: "BERITA UTAMA" });
      expect(patch.body.draftFields).not.toHaveProperty("headlineLabel");
      for (const draftFields of [{ kicker: "X".repeat(61) }, { headlinePresentation: "invalid" }]) {
        expect((await request(`/api/graphics/${graphic.id}`, "PATCH", { draftFields })).status).toBe(400);
      }
      expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(patch.body);
      expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", { title: "RUNDOWN REVISI" })).status).toBe(200);
      const next = (await request(`/api/rundowns/${rundown.id}/items`, "POST", { slug: "OPEN-02", title: "Headline kedua", format: "READER" })).body;
      await request(`/api/rundowns/${rundown.id}/reorder`, "POST", { itemIds: [next.id, item.id] });
      const saved = (await request(`/api/rundowns/${rundown.id}`)).body;
      expect(saved.title).toBe("RUNDOWN REVISI");
      expect(saved.items.map((story: any) => story.id)).toEqual([next.id, item.id]);
      expect(saved.items[1].graphics[1]).toEqual(patch.body);
      expect((await request("/api/live/state")).body.onAirSnapshot).toEqual(before.onAirSnapshot);
      expect(events).toHaveLength(1); // SYNC only; editing emits no output commands.
      const updated = await request("/api/live/update", "POST", { graphicId: graphic.id, syncComposition: false }, { "Idempotency-Key": randomUUID() });
      expect(updated.body.commandStatus).toBe("confirmed");
      expect(updated.body.state.onAirSnapshot).toMatchObject({ headline: "HEADLINE PEMBUKA REVISI", kicker: "BERITA UTAMA", headlinePresentation: "bulletin" });
      expect(events.at(-1)?.type).toBe("UPDATE");
    } finally { unsubscribe(); }
  });

  it("creates and edits rundown, news and CG, then reads each entity back", async () => {
    const rundown = (await request("/api/rundowns", "POST", { programName: "NEWS", title: "Edisi API", items: [] })).body;
    const itemResult = await request(`/api/rundowns/${rundown.id}/items`, "POST", { slug: "NEWS-01", title: "Judul berita", format: "PKG", cgRequired: true, estimatedDurationSeconds: 120, sortOrder: 0 });
    expect(itemResult.status).toBe(201);
    const item = itemResult.body;
    const graphicResult = await request(`/api/items/${item.id}/graphics`, "POST", graphicInput);
    expect(graphicResult.status).toBe(201);
    const graphic = graphicResult.body;
    expect(graphicRecordSchema.safeParse(graphic).success).toBe(true);
    expect(graphic).not.toHaveProperty("status");
    expect((await request(`/api/rundowns/${rundown.id}`, "PATCH", { title: "Edisi revisi" })).status).toBe(200);
    expect((await request(`/api/items/${item.id}`, "PATCH", { estimatedDurationSeconds: 150 })).status).toBe(200);
    const patched = await request(`/api/graphics/${graphic.id}`, "PATCH", { draftFields: { headline: "JUDUL REVISI" } });
    expect(patched.status).toBe(200);
    expect(patched.body.draftFields).toMatchObject({ headline: "JUDUL REVISI", location: "JAKARTA", kicker: "TOPIK" });
    expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(patched.body);
    expect((await request(`/api/items/${item.id}`)).body).toMatchObject({ estimatedDurationSeconds: 150, graphics: [patched.body] });
    const saved = (await request(`/api/rundowns/${rundown.id}`)).body;
    expect(saved.title).toBe("Edisi revisi");
    expect(rundownRecordSchema.safeParse(saved).success).toBe(true);
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();
  });

  it("keeps Program isolated during agent PATCH and applies edits only on explicit UPDATE", async () => {
    const { graphic } = await createMaterial();
    const result = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": randomUUID() });
    expect(result.status).toBe(200);
    expect(result.body.commandStatus).toBe("confirmed");
    expect(liveCommandResultSchema.safeParse(result.body).success).toBe(true);
    const before = liveModule.getLiveState().onAirSnapshot;
    await request(`/api/graphics/${graphic.id}`, "PATCH", { draftFields: { headline: "EDIT BELUM DITERAPKAN" } });
    expect((await request("/api/live/state")).body.onAirSnapshot).toEqual(before);
    const updated = await request("/api/live/update", "POST", { graphicId: graphic.id, syncComposition: false }, { "Idempotency-Key": randomUUID() });
    expect(updated.body.commandStatus).toBe("confirmed");
    expect(updated.body.state.onAirSnapshot.headline).toBe("EDIT BELUM DITERAPKAN");
  });

  it("rejects invalid field patches without changing stored material", async () => {
    const { graphic } = await createMaterial();
    for (const draftFields of [{ headline: "" }, { headline: "A".repeat(121) }, { showLocation: true }]) {
      expect((await request(`/api/graphics/${graphic.id}`, "PATCH", { draftFields })).status).toBe(400);
      expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(graphic);
    }
  });

  it("rejects empty or unknown-only graphic PATCH instead of acknowledging a discarded edit", async () => {
    const { graphic } = await createMaterial();
    for (const body of [{}, { wrongField: "MATERI PENTING" }, { draftFields: {} }]) {
      const result = await request(`/api/graphics/${graphic.id}`, "PATCH", body);
      expect(result.status).toBe(400);
      expect(apiErrorSchema.safeParse(result.body).success).toBe(true);
      expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(graphic);
    }
  });

  it("blocks active template changes in PATCH and story PUT without changing any material or Program", async () => {
    const { rundown, item, graphic } = await createMaterial();
    await request("/api/live/take", "POST", { graphicId: graphic.id });
    const changedGraphic = { id: graphic.id, templateType: "REPORTER", sortOrder: 0, draftFields: { name: "REPORTER", role: "REPORTER", contentMode: "presenter" } };
    const beforeGraphic = (await request(`/api/graphics/${graphic.id}`)).body;
    const beforeItem = (await request(`/api/items/${item.id}`)).body;
    const beforeProgram = liveModule.getLiveState().onAirSnapshot;
    const patch = await request(`/api/graphics/${graphic.id}`, "PATCH", changedGraphic);
    expect(patch.status).toBe(409);
    expect(patch.body.error).toContain("Tipe CG");
    const story = await request(`/api/rundowns/${rundown.id}/story`, "PUT", { itemId: item.id, slug: item.slug, title: "REVISI DITOLAK", format: item.format, cgRequired: true, graphics: [changedGraphic] });
    expect(story.status).toBe(409);
    expect((await request(`/api/graphics/${graphic.id}`)).body).toEqual(beforeGraphic);
    expect((await request(`/api/items/${item.id}`)).body).toEqual(beforeItem);
    expect(liveModule.getLiveState().onAirSnapshot).toEqual(beforeProgram);
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      expect(events[0]).toMatchObject({ type: "SYNC", graphic: { templateType: "HEADLINE" }, fields: beforeProgram });
    } finally { unsubscribe(); }
    await request("/api/live/clear", "POST");
    const afterClear = await request(`/api/graphics/${graphic.id}`, "PATCH", changedGraphic);
    expect(afterClear.status).toBe(200);
    expect(afterClear.body.templateType).toBe("REPORTER");
  });

  it("saves story transactionally, retains provided cue IDs and removes only omitted cues", async () => {
    const { rundown, item, graphic } = await createMaterial();
    const extra = (await request(`/api/items/${item.id}/graphics`, "POST", { templateType: "SOT", draftFields: { headline: "TOPIK", name: "NARASUMBER" } })).body;
    const saved = await request(`/api/rundowns/${rundown.id}/story`, "PUT", { itemId: item.id, slug: item.slug, title: "Judul revisi", format: "PKG", cgRequired: true, estimatedDurationSeconds: 150, sortOrder: 0, graphics: [{ ...graphicInput, id: graphic.id }] });
    expect(saved.status).toBe(200);
    expect(saved.body.graphics.map((cue: any) => cue.id)).toEqual([graphic.id]);
    expect((await request(`/api/graphics/${extra.id}`)).status).toBe(404);
    expect((await request(`/api/rundowns/${rundown.id}/story`, "PUT", { itemId: 123, slug: "BAD", title: "Tidak boleh tersimpan", graphics: [] })).status).toBe(400);
    expect((await request(`/api/items/${item.id}`)).body.title).toBe("Judul revisi");
  });

  it("returns 404 for missing story targets, 409 for foreign cue IDs, without changing any material", async () => {
    const { rundown, item, graphic } = await createMaterial();
    const story = { itemId: item.id, slug: item.slug, title: "REVISI", format: "PKG", graphics: [{ ...graphicInput, id: graphic.id }] };
    const before = (await request(`/api/rundowns/${rundown.id}`)).body;
    const missingRundown = await request("/api/rundowns/missing-rundown/story", "PUT", story);
    expect(missingRundown.status).toBe(404);
    expect(missingRundown.body.error).toBe("Rundown tidak ditemukan");
    const missingStory = await request(`/api/rundowns/${rundown.id}/story`, "PUT", { ...story, itemId: "missing-story" });
    expect(missingStory.status).toBe(404);
    expect(missingStory.body.error).toBe("Berita tidak ditemukan");
    const badCue = await request(`/api/rundowns/${rundown.id}/story`, "PUT", { ...story, graphics: [{ ...graphicInput, id: "foreign-cue" }] });
    expect(badCue.status).toBe(409);
    expect((await request(`/api/rundowns/${rundown.id}`)).body).toEqual(before);
  });

  it("generates new story and cue IDs when creating a rundown from an existing export", async () => {
    const { rundown, item, graphic } = await createMaterial();
    const created = await request("/api/rundowns", "POST", {
      programName: "SALINAN", title: "Edisi salinan", items: [{ ...item, graphics: [graphic] }]
    });
    expect(created.status).toBe(201);
    expect(created.body.id).not.toBe(rundown.id);
    expect(created.body.items[0].id).not.toBe(item.id);
    expect(created.body.items[0].graphics[0].id).not.toBe(graphic.id);
    expect((await request(`/api/rundowns/${rundown.id}`)).body).toEqual(rundown);
  });

  it("imports old status fields without an approval workflow and regenerates all IDs", async () => {
    const { rundown, item, graphic } = await createMaterial();
    const exported = (await request(`/api/rundowns/${rundown.id}/export`)).body;
    exported.rundown.items[0].graphics[0].status = "DRAFT";
    const imported = await request("/api/rundowns/import", "POST", exported);
    expect(imported.status).toBe(201);
    expect(imported.body.id).not.toBe(rundown.id);
    expect(imported.body.items[0].id).not.toBe(item.id);
    const cue = imported.body.items[0].graphics[0];
    expect(cue.id).not.toBe(graphic.id);
    expect(cue).not.toHaveProperty("status");
    expect(cue.draftFields).toEqual(graphic.draftFields);
    expect((await request("/api/live/take", "POST", { graphicId: cue.id })).body.commandStatus).toBe("confirmed");
  });

  it("edits a copied rundown through all PATCH entity routes, exports exact readback and isolates Program", async () => {
    const { rundown, graphic } = await createMaterial();
    const beforeProgram = liveModule.getLiveState();
    const original = (await request(`/api/rundowns/${rundown.id}/export`)).body;
    const cloned = await request("/api/rundowns/import", "POST", original);
    expect(cloned.status).toBe(201);
    const itemId = cloned.body.items[0].id;
    const cueId = cloned.body.items[0].graphics[0].id;
    const rd = await request(`/api/rundowns/${cloned.body.id}`, "PATCH", { title: "EDISI HASIL IMPOR" });
    const item = await request(`/api/items/${itemId}`, "PATCH", { title: "BERITA HASIL IMPOR", estimatedDurationSeconds: 175 });
    const cue = await request(`/api/graphics/${cueId}`, "PATCH", { draftFields: { headline: "HEADLINE HASIL IMPOR", showKicker: "true", kicker: "TOPIK BARU" } });
    expect([rd.status, item.status, cue.status]).toEqual([200, 200, 200]);
    expect(cue.body.draftFields).toMatchObject({ headline: "HEADLINE HASIL IMPOR", kicker: "TOPIK BARU", location: "JAKARTA" });
    const exported = await request(`/api/rundowns/${cloned.body.id}/export`);
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain(`${cloned.body.id}.json`);
    expect(exported.body.schemaVersion).toBe(1);
    expect(exported.body.rundown).toEqual((await request(`/api/rundowns/${cloned.body.id}`)).body);
    expect(exported.body.rundown.items[0].title).toBe("BERITA HASIL IMPOR");
    expect(exported.body.rundown.items[0].graphics[0]).toEqual(cue.body);
    expect((await request(`/api/rundowns/${rundown.id}`)).body.items[0].graphics[0]).toEqual(graphic);
    expect(liveModule.getLiveState()).toEqual(beforeProgram);
    const rejected = await request(`/api/graphics/${cueId}`, "PATCH", { draftFields: { headline: "X".repeat(121) } });
    expect(rejected.status).toBe(400);
    expect((await request(`/api/graphics/${cueId}`)).body).toEqual(cue.body);
  });

  it("returns JSON API errors matching the advertised schema without leaking HTML", async () => {
    for (const [path, method, body, expected] of [
      ["/api/not-a-route", "GET", undefined, 404],
      ["/api/rundowns/unknown/export", "GET", undefined, 404],
      ["/api/rundowns", "POST", { programName: "", title: "INVALID" }, 400],
      ["/api/rundowns/import", "POST", { schemaVersion: 2, rundown: {} }, 400],
      ["/api/live/stream?role=invalid", "GET", undefined, 400],
      ["/api/graphics/unknown", "PATCH", { draftFields: { headline: "TEST" } }, 404]
    ] as const) {
      const response = await request(path, method, body);
      expect(response.status).toBe(expected);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.error).not.toContain("<html");
    }
    const malformed = await fetch(`${baseUrl}/api/rundowns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid" });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("content-type")).toContain("application/json");
    expect(apiErrorSchema.safeParse(await malformed.json()).success).toBe(true);
  });

  it.each([
    { schemaVersion: 2, rundown: { programName: "NEWS", title: "Tidak didukung", items: [] } },
    { schemaVersion: 2, programName: "NEWS", title: "Tidak didukung", items: [] },
    { schemaVersion: "1", rundown: { programName: "NEWS", title: "Versi bukan angka", items: [] } }
  ])("rejects unsupported import versions without creating anything: %j", async (payload) => {
    const before = (await request("/api/rundowns")).body;
    const result = await request("/api/rundowns/import", "POST", payload);
    expect(result.status).toBe(400);
    expect((await request("/api/rundowns")).body).toEqual(before);
  });

  it("reorders complete ID lists and rejects duplicate, partial, foreign, or non-string IDs atomically", async () => {
    const { rundown, item } = await createMaterial();
    const second = (await request(`/api/rundowns/${rundown.id}/items`, "POST", { slug: "NEWS-02", title: "Berita kedua", sortOrder: 1 })).body;
    for (const itemIds of [[item.id], [item.id, item.id], [item.id, "foreign-id"], [item.id, 123], []]) {
      expect((await request(`/api/rundowns/${rundown.id}/reorder`, "POST", { itemIds })).status).toBe(400);
      expect((await request(`/api/rundowns/${rundown.id}`)).body.items.map((story: any) => story.id)).toEqual([item.id, second.id]);
    }
    const reordered = await request(`/api/rundowns/${rundown.id}/reorder`, "POST", { itemIds: [second.id, item.id] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.items.map((story: any) => story.id)).toEqual([second.id, item.id]);
    expect(reordered.body.items.map((story: any) => story.sortOrder)).toEqual([0, 1]);
  });

  it("edits one headline default without resetting the other fields", async () => {
    await request("/api/settings/headline-defaults", "PATCH", { headline: "JUDUL", location: "JAKARTA", kicker: "TOPIK", subline: "DETAIL" });
    const updated = await request("/api/settings/headline-defaults", "PATCH", { location: "BANDUNG" });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ headline: "JUDUL", location: "BANDUNG", kicker: "TOPIK", subline: "DETAIL" });
    expect((await request("/api/settings/headline-defaults", "PATCH", {})).status).toBe(400);
    expect((await request("/api/settings/headline-defaults")).body).toEqual(updated.body);
  });

  it("blocks deleting live material and returns 204 with no JSON after an explicit CLEAR", async () => {
    const { rundown, item, graphic } = await createMaterial();
    await request("/api/live/take", "POST", { graphicId: graphic.id });
    for (const path of [`/api/graphics/${graphic.id}`, `/api/items/${item.id}`, `/api/rundowns/${rundown.id}`]) {
      const result = await request(path, "DELETE");
      expect(result.status).toBe(409);
      expect(result.body.error).toContain("ON AIR");
    }
    await request("/api/live/clear", "POST");
    for (const path of [`/api/graphics/${graphic.id}`, `/api/items/${item.id}`, `/api/rundowns/${rundown.id}`]) {
      const result = await request(path, "DELETE");
      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
      expect((await request(path)).status).toBe(404);
    }
  });
});

describe("agent live requests", () => {
  it.each([" ", "x".repeat(201)])("rejects invalid live idempotency header %j before a command", async key => {
    const { graphic } = await createMaterial();
    const before = liveModule.getLiveState();
    const result = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": key });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/Idempotency-Key/);
    expect(liveModule.getLiveState()).toEqual(before);
  });

  it("rejects a malformed STAGE idempotency header without updating Program", async () => {
    const before = dbModule.getMasterOverlay();
    const result = await request("/api/live/stage", "POST", { mode: "logo" }, { "Idempotency-Key": " " });
    expect(result.status).toBe(400);
    expect(dbModule.getMasterOverlay()).toEqual(before);
  });

  it("returns 404 JSON for PREPARE with a missing cue instead of changing selection", async () => {
    const before = liveModule.getLiveState();
    const response = await request("/api/live/prepare", "POST", { graphicId: "missing-graphic-id" });
    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.error).toBe("Grafis tidak ditemukan");
    expect(liveModule.getLiveState()).toEqual(before);
  });

  it.each([
    ["prepare", undefined], ["prepare", { graphicId: 123 }], ["take", {}], ["take", { graphicId: "CG", presentation: "bad" }],
    ["update", { graphicId: "CG", syncComposition: "false" }], ["variant", { graphicId: "CG", action: "toggle-topic" }],
    ["clear-all", { immediate: "false" }], ["clear", { idempotencyKey: "" }], ["stage", { mode: "invalid" }]
  ])("rejects invalid %s bodies before changing Program", async (action, body) => {
    const { graphic } = await createMaterial();
    await request("/api/live/take", "POST", { graphicId: graphic.id });
    const beforeState = liveModule.getLiveState();
    const beforeMaster = dbModule.getMasterOverlay();
    const result = await request(`/api/live/${action}`, "POST", body);
    expect(result.status).toBe(400);
    expect(result.body.error).toBeTypeOf("string");
    expect(liveModule.getLiveState()).toEqual(beforeState);
    expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
  });

  it("retries an identical live key once and reports failed commands inside HTTP 200", async () => {
    const { graphic } = await createMaterial();
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      const key = randomUUID();
      const first = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": key });
      const retried = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": key });
      expect(retried.body).toEqual(first.body);
      expect(events.filter(event => event.type === "TAKE")).toHaveLength(1);
      const failed = await request("/api/live/take", "POST", { graphicId: "missing-cg" });
      expect(failed.status).toBe(200);
      expect(failed.body).toMatchObject({ commandStatus: "failed", error: "Grafis tidak ditemukan" });
      expect(liveModule.getLiveState().onAirGraphicId).toBe(graphic.id);
    } finally { unsubscribe(); }
  });

  it("returns 409 when a live key is reused for a different command or payload", async () => {
    const { graphic } = await createMaterial();
    const key = randomUUID();
    const first = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": key });
    expect(first.status).toBe(200);
    expect(first.body.commandStatus).toBe("confirmed");
    const changedCommand = await request("/api/live/clear", "POST", {}, { "Idempotency-Key": key });
    expect(changedCommand.status).toBe(409);
    expect(changedCommand.body.error).toContain("Idempotency-Key");
    const changedPayload = await request("/api/live/take", "POST", { graphicId: graphic.id, presentation: "clean" }, { "Idempotency-Key": key });
    expect(changedPayload.status).toBe(409);
    expect(liveModule.getLiveState().onAirGraphicId).toBe(graphic.id);
    const unchangedRetry = await request("/api/live/take", "POST", { graphicId: graphic.id }, { "Idempotency-Key": key });
    expect(unchangedRetry.body).toEqual(first.body);
  });

  it("honors the same HTTP header idempotency contract on all six live commands", async () => {
    const { graphic } = await createMaterial();
    for (const [path, body] of [
      ["take", { graphicId: graphic.id }],
      ["update", { graphicId: graphic.id, syncComposition: true }],
      ["variant", { graphicId: graphic.id, action: "toggle-kicker" }],
      ["clear", {}],
      ["clear-all", { immediate: false }],
      ["stage", { mode: "logo" }]
    ] as const) {
      const headers = { "Idempotency-Key": randomUUID() };
      const first = await request(`/api/live/${path}`, "POST", body, headers);
      const retry = await request(`/api/live/${path}`, "POST", body, headers);
      expect(first.status).toBe(200);
      expect(retry.status).toBe(200);
      expect(first.body.commandStatus).toBe("confirmed");
      expect(retry.body).toEqual(first.body);
    }
  });

  it("accepts body idempotency keys and consistently prioritizes an explicit header", async () => {
    const { graphic } = await createMaterial();
    for (const [path, body] of [
      ["take", { graphicId: graphic.id }],
      ["update", { graphicId: graphic.id }],
      ["variant", { graphicId: graphic.id, action: "toggle-kicker" }],
      ["clear", {}],
      ["clear-all", { immediate: true }]
    ] as const) {
      const idempotencyKey = randomUUID();
      const first = await request(`/api/live/${path}`, "POST", { ...body, idempotencyKey });
      const second = await request(`/api/live/${path}`, "POST", { ...body, idempotencyKey });
      expect(first.status).toBe(200);
      expect(second.body).toEqual(first.body);
    }
    const headerKey = randomUUID();
    const first = await request("/api/live/stage", "POST", { mode: "full" }, { "Idempotency-Key": headerKey });
    const retried = await request("/api/live/stage", "POST", { mode: "full" }, { "Idempotency-Key": headerKey });
    expect(retried.body).toEqual(first.body);
    const firstTake = await request("/api/live/take", "POST", { graphicId: graphic.id, idempotencyKey: "body-one" }, { "Idempotency-Key": headerKey + "-take" });
    const repeatedTake = await request("/api/live/take", "POST", { graphicId: graphic.id, idempotencyKey: "body-two" }, { "Idempotency-Key": headerKey + "-take" });
    expect(repeatedTake.body).toEqual(firstTake.body);
  });

  it("applies an HTTP master PATCH after an already queued STAGE command", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      // Queue STAGE before HTTP PATCH starts, while no previous command is awaited.
      const first = liveModule.setStage("full", randomUUID());
      const patch = request("/api/live/master", "PATCH", { showTicker: false });
      expect((await first).commandStatus).toBe("confirmed");
      const result = await patch;
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ showLogo: true, showTicker: false, showLiveBadge: true });
      expect((await request("/api/live/master")).body.showTicker).toBe(false);
      expect(events.map(event => event.type).slice(-2)).toEqual(["SYNC", "MASTER_UPDATE"]);
    } finally { unsubscribe(); }
  });

  it("rejects empty or unknown-only master PATCH without emitting a live update", async () => {
    const master = (await request("/api/live/master")).body;
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      for (const body of [{}, { showTiker: true }]) {
        const result = await request("/api/live/master", "PATCH", body);
        expect(result.status).toBe(400);
        expect(apiErrorSchema.safeParse(result.body).success).toBe(true);
      }
      expect((await request("/api/live/master")).body).toEqual(master);
      expect(events.map(event => event.type)).toEqual(["SYNC"]);
    } finally { unsubscribe(); }
  });

  it("observes SYNC with role monitor without counting the agent as an output", async () => {
    const response = await fetch(`${baseUrl}/api/live/stream?role=monitor`);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    let received = "";
    try {
      while (!received.includes('"type":"SYNC"')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE berhenti sebelum SYNC");
        received += new TextDecoder().decode(chunk.value);
      }
      expect(liveModule.getLiveState().overlayClientsCount).toBe(0);
    } finally { await reader.cancel(); }
  });

  it("keeps SSE output subscribed throughout the response and releases it after disconnect", async () => {
    const response = await fetch(`${baseUrl}/api/live/stream?role=output`);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      let received = "";
      while (!received.includes('"type":"SYNC"')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("SSE berhenti sebelum SYNC");
        received += new TextDecoder().decode(chunk.value);
      }
      await vi.waitFor(() => {
        expect(liveModule.getLiveState().overlayClientsCount).toBe(1);
        expect(liveModule.getLiveState().connection).toBe("CONNECTED");
      }, { timeout: 300, interval: 10 });
    } finally { await reader.cancel(); }
    await vi.waitFor(() => {
      expect(liveModule.getLiveState().overlayClientsCount).toBe(0);
      expect(liveModule.getLiveState().connection).toBe("STANDALONE");
    }, { timeout: 1000, interval: 10 });
  });

  it("rejects unknown or repeated SSE roles instead of registering phantom output connections", async () => {
    for (const query of ["role=moniter", "role=monitor&role=output"]) {
      const response = await request(`/api/live/stream?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("role");
      expect(liveModule.getLiveState().overlayClientsCount).toBe(0);
    }
  });
});
