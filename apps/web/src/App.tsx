import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock3,
  Copy,
  ExternalLink,
  FileJson,
  Globe,
  Image as ImageIcon,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type {
  AppSettings,
  HeadlineDefaults,
  LiveState,
  MasterOverlayState,
  NewsAnchorDefaults,
  ReporterDefaults,
  OutputFrameRate,
  Rundown,
  TimezoneMode
} from "@newscg/shared";
import { bccMasterOverlayPatchSchema, broadcastLogoUploadSpec, defaultHeadlineDefaults, defaultMasterOverlayState, getGraphicFieldLimit, headlineDefaultsSchema, masterOverlayPatchSchema, masterControlPatch, selectBroadcastColorTheme, selectBroadcastTemplate } from "@newscg/shared";
import { api, mutate } from "./api";
import { createFieldReporterGraphic, createNewsAnchorGraphic, defaultNewsAnchorDefaults, defaultReporterDefaults, newsAnchorDefaultsSchema, reporterDefaultsSchema } from "@newscg/shared";
import TemplatePreview from "./TemplatePreview";
import Liputan7Preview from "./Liputan7Preview";
import BccPreview from "./BccPreview";
import OverlayWindow from "./OverlayWindow";
import { Preparation } from "./Newsroom";
import { SimpleProductionEditor } from "./SimpleProductionEditor";
import { BroadcastClock, BroadcastPreviewBox } from "./BroadcastGraphic";
import { BroadcastColorThemePicker, BroadcastTemplatePicker } from "./VisualTemplatePicker";
import { Liputan7Settings } from "./Liputan7Settings";
import { BroadcastTicker } from "./BroadcastTicker";
import { initWebMcp } from "./webMcp";

type View = "editor" | "rundown" | "settings";

const defaultFallbackRundown: Rundown = {
  id: "RD-DEFAULT",
  programName: "NEWS LIVE",
  title: "Siaran Langsung",
  updatedAt: new Date().toISOString(),
  items: []
};

const blankLive: LiveState = {
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

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

export default function App() {
  if (window.location.pathname === "/templates/liputan7") return <Liputan7Preview />;
  if (window.location.pathname === "/templates/bcc") return <BccPreview />;
  if (["/templates/cnn", "/templates/studio"].includes(window.location.pathname)) return <TemplatePreview />;
  const isOverlayRoute =
    window.location.pathname === "/output" ||
    window.location.pathname === "/overlay" ||
    window.location.search.includes("overlay=1");
  if (isOverlayRoute) {
    return <OverlayWindow />;
  }

  const [view, setView] = useState<View>("editor");
  const [rundowns, setRundowns] = useState<Rundown[]>([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem("newscg-active-rundown") || "");
  useEffect(() => { if (activeId) localStorage.setItem("newscg-active-rundown", activeId); }, [activeId]);
  const [live, setLive] = useState<LiveState>(blankLive);
  const [master, setMaster] = useState<MasterOverlayState>(defaultMasterOverlayState);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const liveReadSequence = useRef(0);
  const masterWriteSequence = useRef(0);

  const [toast, setToast] = useState("");
  const reloadSequence = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const toastKind = /gagal|tidak valid|terputus|melebihi|error|belum tersedia/i.test(toast)
    ? "error"
    : /belum|tunggu|tidak dapat/i.test(toast)
    ? "warn"
    : /berhasil|tersimpan|diterapkan|disalin/i.test(toast)
    ? "success"
    : "info";

  const active = rundowns.find((r) => r.id === activeId) || rundowns[0] || defaultFallbackRundown;

  const masterRef = useRef(master);
  masterRef.current = master;
  const liveRef = useRef(live);
  liveRef.current = live;
  const rundownsRef = useRef(rundowns);
  rundownsRef.current = rundowns;

  const reload = useCallback(async () => {
    const requestSequence = ++reloadSequence.current;
    const liveSequence = ++liveReadSequence.current;
    const masterSequence = masterWriteSequence.current;
    const [r, s, l, m] = await Promise.all([
      api<Rundown[]>("/api/rundowns"),
      api<AppSettings>("/api/settings"),
      api<LiveState>("/api/live/state"),
      api<MasterOverlayState>("/api/live/master")
    ]);
    if (requestSequence !== reloadSequence.current) return;
    setRundowns(r);
    setSettings(s);
    if (liveSequence === liveReadSequence.current) setLive(l);
    if (m && masterSequence === masterWriteSequence.current) setMaster(m);
    setActiveId((id) => r.some((item) => item.id === id) ? id : r[0]?.id || "");
  }, []);

  useEffect(() => {
    reload().catch((e) => setToast(e.message));
    const id = setInterval(
      () => {
        const sequence = ++liveReadSequence.current;
        api<LiveState>("/api/live/state")
          .then((next) => { if (sequence === liveReadSequence.current) setLive(next); })
          .catch(() => {
            if (sequence !== liveReadSequence.current) return;
            setLive((previous) => ({
              ...previous,
              connection: "STANDALONE",
              overlayClientsCount: 0,
              commandStatus: "unknown",
              error: "Koneksi ke server NewsCG terputus"
            }));
          });
      },
      2000
    );
    return () => clearInterval(id);
  }, [reload]);

  // F1, F2, F3 global tab navigation shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shortcutsEnabled || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "F1") {
        event.preventDefault();
        setView("editor");
      } else if (event.key === "F2") {
        event.preventDefault();
        setView("rundown");
      } else if (event.key === "F3") {
        event.preventDefault();
        setView("settings");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutsEnabled]);

  async function updateMaster(patch: Partial<MasterOverlayState>) {
    try {
      const isBcc = patch.broadcastTemplate === "bcc" || (!patch.broadcastTemplate && master.broadcastTemplate === "bcc");
      const schema = isBcc ? bccMasterOverlayPatchSchema : masterOverlayPatchSchema;
      const parsed = schema.safeParse(patch);
      if (!parsed.success) throw new Error(isBcc ? "Pengaturan master BCC tidak valid." : "Pengaturan master tidak valid. Teks dan kecepatan ticker diatur melalui rundown.");
      ++masterWriteSequence.current;
      const res = await mutate<MasterOverlayState>("/api/live/master", "PATCH", parsed.data);
      ++masterWriteSequence.current;
      setMaster(res);
      setToast("Pengaturan master diterapkan ke output NewsCG");
    } catch (e: any) {
      setToast(e.message);
      throw e;
    }
  }

  const updateMasterCallback = useCallback(async (patch: Partial<MasterOverlayState>) => {
    return updateMaster(patch);
  }, [master.broadcastTemplate]);

  useEffect(() => {
    initWebMcp({
      getMaster: () => masterRef.current,
      getLiveState: () => liveRef.current,
      getRundowns: () => rundownsRef.current,
      onUpdateMaster: updateMasterCallback,
      onReload: reload
    });
  }, [updateMasterCallback, reload]);

  async function copyOutputUrl() {
    const url = `${window.location.origin}/output`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setToast(`Output URL disalin: ${url}`);
    } else {
      setToast(`Gagal menyalin otomatis. Silakan salin manual: ${url}`);
    }
  }

  const status =
    live.error === "Koneksi ke server NewsCG terputus"
      ? { label: "SERVER TERPUTUS", kind: "bad" }
      : live.overlayClientsCount > 0
      ? { label: `${live.overlayClientsCount} KLIEN OUTPUT`, kind: "ok" }
      : { label: "0 KLIEN OUTPUT", kind: "mock" };

  const activeLayerParts: string[] = [];
  if (live.onAirGraphicId) activeLayerParts.push("Lower Third");
  if (master.showLogo || master.showProgramLogo) activeLayerParts.push("Logo");
  if (master.showTicker) activeLayerParts.push("Ticker");
  const onAirBannerText = live.onAirGraphicId || activeLayerParts.length > 0
    ? `${live.onAirGraphicId ? "ON AIR" : "MASTER"} · ${activeLayerParts.join(" · ") || "Standby"}`
    : "STANDBY · Output Bersih";

  const templateBadgeLabel =
    master.broadcastTemplate === "liputan7"
      ? "Liputan7 · HOC TV"
      : master.broadcastTemplate === "bcc"
      ? "BCC News"
      : "CNN / Studio";

  return (
    <div className="app-shell-zero-scroll rt">
      <header className="unified-topbar hd">
        <div className="topbar-left">
          <button type="button" className="brand-compact lg" onClick={() => setView("editor")}>
            <span className="brand-mark mk" />
            <span>NewsCG</span>
          </button>
          <div className="topbar-program-badge sr-only-text">
            <small>PROGRAM:</small>
            <select
              aria-label="Pilih Rundown Program"
              value={active?.id || ""}
              onChange={(e) => setActiveId(e.target.value)}
              className="topbar-rundown-select"
            >
              {rundowns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.programName} · {r.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav className="topbar-nav-tabs tabs" aria-label="Navigasi utama">
          {(
            [
              ["editor", "Kontrol", "F1", "Kontrol Siaran"],
              ["rundown", "Rundown", "F2", "Rundown & CG"],
              ["settings", "Settings", "F3", "Pengaturan Default"]
            ] as const
          ).map(([id, shortLabel, hotkey, accessibleLabel]) => (
            <button
              key={id}
              type="button"
              data-label={shortLabel}
              data-key={hotkey}
              className={`topbar-tab-btn tab ${view === id ? "active on" : ""}`}
              onClick={() => setView(id)}
            >
              <span className="sr-only-text">{accessibleLabel}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-right hr">
          <button
            type="button"
            className={`oa ${live.onAirGraphicId ? "" : "standby"}`}
            onClick={() => setView("editor")}
            title="Status layer yang sedang tayang di Program"
          >
            <i className="dt" style={{ background: live.onAirGraphicId ? "#fff" : "#3DD68C" }} />
            <span>{onAirBannerText}</span>
          </button>

          <button
            type="button"
            className="pill"
            onClick={() => setShowSetupModal(true)}
            title="Klik untuk membuka Pengaturan Cepat Template & Identitas"
          >
            {templateBadgeLabel}
          </button>

          <button
            type="button"
            className="pill"
            onClick={() => setShortcutsEnabled((prev) => !prev)}
            title="Aktif/nonaktifkan Hotkeys Keyboard"
          >
            <i className="dt" style={{ background: shortcutsEnabled ? "#3DD68C" : "#6B7686" }} />
            <span>Hotkeys {shortcutsEnabled ? "ON" : "OFF"}</span>
          </button>

          <button
            type="button"
            className={`pill status-chip ${status.kind}`}
            onClick={copyOutputUrl}
            onContextMenu={(e) => {
              e.preventDefault();
              window.open("/output", "_blank");
            }}
            title="Klik untuk menyalin URL /output · Klik kanan untuk membuka /output di tab baru"
          >
            <i
              className="dt"
              style={{
                background:
                  status.kind === "bad" ? "#FF6369" : live.overlayClientsCount > 0 ? "#3DD68C" : "#6B7686"
              }}
            />
            <span aria-hidden="true">{live.overlayClientsCount} output</span>
            <span className="sr-only-text">{status.label}</span>
          </button>

          <div className="output-url-box sr-only-text">
            <button
              type="button"
              className="copy-url-btn"
              onClick={copyOutputUrl}
              title="Salin URL output untuk vMix/OBS Web Browser"
            >
              <Globe size={13} />
              <span>Output URL</span>
              <Copy size={11} />
            </button>
            <button
              type="button"
              className="open-url-btn"
              onClick={() => window.open("/output", "_blank")}
              title="Buka layar overlay di tab baru"
            >
              <ExternalLink size={12} />
            </button>
          </div>

          <span className="m clk clock-compact">
            <Clock timezone={master.timezone} customLabel={master.customTimezoneLabel} />
          </span>
        </div>
      </header>

      <main className="main-content-zero-scroll">
        {view === "editor" && (
          <SimpleProductionEditor
            rundown={active}
            rundowns={rundowns}
            onSelectRundown={setActiveId}
            onOpenRundownTab={() => setView("rundown")}
            reload={reload}
            toast={setToast}
            master={master}
            live={live}
            onUpdateMaster={updateMaster}
            shortcutsEnabled={shortcutsEnabled}
            onToggleShortcuts={() => setShortcutsEnabled((prev) => !prev)}
          />
        )}
        {view === "rundown" && (
          <Preparation
            rundown={active}
            rundowns={rundowns}
            onRundown={setActiveId}
            reload={reload}
            toast={setToast}
            master={master}
            live={live}
            onSetup={() => setShowSetupModal(true)}
            onSendToPreview={() => setView("editor")}
          />
        )}
        {view === "settings" && settings && (
          <SettingsView
            value={settings}
            master={master}
            live={live}
            onUpdateMaster={updateMaster}
            onSaved={reload}
            toast={setToast}
            shortcutsEnabled={shortcutsEnabled}
            onToggleShortcuts={() => setShortcutsEnabled((prev) => !prev)}
          />
        )}
      </main>

      {showSetupModal && (
        <BroadcastSetupModal
          master={master}
          onUpdate={updateMaster}
          onClose={() => setShowSetupModal(false)}
        />
      )}

      {toast && (
        <div className={`toast toast-${toastKind}`} role="status">
          <i className="toast-dot" aria-hidden="true" />
          <span className="toast-text">{toast}</span>
          <button type="button" className="toast-close" onClick={() => setToast("")} aria-label="Tutup notifikasi">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Clock({ timezone = "WIB", customLabel }: { timezone?: TimezoneMode; customLabel?: string }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const offsetMap: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };
  const targetOffset = offsetMap[timezone] ?? 7;
  const utc = time.getTime() + time.getTimezoneOffset() * 60000;
  const targetTime = new Date(utc + targetOffset * 3600000);
  const label = timezone === "CUSTOM" ? customLabel || "WIB" : timezone;

  return (
    <>
      {targetTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/\./g, ":")}
      <small> {label}</small>
    </>
  );
}

function BroadcastSetupModal({
  master,
  onUpdate,
  onClose
}: {
  master: MasterOverlayState;
  onUpdate: (patch: Partial<MasterOverlayState>) => Promise<void>;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"broadcast" | "logo">("broadcast");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<MasterOverlayState>({ ...master });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    return () => openerRef.current?.focus();
  }, []);
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !saving) { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    ) || []).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const changed = JSON.stringify(draft) !== JSON.stringify(master);
  const patchDraft = (patch: Partial<MasterOverlayState>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  };
  const apply = async () => {
    if (!changed || saving) return;
    setSaving(true);
    setError("");
    try {
      const patch = Object.fromEntries(
        (Object.keys(draft) as Array<keyof MasterOverlayState>)
          .filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(master[key]))
          .map((key) => [key, draft[key]])
      ) as Partial<MasterOverlayState>;
      await onUpdate(patch);
      onClose();
    } catch (reason) {
      setError((reason as Error).message || "Pengaturan gagal diterapkan.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > broadcastLogoUploadSpec.maxBytes) {
      setError(`Ukuran file gambar melebihi batas ${broadcastLogoUploadSpec.maxBytes / (1024 * 1024)} MB`);
      return;
    }
    setSaving(true);
    setError("");
    fetch("/api/uploads/logo", {
      method: "POST",
      headers: { "Content-Type": file.type || "image/png" },
      body: file
    })
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "Gagal mengunggah file gambar");
        }
        return res.json();
      })
      .then((data) => {
        patchDraft({ logoType: "image", logoImage: data.url });
      })
      .catch((err: any) => {
        setError(err.message || "Gagal mengunggah logo");
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className="modal-overlay">
      <div ref={dialogRef} className="modal-box broadcast-setup-modal" role="dialog" aria-modal="true" aria-label="Pengaturan siaran dan identitas" onKeyDown={onDialogKeyDown}>
        <div className="modal-header">
          <h3>
            <SlidersHorizontal size={16} /> Pengaturan Siaran & Identitas Brand
          </h3>
          <button onClick={onClose} className="modal-close-btn" title="Tutup">
            <X size={16} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab-btn ${activeTab === "broadcast" ? "active" : ""}`}
            onClick={() => setActiveTab("broadcast")}
          >
            <Clock3 size={14} /> Identitas & Waktu
          </button>
          <button
            className={`modal-tab-btn ${activeTab === "logo" ? "active" : ""}`}
            onClick={() => setActiveTab("logo")}
          >
            <ImageIcon size={14} /> Logo Siaran
          </button>
        </div>

        {activeTab === "broadcast" && (
          <div className="modal-tab-content">
            <BroadcastTemplatePicker value={draft.broadcastTemplate} disabled={saving} onChange={(value) => setDraft((current) => selectBroadcastTemplate(current, value))} />
            <Liputan7Settings master={draft} disabled={saving} onChange={setDraft} onBusyChange={setSaving} />
            <div className="setup-field-group">
              <label>
                <span className="master-label">Nama Berita di Ticker (Badge Merah — Fit Huruf)</span>
                <input
                  className="master-input full"
                  value={draft.brandText || ""}
                  placeholder="CNNINDONESIA.COM"
                  onChange={(e) => patchDraft({ brandText: e.target.value })}
                />
                <small className="field-hint">Warna merah pada layar siaran otomatis fit membungkus teks tanpa space kosong.</small>
              </label>

              <label style={{ marginTop: 10 }}>
                <span className="master-label">Zona Waktu Siaran</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <select
                    className="master-select full"
                    value={draft.timezone}
                    onChange={(e) => patchDraft({ timezone: e.target.value as TimezoneMode })}
                  >
                    <option value="WIB">WIB — Waktu Indonesia Barat (UTC+7)</option>
                    <option value="WITA">WITA — Waktu Indonesia Tengah (UTC+8)</option>
                    <option value="WIT">WIT — Waktu Indonesia Timur (UTC+9)</option>
                    <option value="CUSTOM">Custom Label Zona Waktu</option>
                  </select>
                  {draft.timezone === "CUSTOM" && (
                    <input
                      className="master-input"
                      style={{ width: 90 }}
                      placeholder="Label"
                      value={draft.customTimezoneLabel || ""}
                      onChange={(e) => patchDraft({ customTimezoneLabel: e.target.value })}
                    />
                  )}
                </div>
              </label>

              {draft.broadcastTemplate === "bcc" ? (
                <>
                  <label style={{ marginTop: 10 }}>
                    <span className="master-label">Ticker Global BCC News</span>
                    <textarea
                      className="master-input full"
                      rows={3}
                      value={draft.tickerText ?? ""}
                      placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"
                      onChange={(e) => patchDraft({ tickerText: e.target.value })}
                    />
                    <small className="field-hint">Ticker BCC bersifat global dan tampil di seluruh tayangan tanpa terikat rundown.</small>
                  </label>
                  <label style={{ marginTop: 10 }}>
                    <span className="master-label">Kecepatan Ticker BCC</span>
                    <select
                      className="master-select full"
                      value={draft.tickerSpeed ?? 85}
                      onChange={(e) => patchDraft({ tickerSpeed: Number(e.target.value) })}
                    >
                      <option value={65}>Lambat (65 px/detik)</option>
                      <option value={85}>Normal (85 px/detik)</option>
                      <option value={105}>Cepat (105 px/detik)</option>
                    </select>
                  </label>
                </>
              ) : (
                <p className="field-hint">Materi ticker mengikuti rundown dan jadwal tayang. Sunting di Rundown &amp; CG.</p>
              )}

              <div style={{ marginTop: 14 }}>
                <span className="master-label" style={{ display: "block", marginBottom: 6, color: "#38bdf8" }}>
                  PRATINJAU TICKER (BADGE FIT & ANIMASI):
                </span>
                <div
                  className="cg-ticker-bar cnn-template"
                  style={{
                    position: "relative",
                    height: 44,
                    borderRadius: 6,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "stretch",
                    border: "1px solid #334155"
                  }}
                >
                  <div className="cg-ticker-badge" style={{ height: "100%", fontSize: 18 }}>
                    <span>{draft.brandText || "CNNINDONESIA.COM"}</span>
                  </div>
                  <BroadcastTicker text={draft.tickerText?.trim() || (draft.broadcastTemplate === "bcc" ? "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS" : "")} speed={draft.tickerSpeed} revision={draft.tickerRevision} fps={30} />
                  <div className="cg-ticker-clock" style={{ height: "100%", fontSize: 20 }}>
                    <BroadcastClock timezone={draft.timezone} customLabel={draft.customTimezoneLabel} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "logo" && (
          <div className="modal-tab-content">
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                className={`toggle-btn ${draft.logoType === "text" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
                onClick={() => patchDraft({ logoType: "text" })}
              >
                Teks Bawaan (CNN Indonesia)
              </button>
              <button
                className={`toggle-btn ${draft.logoType === "image" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
                onClick={() => patchDraft({ logoType: "image" })}
              >
                Upload Gambar Logo Kustom
              </button>
            </div>

            {draft.logoType === "text" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  <span className="master-label">Teks Logo Utama</span>
                  <input
                    className="master-input full"
                    style={{ marginTop: 4 }}
                    value={draft.logoText || "CNN"}
                    onChange={(e) => patchDraft({ logoText: e.target.value })}
                  />
                </label>
                <label>
                  <span className="master-label">Teks Sub-Logo</span>
                  <input
                    className="master-input full"
                    style={{ marginTop: 4 }}
                    value={draft.logoSub || "Indonesia"}
                    onChange={(e) => patchDraft({ logoSub: e.target.value })}
                  />
                </label>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    background: "#0c1017",
                    border: "1px dashed #2d3b4e",
                    borderRadius: 4,
                    padding: 16,
                    textAlign: "center"
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleFileUpload}
                  />
                  <button
                    className="primary-small"
                    style={{ margin: "0 auto 8px" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} /> Pilih File Gambar Logo
                  </button>
                  <p style={{ margin: 0, fontSize: 11, color: "#8b9cb3", lineHeight: 1.5 }}>
                    Rekomendasi file upload: <b>PNG transparan {broadcastLogoUploadSpec.width} × {broadcastLogoUploadSpec.height} px</b> atau SVG.
                    <br />
                    Sisakan sekitar {broadcastLogoUploadSpec.padding} px di tepi, maksimal {broadcastLogoUploadSpec.maxBytes / (1024 * 1024)} MB. Logo ditampilkan proporsional.
                  </p>
                </div>
                {draft.logoImage && (
                  <button
                    style={{
                      marginTop: 8,
                      background: "transparent",
                      border: 0,
                      color: "#ff7d87",
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                    onClick={() => patchDraft({ logoImage: null, logoType: "text" })}
                  >
                    Hapus logo kustom (kembali ke teks bawaan)
                  </button>
                )}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <span className="master-label">PRATINJAU LOGO DI DALAM KOTAK SIARAN:</span>
              <div className="logo-preview-box">
                {draft.logoType === "image" && draft.logoImage ? (
                  <img src={draft.logoImage} alt="Logo Preview" className="cg-custom-logo-img" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span className="cg-cnn-logo" style={{ fontSize: 36 }}>
                      {draft.logoText || "CNN"}
                    </span>
                    <span className="cg-cnn-sub" style={{ fontSize: 12 }}>
                      {draft.logoSub || "Indonesia"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <span role="status">{error || (changed ? "Perubahan belum diterapkan ke output." : "Belum ada perubahan.")}</span>
          <button className="btn-modal-cancel" onClick={onClose} disabled={saving}>Batal</button>
          <button className="primary-small" onClick={() => void apply()} disabled={!changed || saving}>
            {saving ? "Menerapkan…" : "Terapkan ke Output"}
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_WEATHER_ROWS = [
  { city: "Jakarta Pusat", subdistrict: "Kemayoran", condition: "Berawan", temp: "26–28°C" },
  { city: "Bandung", subdistrict: "Sukarasa", condition: "Berawan", temp: "21–22°C" },
  { city: "Surabaya", subdistrict: "Karang Pilang", condition: "Cerah Berawan", temp: "27–34°C" },
  { city: "Medan", subdistrict: "Pasar Baru", condition: "Hujan Ringan", temp: "24–28°C" },
  { city: "Semarang", subdistrict: "Miroto", condition: "Cerah Berawan", temp: "28–30°C" },
  { city: "Denpasar", subdistrict: "Serangan", condition: "Cerah", temp: "25–29°C" },
  { city: "Makassar", subdistrict: "Bontorannu", condition: "Cerah", temp: "29–32°C" }
];

function SettingsView({
  value,
  master,
  live,
  onUpdateMaster,
  onSaved,
  toast,
  shortcutsEnabled = true,
  onToggleShortcuts
}: {
  value: AppSettings;
  master: MasterOverlayState;
  live: LiveState;
  onUpdateMaster: (p: Partial<MasterOverlayState>) => Promise<void>;
  onSaved: () => Promise<void>;
  toast: (s: string) => void;
  shortcutsEnabled?: boolean;
  onToggleShortcuts?: () => void;
}) {
  const [activeNav, setActiveNav] = useState<"template" | "identity" | "ticker" | "hotkeys" | "output" | "general">("template");
  const [settingsPreviewMode, setSettingsPreviewMode] = useState<"headline" | "highlight" | "anchor" | "reporter">("headline");
  const [previewShowLogo, setPreviewShowLogo] = useState(true);
  const [previewShowTicker, setPreviewShowTicker] = useState(true);
  const [previewShowLive, setPreviewShowLive] = useState(true);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Broadcast safety toggles
  const [safeModeTake, setSafeModeTake] = useState(() => localStorage.getItem("newscg-safety-safe-take") !== "false");
  const [holdBlackout, setHoldBlackout] = useState(() => localStorage.getItem("newscg-safety-hold-blackout") !== "false");
  const [pauseHotkeysTyping, setPauseHotkeysTyping] = useState(() => localStorage.getItem("newscg-safety-pause-typing") !== "false");
  const [autoAdvanceClear, setAutoAdvanceClear] = useState(() => localStorage.getItem("newscg-safety-auto-advance") === "true");

  const [form, setForm] = useState<AppSettings>(value);
  const [masterForm, setMasterForm] = useState<MasterOverlayState>(master);
  const [headlineDefaults, setHeadlineDefaults] = useState<HeadlineDefaults>(defaultHeadlineDefaults);
  const [anchorDefaults, setAnchorDefaults] = useState<NewsAnchorDefaults>(defaultNewsAnchorDefaults);
  const [anchorState, setAnchorState] = useState({ loading: true, loaded: false, error: "", attempt: 0 });
  const [savingAnchor, setSavingAnchor] = useState(false);
  const anchorSaveInFlight = useRef(false);
  const editedAnchorFields = useRef(new Set<keyof NewsAnchorDefaults>());
  const [reporterDefaults, setReporterDefaults] = useState<ReporterDefaults>(defaultReporterDefaults);
  const [reporterState, setReporterState] = useState({ loading: true, loaded: false, error: "", attempt: 0 });
  const [savingReporter, setSavingReporter] = useState(false);
  const reporterSaveInFlight = useRef(false);
  const editedReporterFields = useRef(new Set<keyof ReporterDefaults>());
  const [savingHeadline, setSavingHeadline] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savingMaster, setSavingMaster] = useState(false);
  const allSaveInFlight = useRef(false);
  const masterSaveInFlight = useRef(false);
  const headlineSaveInFlight = useRef(false);
  const [loadingHeadline, setLoadingHeadline] = useState(true);
  const [headlineLoaded, setHeadlineLoaded] = useState(false);
  const [headlineLoadError, setHeadlineLoadError] = useState("");
  const [headlineLoadAttempt, setHeadlineLoadAttempt] = useState(0);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const editedHeadlineFields = useRef(new Set<keyof HeadlineDefaults>());
  const masterLogoInputRef = useRef<HTMLInputElement>(null);
  const previousMaster = useRef(master);

  useEffect(() => setForm(value), [value]);
  useEffect(() => {
    const source = previousMaster.current;
    previousMaster.current = master;
    setMasterForm((current) => ({
      ...master,
      ...Object.fromEntries((Object.keys(master) as Array<keyof MasterOverlayState>)
        .filter((field) => current[field] !== source[field])
        .map((field) => [field, current[field]]))
    }));
  }, [master]);

  useEffect(() => {
    let active = true;
    setLoadingHeadline(true);
    setHeadlineLoadError("");
    api<HeadlineDefaults>("/api/settings/headline-defaults")
      .then((data) => {
        const defaults = headlineDefaultsSchema.parse(data);
        if (!active) return;
        setHeadlineDefaults((current) => Object.fromEntries(
          (Object.keys(defaults) as Array<keyof HeadlineDefaults>).map((field) => [
            field, editedHeadlineFields.current.has(field) ? current[field] : defaults[field]
          ])
        ) as HeadlineDefaults);
        setHeadlineLoaded(true);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setHeadlineLoaded(false);
        setHeadlineLoadError(`Default headline belum dimuat: ${reason instanceof Error ? reason.message : "Permintaan gagal"}. Muat ulang sebelum menyimpan.`);
      })
      .finally(() => { if (active) setLoadingHeadline(false); });
    return () => { active = false; };
  }, [headlineLoadAttempt]);

  useEffect(() => {
    let active = true;
    setAnchorState((current) => ({ ...current, loading: true, error: "" }));
    api<NewsAnchorDefaults>("/api/settings/news-anchor-defaults").then((data) => {
      const defaults = newsAnchorDefaultsSchema.parse(data);
      if (!active) return;
      setAnchorDefaults((current) => ({ ...defaults, ...Object.fromEntries(
        [...editedAnchorFields.current].map((field) => [field, current[field]])) }));
      setAnchorState((current) => ({ ...current, loaded: true }));
    }).catch((error: unknown) => {
      if (active) setAnchorState((current) => ({ ...current, loaded: false,
        error: `Default news anchor gagal dimuat: ${error instanceof Error ? error.message : "Permintaan gagal"}` }));
    }).finally(() => { if (active) setAnchorState((current) => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [anchorState.attempt]);

  const patchAnchorDefault = (field: keyof NewsAnchorDefaults, text: string) => {
    editedAnchorFields.current.add(field);
    setAnchorDefaults((current) => ({ ...current, [field]: text }));
  };

  useEffect(() => {
    let active = true;
    setReporterState((current) => ({ ...current, loading: true, error: "" }));
    api<ReporterDefaults>("/api/settings/reporter-defaults").then((data) => {
      const defaults = reporterDefaultsSchema.parse(data);
      if (!active) return;
      setReporterDefaults((current) => ({ ...defaults, ...Object.fromEntries(
        [...editedReporterFields.current].map((field) => [field, current[field]])) }));
      setReporterState((current) => ({ ...current, loaded: true }));
    }).catch((error: unknown) => {
      if (active) setReporterState((current) => ({ ...current, loaded: false,
        error: `Default reporter lapangan gagal dimuat: ${error instanceof Error ? error.message : "Permintaan gagal"}` }));
    }).finally(() => { if (active) setReporterState((current) => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [reporterState.attempt]);

  const patchReporterDefault = (field: keyof ReporterDefaults, text: string) => {
    editedReporterFields.current.add(field);
    setReporterDefaults((current) => ({ ...current, [field]: text }));
  };

  const patchHeadlineDefault = (field: keyof HeadlineDefaults, text: string) => {
    editedHeadlineFields.current.add(field);
    setHeadlineDefaults((current) => ({ ...current, [field]: text }));
  };

  async function save() {
    if (allSaveInFlight.current || masterSaveInFlight.current) return;
    if (!headlineLoaded || loadingHeadline || headlineSaveInFlight.current || uploadingLogo || !anchorState.loaded || anchorState.loading || anchorSaveInFlight.current || !reporterState.loaded || reporterState.loading || reporterSaveInFlight.current) {
      toast(headlineLoadError || anchorState.error || reporterState.error || "Tunggu sampai pengaturan dan logo selesai dimuat sebelum menyimpan semua.");
      return;
    }
    allSaveInFlight.current = true;
    setSavingAll(true);
    try {
      const masterPatch = masterControlPatch(masterForm);
      await mutate("/api/settings", "PATCH", form);
      await onUpdateMaster(masterPatch);
      await saveHeadlineDefaultsData(false);
      await saveNewsAnchorDefaultsData(false);
      await saveReporterDefaultsData(false);
      await onSaved();
      toast("Semua pengaturan berhasil disimpan");
    } catch (error) {
      toast(`Sebagian pengaturan belum tersimpan: ${(error as Error).message}`);
    } finally {
      allSaveInFlight.current = false;
      setSavingAll(false);
    }
  }

  async function saveMaster() {
    if (uploadingLogo || allSaveInFlight.current || masterSaveInFlight.current) return;
    masterSaveInFlight.current = true;
    setSavingMaster(true);
    try {
      await onUpdateMaster(masterControlPatch(masterForm));
      toast("Pengaturan default elemen master berhasil disimpan");
    } catch (error) {
      toast((error as Error).message || "Gagal menerapkan master");
    } finally {
      masterSaveInFlight.current = false;
      setSavingMaster(false);
    }
  }

  async function saveHeadlineDefaultsData(notify = true) {
    if ((notify && allSaveInFlight.current) || !headlineLoaded || loadingHeadline || headlineSaveInFlight.current) {
      const message = headlineLoadError || "Default headline masih dimuat. Tunggu sebelum menyimpan.";
      if (notify) toast(message);
      else throw new Error(message);
      return;
    }
    headlineSaveInFlight.current = true;
    setSavingHeadline(true);
    const submitted = headlineDefaults;
    try {
      const updated = await mutate<HeadlineDefaults>(
        "/api/settings/headline-defaults",
        "PATCH",
        headlineDefaults
      );
      setHeadlineDefaults((current) => Object.fromEntries(
        (Object.keys(submitted) as Array<keyof HeadlineDefaults>).map((field) => [
          field, current[field] === submitted[field] ? updated[field] : current[field]
        ])
      ) as HeadlineDefaults);
      if (notify) toast("Pengaturan default headline berita berhasil disimpan");
    } catch (e: any) {
      if (notify) toast(e.message || "Gagal menyimpan default headline");
      else throw e;
    } finally {
      headlineSaveInFlight.current = false;
      setSavingHeadline(false);
    }
  }

  async function saveNewsAnchorDefaultsData(notify = true) {
    if ((notify && allSaveInFlight.current) || anchorSaveInFlight.current || anchorState.loading || !anchorState.loaded) return;
    anchorSaveInFlight.current = true;
    setSavingAnchor(true);
    const submitted = anchorDefaults;
    try {
      const updated = newsAnchorDefaultsSchema.parse(await mutate<NewsAnchorDefaults>("/api/settings/news-anchor-defaults", "PATCH", submitted));
      setAnchorDefaults((current) => ({ name: current.name === submitted.name ? updated.name : current.name,
        role: current.role === submitted.role ? updated.role : current.role }));
      if (notify) toast("Default news anchor tersimpan. Tekan P di Produksi untuk menyiapkannya.");
    } catch (error) {
      if (!notify) throw error;
      toast(error instanceof Error ? error.message : "Default news anchor gagal disimpan");
    } finally { anchorSaveInFlight.current = false; setSavingAnchor(false); }
  }

  async function saveReporterDefaultsData(notify = true) {
    if ((notify && allSaveInFlight.current) || reporterSaveInFlight.current || reporterState.loading || !reporterState.loaded) return;
    reporterSaveInFlight.current = true;
    setSavingReporter(true);
    const submitted = reporterDefaults;
    try {
      const updated = reporterDefaultsSchema.parse(await mutate<ReporterDefaults>("/api/settings/reporter-defaults", "PATCH", submitted));
      setReporterDefaults((current) => ({ name: current.name === submitted.name ? updated.name : current.name,
        role: current.role === submitted.role ? updated.role : current.role,
        location: current.location === submitted.location ? updated.location : current.location }));
      if (notify) toast("Default reporter lapangan tersimpan. Tekan O di Produksi untuk menyiapkannya.");
    } catch (error) {
      if (!notify) throw error;
      toast(error instanceof Error ? error.message : "Default reporter lapangan gagal disimpan");
    } finally { reporterSaveInFlight.current = false; setSavingReporter(false); }
  }

  const anchorGraphic = anchorDefaults.name.trim() ? createNewsAnchorGraphic(anchorDefaults) : null;
  const reporterGraphic = reporterDefaults.name.trim() ? createFieldReporterGraphic(reporterDefaults) : null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploadingLogo) return;
    if (file.size > broadcastLogoUploadSpec.maxBytes) {
      toast(`Ukuran file gambar melebihi batas ${broadcastLogoUploadSpec.maxBytes / (1024 * 1024)} MB`);
      return;
    }
    setUploadingLogo(true);
    fetch("/api/uploads/logo", {
      method: "POST",
      headers: { "Content-Type": file.type || "image/png" },
      body: file
    })
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "Gagal mengunggah file logo");
        }
        return res.json();
      })
      .then((data) => {
        setMasterForm((current) => ({ ...current, logoType: "image", logoImage: data.url }));
        toast("Gambar logo berhasil diunggah (klik Simpan Default Master untuk menerapkan)");
      })
      .catch((err: any) => {
        toast(err.message || "Gagal mengunggah logo");
      })
      .finally(() => setUploadingLogo(false));
  };

  const outputUrl = `${window.location.origin}/output`;

  const scrollToSection = (navId: typeof activeNav, sectionKey: string) => {
    setActiveNav(navId);
    sectionRefs.current[sectionKey]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isMasterDirty = JSON.stringify(masterControlPatch(masterForm)) !== JSON.stringify(masterControlPatch(master));

  const liveSettingsPreviewGraphic =
    settingsPreviewMode === "anchor"
      ? anchorGraphic || createNewsAnchorGraphic({ name: "NADIA PUTRI", role: "News Anchor" })
      : settingsPreviewMode === "reporter"
      ? reporterGraphic || createFieldReporterGraphic({ name: "RAKA PRATAMA", role: "Reporter Lapangan", location: "JAKARTA SELATAN" })
      : { templateType: "HEADLINE" as const };

  const liveSettingsPreviewFields: Record<string, string> | null =
    settingsPreviewMode === "anchor"
      ? (anchorGraphic || createNewsAnchorGraphic({ name: "NADIA PUTRI", role: "News Anchor" })).draftFields
      : settingsPreviewMode === "reporter"
      ? (reporterGraphic || createFieldReporterGraphic({ name: "RAKA PRATAMA", role: "Reporter Lapangan", location: "JAKARTA SELATAN" })).draftFields
      : settingsPreviewMode === "highlight"
      ? {
          headline: headlineDefaults.headline || "FORUM EKONOMI NASIONAL 2026 RESMI DIBUKA HARI INI",
          subline: headlineDefaults.subline || "Ratusan Delegasi Bahas Kerja Sama Investasi Strategis",
          kicker: headlineDefaults.kicker || "HIGHLIGHT",
          location: headlineDefaults.location || "JAKARTA",
          headlinePresentation: "bulletin",
          layoutStyle: "sub",
          showKicker: "true",
          showDetail: "true",
          showLocation: "true"
        }
      : {
          headline: headlineDefaults.headline || "PENDAFTARAN MAHASISWA BARU POLIMEDIA 2026 MENURUN",
          subline: headlineDefaults.subline || "Kampus Perluas Jalur Seleksi Vokasi dan Beasiswa Industri",
          kicker: headlineDefaults.kicker || "KAMPUS",
          location: headlineDefaults.location || "JAKARTA",
          headlinePresentation: "story",
          layoutStyle: headlineDefaults.subline ? "sub" : "single",
          showKicker: headlineDefaults.kicker ? "true" : "false",
          showDetail: headlineDefaults.subline ? "true" : "false",
          showLocation: headlineDefaults.location ? "true" : "false"
        };

  return (
    <div className="settings-workspace-grid">
      {/* 1. LEFT SIDEBAR NAVIGATION */}
      <aside className="p settings-nav-sidebar">
        <div className="settings-nav-title l">Kategori Pengaturan</div>
        {(
          [
            ["template", "Template & Pratinjau", "sec-template"],
            ["ticker", "Identitas, Logo & Jam", "sec-master"],
            ["identity", "Siklus Cuaca BMKG", "sec-weather"],
            ["general", "Default Headline & Anchor", "sec-defaults"],
            ["output", "Output vMix / OBS", "sec-output"],
            ["hotkeys", "Hotkeys & Keamanan", "sec-hotkeys"]
          ] as const
        ).map(([id, label, sec]) => (
          <button
            key={id}
            type="button"
            className={`it ${activeNav === id ? "on" : ""}`}
            style={{ fontWeight: 600 }}
            onClick={() => scrollToSection(id, sec)}
          >
            <span>{label}</span>
          </button>
        ))}

        <div className="settings-nav-footer">
          <div className="settings-active-tpl-chip">
            <span className="l">Tayang saat ini</span>
            <b>
              {master.broadcastTemplate === "liputan7"
                ? "Liputan7 · HOC TV"
                : master.broadcastTemplate === "bcc"
                ? "BCC News"
                : "CNN / Studio"}
            </b>
          </div>
          <button
            type="button"
            className="b primary-small settings-save-all-btn"
            onClick={save}
            disabled={savingAll || savingMaster || !headlineLoaded || loadingHeadline || savingHeadline || uploadingLogo || !anchorState.loaded || anchorState.loading || savingAnchor || !reporterState.loaded || reporterState.loading || savingReporter}
          >
            <Save size={15} />
            {savingAll ? "Menyimpan…" : "Simpan Semua"}
          </button>
        </div>
      </aside>

      {/* 2. CENTER COLUMN: INTERACTIVE TEMPLATE STUDIO, BRANDING, DEFAULTS, & OUTPUT */}
      <section className="settings-center-scroll">
        {/* Card A: Interactive Template Studio & Live 16:9 Preview */}
        <div
          ref={(el) => { sectionRefs.current["sec-template"] = el; }}
          className="p settings-studio-hero-card"
        >
          <div className="settings-hero-header fl">
            <div>
              <span className="l">Template siaran &amp; Pratinjau Langsung (16:9)</span>
              <h3 className="settings-hero-title">Pilih Gaya Grafis Siaran &amp; Cek Hasilnya Secara Real-Time</h3>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {isMasterDirty && (
                <span className="st y">Perubahan belum diterapkan</span>
              )}
              <button
                type="button"
                className="b primary-small"
                style={{ height: 36 }}
                disabled={uploadingLogo || savingMaster || savingAll}
                onClick={saveMaster}
              >
                Simpan sebagai preset
              </button>
            </div>
          </div>

          <div className="settings-studio-deck">
            {/* Kolom Kiri: Pilihan 3 Template */}
            <div className="settings-tpl-list">
              {(
                [
                  ["cnn", "CNN / Studio", "Anchor, headline, ticker, live badge", "#D93036"],
                  ["liputan7", "Liputan7 · HOC TV", "Logo program, logo TV, cuaca BMKG", "#F5A524"],
                  ["bcc", "BCC News", "Live badge, jam, ticker global", "#4C8DFF"]
                ] as const
              ).map(([tplId, tplTitle, tplDesc, accentColor]) => {
                const selected = masterForm.broadcastTemplate === tplId;
                const isLiveActive = master.broadcastTemplate === tplId;
                return (
                  <button
                    key={tplId}
                    type="button"
                    className={`p settings-tpl-card ${selected ? "selected" : ""}`}
                    disabled={savingMaster || savingAll || uploadingLogo}
                    onClick={() => setMasterForm((current) => selectBroadcastTemplate(current, tplId))}
                  >
                    <div className="settings-tpl-thumb">
                      <div className="settings-tpl-thumb-top">
                        <span className="settings-tpl-dot" style={{ background: accentColor }} />
                        <span className="settings-tpl-badge-mini">16:9 HD</span>
                      </div>
                      <div className="settings-tpl-bar" style={{ background: accentColor }} />
                      <div className="settings-tpl-subbar" />
                    </div>
                    <div className="settings-tpl-info">
                      <div className="fl" style={{ gap: 6 }}>
                        <b>{tplTitle}</b>
                        {isLiveActive ? (
                          <span className="st g">AKTIF</span>
                        ) : selected ? (
                          <span className="st y">PRATINJAU</span>
                        ) : null}
                      </div>
                      <div className="settings-tpl-desc">{tplDesc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Kolom Kanan: Interactive 16:9 Live Preview Monitor */}
            <div className="settings-live-preview-pane">
              <div className="settings-preview-toolbar">
                <div className="seg settings-preview-mode-seg" role="group" aria-label="Mode contoh grafis di pratinjau">
                  {(
                    [
                      ["headline", "Headline"],
                      ["highlight", "Highlight"],
                      ["anchor", "Anchor (P)"],
                      ["reporter", "Reporter (O)"]
                    ] as const
                  ).map(([mId, mLabel]) => (
                    <button
                      key={mId}
                      type="button"
                      className={settingsPreviewMode === mId ? "on" : ""}
                      onClick={() => setSettingsPreviewMode(mId)}
                    >
                      {mLabel}
                    </button>
                  ))}
                </div>

                <div className="settings-preview-layer-pills">
                  <button
                    type="button"
                    className={`mini-pill-btn ${previewShowLogo ? "active" : ""}`}
                    onClick={() => setPreviewShowLogo((v) => !v)}
                  >
                    Logo {previewShowLogo ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className={`mini-pill-btn ${previewShowTicker ? "active" : ""}`}
                    onClick={() => setPreviewShowTicker((v) => !v)}
                  >
                    Ticker {previewShowTicker ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className={`mini-pill-btn ${previewShowLive ? "active" : ""}`}
                    onClick={() => setPreviewShowLive((v) => !v)}
                  >
                    Jam/Live {previewShowLive ? "ON" : "OFF"}
                  </button>
                </div>
              </div>

              <div className="settings-palette-preview settings-hero-monitor">
                <BroadcastPreviewBox
                  graphic={liveSettingsPreviewGraphic}
                  fields={liveSettingsPreviewFields}
                  master={{
                    ...masterForm,
                    showLogo: previewShowLogo,
                    showProgramLogo: masterForm.broadcastTemplate === "liputan7" ? previewShowLogo : false,
                    showTicker: previewShowTicker,
                    showLiveBadge: previewShowLive
                  }}
                  studioReference
                />
              </div>

              <div className="settings-preview-caption fl">
                <span>
                  Pratinjau menampilkan template{" "}
                  <b>
                    {masterForm.broadcastTemplate === "liputan7"
                      ? "Liputan7 · HOC TV"
                      : masterForm.broadcastTemplate === "bcc"
                      ? "BCC News"
                      : "CNN / Studio"}
                  </b>{" "}
                  dengan contoh <b>{settingsPreviewMode.toUpperCase()}</b>.
                </span>
                <span>Klik <b>Simpan Default Master</b> untuk menerapkan ke Output.</span>
              </div>
            </div>
          </div>
        </div>

        {/* 1. KARTU PENGATURAN DEFAULT SIARAN (LOGO, WARNA, NAMA BERITA TICKER, & ZONA WAKTU) */}
        <div
          ref={(el) => { sectionRefs.current["sec-master"] = el; }}
          className="settings-card broadcast-defaults-card p"
        >
          <h3>
            <SlidersHorizontal size={17} />
            Pengaturan Siaran · Logo & Jam
          </h3>
          <p>
            Atur warna, logo, dan jam di Preview. Klik Simpan Default Master untuk menyimpan dan menerapkan perubahan ke siaran.
          </p>

          <div className="sr-only-text">
            <BroadcastTemplatePicker value={masterForm.broadcastTemplate} disabled={savingMaster || savingAll || uploadingLogo} onChange={(value) => setMasterForm((current) => selectBroadcastTemplate(current, value))} />
          </div>
          <Liputan7Settings master={masterForm} disabled={savingMaster || savingAll || uploadingLogo} onChange={setMasterForm} onBusyChange={setUploadingLogo} />
          {masterForm.broadcastTemplate === "cnn" && (
            <BroadcastColorThemePicker value={masterForm.colorTheme} onChange={(colorTheme) => {
              setMasterForm((previous) => selectBroadcastColorTheme(previous, colorTheme));
            }} />
          )}
          <small className="settings-palette-note">Preview warna langsung terlihat pada monitor 16:9 di atas. Perubahan diterapkan ke output setelah Simpan Default Master.</small>

          <div
            className="settings-subgroup"
            style={{
              marginBottom: 16,
              padding: "12px",
              background: "#0F131A",
              borderRadius: 8,
              border: "1px solid #252C38"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 12, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 6 }}>
                <ImageIcon size={15} /> Logo Siaran Default
              </strong>
              <div className="tab-pill-group" style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  className={`mini-pill-btn ${masterForm.logoType === "text" ? "active" : ""}`}
                  disabled={uploadingLogo}
                  onClick={() => setMasterForm({ ...masterForm, logoType: "text" as const })}
                >
                  Teks Logo
                </button>
                <button
                  type="button"
                  className={`mini-pill-btn ${masterForm.logoType === "image" ? "active" : ""}`}
                  disabled={uploadingLogo}
                  onClick={() => setMasterForm({ ...masterForm, logoType: "image" as const })}
                >
                  Upload Gambar
                </button>
              </div>
            </div>

            <small className="settings-palette-note">
              Logo: <b>PNG transparan {broadcastLogoUploadSpec.width} × {broadcastLogoUploadSpec.height} px</b>,
              ruang kosong sekitar {broadcastLogoUploadSpec.padding} px di tepi, maksimal {broadcastLogoUploadSpec.maxBytes / (1024 * 1024)} MB. SVG juga didukung. Logo ditampilkan proporsional.
            </small>
            {masterForm.logoType === "image" ? (
              <div>
                <input
                  ref={masterLogoInputRef}
                  type="file"
                  disabled={uploadingLogo}
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={handleLogoUpload}
                />
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    style={{
                      width: 140,
                      height: 80,
                      background: "#06090e",
                      border: "1px dashed #2d3b4e",
                      borderRadius: 4,
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                      flexShrink: 0
                    }}
                  >
                    {masterForm.logoImage ? (
                      <img
                        src={masterForm.logoImage}
                        alt="Logo Preview"
                        style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }}
                      />
                    ) : (
                      <span style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 6 }}>
                        Belum ada gambar
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="primary-small"
                        disabled={uploadingLogo}
                        onClick={() => masterLogoInputRef.current?.click()}
                      >
                        <Upload size={13} /> {uploadingLogo ? "Mengunggah…" : masterForm.logoImage ? "Ganti File Gambar" : "Pilih File Gambar Logo"}
                      </button>
                      {masterForm.logoImage && (
                        <button
                          type="button"
                          className="btn-text-danger"
                          disabled={uploadingLogo}
                          style={{
                            background: "transparent",
                            border: "1px solid #5a242c",
                            color: "#ff8891",
                            borderRadius: 4,
                            padding: "5px 10px",
                            fontSize: 11,
                            cursor: "pointer"
                          }}
                          onClick={() => {
                            setMasterForm({ ...masterForm, logoImage: null, logoType: "text" as const });
                            toast("Logo gambar dihapus (kembali ke teks bawaan)");
                          }}
                        >
                          <Trash2 size={12} /> Hapus
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                    Teks Logo Utama
                  </span>
                  <input
                    style={{
                      marginTop: 4,
                      width: "100%",
                      background: "#06090e",
                      color: "white",
                      border: "1px solid #2d3748",
                      borderRadius: 4,
                      padding: "7px 9px",
                      fontSize: 11
                    }}
                    value={masterForm.logoText || "CNN"}
                    onChange={(e) => setMasterForm({ ...masterForm, logoText: e.target.value })}
                  />
                </label>
                <label>
                  <span style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                    Teks Sub-Logo
                  </span>
                  <input
                    style={{
                      marginTop: 4,
                      width: "100%",
                      background: "#06090e",
                      color: "white",
                      border: "1px solid #2d3748",
                      borderRadius: 4,
                      padding: "7px 9px",
                      fontSize: 11
                    }}
                    value={masterForm.logoSub || "Indonesia"}
                    onChange={(e) => setMasterForm({ ...masterForm, logoSub: e.target.value })}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="wide">
              <span>Nama Berita di Ticker (Lebar Otomatis Sesuai Huruf)</span>
              <input
                value={masterForm.brandText || ""}
                placeholder="NAMA NEWS ANDA"
                onChange={(e) => setMasterForm({ ...masterForm, brandText: e.target.value })}
              />
              <small style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, display: "block" }}>
                Label di sebelah kiri running text mengikuti warna template. Lebarnya otomatis menyesuaikan nama berita.
              </small>
            </label>
          </div>

          {masterForm.broadcastTemplate === "bcc" ? (
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <label className="wide">
                <span>Ticker Global BCC News</span>
                <textarea
                  rows={3}
                  value={masterForm.tickerText ?? ""}
                  placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"
                  onChange={(e) => setMasterForm({ ...masterForm, tickerText: e.target.value })}
                />
                <small style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, display: "block" }}>
                  Ticker BCC bersifat global dan tampil di seluruh tayangan tanpa terikat rundown.
                </small>
              </label>
              <label>
                <span>Kecepatan Ticker BCC</span>
                <select
                  value={masterForm.tickerSpeed ?? 85}
                  onChange={(e) => setMasterForm({ ...masterForm, tickerSpeed: Number(e.target.value) })}
                >
                  <option value={65}>Lambat (65 px/detik)</option>
                  <option value={85}>Normal (85 px/detik)</option>
                  <option value={105}>Cepat (105 px/detik)</option>
                </select>
              </label>
            </div>
          ) : (
            <>
              <p>Materi ticker disimpan per rundown. Atur jadwal dan teksnya di Rundown &amp; CG.</p>
              <p>Kecepatan ticker dihitung otomatis dari isinya dan disimpan per rundown. Pilih mode manual di Rundown &amp; CG jika diperlukan.</p>
            </>
          )}

          <div className="form-grid" style={{ marginBottom: 14 }}>
            <label>
              <span>Zona Waktu Siaran</span>
              <select
                value={masterForm.timezone}
                onChange={(e) => setMasterForm({ ...masterForm, timezone: e.target.value as TimezoneMode })}
              >
                <option value="WIB">WIB (Waktu Indonesia Barat, UTC+7)</option>
                <option value="WITA">WITA (Waktu Indonesia Tengah, UTC+8)</option>
                <option value="WIT">WIT (Waktu Indonesia Timur, UTC+9)</option>
                <option value="CUSTOM">Custom Label Suffix</option>
              </select>
            </label>
            {masterForm.timezone === "CUSTOM" && (
              <label>
                <span>Label Kustom Zona Waktu</span>
                <input
                  placeholder="Label Jam"
                  value={masterForm.customTimezoneLabel || ""}
                  onChange={(e) => setMasterForm({ ...masterForm, customTimezoneLabel: e.target.value })}
                />
              </label>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderTop: "1px solid #252C38",
              paddingTop: 12,
              marginTop: 10
            }}
          >
            <button className="primary-small b" onClick={saveMaster} disabled={uploadingLogo || savingMaster || savingAll}>
              <Save size={13} /> Simpan Default Master
            </button>
            <span style={{ fontSize: 10, color: "#64748b" }}>
              Perubahan identitas grafis tersimpan ke database & terkirim ke overlay siaran.
            </span>
          </div>
        </div>

        {/* Card B: Siklus logo dan cuaca (BMKG) */}
        <div
          ref={(el) => { sectionRefs.current["sec-weather"] = el; }}
          className="p settings-card"
        >
          <div className="fl" style={{ marginBottom: 12 }}>
            <span className="l">Siklus logo dan cuaca (Khusus Template Liputan7 · HOC TV)</span>
            <span className="m" style={{ fontSize: 12, color: "#98A3B3" }}>
              BMKG · data &gt; 3 jam: tampil logo saja
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, height: 34, marginBottom: 14 }}>
            <div style={{ flex: 10, background: "#2A3A55", padding: 8, borderRadius: 4, fontSize: 11, display: "flex", alignItems: "center" }}>Logo 10 dtk</div>
            {DEFAULT_WEATHER_ROWS.map((row) => (
              <div key={row.city} title={`${row.city} (3 dtk)`} style={{ flex: 3, background: "#1F6F4A", borderRadius: 4 }} />
            ))}
            <div style={{ flex: 10, background: "#2A3A55", padding: 8, borderRadius: 4, fontSize: 11, display: "flex", alignItems: "center" }}>Logo 10 dtk</div>
          </div>
          <table>
            <thead className="l">
              <tr>
                <th>Kota</th>
                <th>Kelurahan / desa</th>
                <th>Cuaca</th>
                <th>Suhu</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_WEATHER_ROWS.map((row) => (
                <tr key={row.city}>
                  <td>{row.city}</td>
                  <td>{row.subdistrict}</td>
                  <td>{row.condition}</td>
                  <td className="m">{row.temp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 2. KARTU PENGATURAN DEFAULT HEADLINE BERITA */}
        <div
          ref={(el) => { sectionRefs.current["sec-defaults"] = el; }}
          className="settings-card headline-defaults-card p"
        >
          <h3>
            <FileJson size={17} />
            Pengaturan Default Headline Berita
          </h3>
          <p>
            Nilai awal bawaan saat membuat berita baru pada tab Persiapan. Berita yang sudah dibuat sebelumnya tetap mempertahankan datanya masing-masing.
          </p>
          {loadingHeadline && <p role="status">Memuat default headline…</p>}
          {headlineLoadError && (
            <div role="alert" className="modal-error-banner">
              {headlineLoadError}
              <button type="button" onClick={() => setHeadlineLoadAttempt((attempt) => attempt + 1)}>Muat ulang default</button>
            </div>
          )}

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="wide">
              <span>Default Headline / Judul Utama</span>
              <input
                value={headlineDefaults.headline}
                placeholder="Contoh: BERITA UTAMA HARI INI"
                maxLength={getGraphicFieldLimit("HEADLINE", "headline")}
                onChange={(e) => patchHeadlineDefault("headline", e.target.value)}
              />
            </label>
          </div>

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label>
              <span>Default Lokasi</span>
              <input
                value={headlineDefaults.location}
                placeholder="Contoh: JAKARTA"
                maxLength={getGraphicFieldLimit("HEADLINE", "location")}
                onChange={(e) => patchHeadlineDefault("location", e.target.value)}
              />
            </label>
            <label>
              <span>Default Topik / Kicker</span>
              <input
                value={headlineDefaults.kicker}
                placeholder="Contoh: BREAKING NEWS"
                maxLength={getGraphicFieldLimit("HEADLINE", "kicker")}
                onChange={(e) => patchHeadlineDefault("kicker", e.target.value)}
              />
            </label>
          </div>

          <div className="form-grid" style={{ marginBottom: 14 }}>
            <label className="wide">
              <span>Default Detail / Subline Keterangan</span>
              <input
                value={headlineDefaults.subline}
                placeholder="Contoh: Keterangan tambahan berita..."
                maxLength={getGraphicFieldLimit("HEADLINE", "subline")}
                onChange={(e) => patchHeadlineDefault("subline", e.target.value)}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderTop: "1px solid #252C38",
              paddingTop: 12
            }}
          >
            <button
              className="primary-small b"
              onClick={() => void saveHeadlineDefaultsData()}
              disabled={savingHeadline || savingAll || loadingHeadline || !headlineLoaded}
            >
              <Save size={13} /> {savingHeadline ? "Menyimpan..." : "Simpan Default Headline"}
            </button>
            <span style={{ fontSize: 10, color: "#64748b" }}>
              Tersimpan permanen di database server sebagai template awal materi baru.
            </span>
          </div>
        </div>

        <div className="settings-card news-anchor-defaults-card p">
          <h3><FileJson size={17} /> Pengaturan Default News Anchor</h3>
          <p>Dipakai semua template. Di Produksi, P menyiapkan anchor di Preview; Spasi/Enter menayangkan. P lagi kembali ke cue berita.</p>
          {anchorState.loading && <p role="status">Memuat default news anchor…</p>}
          {anchorState.error && (
            <div role="alert" className="modal-error-banner">
              {anchorState.error}
              <button type="button" onClick={() => setAnchorState((current) => ({ ...current, attempt: current.attempt + 1 }))}>Muat ulang news anchor</button>
            </div>
          )}
          <div className="form-grid">
            <label>
              <span>Nama Anchor</span>
              <input
                value={anchorDefaults.name}
                placeholder="Nama pembawa berita"
                maxLength={getGraphicFieldLimit("REPORTER", "name")}
                onChange={(event) => patchAnchorDefault("name", event.target.value)}
              />
            </label>
            <label>
              <span>Jabatan Anchor</span>
              <input
                value={anchorDefaults.role}
                placeholder="News Anchor"
                maxLength={getGraphicFieldLimit("REPORTER", "role")}
                onChange={(event) => patchAnchorDefault("role", event.target.value)}
              />
            </label>
          </div>
          <div className="settings-palette-preview" style={{ marginTop: 12 }}>
            <BroadcastPreviewBox
              graphic={anchorGraphic}
              fields={anchorGraphic?.draftFields || null}
              master={{ ...masterForm, showTicker: false }}
              emptyText="ISI NAMA ANCHOR UNTUK MELIHAT PREVIEW"
            />
          </div>
          <button
            type="button"
            className="primary-small b"
            style={{ marginTop: 12 }}
            onClick={() => void saveNewsAnchorDefaultsData()}
            disabled={savingAll || savingAnchor || anchorState.loading || !anchorState.loaded}
          >
            <Save size={13} /> {savingAnchor ? "Menyimpan…" : "Simpan Default News Anchor"}
          </button>
          <p style={{ margin: "10px 0 0" }}>Menyimpan default hanya mengubah data bawaan; Program tetap memakai snapshot yang sedang tayang. Nama wajib diisi sebelum TAKE.</p>
        </div>

        <div className="settings-card reporter-defaults-card p">
          <h3><FileJson size={17} /> Pengaturan Default Reporter Lapangan</h3>
          <p>Dipakai semua template. Di Produksi, <b>O</b> menyiapkan reporter lapangan di Preview; Spasi/→ menayangkan. O lagi kembali ke cue berita.</p>
          {reporterState.loading && <p role="status">Memuat default reporter lapangan…</p>}
          {reporterState.error && (
            <div role="alert" className="modal-error-banner">
              {reporterState.error}
              <button type="button" onClick={() => setReporterState((current) => ({ ...current, attempt: current.attempt + 1 }))}>Muat ulang reporter</button>
            </div>
          )}
          <div className="form-grid">
            <label>
              <span>Nama Reporter</span>
              <input
                value={reporterDefaults.name}
                placeholder="Nama reporter lapangan"
                maxLength={getGraphicFieldLimit("REPORTER", "name")}
                onChange={(event) => patchReporterDefault("name", event.target.value)}
              />
            </label>
            <label>
              <span>Jabatan Reporter</span>
              <input
                value={reporterDefaults.role}
                placeholder="Reporter Lapangan"
                maxLength={getGraphicFieldLimit("REPORTER", "role")}
                onChange={(event) => patchReporterDefault("role", event.target.value)}
              />
            </label>
            <label>
              <span>Lokasi Liputan</span>
              <input
                value={reporterDefaults.location}
                placeholder="Contoh: Jakarta Selatan"
                maxLength={getGraphicFieldLimit("REPORTER", "location")}
                onChange={(event) => patchReporterDefault("location", event.target.value)}
              />
            </label>
          </div>
          <div className="settings-palette-preview" style={{ marginTop: 12 }}>
            <BroadcastPreviewBox
              graphic={reporterGraphic}
              fields={reporterGraphic?.draftFields || null}
              master={{ ...masterForm, showTicker: false }}
              emptyText="ISI NAMA REPORTER UNTUK MELIHAT PREVIEW"
            />
          </div>
          <button
            type="button"
            className="primary-small b"
            style={{ marginTop: 12 }}
            onClick={() => void saveReporterDefaultsData()}
            disabled={savingAll || savingReporter || reporterState.loading || !reporterState.loaded}
          >
            <Save size={13} /> {savingReporter ? "Menyimpan…" : "Simpan Default Reporter Lapangan"}
          </button>
          <p style={{ margin: "10px 0 0" }}>Menyimpan default hanya mengubah data bawaan; Program tetap memakai snapshot yang sedang tayang. Nama wajib diisi sebelum TAKE.</p>
        </div>

        {/* 3. KARTU OUTPUT & INTEGRASI SWITCHER */}
        <div
          ref={(el) => { sectionRefs.current["sec-output"] = el; }}
          className="settings-card p"
        >
          <h3>
            <Globe size={17} />
            Output Layar Siaran (vMix / OBS Browser Input)
          </h3>
          <p>
            NewsCG beroperasi dengan arsitektur web overlay transparan (Singular.live style). Tambahkan URL Output sebagai input Web Browser pada switcher siaran Anda (vMix, OBS Studio, Wirecast, Tricaster).
          </p>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <label>
              <span>Target FPS animasi output</span>
              <select
                value={masterForm.outputFps || 30}
                onChange={(event) => setMasterForm((previous) => ({ ...previous, outputFps: Number(event.target.value) as OutputFrameRate }))}
              >
                <option value={25}>25 fps — cocok untuk proyek vMix 25p</option>
                <option value={30}>30 fps — direkomendasikan, lebih ringan</option>
                <option value={60}>60 fps — gerak lebih halus</option>
              </select>
            </label>
            <p style={{ margin: 0, alignSelf: "end", fontSize: 11, color: "#9cb1c9", lineHeight: 1.5 }}>
              Pilihan ini mengatur pembaruan ticker di /output. Klik Simpan Semua untuk menerapkan; Preview dan Program di dashboard tetap 30 fps agar ringan.
            </p>
          </div>

          <div
            style={{
              marginTop: 14,
              background: "#0F131A",
              border: "1px solid #252C38",
              borderRadius: 8,
              padding: 14
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
                paddingBottom: 10,
                borderBottom: "1px solid #252C38"
              }}
            >
              <span style={{ fontSize: 11, color: "#8a96a8" }}>Koneksi output NewsCG (tab/Browser Source):</span>
              <span className={`state-badge st ${live.overlayClientsCount > 0 ? "r" : ""}`}>
                <b>
                  {live.overlayClientsCount > 0
                    ? `${live.overlayClientsCount} klien terhubung`
                    : "Belum ada klien terhubung"}
                </b>
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-small b"
                onClick={async () => {
                  const ok = await copyToClipboard(outputUrl);
                  if (ok) {
                    toast("URL Output disalin ke clipboard!");
                  } else {
                    toast(`Gagal menyalin otomatis. URL: ${outputUrl}`);
                  }
                }}
              >
                <Copy size={13} /> Salin URL Output vMix
              </button>
              <button
                type="button"
                className="secondary-small b"
                onClick={() => window.open("/output", "_blank")}
              >
                <ExternalLink size={13} /> Buka Preview Output di Tab Baru
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. RIGHT COLUMN: HOTKEYS & KEAMANAN SIARAN (Settings.dc.html) */}
      <div
        ref={(el) => { sectionRefs.current["sec-hotkeys"] = el; }}
        className="settings-right-scroll"
      >
        <aside className="p" style={{ padding: 16 }}>
          <div className="fl" style={{ marginBottom: 8 }}>
            <span className="l">Hotkeys</span>
            <button
              type="button"
              className={`tg ${shortcutsEnabled ? "on active" : ""}`}
              aria-label="Hotkeys"
              aria-pressed={shortcutsEnabled}
              onClick={onToggleShortcuts}
            />
          </div>
          <div className="fl" style={{ height: 30 }}><span className="k">Space / Enter</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>TAKE atau UPDATE</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">U</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Update in-place</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">Esc / C</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>CLEAR</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">← →</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>OUT / TAKE · highlight</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">↑ ↓</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Story</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">K · PgUp/PgDn</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>SOT</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">P · O · H</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Anchor · Reporter · Bersih</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">L · T · D</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Lokasi · Topik · Detail</span></div>
          <div className="fl" style={{ height: 30 }}><span className="k">M · 1 2 3 · 0</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Master</span></div>
          <div style={{ borderTop: "1px solid #252C38", marginTop: 8, paddingTop: 8 }}>
            <div className="fl" style={{ height: 30 }}><span className="k">F1–F3</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Pindah tab</span></div>
            <div className="fl" style={{ height: 30 }}><span className="k">/</span><span style={{ fontSize: 13, color: "#C5CDD9" }}>Cari story</span></div>
          </div>
        </aside>

        <aside className="p" style={{ padding: 16 }}>
          <div className="l" style={{ marginBottom: 8 }}>Keamanan siaran</div>
          <div className="fl" style={{ height: 40 }}>
            <span style={{ fontSize: 13 }}>Safe mode: TAKE hanya jika Preview siap</span>
            <button
              type="button"
              className={`tg ${safeModeTake ? "on active" : ""}`}
              aria-label="Safe mode: TAKE hanya jika Preview siap"
              aria-pressed={safeModeTake}
              onClick={() => {
                const next = !safeModeTake;
                setSafeModeTake(next);
                localStorage.setItem("newscg-safety-safe-take", String(next));
              }}
            />
          </div>
          <div className="fl" style={{ height: 40 }}>
            <span style={{ fontSize: 13 }}>BLACKOUT harus ditahan 1 detik</span>
            <button
              type="button"
              className={`tg ${holdBlackout ? "on active" : ""}`}
              aria-label="BLACKOUT harus ditahan 1 detik"
              aria-pressed={holdBlackout}
              onClick={() => {
                const next = !holdBlackout;
                setHoldBlackout(next);
                localStorage.setItem("newscg-safety-hold-blackout", String(next));
              }}
            />
          </div>
          <div className="fl" style={{ height: 40 }}>
            <span style={{ fontSize: 13 }}>Hotkeys pause saat mengetik</span>
            <button
              type="button"
              className={`tg ${pauseHotkeysTyping ? "on active" : ""}`}
              aria-label="Hotkeys pause saat mengetik"
              aria-pressed={pauseHotkeysTyping}
              onClick={() => {
                const next = !pauseHotkeysTyping;
                setPauseHotkeysTyping(next);
                localStorage.setItem("newscg-safety-pause-typing", String(next));
              }}
            />
          </div>
          <div className="fl" style={{ height: 40 }}>
            <span style={{ fontSize: 13 }}>Auto-maju ke story berikutnya setelah CLEAR</span>
            <button
              type="button"
              className={`tg ${autoAdvanceClear ? "on active" : ""}`}
              aria-label="Auto-maju ke story berikutnya setelah CLEAR"
              aria-pressed={autoAdvanceClear}
              onClick={() => {
                const next = !autoAdvanceClear;
                setAutoAdvanceClear(next);
                localStorage.setItem("newscg-safety-auto-advance", String(next));
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
