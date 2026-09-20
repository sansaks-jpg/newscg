import { randomUUID } from "node:crypto";
import type { GraphicItem, LiveState, LiveVariantAction, MasterOverlayState, OverlayEvent } from "@newscg/shared";
import { getGraphic, getMasterOverlay, getOnAir, getSettingsInternal, logAction, markGraphicPushed, saveMasterOverlay, saveOnAir } from "./db.js";
import { HttpVmixAdapter, MockVmixAdapter, type VmixAdapter } from "./vmix.js";

export const mockAdapter = new MockVmixAdapter();
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
  mode: "mock",
  outputMode: "web",
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

function adapter(): VmixAdapter {
  const s = getSettingsInternal();
  return s.mode === "http"
    ? new HttpVmixAdapter({ host: s.vmixHost, port: s.vmixPort, username: s.username, password: s.password })
    : mockAdapter;
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
  const s = getSettingsInternal();
  const outputMode = s.outputMode || "web";
  let connection = live.connection;
  if (outputMode === "web") {
    connection = subscribers.size > 0 ? "CONNECTED" : "STANDALONE";
  } else if (s.mode === "mock") {
    connection = mockAdapter.connected ? "MOCK" : "DISCONNECTED";
  }
  return {
    ...live,
    selectedGraphicId,
    mode: s.mode,
    outputMode,
    connection,
    overlayClientsCount: subscribers.size,
    onAirGraphicId: persisted?.graphicId || null,
    actualOverlayInputGuid: persisted?.inputGuid || (outputMode === "web" && persisted?.graphicId ? "web-overlay" : null),
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

export function checkConnection() {
  return (async () => {
    const s = getSettingsInternal();
    if (s.outputMode === "web") {
      live.connection = subscribers.size > 0 ? "CONNECTED" : "STANDALONE";
      live.error = null;
      return { ok: true, status: live.connection, message: `Web Overlay siap (${subscribers.size} client terhubung)` };
    }
    const result = await adapter().checkConnection();
    live.connection = s.mode === "mock" ? (result.ok ? "MOCK" : "DISCONNECTED") : (result.ok ? "CONNECTED" : result.authFailed ? "AUTH_FAILED" : "DISCONNECTED");
    live.error = result.ok ? null : result.message;
    return { ...result, status: live.connection };
  })();
}

export async function listInputs() {
  return adapter().listInputs();
}

export function take(graphicId: string, idempotencyKey: string, options?: { presentation?: "clean" }) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    const graphic = getGraphic(graphicId);
    if (!graphic) throw new Error("Grafis tidak ditemukan");
    const settings = getSettingsInternal();
    live = { ...live, commandStatus: "pending", error: null, lastActionAt: new Date().toISOString() };

    // Mode 1: Web Overlay (Singular.live style)
    if (settings.outputMode !== "vmix-gt") {
      try {
        const effectiveFields = options?.presentation === "clean"
          ? { ...graphic.draftFields, showLocation: "false", showKicker: "false", layoutStyle: "single" }
          : graphic.draftFields;

        markGraphicPushed(graphic.id, effectiveFields);
        saveOnAir(graphic.id, "web-overlay", settings.overlayNumber || 1, effectiveFields, "confirmed");
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
    }

    // Mode 2: Legacy vMix GT Title API
    const mapping = settings.mappings.find((m: any) => m.templateType === graphic.templateType);
    if (!mapping) throw new Error(`Mapping ${graphic.templateType} belum diatur`);

    try {
      const connection = await adapter().checkConnection();
      if (!connection.ok) throw new Error(connection.message);
      const overlay = await adapter().getOverlayState(settings.overlayNumber);
      const ownedGuids = new Set(settings.mappings.map((m: any) => m.inputGuid));
      if (overlay.inputGuid && !ownedGuids.has(overlay.inputGuid)) throw new Error("TAKE diblokir: overlay khusus berisi grafis yang bukan milik NewsCG");
      if (overlay.inputGuid === mapping.inputGuid) await adapter().hideOwnedOverlay(mapping.inputGuid, settings.overlayNumber);
      const targetFields = Object.fromEntries(
        Object.entries(mapping.fieldMap)
          .filter(([key]: any) => graphic.draftFields[key] !== undefined)
          .map(([key, target]: any) => [target, graphic.draftFields[key]])
      );
      await adapter().setTitleFields(mapping.inputGuid, targetFields);
      await adapter().showOnOverlay(mapping.inputGuid, settings.overlayNumber);
      const verified = await verifyOverlay(mapping.inputGuid, settings.overlayNumber, settings.pollingIntervalMs);
      if (!verified) throw Object.assign(new Error("Perintah dikirim, tetapi status overlay belum dapat dikonfirmasi"), { unknown: true });
      markGraphicPushed(graphic.id, graphic.draftFields);
      saveOnAir(graphic.id, mapping.inputGuid, settings.overlayNumber, graphic.draftFields, "confirmed");
      live = {
        ...live,
        commandStatus: "confirmed",
        onAirGraphicId: graphic.id,
        actualOverlayInputGuid: mapping.inputGuid,
        onAirSnapshot: graphic.draftFields,
        error: null
      };
      broadcastOverlayEvent({ type: "TAKE", graphic, fields: graphic.draftFields, master: getMasterOverlay() });
      logAction("TAKE", "confirmed", `${graphic.templateType} terkonfirmasi ON AIR`, graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: mapping.inputGuid, timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      const status = e.unknown ? "unknown" : "failed";
      live = { ...live, commandStatus: status, error: e.message };
      logAction("TAKE", status, e.message, graphic.id, requestId);
      return { requestId, commandStatus: status, actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
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
    const settings = getSettingsInternal();

    try {
      if (!graphic || !current || current.graphicId !== graphicId) {
        throw new Error("UPDATE diblokir: grafis ini tidak terverifikasi ON AIR");
      }
      live = { ...live, commandStatus: "pending", error: null };

      if (settings.outputMode !== "vmix-gt") {
        const existingSnapshot = (current.snapshot as Record<string, string>) || {};
        const effectiveFields: Record<string, string> = {
          ...graphic.draftFields
        };
        // Jika syncComposition tidak diset, pertahankan visibilitas lama dari snapshot
        if (!options?.syncComposition) {
          if (existingSnapshot.showLocation !== undefined) effectiveFields.showLocation = existingSnapshot.showLocation;
          if (existingSnapshot.showKicker !== undefined) effectiveFields.showKicker = existingSnapshot.showKicker;
          if (existingSnapshot.layoutStyle !== undefined) effectiveFields.layoutStyle = existingSnapshot.layoutStyle;
        }
        markGraphicPushed(graphic.id, effectiveFields);
        saveOnAir(graphic.id, "web-overlay", settings.overlayNumber || 1, effectiveFields, "confirmed");
        live = { ...live, commandStatus: "confirmed", onAirSnapshot: effectiveFields, lastActionAt: new Date().toISOString() };
        broadcastOverlayEvent({ type: "UPDATE", graphicId: graphic.id, fields: effectiveFields, master: getMasterOverlay() });
        logAction("UPDATE", "confirmed", "Konten ON AIR diperbarui (Web Overlay)", graphic.id, requestId);
        return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: "web-overlay", timestamp: new Date().toISOString(), error: null, state: publicState() };
      }

      if (!current.inputGuid) throw new Error("UPDATE diblokir: input vMix tidak diketahui");
      const overlay = await adapter().getOverlayState(settings.overlayNumber);
      if (overlay.inputGuid !== current.inputGuid) throw new Error("UPDATE diblokir: status overlay tidak cocok");
      const mapping = settings.mappings.find((m: any) => m.templateType === graphic.templateType);
      if (!mapping || mapping.inputGuid !== current.inputGuid) throw new Error("Mapping input berubah; lakukan CLEAR dan TAKE ulang");
      const target = Object.fromEntries(
        Object.entries(mapping.fieldMap)
          .filter(([k]: any) => graphic.draftFields[k] !== undefined)
          .map(([k, v]: any) => [v, graphic.draftFields[k]])
      );
      await adapter().setTitleFields(current.inputGuid, target);
      markGraphicPushed(graphic.id, graphic.draftFields);
      saveOnAir(graphic.id, current.inputGuid, settings.overlayNumber, graphic.draftFields, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirSnapshot: graphic.draftFields, lastActionAt: new Date().toISOString() };
      broadcastOverlayEvent({ type: "UPDATE", graphicId: graphic.id, fields: graphic.draftFields, master: getMasterOverlay() });
      logAction("UPDATE", "confirmed", "Konten ON AIR diperbarui", graphic.id, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: current.inputGuid, timestamp: new Date().toISOString(), error: null, state: publicState() };
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
    const settings = getSettingsInternal();

    try {
      if (settings.outputMode === "vmix-gt") {
        throw new Error("Perintah varian komposisi langsung belum didukung pada mode vMix GT Title");
      }
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

      saveOnAir(graphic.id, current.inputGuid || "web-overlay", settings.overlayNumber || 1, updatedSnapshot, "confirmed");
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
        actualOverlayInputGuid: current.inputGuid || "web-overlay",
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
    const settings = getSettingsInternal();

    try {
      if (!current?.graphicId) throw new Error("Tidak ada grafis NewsCG yang terverifikasi ON AIR");
      live = { ...live, commandStatus: "pending", error: null };

      if (settings.outputMode !== "vmix-gt") {
        saveOnAir(null, null, settings.overlayNumber || 1, null, "confirmed");
        live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString() };
        broadcastOverlayEvent({ type: "CLEAR", master: getMasterOverlay() });
        logAction("CLEAR", "confirmed", "Lower third NewsCG terkonfirmasi bersih (Web Overlay)", current.graphicId, requestId);
        return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
      }

      if (!current.inputGuid) throw new Error("Tidak ada input vMix yang terverifikasi ON AIR");
      await adapter().hideOwnedOverlay(current.inputGuid, settings.overlayNumber);
      const cleared = await verifyOverlay(null, settings.overlayNumber, settings.pollingIntervalMs);
      if (!cleared) throw Object.assign(new Error("CLEAR dikirim, tetapi overlay belum terkonfirmasi kosong"), { unknown: true });
      saveOnAir(null, null, settings.overlayNumber, null, "confirmed");
      live = { ...live, commandStatus: "confirmed", onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: new Date().toISOString() };
      broadcastOverlayEvent({ type: "CLEAR", master: getMasterOverlay() });
      logAction("CLEAR", "confirmed", "Lower third NewsCG terkonfirmasi bersih", current.graphicId, requestId);
      return { requestId, commandStatus: "confirmed", actualOverlayInputGuid: null, timestamp: new Date().toISOString(), error: null, state: publicState() };
    } catch (e: any) {
      const status = e.unknown ? "unknown" : "failed";
      live = { ...live, commandStatus: status, error: e.message };
      logAction("CLEAR", status, e.message, current?.graphicId, requestId);
      return { requestId, commandStatus: status, actualOverlayInputGuid: current?.inputGuid || null, timestamp: new Date().toISOString(), error: e.message, state: publicState() };
    }
  });
}

export function clearAllLive(idempotencyKey: string, options?: { immediate?: boolean }) {
  return enqueue(idempotencyKey, async () => {
    const requestId = randomUUID();
    if (getSettingsInternal().outputMode === "vmix-gt") throw new Error("Layar kosong dan preset master tersedia untuk output browser. Gunakan CLEAR untuk GT Title.");
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
    if (getSettingsInternal().outputMode === "vmix-gt") throw new Error("Preset siaran memerlukan mode output browser.");
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

async function verifyOverlay(expected: string | null, overlay: number, interval: number) {
  for (let i = 0; i < 5; i++) {
    const state = await adapter().getOverlayState(overlay);
    if (state.inputGuid === expected) return true;
    await new Promise(r => setTimeout(r, Math.min(interval, 1000)));
  }
  return false;
}

export function setMockConnection(value: boolean) {
  mockAdapter.connected = value;
  live.connection = value ? "MOCK" : "DISCONNECTED";
  if (!value) live.error = "Mock vMix terputus untuk simulasi recovery";
  return publicState();
}
