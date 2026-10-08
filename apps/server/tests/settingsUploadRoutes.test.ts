import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import type { Server } from "node:http";
import sharp from "sharp";
import { broadcastLogoUploadSpec, defaultHeadlineDefaults, defaultMasterOverlayState, masterOverlaySchema } from "@newscg/shared";
import type { OverlayEvent } from "@newscg/shared";

let tempRoot: string;
let uploadsPath: string;
let server: Server;
let baseUrl: string;
let dbModule: typeof import("../src/db.js");
let liveModule: typeof import("../src/live.js");
let png: Buffer;
let otherPng: Buffer;
let jpeg: Buffer;
let webp: Buffer;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><defs><linearGradient id="g"><stop stop-color="#17364f"/><stop offset="1" stop-color="#b38d61"/></linearGradient></defs><rect width="80" height="50" fill="url(#g)"/></svg>');

async function jsonRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
  return { response, body: await response.json() };
}
async function upload(data: Buffer, contentType = "image/png") {
  const response = await fetch(`${baseUrl}/api/uploads/logo`, { method: "POST", headers: { "Content-Type": contentType }, body: data });
  return { response, body: await response.json() };
}
function storeRawSetting(key: string, value: string) {
  dbModule.db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}
function rawSetting(key: string): string | undefined {
  return (dbModule.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined)?.value;
}

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "newscg-settings-upload-"));
  uploadsPath = join(tempRoot, "uploads");
  const databasePath = join(tempRoot, "routes.db");
  vi.stubEnv("DATABASE_PATH", databasePath);
  vi.stubEnv("UPLOADS_PATH", uploadsPath);
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
  if (!address || typeof address === "string") throw new Error("Port server pengujian tidak tersedia");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const first = sharp({ create: { width: 80, height: 50, channels: 4, background: "#17364f" } });
  png = await first.clone().png().toBuffer();
  jpeg = await first.clone().jpeg().toBuffer();
  webp = await first.clone().webp().toBuffer();
  otherPng = await sharp({ create: { width: 80, height: 50, channels: 4, background: "#b38d61" } }).png().toBuffer();
}, 20_000);

beforeEach(() => {
  dbModule.db.prepare("DELETE FROM settings").run();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (server) {
    await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
  }
  if (dbModule?.db.open) dbModule.db.close();
  vi.unstubAllEnvs();
  if (tempRoot) {
    const location = relative(resolve(tmpdir()), resolve(tempRoot));
    if (location.startsWith("..") || !basename(tempRoot).startsWith("newscg-settings-upload-")) throw new Error("Direktori pengujian tidak aman untuk dibersihkan");
    await rm(tempRoot, { recursive: true, force: true });
  }
});

describe("general settings and persisted configuration", () => {
  it("exposes only general settings and preserves old/internal rows", async () => {
    storeRawSetting("master_overlay", JSON.stringify({ brandText: "BERITA LAMA", showLogo: true }));
    storeRawSetting("headline_defaults", "{broken");
    storeRawSetting("legacy_vmix", JSON.stringify({ mode: "mock", input: "old" }));
    const originalMaster = rawSetting("master_overlay");
    const originalLegacy = rawSetting("legacy_vmix");
    const result = await jsonRequest("/api/settings");
    expect(result.response.status).toBe(200);
    expect(result.body).toEqual({ outputMode: "web" });
    const saved = await jsonRequest("/api/settings", "PATCH", result.body);
    expect(saved.response.status).toBe(200);
    expect(rawSetting("master_overlay")).toBe(originalMaster);
    expect(rawSetting("legacy_vmix")).toBe(originalLegacy);
    expect(rawSetting("headline_defaults")).toBe("{broken");
  });

  it.each([
    { master_overlay: { tickerText: 123, showTicker: true } },
    { outputMode: "web", master_overlay: { showLogo: true } },
    { headline_defaults: { headline: "BYPASS" } },
    { outputMode: "vmix" },
    { anything: "not a setting" },
    {}
  ])("rejects unsupported or internal keys without changing master: %j", async (patch) => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((event) => events.push(event), "monitor");
    try {
      const result = await jsonRequest("/api/settings", "PATCH", patch);
      expect(result.response.status).toBe(400);
      expect(result.body.error).toBe("Data pengaturan tidak valid");
      expect(dbModule.getMasterOverlay()).toEqual(defaultMasterOverlayState);
      expect(events.map((event) => event.type)).toEqual(["SYNC"]);
    } finally { unsubscribe(); }
  });

  it("prevents internal callers from bypassing the settings schema", () => {
    expect(() => dbModule.saveSettings({ master_overlay: { tickerText: 123 } })).toThrow();
    expect(rawSetting("master_overlay")).toBeUndefined();
  });

  it("keeps valid persisted master fields, safely falls back for bad fields, and leaves the original row untouched", async () => {
    const raw = JSON.stringify({ colorTheme: "studio-navy", brandText: "STASIUN SAYA", logoImage: "/uploads/logo.png?v=old", tickerText: 123, tickerSpeed: 900, outputFps: "bad", showTicker: "yes", futureOption: "keep" });
    storeRawSetting("master_overlay", raw);
    const result = await jsonRequest("/api/live/master");
    expect(result.response.status).toBe(200);
    expect(masterOverlaySchema.safeParse(result.body).success).toBe(true);
    expect(result.body).toMatchObject({ colorTheme: "studio-navy", brandText: "STASIUN SAYA", logoImage: "/uploads/logo.png?v=old", tickerText: defaultMasterOverlayState.tickerText, tickerSpeed: 85, outputFps: 30, showTicker: false });
    expect(rawSetting("master_overlay")).toBe(raw);
    expect(console.warn).toHaveBeenCalled();
    const applied = await jsonRequest("/api/live/master", "PATCH", { showLogo: true });
    expect(applied.response.status).toBe(200);
    expect(JSON.parse(rawSetting("master_overlay")!)).toMatchObject({ futureOption: "keep", tickerText: 123, showLogo: true });
  });

  it("uses safe values for malformed persisted JSON and preserves its raw value before explicit repair", async () => {
    storeRawSetting("master_overlay", "{broken");
    storeRawSetting("outputMode", "not json");
    storeRawSetting("headline_defaults", JSON.stringify({ headline: 123, location: "JAKARTA", futureOption: "keep" }));
    expect((await jsonRequest("/api/settings")).body).toEqual({ outputMode: "web" });
    expect((await jsonRequest("/api/live/master")).body).toEqual(defaultMasterOverlayState);
    expect((await jsonRequest("/api/settings/headline-defaults")).body).toEqual({ ...defaultHeadlineDefaults, location: "JAKARTA" });
    expect(rawSetting("master_overlay")).toBe("{broken");
    expect(rawSetting("outputMode")).toBe("not json");
    const repaired = await jsonRequest("/api/live/master", "PATCH", { brandText: "BERITA BARU" });
    expect(repaired.response.status).toBe(200);
    expect(repaired.body.brandText).toBe("BERITA BARU");
    const backups = dbModule.db.prepare("SELECT value FROM settings WHERE key LIKE 'recovery:master_overlay:%'").all() as Array<{ value: string }>;
    expect(backups).toHaveLength(1);
    expect(JSON.parse(backups[0]!.value)).toMatchObject({ sourceKey: "master_overlay", rawValue: "{broken" });
  });

  it("uses the validated master endpoint and emits MASTER_UPDATE", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((event) => events.push(event), "monitor");
    try {
      const invalid = await jsonRequest("/api/live/master", "PATCH", { tickerText: 123 });
      expect(invalid.response.status).toBe(400);
      const valid = await jsonRequest("/api/live/master", "PATCH", { tickerText: "BERITA TERVERIFIKASI", colorTheme: "studio-navy" });
      expect(valid.response.status).toBe(200);
      expect(events.at(-1)).toMatchObject({ type: "MASTER_UPDATE", master: { tickerText: "BERITA TERVERIFIKASI", colorTheme: "studio-navy" } });
    } finally { unsubscribe(); }
  });
});

describe("immutable validated logo uploads", () => {
  it("preserves the current legacy logo and live master until an explicit apply", async () => {
    await writeFile(join(uploadsPath, "logo.png"), png);
    dbModule.saveMasterOverlay({ logoType: "image", logoImage: "/uploads/logo.png?v=old", showLogo: true });
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((event) => events.push(event), "monitor");
    try {
      const first = await upload(otherPng);
      const second = await upload(png);
      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.body.url).toMatch(/^\/uploads\/logo-[0-9a-f-]+\.png$/);
      expect(second.body.url).not.toBe(first.body.url);
      expect(await readFile(join(uploadsPath, basename(first.body.url)))).toEqual(otherPng);
      expect(Buffer.from(await (await fetch(`${baseUrl}/uploads/logo.png?v=old`)).arrayBuffer())).toEqual(png);
      expect(dbModule.getMasterOverlay().logoImage).toBe("/uploads/logo.png?v=old");
      expect(events.map((event) => event.type)).toEqual(["SYNC"]);
      await jsonRequest("/api/live/master", "PATCH", { logoType: "image", logoImage: first.body.url });
      expect(dbModule.getMasterOverlay().logoImage).toBe(first.body.url);
      expect(events.at(-1)?.type).toBe("MASTER_UPDATE");
    } finally { unsubscribe(); }
  });

  it.each(["image/png", "image/jpeg", "image/webp", "image/svg+xml"])("accepts and serves a fully decoded %s logo at its own immutable URL", async (mimeType) => {
    const data = { "image/png": png, "image/jpeg": jpeg, "image/webp": webp, "image/svg+xml": svg }[mimeType]!;
    const result = await upload(data, mimeType);
    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({ width: 80, height: 50 });
    const stored = await fetch(`${baseUrl}${result.body.url}`);
    expect(stored.status).toBe(200);
    expect(Buffer.from(await stored.arrayBuffer())).toEqual(data);
  });

  it("rejects fake images, truncated pixel data, mismatched MIME, and unsupported formats without saving files", async () => {
    const before = await readdir(uploadsPath);
    for (const [data, mime, status] of [
      [Buffer.from("not an image"), "image/png", 400],
      [png.subarray(0, png.length - 20), "image/png", 400],
      [jpeg, "image/png", 400],
      [Buffer.alloc(0), "image/png", 400],
      [png, "image/gif", 415]
    ] as const) {
      const result = await upload(data, mime);
      expect(result.response.status).toBe(status);
      expect(result.body.error).toMatch(/logo|gambar|format/i);
    }
    expect(await readdir(uploadsPath)).toEqual(before);
  });

  it("enforces the shared 2 MB payload limit with HTTP 413", async () => {
    const result = await upload(Buffer.alloc(broadcastLogoUploadSpec.maxBytes + 1));
    expect(result.response.status).toBe(413);
    expect(result.body.error).toBe("Ukuran logo melebihi batas 2 MB.");
  });

  it("keeps 800 × 500 as a recommendation and rejects excessive decoded dimensions", async () => {
    const oversized = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${broadcastLogoUploadSpec.maxDimension + 1}" height="1"><rect width="10" height="1"/></svg>`);
    const result = await upload(oversized, "image/svg+xml");
    expect(result.response.status).toBe(400);
    expect(result.body.error).toMatch(/Dimensi logo/);
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><image href="https://example.invalid/image.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><style>@import "https://example.invalid/style.css";</style><rect width="80" height="50"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><rect fill="url(https://example.invalid/image.svg)" width="80" height="50"/></svg>',
    '<!DOCTYPE svg [<!ENTITY external SYSTEM "file:///outside">]><svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50" onload="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><set attributeName="href" to="https://example.invalid/image.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><rect></svg>'
  ])("rejects SVG external resources, active content, and malformed XML before saving: %s", async (source) => {
    const before = await readdir(uploadsPath);
    const result = await upload(Buffer.from(source), "image/svg+xml");
    expect(result.response.status).toBe(400);
    expect(result.body.error).toMatch(/SVG/);
    expect(await readdir(uploadsPath)).toEqual(before);
  });
});

describe("HTTP input errors", () => {
  it("reports malformed JSON as HTTP 400 in Indonesian", async () => {
    const response = await fetch(`${baseUrl}/api/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{broken" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Format JSON tidak valid. Periksa data yang dikirim." });
  });

  it("reports oversized JSON as HTTP 413", async () => {
    const response = await fetch(`${baseUrl}/api/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(2 * 1024 * 1024) }) });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/Ukuran data melebihi batas/);
  });

  it("rejects absent stage/import bodies as HTTP 400", async () => {
    for (const path of ["/api/live/stage", "/api/rundowns/import"]) {
      const result = await jsonRequest(path, "POST");
      expect(result.response.status).toBe(400);
      expect(result.body.error).not.toMatch(/undefined|properties/);
    }
  });

  it.each(["1.5", "0", "201", "NaN", "2&limit=3"])("rejects invalid action-log limit %s without a SQL error", async (limit) => {
    const result = await jsonRequest(`/api/actions?limit=${limit}`);
    expect(result.response.status).toBe(400);
    expect(result.body.error).toBe("Batas riwayat aksi harus berupa bilangan bulat antara 1 dan 200.");
  });

  it("returns actions for a valid integer limit and keeps unknown API routes JSON", async () => {
    const actions = await jsonRequest("/api/actions?limit=2");
    expect(actions.response.status).toBe(200);
    expect(Array.isArray(actions.body)).toBe(true);
    expect(actions.body.length).toBeLessThanOrEqual(2);
    const missing = await jsonRequest("/api/no-such-endpoint");
    expect(missing.response.status).toBe(404);
    expect(missing.body).toEqual({ error: "Endpoint API tidak ditemukan" });
  });
});
