import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { graphicInputSchema, graphicPatchSchema, rundownInputSchema, storyInputSchema } from "@newscg/shared";

const draftFields = { headline: "MATERI LAMA", location: "Jakarta", visualTemplate: "cnn" };
const pushedFields = { ...draftFields, headline: "TEKS PROGRAM LAMA", showLocation: "true" };
const readyFields = { name: "Reporter Lama", role: "Reporter", location: "Jakarta" };
const storedMaster = JSON.stringify({ brandText: "NEWS LAMA", showLiveBadge: false, legacyMetadata: "tetap disimpan" });
let testRoot: string;
let testDb: string;
let dbModule: typeof import("../src/db.js");

describe("Graphic storage without material approval", () => {
  beforeAll(async () => {
    testRoot = mkdtempSync(join(tmpdir(), "newscg-graphic-migration-"));
    testDb = join(testRoot, "legacy.db");
    vi.stubEnv("DATABASE_PATH", testDb);
    vi.stubEnv("NODE_ENV", "test");
    const legacyDb = new Database(testDb);
    try {
      legacyDb.pragma("foreign_keys = ON");
      legacyDb.exec(`
        CREATE TABLE migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO migrations VALUES (1, '2026-01-01T00:00:00.000Z');
        CREATE TABLE rundowns (
          id TEXT PRIMARY KEY, program_name TEXT NOT NULL, title TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE rundown_items (
          id TEXT PRIMARY KEY, rundown_id TEXT NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
          slug TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL,
          estimated_duration_seconds INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
          cg_required INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE graphic_items (
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES rundown_items(id) ON DELETE CASCADE,
          template_type TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'DRAFT', retained_metadata TEXT NOT NULL DEFAULT 'retained-default',
          draft_fields TEXT NOT NULL, last_pushed_fields TEXT
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE on_air_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1), graphic_id TEXT, input_guid TEXT,
          overlay_number INTEGER, snapshot TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO rundowns VALUES ('RD-LEGACY', 'NEWS LAMA', 'Rundown lama', '2026-01-01', '2026-01-02');
        INSERT INTO rundown_items VALUES ('ITEM-LEGACY', 'RD-LEGACY', 'BERITA-LAMA', 'Berita lama', 'VO', 90, 0, 1);
      `);
      const insertGraphic = legacyDb.prepare("INSERT INTO graphic_items(rowid,id,item_id,template_type,sort_order,status,retained_metadata,draft_fields,last_pushed_fields) VALUES (?,?,?,?,?,?,?,?,?)");
      insertGraphic.run(41, "CG-LEGACY-DRAFT", "ITEM-LEGACY", "HEADLINE", 0, "DRAFT", "draft-metadata", JSON.stringify(draftFields), JSON.stringify(pushedFields));
      insertGraphic.run(73, "CG-LEGACY-READY", "ITEM-LEGACY", "REPORTER", 0, "READY", "ready-metadata", JSON.stringify(readyFields), null);
      legacyDb.prepare("INSERT INTO settings(key,value) VALUES (?,?)").run("master_overlay", storedMaster);
      legacyDb.prepare("INSERT INTO on_air_state VALUES (1,?,?,?,?,?,?)").run("CG-LEGACY-DRAFT", "web-overlay", 1, JSON.stringify(pushedFields), "confirmed", "2026-01-02T00:00:00.000Z");
    } finally {
      legacyDb.close();
    }
    vi.resetModules();
    dbModule = await import("../src/db.js");
    const databases = dbModule.db.pragma("database_list") as Array<{ name: string; file: string }>;
    expect(resolve(databases.find((database) => database.name === "main")!.file)).toBe(resolve(testDb));
  });

  afterAll(() => {
    if (dbModule?.db.open) dbModule.db.close();
    vi.unstubAllEnvs();
    if (testRoot) {
      const localPath = relative(tmpdir(), testRoot);
      if (!localPath || localPath.startsWith("..") || isAbsolute(localPath) || !basename(testRoot).startsWith("newscg-graphic-migration-")) {
        throw new Error("Direktori tes tidak valid untuk dibersihkan");
      }
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it("drops only the legacy approval column and preserves rows, order, fields, and Program", () => {
    const columns = dbModule.db.pragma("table_info(graphic_items)") as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("status");
    expect(columns.map((column) => column.name)).toContain("retained_metadata");
    const rows = dbModule.db.prepare("SELECT rowid,id,item_id,template_type,sort_order,retained_metadata,draft_fields,last_pushed_fields FROM graphic_items ORDER BY rowid").all();
    expect(rows).toEqual([
      { rowid: 41, id: "CG-LEGACY-DRAFT", item_id: "ITEM-LEGACY", template_type: "HEADLINE", sort_order: 0, retained_metadata: "draft-metadata", draft_fields: JSON.stringify(draftFields), last_pushed_fields: JSON.stringify(pushedFields) },
      { rowid: 73, id: "CG-LEGACY-READY", item_id: "ITEM-LEGACY", template_type: "REPORTER", sort_order: 0, retained_metadata: "ready-metadata", draft_fields: JSON.stringify(readyFields), last_pushed_fields: null }
    ]);
    const rundown = dbModule.getRundown("RD-LEGACY")!;
    expect(rundown).toMatchObject({ programName: "NEWS LAMA", title: "Rundown lama", updatedAt: "2026-01-02" });
    expect(rundown.items[0]).toMatchObject({ id: "ITEM-LEGACY", cgRequired: true, estimatedDurationSeconds: 90, sortOrder: 0 });
    expect(rundown.items[0]!.graphics.map((graphic) => graphic.id)).toEqual(["CG-LEGACY-DRAFT", "CG-LEGACY-READY"]);
    expect(rundown.items[0]!.graphics.every((graphic) => !Object.hasOwn(graphic, "status"))).toBe(true);
    expect(dbModule.getOnAir()).toEqual({ graphicId: "CG-LEGACY-DRAFT", inputGuid: "web-overlay", overlayNumber: 1, snapshot: pushedFields, status: "confirmed", updatedAt: "2026-01-02T00:00:00.000Z" });
    expect(dbModule.db.prepare("SELECT value FROM settings WHERE key='master_overlay'").get()).toEqual({ value: storedMaster });
    expect(dbModule.db.pragma("foreign_key_check")).toEqual([]);
    expect(dbModule.db.prepare("SELECT version FROM migrations ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it("accepts and strips legacy status from graphic, patch, story, and import payloads", () => {
    for (const status of ["DRAFT", "READY"]) {
      const input = { templateType: "HEADLINE", sortOrder: 0, status, draftFields };
      const parsed = graphicInputSchema.parse(input);
      expect(parsed).not.toHaveProperty("status");
      expect(parsed.draftFields).toEqual(draftFields);
      expect(graphicPatchSchema.parse({ status, draftFields: { headline: "REVISI" } })).toEqual({ draftFields: { headline: "REVISI" } });
      const story = storyInputSchema.parse({ slug: "IMPOR", title: "Berita impor", format: "VO", graphics: [input] });
      expect(story.graphics[0]).not.toHaveProperty("status");
      const imported = dbModule.createRundown(rundownInputSchema.parse({ programName: "NEWS IMPOR", title: "Rundown impor", items: [{ ...story, graphics: [input] }] }));
      expect(imported.items[0]!.graphics[0]).not.toHaveProperty("status");
      expect(imported.items[0]!.graphics[0]!.draftFields).toEqual(draftFields);
    }
  });

  it("creates and updates material with explicit columns while preserving unrelated stored data", () => {
    const graphic = dbModule.createGraphic("ITEM-LEGACY", graphicInputSchema.parse({ templateType: "HEADLINE", draftFields: { headline: "MATERI BARU" } }));
    expect(graphic).not.toHaveProperty("status");
    expect(dbModule.db.prepare("SELECT retained_metadata FROM graphic_items WHERE id=?").get(graphic.id)).toEqual({ retained_metadata: "retained-default" });
    const previousProgram = dbModule.getOnAir();
    const updated = dbModule.updateGraphic("CG-LEGACY-DRAFT", graphicPatchSchema.parse({ status: "READY", draftFields: { headline: "REVISI DI EDITOR" } }));
    expect(updated).not.toHaveProperty("status");
    expect(updated?.draftFields).toEqual({ ...draftFields, headline: "REVISI DI EDITOR" });
    expect(updated?.lastPushedFields).toEqual(pushedFields);
    expect(dbModule.getOnAir()).toEqual(previousProgram);
    expect(dbModule.db.prepare("SELECT retained_metadata FROM graphic_items WHERE id='CG-LEGACY-DRAFT'").get()).toEqual({ retained_metadata: "draft-metadata" });
  });

  it("can TAKE formerly DRAFT material after migration without approval", async () => {
    const live = await import("../src/live.js");
    const result = await live.take("CG-LEGACY-DRAFT", "take-migrated-material");
    expect(result.commandStatus).toBe("confirmed");
    expect(result.error).toBeNull();
    expect(dbModule.getOnAir()?.graphicId).toBe("CG-LEGACY-DRAFT");
    expect(dbModule.getOnAir()?.snapshot?.headline).toBe("REVISI DI EDITOR");
  });

  it("runs the migration again without changing material or Program", async () => {
    const material = dbModule.db.prepare("SELECT rowid,* FROM graphic_items ORDER BY rowid").all();
    const program = dbModule.getOnAir();
    dbModule.db.close();
    vi.resetModules();
    dbModule = await import("../src/db.js");
    expect(dbModule.db.prepare("SELECT rowid,* FROM graphic_items ORDER BY rowid").all()).toEqual(material);
    expect(dbModule.getOnAir()).toEqual(program);
    expect(dbModule.db.prepare("SELECT version FROM migrations ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect(dbModule.db.pragma("foreign_key_check")).toEqual([]);
    expect(dbModule.db.prepare("SELECT value FROM settings WHERE key='master_overlay'").get()).toEqual({ value: storedMaster });
  });
});
