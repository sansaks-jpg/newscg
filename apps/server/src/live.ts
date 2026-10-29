import { randomUUID } from "node:crypto";
import type { GraphicItem, LiveNewsAnchorInput, LiveReporterInput, LiveState, LiveVariantAction, MasterOverlayState, OverlayEvent } from "@newscg/shared";
import { createFieldReporterGraphic, createNewsAnchorGraphic, fieldReporterGraphicId, newsAnchorDefaultsSchema, newsAnchorGraphicId, normalizeHeadlineTopicFields, reporterDefaultsSchema } from "@newscg/shared";
import { getNewsAnchorDefaults, getReporterDefaults } from "./db.js";
import { getGraphic, getItem, getMasterOverlay, getOnAir, logAction, markGraphicPushed, rundownTickerSnapshot, saveProgramWithTicker, saveMasterAndClearOnAir, saveMasterOverlay, saveOnAir } from "./db.js";

let selectedGraphicId: string | null = null;
let live: LiveState = {
  connection: "STANDALONE",
  commandStatus: "idle",
  selectedGraphicId: null,
  onAirGraphicId: null,
  actualOverlayInputGuid: null,
  onAirSnapshot: null,
  lastActionAt: null,
  error: null,
  overlayClientsCount: 0
};
const idempotency = new Map<string, { signature: string; result: Promise<any> }>();
let queue: Promise<unknown> = Promise.resolve();

type OverlaySubscriberRole = "output" | "monitor";
type OverlaySubscriber = {
  id: string;
  role: OverlaySubscriberRole;
  handler: (event: OverlayEvent) => void;
};
const subscribers = new Map<string, OverlaySubscriber>();
let currentRevision = 1;

function effectiveOnAirFields(graphic: GraphicItem | null, fields: Record<string, string> | null | undefined) {
  return fields ? normalizeHeadlineTopicFields(graphic?.templateType, fields) : null;
}

function getProgramGraphic(graphicId: string | null | undefined, snapshot?: unknown): GraphicItem | null {
  if (graphicId === newsAnchorGraphicId) {
    const defaults = newsAnchorDefaultsSchema.safeParse(snapshot);
    return defaults.success && defaults.data.name ? createNewsAnchorGraphic(defaults.data) : null;
  }
  if (graphicId === fieldReporterGraphicId) {
    const defaults = reporterDefaultsSchema.safeParse(snapshot);
    return defaults.success && defaults.data.name ? createFieldReporterGraphic(defaults.data) : null;
  }
  return graphicId ? getGraphic(graphicId) : null;
}

export function addOverlaySubscriber(
  handler: (event: OverlayEvent) => void,
  role: OverlaySubscriberRole = "output"
) {
  const id = randomUUID();
  subscribers.set(id, { id, role, handler });
  const current = getOnAir();
  const graphic = getProgramGraphic(current?.graphicId, current?.snapshot);
  const master = getMasterOverlay();
  handler({
    type: "SYNC",
    onAir: Boolean(current?.graphicId),
    graphic,
    fields: effectiveOnAirFields(graphic, current?.snapshot as Record<string, string> | null),
    master,
    revision: currentRevision
  });
  return () => {
    subscribers.delete(id);
  };
}

function broadcastOverlayEvent(event: OverlayEvent) {
  currentRevision++;
  const eventWithRevision: OverlayEvent = { ...event, revision: currentRevision };
  for (const sub of subscribers.values()) {
    try {
      sub.handler(eventWithRevision);
    } catch (e) {
      console.error("Gagal mengirim event overlay", e);
    }
  }
}

function getOutputClientsCount(): number {
  let count = 0;
  for (const sub of subscribers.values()) {
    if (sub.role === "output") count++;
  }
  return count;
}

function enqueue<T>(key: string, signature: string, action: () => Promise<T>): Promise<T> {
  const existing = idempotency.get(key);
  if (existing) {
    if (existing.signature !== signature) {
      const error = Object.assign(new Error("Idempotency-Key sudah digunakan untuk perintah atau data siaran berbeda. Gunakan kunci baru."),
        { status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
      return Promise.reject(error);
    }
    return existing.result;
  }
  const result = queue.then(action, action);
  queue = result.catch(() => undefined);
  idempotency.set(key, { signature, result });
  const expire = () => {
    const timer = setTimeout(() => {
      if (idempotency.get(key)?.result === result) idempotency.delete(key);
    }, 60_000);
    if (timer.unref) timer.unref();
  };
  void result.then(expire, expire);
  return result;
}

function publicState(): LiveState {
  const persisted = getOnAir();
  const outputClientsCount = getOutputClientsCount();
  const connection = outputClientsCount > 0 ? "CONNECTED" : "STANDALONE";
  return {
    ...live,
    selectedGraphicId,
    connection,
    overlayClientsCount: outputClientsCount,
    onAirGraphicId: persisted?.graphicId || null,
    actualOverlayInputGuid: persisted?.graphicId ? "web-overlay" : null,
    onAirSnapshot: effectiveOnAirFields(
      getProgramGraphic(persisted?.graphicId, persisted?.snapshot),
      persisted?.snapshot as Record<string, string> | null
    )
  };
}

export const getLiveState = publicState;

export function prepare(graphicId: string) {
  if (!getGraphic(graphicId)) throw new Error("Grafis tidak ditemukan");
  selectedGraphicId = graphicId;
  live = { ...live, selectedGraphicId, error: null };
  return publicState();
}

export function take(graphicId: string, idempotencyKey: string, options?: { presentation?: "clean"; fields?: Record<string, string> }) {
  return enqueue(idempotencyKey, `TAKE:${JSON.stringify([graphicId, options?.presentation ?? null, options?.fields ?? null])}`, async () => {
    const requestId = randomUUID();
    const graphic = getGraphic(graphicId);
    live = { ...live, commandStatus: "pending", error: null, lastActionAt: new Date().toISOString() };

    try {
      if (!graphic) throw new Error("Grafis tidak ditemukan");
      if (!getItem(graphic.itemId)?.cgRequired) throw new Error("TAKE diblokir: item rundown ditandai tanpa CG.");
      const previous = getOnAir();
      const previousGraphic = previous?.graphicId ? getGraphic(previous.graphicId) : null;
      const switchDetail = Boolean(previousGraphic && previousGraphic.id !== graphic.id &&
        previousGraphic.itemId === graphic.itemId &&
        ["HEADLINE", "SOT"].includes(previousGraphic.templateType) &&
        ["HEADLINE", "SOT"].includes(graphic.templateType));
      const sourceFields = options?.fields || graphic.draftFields;
      const normalized = normalizeHeadlineTopicFields(graphic.templateType, sourceFields);
      const effectiveFields: Record<string, string> = options?.presentation === "clean"
        ? { ...normalized, showLocation: "false", showKicker: "false", layoutStyle: "single" }
        : { ...normalized };
      if (switchDetail && previous?.snapshot && !options?.fields) {
        const snapshot = effectiveOnAirFields(previousGraphic, previous.snapshot as Record<string, string>) || {};
        effectiveFields.location = snapshot.location || effectiveFields.location || "";
        effectiveFields.showLocation = snapshot.showLocation ?? (snapshot.location?.trim() ? "true" : "false");
      }

      const master = saveProgramWithTicker(graphic, effectiveFields);
      live = {
        ...live,
        commandStatus: "confirmed",
        onAirGraphicId: graphic.id,
        actualOverlayInputGuid: "web-overlay",
        onAirSnapshot: effectiveFields,
        error: null
      };
      broadcastOverlayEvent({ type: switchDetail ? "SWITCH_DETAIL" : "TAKE", graphic, fields: effectiveFields, master });
      const currentOutputs = getOutputClientsCount();
      const statusNote = currentOutputs > 0 ? `(${currentOutputs} output terhubung)` : "(siaga / belum ada output vMix-OBS)";
      logAction("TAKE", "confirmed", `${graphic.templateType} terkonfirmasi ON AIR ${statusNote}`, graphic.id, requestId);
      return {
        requestId,
        commandStatus: "confirmed",
        actualOverlayInputGuid: "web-overlay",
        timestamp: new Date().toISOString(),
        error: null,
        state: publicState()
      };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      logAction("TAKE", "failed", e.message, graphic?.id, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

/** Default anchor is a Program snapshot, never a cue inserted into a rundown. */
export function takeNewsAnchor(input: LiveNewsAnchorInput, idempotencyKey: string) {
  return enqueue(idempotencyKey, `NEWS_ANCHOR:${JSON.stringify([input.action, input.defaults ?? null])}`, async () => {
    const requestId = randomUUID();
    try {
      const defaults = input.defaults || getNewsAnchorDefaults();
      if (!defaults.name.trim()) throw new Error("Isi Nama Anchor di Pengaturan Default News Anchor sebelum menayangkan.");
      const graphic = createNewsAnchorGraphic(defaults);
      const current = getOnAir();
      const update = current?.graphicId === newsAnchorGraphicId;
      if (input.action === "update" && !update) throw new Error("UPDATE diblokir: news anchor tidak sedang ON AIR.");
      const fields = { ...graphic.draftFields };
      saveOnAir(graphic.id, "web-overlay", 1, fields, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: graphic.id, onAirSnapshot: fields,
        actualOverlayInputGuid: "web-overlay", lastActionAt: new Date().toISOString(), error: null };
      broadcastOverlayEvent(update
        ? { type: "UPDATE", graphicId: graphic.id, fields, master: getMasterOverlay() }
        : { type: "TAKE", graphic, fields, master: getMasterOverlay() });
      logAction(update ? "UPDATE" : "TAKE", "confirmed", "News anchor default terkonfirmasi ON AIR", graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: "web-overlay",
        timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "News anchor gagal ditayangkan";
      live = { ...live, commandStatus: "failed", error: message };
      logAction(input.action === "update" ? "UPDATE" : "TAKE", "failed", message, newsAnchorGraphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: getOnAir()?.inputGuid || null,
        timestamp: new Date().toISOString(), error: message, state: publicState() };
    }
  });
}

export function takeFieldReporter(input: LiveReporterInput, idempotencyKey: string) {
  return enqueue(idempotencyKey, `FIELD_REPORTER:${JSON.stringify([input.action, input.defaults ?? null])}`, async () => {
    const requestId = randomUUID();
    try {
      const defaults = input.defaults || getReporterDefaults();
      if (!defaults.name.trim()) throw new Error("Isi Nama Reporter Lapangan di Pengaturan Default Reporter Lapangan sebelum menayangkan.");
      const graphic = createFieldReporterGraphic(defaults);
      const current = getOnAir();
      const update = current?.graphicId === fieldReporterGraphicId;
      if (input.action === "update" && !update) throw new Error("UPDATE diblokir: reporter lapangan tidak sedang ON AIR.");
      const fields = { ...graphic.draftFields };
      saveOnAir(graphic.id, "web-overlay", 1, fields, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: graphic.id, onAirSnapshot: fields,
        actualOverlayInputGuid: "web-overlay", lastActionAt: new Date().toISOString(), error: null };
      broadcastOverlayEvent(update
        ? { type: "UPDATE", graphicId: graphic.id, fields, master: getMasterOverlay() }
        : { type: "TAKE", graphic, fields, master: getMasterOverlay() });
      logAction(update ? "UPDATE" : "TAKE", "confirmed", "Reporter lapangan default terkonfirmasi ON AIR", graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: "web-overlay",
        timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reporter lapangan gagal ditayangkan";
      live = { ...live, commandStatus: "failed", error: message };
      logAction(input.action === "update" ? "UPDATE" : "TAKE", "failed", message, fieldReporterGraphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: getOnAir()?.inputGuid || null,
        timestamp: new Date().toISOString(), error: message, state: publicState() };
    }
  });
}

export function updateLive(
  graphicId: string,
  idempotencyKey: string,
  options?: { syncComposition?: boolean; fields?: Record<string, string> }
) {
  return enqueue(idempotencyKey, `UPDATE:${JSON.stringify([graphicId, options?.syncComposition ?? false, options?.fields ?? null])}`, async () => {
    const requestId = randomUUID();

    try {
      const graphic = getGraphic(graphicId);
      const current = getOnAir();
      const previousGraphic = current?.graphicId ? getGraphic(current.graphicId) : null;
      const switchDetail = Boolean(graphic && previousGraphic && previousGraphic.id !== graphic.id &&
        previousGraphic.itemId === graphic.itemId &&
        ["HEADLINE", "SOT"].includes(previousGraphic.templateType) &&
        ["HEADLINE", "SOT"].includes(graphic.templateType));
      if (!graphic || !current || (current.graphicId !== graphicId && !switchDetail)) {
        throw new Error("UPDATE diblokir: grafis ini tidak terverifikasi ON AIR");
      }
      live = { ...live, commandStatus: "pending", error: null };

      const existingSnapshot = effectiveOnAirFields(previousGraphic, current.snapshot as Record<string, string>) || {};
      const effectiveFields: Record<string, string> = {
        ...normalizeHeadlineTopicFields(graphic.templateType, options?.fields || graphic.draftFields)
      };
      if (!options?.syncComposition && !options?.fields) {
        if (existingSnapshot.showLocation !== undefined) effectiveFields.showLocation = existingSnapshot.showLocation;
        if (existingSnapshot.showKicker !== undefined) effectiveFields.showKicker = existingSnapshot.showKicker;
        if (existingSnapshot.layoutStyle !== undefined) effectiveFields.layoutStyle = existingSnapshot.layoutStyle;
      }
      if (switchDetail && !options?.fields) {
        effectiveFields.location = existingSnapshot.location || effectiveFields.location || "";
        effectiveFields.showLocation = existingSnapshot.showLocation ?? (existingSnapshot.location?.trim() ? "true" : "false");
      }
      markGraphicPushed(graphic.id, effectiveFields);
      saveOnAir(graphic.id, "web-overlay", 1, effectiveFields, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: graphic.id, onAirSnapshot: effectiveFields, lastActionAt: new Date().toISOString(), error: null };
      broadcastOverlayEvent(switchDetail
        ? { type: "SWITCH_DETAIL", graphic, fields: effectiveFields, master: getMasterOverlay() }
        : { type: "UPDATE", graphicId: graphic.id, fields: effectiveFields, master: getMasterOverlay() });
      logAction("UPDATE", "confirmed", "Konten ON AIR diperbarui (Web Overlay)", graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: "web-overlay", timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      logAction("UPDATE", "failed", e.message, graphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: getOnAir()?.inputGuid || null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function takeVariantLive(
  graphicId: string,
  action: LiveVariantAction,
  idempotencyKey: string
) {
  return enqueue(idempotencyKey, `VARIANT:${JSON.stringify([graphicId, action])}`, async () => {
    const requestId = randomUUID();

    try {
      const graphic = getGraphic(graphicId);
      const current = getOnAir();
      if (!graphic || !current || current.graphicId !== graphicId) {
        throw new Error("Perubahan varian diblokir: grafis ini tidak sedang ON AIR");
      }

      const currentSnapshot = effectiveOnAirFields(graphic, current.snapshot as Record<string, string>) ||
        normalizeHeadlineTopicFields(graphic.templateType, graphic.draftFields);
      const updatedSnapshot = { ...currentSnapshot };

      if (action === "clean-headline") {
        updatedSnapshot.showLocation = "false";
        updatedSnapshot.showKicker = "false";
        updatedSnapshot.layoutStyle = "single";
      } else if (action === "toggle-location") {
        const hasLocation = Boolean(currentSnapshot.location?.trim());
        if (!hasLocation) {
          throw new Error("Data lokasi belum tersedia pada berita ini");
        }
        const isCurrentShown = currentSnapshot.showLocation !== "false";
        updatedSnapshot.showLocation = isCurrentShown ? "false" : "true";
      } else if (action === "toggle-kicker") {
        const hasKicker = Boolean(currentSnapshot.kicker?.trim());
        if (!hasKicker) {
          throw new Error("Topik/kicker belum tersedia pada berita ini");
        }
        const isCurrentShown = currentSnapshot.showKicker !== "false";
        updatedSnapshot.showKicker = isCurrentShown ? "false" : "true";
      } else if (action === "toggle-detail") {
        const hasDetail = Boolean(currentSnapshot.subline?.trim());
        if (!hasDetail) {
          throw new Error("Detail/subline belum tersedia pada berita ini");
        }
        const isCurrentSub = currentSnapshot.layoutStyle === "sub";
        updatedSnapshot.layoutStyle = isCurrentSub ? "single" : "sub";
      } else {
        throw new Error(`Aksi varian '${action}' tidak dikenal`);
      }

      saveOnAir(graphic.id, "web-overlay", 1, updatedSnapshot, "confirmed");
      live = {
        ...live,
        commandStatus: "confirmed",
        onAirSnapshot: updatedSnapshot,
        lastActionAt: new Date().toISOString(),
        error: null
      };
      broadcastOverlayEvent({
        type: "UPDATE",
        graphicId: graphic.id,
        fields: updatedSnapshot,
        master: getMasterOverlay()
      });
      logAction("VARIANT", "confirmed", `Varian ${action} diterapkan pada ${graphic.id}`, graphic.id, requestId);
      return {
        requestId,
        commandStatus: "confirmed",
        actualOverlayInputGuid: "web-overlay",
        timestamp: new Date().toISOString(),
        error: null,
        state: publicState()
      };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      logAction("VARIANT", "failed", e.message, graphicId, requestId);
      return {
        requestId,
        commandStatus: "failed",
        actualOverlayInputGuid: getOnAir()?.inputGuid || null,
        timestamp: new Date().toISOString(),
        error: e.message,
        state: publicState()
      };
    }
  });
}

export function clearLive(idempotencyKey: string) {
  return enqueue(idempotencyKey, "CLEAR", async () => {
    const requestId = randomUUID();

    try {
      const current = getOnAir();
      if (!current?.graphicId) throw new Error("Tidak ada grafis NewsCG yang terverifikasi ON AIR");
      live = { ...live, commandStatus: "pending", error: null };

      saveOnAir(null, null, 1, null, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString(), error: null };
      broadcastOverlayEvent({ type: "CLEAR", master: getMasterOverlay() });
      logAction("CLEAR", "confirmed", "Lower third NewsCG terkonfirmasi bersih (Web Overlay)", current.graphicId, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      const current = getOnAir();
      logAction("CLEAR", "failed", e.message, current?.graphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: current?.inputGuid || null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function clearAllLive(idempotencyKey: string, options?: { immediate?: boolean }) {
  return enqueue(idempotencyKey, `CLEAR_ALL:${options?.immediate !== false}`, async () => {
    const requestId = randomUUID();
    try {
      live = { ...live, commandStatus: "pending", error: null };
      saveMasterAndClearOnAir({ showLogo: false, showTicker: false, showLiveBadge: false, showProgramLogo: false, showWeather: false, tickerText: "", tickerRundownId: null, tickerForDate: null });
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString(), error: null };
      const immediate = options?.immediate !== false;
      broadcastOverlayEvent(immediate ? { type: "CLEAR_ALL_IMMEDIATE" } : { type: "CLEAR_ALL_ANIMATED" });
      logAction("CLEAR_ALL", "confirmed", `Seluruh layer grafis (Blackout) dibersihkan (${immediate ? "Instan" : "Animasi"})`, null, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (error) {
      const message = `Gagal mengosongkan seluruh layer: ${error instanceof Error ? error.message : "Kesalahan penyimpanan"}`;
      live = { ...live, commandStatus: "failed", error: message };
      logAction("CLEAR_ALL", "failed", message, getOnAir()?.graphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: getOnAir()?.inputGuid || null, timestamp: new Date().toISOString(), error: message, state: publicState() };
    }
  });
}

export function setStage(mode: "empty" | "logo" | "full", idempotencyKey: string) {
  return enqueue(idempotencyKey, `STAGE:${mode}`, async () => {
    try {
      live = { ...live, commandStatus: "pending", error: null };
      const liputan7 = getMasterOverlay().broadcastTemplate === "liputan7";
      const master = saveMasterAndClearOnAir({ showLogo: mode !== "empty", showTicker: mode === "full", showLiveBadge: mode === "full",
        showProgramLogo: liputan7 && mode !== "empty", showWeather: liputan7 && mode === "full" });
      live = { ...live, commandStatus: "confirmed", error: null, lastActionAt: new Date().toISOString() };
      broadcastOverlayEvent({ type: "SYNC", onAir: false, graphic: null, fields: null, master });
      logAction("STAGE", "confirmed", `Preset ${mode}`);
      return { state: publicState(), master, commandStatus: "confirmed" };
    } catch (error) {
      const message = `Gagal menerapkan preset ${mode}: ${error instanceof Error ? error.message : "Kesalahan penyimpanan"}`;
      live = { ...live, commandStatus: "failed", error: message };
      logAction("STAGE", "failed", message, getOnAir()?.graphicId);
      return { state: publicState(), master: getMasterOverlay(), commandStatus: "failed", error: message };
    }
  });
}

export function updateMasterState(patch: Partial<MasterOverlayState>): Promise<MasterOverlayState> {
  // Master PATCH must obey the same command order as STAGE/CLEAR_ALL, both of
  // which also update master layers. A synchronous PATCH can otherwise be
  // overwritten by a previously received but still queued STAGE command.
  const action = () => {
    const updated = saveMasterOverlay(patch);
    broadcastOverlayEvent({ type: "MASTER_UPDATE", master: updated });
    logAction("MASTER", "confirmed", "Master broadcast layer diperbarui");
    return updated;
  };
  const result = queue.then(action, action);
  queue = result.catch(() => undefined);
  return result;
}

export function applyRundownTicker(rundownId: string, idempotencyKey: string, immediate = false) {
  return enqueue(idempotencyKey, `TICKER:${rundownId}:${immediate}`, async () => {
    const program = getOnAir();
    const graphic = program?.graphicId ? getGraphic(program.graphicId) : null;
    if (graphic && getItem(graphic.itemId)?.rundownId !== rundownId) {
      throw Object.assign(new Error("Ticker berasal dari rundown berbeda dengan CG Program. TAKE rundown target atau CLEAR dengan instruksi operator terlebih dahulu."), { status: 409 });
    }
    const master = saveMasterOverlay(rundownTickerSnapshot(rundownId, immediate));
    broadcastOverlayEvent({ type: "MASTER_UPDATE", master });
    logAction("TICKER", "confirmed", `Ticker rundown ${rundownId} diterapkan`);
    return { commandStatus: "confirmed" as const, state: publicState(), master };
  });
}
