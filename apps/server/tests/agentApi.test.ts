import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  broadcastLogoUploadSpec, graphicFieldLimits, graphicRecordSchema,
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
    for (const name of ["guide", "rundownGuide"]) {
      const response = await fetch(`${baseUrl}${result.body.links[name]}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      expect(await response.text()).toBe(await readFile(new URL(`../../../docs/${name === "guide" ? "AI_AGENT_API.md" : "AI_RUNDOWN_GUIDE.md"}`, import.meta.url), "utf8"));
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
    expect(schemas.GraphicPatch.properties.draftFields.additionalProperties).toEqual({ type: "string" });
    expect(JSON.stringify(schemas.GraphicInput)).not.toContain('"status"');
    expect(schemas.RundownInput.properties.items.items.properties.graphics.items.oneOf).toHaveLength(templateTypes.length);
    expect(schemas.StorySave.properties.itemId).toBeDefined();
    expect(schemas.LiveClearAll.properties.immediate.default).toBe(true);
  });
});

describe("agent material editing through real HTTP", () => {
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
});
