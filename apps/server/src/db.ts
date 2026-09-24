import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, GraphicItem, HeadlineDefaults, MasterOverlayState, Rundown, RundownItem, TemplateType } from "@newscg/shared";
import { defaultHeadlineDefaults, defaultMasterOverlayState } from "@newscg/shared";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(serverRoot, process.env.DATABASE_PATH || "./data/newscg.db");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rundowns (
  id TEXT PRIMARY KEY, program_name TEXT NOT NULL, title TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rundown_items (
  id TEXT PRIMARY KEY, rundown_id TEXT NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, title TEXT NOT NULL, format TEXT NOT NULL,
  estimated_duration_seconds INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS graphic_items (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES rundown_items(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'DRAFT',
  draft_fields TEXT NOT NULL, last_pushed_fields TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS on_air_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1), graphic_id TEXT, input_guid TEXT,
  overlay_number INTEGER, snapshot TEXT, status TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS action_logs (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL,
  graphic_id TEXT, request_id TEXT, created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO migrations(version, applied_at) VALUES (1, datetime('now'));
`);
const itemColumns = db.prepare("PRAGMA table_info(rundown_items)").all() as Array<{ name: string }>;
if (!itemColumns.some((column) => column.name === "cg_required")) {
  db.exec("ALTER TABLE rundown_items ADD COLUMN cg_required INTEGER NOT NULL DEFAULT 1");
  db.exec("UPDATE rundown_items SET cg_required = 0 WHERE format = 'LAINNYA' AND NOT EXISTS (SELECT 1 FROM graphic_items WHERE item_id = rundown_items.id)");
}

const json = <T>(value: string | null): T | null => value ? JSON.parse(value) as T : null;

export function getRundowns(): Rundown[] {
  return (db.prepare("SELECT id, program_name, title, updated_at FROM rundowns ORDER BY updated_at DESC").all() as any[]).map(readRundownRow);
}
export function getRundown(id: string): Rundown | null {
  const row = db.prepare("SELECT id, program_name, title, updated_at FROM rundowns WHERE id = ?").get(id) as any;
  return row ? readRundownRow(row) : null;
}
function readRundownRow(row: any): Rundown {
  const items = (db.prepare("SELECT * FROM rundown_items WHERE rundown_id = ? ORDER BY sort_order, rowid").all(row.id) as any[]).map(readItemRow);
  return { id: row.id, programName: row.program_name, title: row.title, updatedAt: row.updated_at, items };
}
function readItemRow(row: any): RundownItem {
  const graphics = (db.prepare("SELECT * FROM graphic_items WHERE item_id = ? ORDER BY sort_order, rowid").all(row.id) as any[]).map(readGraphicRow);
  return { id: row.id, rundownId: row.rundown_id, slug: row.slug, title: row.title, format: row.format, cgRequired: Boolean(row.cg_required), estimatedDurationSeconds: row.estimated_duration_seconds, sortOrder: row.sort_order, graphics };
}
export function getItem(id: string): RundownItem | null {
  const row = db.prepare("SELECT * FROM rundown_items WHERE id = ?").get(id) as any;
  return row ? readItemRow(row) : null;
}
function readGraphicRow(row: any): GraphicItem {
  return { id: row.id, itemId: row.item_id, templateType: row.template_type, sortOrder: row.sort_order, status: row.status, draftFields: json(row.draft_fields) || {}, lastPushedFields: json(row.last_pushed_fields) };
}
export function getGraphic(id: string): GraphicItem | null {
  const row = db.prepare("SELECT * FROM graphic_items WHERE id = ?").get(id) as any;
  return row ? readGraphicRow(row) : null;
}

export const createRundown = db.transaction((input: { id?: string; programName: string; title: string; items?: any[] }) => {
  const id = input.id || `RD-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO rundowns(id, program_name, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, input.programName, input.title, now, now);
  for (const item of input.items || []) {
    const itemId = item.id || randomUUID();
    db.prepare("INSERT INTO rundown_items(id,rundown_id,slug,title,format,estimated_duration_seconds,sort_order,cg_required) VALUES (?,?,?,?,?,?,?,?)").run(itemId, id, item.slug, item.title, item.format, item.estimatedDurationSeconds, item.sortOrder, Number(item.cgRequired ?? item.format !== "LAINNYA"));
    for (const graphic of item.graphics || []) {
      db.prepare("INSERT INTO graphic_items VALUES (?, ?, ?, ?, ?, ?, NULL)").run(graphic.id || randomUUID(), itemId, graphic.templateType, graphic.sortOrder, graphic.status || "DRAFT", JSON.stringify(graphic.draftFields));
    }
  }
  return getRundown(id)!;
});

export function updateRundown(id: string, patch: any) {
  const current = getRundown(id); if (!current) return null;
  db.prepare("UPDATE rundowns SET program_name = ?, title = ?, updated_at = ? WHERE id = ?").run(patch.programName ?? current.programName, patch.title ?? current.title, new Date().toISOString(), id);
  return getRundown(id);
}
export function deleteRundown(id: string) { return db.prepare("DELETE FROM rundowns WHERE id = ?").run(id).changes > 0; }
export function createItem(rundownId: string, input: any) {
  const id = randomUUID();
  db.prepare("INSERT INTO rundown_items(id,rundown_id,slug,title,format,estimated_duration_seconds,sort_order,cg_required) VALUES (?,?,?,?,?,?,?,?)").run(id, rundownId, input.slug, input.title, input.format, input.estimatedDurationSeconds, input.sortOrder, Number(input.cgRequired ?? input.format !== "LAINNYA"));
  touch(rundownId); return (getRundown(rundownId)?.items.find(x => x.id === id)) || null;
}
export function updateItem(id: string, patch: any) {
  const row = db.prepare("SELECT * FROM rundown_items WHERE id = ?").get(id) as any; if (!row) return null;
  db.prepare("UPDATE rundown_items SET slug=?,title=?,format=?,estimated_duration_seconds=?,sort_order=?,cg_required=? WHERE id=?").run(patch.slug ?? row.slug, patch.title ?? row.title, patch.format ?? row.format, patch.estimatedDurationSeconds ?? row.estimated_duration_seconds, patch.sortOrder ?? row.sort_order, Number(patch.cgRequired ?? Boolean(row.cg_required)), id);
  touch(row.rundown_id); return readItemRow(db.prepare("SELECT * FROM rundown_items WHERE id=?").get(id));
}
export function deleteItem(id: string) {
  const row = db.prepare("SELECT rundown_id FROM rundown_items WHERE id=?").get(id) as any; if (!row) return false;
  const changed = db.prepare("DELETE FROM rundown_items WHERE id=?").run(id).changes > 0; touch(row.rundown_id); return changed;
}
export function createGraphic(itemId: string, input: any) {
  const id = input.id || randomUUID();
  db.prepare("INSERT INTO graphic_items VALUES (?, ?, ?, ?, ?, ?, NULL)").run(id, itemId, input.templateType, input.sortOrder, input.status, JSON.stringify(input.draftFields));
  return getGraphic(id)!;
}
export function updateGraphic(id: string, patch: any) {
  const current = getGraphic(id); if (!current) return null;
  const mergedFields = patch.draftFields !== undefined ? { ...current.draftFields, ...patch.draftFields } : current.draftFields;
  db.prepare("UPDATE graphic_items SET template_type=?,sort_order=?,status=?,draft_fields=? WHERE id=?").run(patch.templateType ?? current.templateType, patch.sortOrder ?? current.sortOrder, patch.status ?? current.status, JSON.stringify(mergedFields), id);
  return getGraphic(id);
}
export function deleteGraphic(id: string) { return db.prepare("DELETE FROM graphic_items WHERE id=?").run(id).changes > 0; }
export const saveStory = db.transaction((rundownId: string, itemId: string | null, input: any) => {
  const rundown = getRundown(rundownId);
  if (!rundown) throw new Error("Rundown tidak ditemukan");
  const current = itemId ? rundown.items.find(i => i.id === itemId) : null;
  if (itemId && !current) throw new Error("Berita tidak ditemukan");
  const ids = input.graphics.filter((g: any) => g.id).map((g: any) => g.id);
  if (new Set(ids).size !== ids.length || ids.some((id: string) => !current?.graphics.some(g => g.id === id))) throw new Error("ID grafis tidak valid untuk berita ini");
  const onAirId = getOnAir()?.graphicId;
  if (current?.graphics.some(g => g.id === onAirId && !ids.includes(g.id))) throw new Error("CG sedang tayang. Sembunyikan sebelum menghapus.");
  const item = current ? updateItem(current.id, input)! : createItem(rundownId, input)!;
  for (const g of current?.graphics || []) if (!ids.includes(g.id)) deleteGraphic(g.id);
  for (const g of input.graphics) g.id ? updateGraphic(g.id, g) : createGraphic(item.id, g);
  return getRundown(rundownId)!.items.find(i => i.id === item.id)!;
});
export function markGraphicPushed(id: string, fields: Record<string, string>) { db.prepare("UPDATE graphic_items SET last_pushed_fields=? WHERE id=?").run(JSON.stringify(fields), id); }
function touch(id: string) { db.prepare("UPDATE rundowns SET updated_at=? WHERE id=?").run(new Date().toISOString(), id); }

const settingDefaults: Record<string, any> = { outputMode: "web" };
export function getSettingsInternal() {
  const rows = Object.fromEntries((db.prepare("SELECT key,value FROM settings").all() as any[]).map(r => [r.key, JSON.parse(r.value)]));
  return { ...settingDefaults, ...rows };
}
export function getSettings(): AppSettings { return getSettingsInternal(); }
export const saveSettings = db.transaction((patch: any) => {
  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(val));
    }
  }
  return getSettings();
});
export function logAction(action: string, status: string, message: string, graphicId?: string | null, requestId?: string) {
  db.prepare("INSERT INTO action_logs VALUES(?,?,?,?,?,?,?)").run(randomUUID(), action, status, message, graphicId || null, requestId || null, new Date().toISOString());
}
export function getActions(limit = 50) { return db.prepare("SELECT * FROM action_logs ORDER BY created_at DESC LIMIT ?").all(limit); }
export function saveOnAir(graphicId: string | null, inputGuid: string | null, overlayNumber: number, snapshot: Record<string,string> | null, status: string) {
  db.prepare("INSERT INTO on_air_state VALUES(1,?,?,?,?,?,?) ON CONFLICT(singleton) DO UPDATE SET graphic_id=excluded.graphic_id,input_guid=excluded.input_guid,overlay_number=excluded.overlay_number,snapshot=excluded.snapshot,status=excluded.status,updated_at=excluded.updated_at").run(graphicId, inputGuid, overlayNumber, snapshot ? JSON.stringify(snapshot) : null, status, new Date().toISOString());
}
export function getOnAir() { const row = db.prepare("SELECT * FROM on_air_state WHERE singleton=1").get() as any; return row ? { graphicId: row.graphic_id, inputGuid: row.input_guid, overlayNumber: row.overlay_number, snapshot: json(row.snapshot), status: row.status, updatedAt: row.updated_at } : null; }

export function getMasterOverlay(): MasterOverlayState {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'master_overlay'").get() as any;
  if (!row) return defaultMasterOverlayState;
  const parsed = json(row.value) as any;
  return { ...defaultMasterOverlayState, ...(parsed || {}) };
}

export function saveMasterOverlay(patch: Partial<MasterOverlayState>): MasterOverlayState {
  const current = getMasterOverlay();
  const updated = { ...current, ...patch };
  db.prepare("INSERT INTO settings(key, value) VALUES('master_overlay', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(updated));
  return updated;
}

export function getHeadlineDefaults(): HeadlineDefaults {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'headline_defaults'").get() as any;
  if (!row) return defaultHeadlineDefaults;
  const parsed = json(row.value) as any;
  return { ...defaultHeadlineDefaults, ...(parsed || {}) };
}

export function saveHeadlineDefaults(patch: Partial<HeadlineDefaults>): HeadlineDefaults {
  const current = getHeadlineDefaults();
  const updated = { ...current, ...patch };
  db.prepare("INSERT INTO settings(key, value) VALUES('headline_defaults', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(updated));
  return updated;
}

export function seedIfEmpty() {
  if ((db.prepare("SELECT COUNT(*) count FROM rundowns").get() as any).count) return;
  const rd = createRundown({ id: "NEWS-001", programName: "NEWS LIVE", title: "Rundown Siaran", items: [] });
  logAction("SYSTEM", "confirmed", `Rundown baru ${rd.id} dibuat (bersih)`);
}
