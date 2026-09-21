import { randomUUID } from "node:crypto";
import type { GraphicItem, LiveState, LiveVariantAction, MasterOverlayState, OverlayEvent } from "@newscg/shared";
import { getGraphic, getMasterOverlay, getOnAir, logAction, markGraphicPushed, saveMasterOverlay, saveOnAir } from "./db.js";

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
const idempotency = new Map<string, Promise<any>>();
let queue: Promise<unknown> = Promise.resolve();

const subscribers = new Set<(event: OverlayEvent) => void>();
let currentRevision = 1;

export function addOverlaySubscriber(handler: (event: OverlayEvent) => void) {
  subscribers.add(handler);
  const current = getOnAir();
  const graphic = current?.graphicId ? getGraphic(current.graphicId) : null;
  const master = getMasterOverlay();
  handler({
    type: "SYNC",
    onAir: Boolean(current?.graphicId),
    graphic,
    fields: (current?.snapshot as Record<string, string> | null) || null,
    master,
    revision: currentRevision
  });
  return () => {
    subscribers.delete(handler);
  };
}

export function broadcastOverlayEvent(event: OverlayEvent) {
  currentRevision++;
  const eventWithRevision: OverlayEvent = { ...event, revision: currentRevision };
  for (const sub of subscribers) {
    try {
      sub(eventWithRevision);
    } catch (e) {
      console.error("Gagal mengirim event overlay", e);
    }
  }
}

function enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
  const existing = idempotency.get(key);
  if (existing) return existing;
  const result = queue.then(action, action);
  queue = result.catch(() => undefined);
  idempotency.set(key, result);
  const timer = setTimeout(() => idempotency.delete(key), 60_000);
  if (timer.unref) timer.unref();
  return result;
}

function publicState(): LiveState {
  const persisted = getOnAir();
  const connection = subscribers.size > 0 ? "CONNECTED" : "STANDALONE";
  return {
    ...live,
    selectedGraphicId,
    connection,
    overlayClientsCount: subscribers.size,
    onAirGraphicId: persisted?.graphicId || null,
    actualOverlayInputGuid: persisted?.graphicId ? "web-overlay" : null,
    onAirSnapshot: (persisted?.snapshot as Record<string, string> | null) || null
  };
}

export const getLiveState = publicState;

export function prepare(graphicId: string) {
  if (!getGraphic(graphicId)) throw new Error("Grafis tidak ditemukan");
  selectedGraphicId = graphicId;
  live = { ...live, selectedGraphicId, error: null };
  return publicState();
}

export function take(graphicId: string, idempotencyKey: string, options?: { presentation?: "clean" }) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    const graphic = getGraphic(graphicId);
    if (!graphic) throw new Error("Grafis tidak ditemukan");
    live = { ...live, commandStatus: "pending", error: null, lastActionAt: new Date().toISOString() };

    try {
      const effectiveFields = options?.presentation === "clean"
        ? { ...graphic.draftFields, showLocation: "false", showKicker: "false", layoutStyle: "single" }
        : graphic.draftFields;

      markGraphicPushed(graphic.id, effectiveFields);
      saveOnAir(graphic.id, "web-overlay", 1, effectiveFields, "confirmed");
      live = {
        ...live,
        commandStatus: "confirmed",
        onAirGraphicId: graphic.id,
        actualOverlayInputGuid: "web-overlay",
        onAirSnapshot: effectiveFields,
        error: null
      };
      broadcastOverlayEvent({ type: "TAKE", graphic, fields: effectiveFields, master: getMasterOverlay() });
      logAction("TAKE", "confirmed", `${graphic.templateType} terkonfirmasi ON AIR (Web Overlay)`, graphic.id, requestId);
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
      logAction("TAKE", "failed", e.message, graphic.id, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function updateLive(
  graphicId: string,
  idempotencyKey: string,
  options?: { syncComposition?: boolean }
) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    const graphic = getGraphic(graphicId);
    const current = getOnAir();

    try {
      if (!graphic || !current || current.graphicId !== graphicId) {
        throw new Error("UPDATE diblokir: grafis ini tidak terverifikasi ON AIR");
      }
      live = { ...live, commandStatus: "pending", error: null };

      const existingSnapshot = (current.snapshot as Record<string, string>) || {};
      const effectiveFields: Record<string, string> = {
        ...graphic.draftFields
      };
      if (!options?.syncComposition) {
        if (existingSnapshot.showLocation !== undefined) effectiveFields.showLocation = existingSnapshot.showLocation;
        if (existingSnapshot.showKicker !== undefined) effectiveFields.showKicker = existingSnapshot.showKicker;
        if (existingSnapshot.layoutStyle !== undefined) effectiveFields.layoutStyle = existingSnapshot.layoutStyle;
      }
      markGraphicPushed(graphic.id, effectiveFields);
      saveOnAir(graphic.id, "web-overlay", 1, effectiveFields, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirSnapshot: effectiveFields, lastActionAt: new Date().toISOString() };
      broadcastOverlayEvent({ type: "UPDATE", graphicId: graphic.id, fields: effectiveFields, master: getMasterOverlay() });
      logAction("UPDATE", "confirmed", "Konten ON AIR diperbarui (Web Overlay)", graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: "web-overlay", timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      logAction("UPDATE", "failed", e.message, graphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: current?.inputGuid || null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function takeVariantLive(
  graphicId: string,
  action: LiveVariantAction,
  idempotencyKey: string
) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    const graphic = getGraphic(graphicId);
    const current = getOnAir();

    try {
      if (!graphic || !current || current.graphicId !== graphicId) {
        throw new Error("Perubahan varian diblokir: grafis ini tidak sedang ON AIR");
      }

      const currentSnapshot = (current.snapshot as Record<string, string>) || { ...graphic.draftFields };
      const updatedSnapshot = { ...currentSnapshot };

      if (action === "clean-headline") {
        updatedSnapshot.showLocation = "false";
        updatedSnapshot.showKicker = "false";
        updatedSnapshot.layoutStyle = "single";
      } else if (action === "toggle-location") {
        const hasLocation = Boolean(graphic.draftFields.location?.trim());
        if (!hasLocation) {
          throw new Error("Data lokasi belum tersedia pada berita ini");
        }
        const isCurrentShown = currentSnapshot.showLocation !== "false";
        updatedSnapshot.showLocation = isCurrentShown ? "false" : "true";
      } else if (action === "toggle-kicker") {
        const hasKicker = Boolean(graphic.draftFields.kicker?.trim());
        if (!hasKicker) {
          throw new Error("Topik/kicker belum tersedia pada berita ini");
        }
        const isCurrentShown = currentSnapshot.showKicker !== "false";
        updatedSnapshot.showKicker = isCurrentShown ? "false" : "true";
      } else if (action === "toggle-detail") {
        const hasDetail = Boolean(graphic.draftFields.subline?.trim());
        if (!hasDetail) {
          throw new Error("Detail/subline belum tersedia pada berita ini");
        }
        const isCurrentSub = currentSnapshot.layoutStyle === "sub";
        updatedSnapshot.layoutStyle = isCurrentSub ? "single" : "sub";
      }

      saveOnAir(graphic.id, "web-overlay", 1, updatedSnapshot, "confirmed");
      live = {
        ...live,
        commandStatus: "confirmed",
        onAirSnapshot: updatedSnapshot,
        lastActionAt: new Date().toISOString()
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
        actualOverlayInputGuid: current?.inputGuid || null,
        timestamp: new Date().toISOString(),
        error: e.message,
        state: publicState()
      };
    }
  });
}

export function clearLive(idempotencyKey: string) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    const current = getOnAir();

    try {
      if (!current?.graphicId) throw new Error("Tidak ada grafis NewsCG yang terverifikasi ON AIR");
      live = { ...live, commandStatus: "pending", error: null };

      saveOnAir(null, null, 1, null, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString() };
      broadcastOverlayEvent({ type: "CLEAR", master: getMasterOverlay() });
      logAction("CLEAR", "confirmed", "Lower third NewsCG terkonfirmasi bersih (Web Overlay)", current.graphicId, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      live = { ...live, commandStatus: "failed", error: e.message };
      logAction("CLEAR", "failed", e.message, current?.graphicId, requestId);
      return { requestId, commandStatus: "failed", actualOverlayInputGuid: current?.inputGuid || null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function clearAllLive(idempotencyKey: string, options?: { immediate?: boolean }) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    saveMasterOverlay({ showLogo: false, showTicker: false, showLiveBadge: false });
    saveOnAir(null, null, 1, null, "confirmed");
    live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString() };
    const immediate = options?.immediate !== false;
    broadcastOverlayEvent(immediate ? { type: "CLEAR_ALL_IMMEDIATE" } : { type: "CLEAR_ALL_ANIMATED" });
    logAction("CLEAR_ALL", "confirmed", `Seluruh layer grafis (Blackout) dibersihkan (${immediate ? "Instan" : "Animasi"})`, null, requestId);
    return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
  });
}

export function setStage(mode: "empty" | "logo" | "full", idempotencyKey: string) {
  return enqueue(idempotencyKey, async () => {
    const master = saveMasterOverlay({ showLogo: mode !== "empty", showTicker: mode === "full", showLiveBadge: mode === "full" });
    saveOnAir(null, null, 1, null, "confirmed");
    live = { ...live, commandStatus: "confirmed", error: null, lastActionAt: new Date().toISOString() };
    broadcastOverlayEvent({ type: "SYNC", onAir: false, graphic: null, fields: null, master });
    logAction("STAGE", "confirmed", `Preset ${mode}`);
    return { state: publicState(), master, commandStatus: "confirmed" };
  });
}

export function updateMasterState(patch: Partial<MasterOverlayState>) {
  const updated = saveMasterOverlay(patch);
  broadcastOverlayEvent({ type: "MASTER_UPDATE", master: updated });
  logAction("MASTER", "confirmed", "Master broadcast layer diperbarui");
  return updated;
}
