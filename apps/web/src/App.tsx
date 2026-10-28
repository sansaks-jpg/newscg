import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock3,
  Copy,
  ExternalLink,
  FileJson,
  Globe,
  Image as ImageIcon,
  LayoutList,

  PencilLine,
  Save,
  Settings,
  Signal,
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
  const liveReadSequence = useRef(0);
  const masterWriteSequence = useRef(0);

  const [toast, setToast] = useState("");
  const reloadSequence = useRef(0);

  const active = rundowns.find((r) => r.id === activeId) || rundowns[0];

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

  return (
    <div className="app-shell-zero-scroll">
      <header className="unified-topbar">
        <div className="topbar-left">
          <button className="brand-compact" onClick={() => setView("editor")}>
            <span className="brand-mark">N</span>
            <span className="brand-text">
              <b>NewsCG</b>
              <small>LIVE</small>
            </span>
          </button>
          <div className="topbar-program-badge">
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

        <nav className="topbar-nav-tabs">
          {(
            [
              ["editor", PencilLine, "Kontrol Siaran"],
              ["rundown", LayoutList, "Rundown & CG"],
              ["settings", Settings, "Pengaturan Default"]
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              className={`topbar-tab-btn ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
            >
              <Icon size={14} />
              <span>{label}</span>
              {id === "editor" && live.onAirGraphicId ? <span className="tab-pulse-dot" /> : null}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="output-url-box">
            <button
              className="copy-url-btn"
              onClick={copyOutputUrl}
              title="Salin URL output untuk vMix/OBS Web Browser"
            >
              <Globe size={13} />
              <span>Output URL</span>
              <Copy size={11} />
            </button>
            <button
              className="open-url-btn"
              onClick={() => window.open("/output", "_blank")}
              title="Buka layar overlay di tab baru"
            >
              <ExternalLink size={12} />
            </button>
          </div>
          <span className={`status-chip ${status.kind}`}>
            <Signal size={12} />
            {status.label}
          </span>
          <span className="clock-compact">
            <Clock timezone={master.timezone} customLabel={master.customTimezoneLabel} />
          </span>
          <button
            className="setup-modal-icon-btn"
            onClick={() => setShowSetupModal(true)}
            title="Pengaturan Siaran, Identitas & Logo"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>
      </header>

      <main className="main-content-zero-scroll">
        {view === "editor" && (
          <SimpleProductionEditor
            rundown={active}


            reload={reload}
            toast={setToast}
            master={master}
            live={live}
            onUpdateMaster={updateMaster}

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
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")}>
            <X size={16} />
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
      {targetTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
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
    return;





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
            <BroadcastTemplatePicker value={draft.broadcastTemplate} disabled={saving} onChange={value => setDraft(current => selectBroadcastTemplate(current, value))} />
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

              {/* Pratinjau Interaktif Ticker */}
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

function SettingsView({
  value,
  master,
  live,
  onUpdateMaster,

  onSaved,
  toast
}: {
  value: AppSettings;
  master: MasterOverlayState;
  live: LiveState;
  onUpdateMaster: (p: Partial<MasterOverlayState>) => Promise<void>;

  onSaved: () => Promise<void>;
  toast: (s: string) => void;
}) {
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
    setAnchorState(current => ({ ...current, loading: true, error: "" }));
    api<NewsAnchorDefaults>("/api/settings/news-anchor-defaults").then(data => {
      const defaults = newsAnchorDefaultsSchema.parse(data);
      if (!active) return;
      setAnchorDefaults(current => ({ ...defaults, ...Object.fromEntries(
        [...editedAnchorFields.current].map(field => [field, current[field]])) }));
      setAnchorState(current => ({ ...current, loaded: true }));
    }).catch((error: unknown) => {
      if (active) setAnchorState(current => ({ ...current, loaded: false,
        error: `Default news anchor gagal dimuat: ${error instanceof Error ? error.message : "Permintaan gagal"}` }));
    }).finally(() => { if (active) setAnchorState(current => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [anchorState.attempt]);

  const patchAnchorDefault = (field: keyof NewsAnchorDefaults, text: string) => {
    editedAnchorFields.current.add(field);
    setAnchorDefaults(current => ({ ...current, [field]: text }));
  };

  useEffect(() => {
    let active = true;
    setReporterState(current => ({ ...current, loading: true, error: "" }));
    api<ReporterDefaults>("/api/settings/reporter-defaults").then(data => {
      const defaults = reporterDefaultsSchema.parse(data);
      if (!active) return;
      setReporterDefaults(current => ({ ...defaults, ...Object.fromEntries(
        [...editedReporterFields.current].map(field => [field, current[field]])) }));
      setReporterState(current => ({ ...current, loaded: true }));
    }).catch((error: unknown) => {
      if (active) setReporterState(current => ({ ...current, loaded: false,
        error: `Default reporter lapangan gagal dimuat: ${error instanceof Error ? error.message : "Permintaan gagal"}` }));
    }).finally(() => { if (active) setReporterState(current => ({ ...current, loading: false })); });
    return () => { active = false; };
  }, [reporterState.attempt]);

  const patchReporterDefault = (field: keyof ReporterDefaults, text: string) => {
    editedReporterFields.current.add(field);
    setReporterDefaults(current => ({ ...current, [field]: text }));
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
      setAnchorDefaults(current => ({ name: current.name === submitted.name ? updated.name : current.name,
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
      setReporterDefaults(current => ({ name: current.name === submitted.name ? updated.name : current.name,
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
    return;








  };

  const outputUrl = `${window.location.origin}/output`;

  return (
    <section className="page">
      <PageTitle
        eyebrow="GRAPHICS & CONNECTION CONFIG"
        title="Settings"
        action={
          <button className="primary-small" onClick={save} disabled={savingAll || savingMaster || !headlineLoaded || loadingHeadline || savingHeadline || uploadingLogo || !anchorState.loaded || anchorState.loading || savingAnchor || !reporterState.loaded || reporterState.loading || savingReporter}>
            <Save size={16} />
            {savingAll ? "Menyimpan…" : "Simpan Semua"}
          </button>
        }
      />
      <div className="settings-grid">
        {/* 1. KARTU PENGATURAN DEFAULT SIARAN (LOGO, NAMA BERITA TICKER, & ISI TICKER) */}
        <div className="settings-card broadcast-defaults-card">
          <h3>
            <SlidersHorizontal size={17} />
            Pengaturan Siaran · Logo & Jam
          </h3>
          <p>
            Atur warna, logo, dan jam di Preview. Klik Simpan Default Master untuk menyimpan dan menerapkan perubahan ke siaran.
          </p>

          <BroadcastTemplatePicker value={masterForm.broadcastTemplate} disabled={savingMaster || savingAll || uploadingLogo} onChange={value => setMasterForm(current => selectBroadcastTemplate(current, value))} />
          <Liputan7Settings master={masterForm} disabled={savingMaster || savingAll || uploadingLogo} onChange={setMasterForm} onBusyChange={setUploadingLogo} />
          {masterForm.broadcastTemplate === "cnn" && <BroadcastColorThemePicker value={masterForm.colorTheme} onChange={(colorTheme) => {
            setMasterForm((previous) => selectBroadcastColorTheme(previous, colorTheme));
          }} />}
          <small className="settings-palette-note">Preview warna pada studio referensi. Perubahan diterapkan ke output setelah Simpan Default Master.</small>
          <div className="settings-palette-preview">
            <BroadcastPreviewBox graphic={{ templateType: "HEADLINE" }} fields={{
              headline: headlineDefaults.headline || "PENDAFTARAN MAHASISWA BARU POLIMEDIA 2026 MENURUN",
              layoutStyle: "single", showLocation: "false"
            }} master={{ ...masterForm, showLogo: true, showTicker: true, showLiveBadge: true }} studioReference />
          </div>

          {/* Subgrup 1: Logo Siaran Default */}
          <div
            className="settings-subgroup"
            style={{
              marginBottom: 16,
              padding: "12px",
              background: "#0c1018",
              borderRadius: 6,
              border: "1px solid #1c2638"
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
                  onClick={() => {
                    const u = { ...masterForm, logoType: "text" as const };
                    setMasterForm(u);

                  }}
                >
                  Teks Logo
                </button>
                <button
                  type="button"
                  className={`mini-pill-btn ${masterForm.logoType === "image" ? "active" : ""}`}
                  disabled={uploadingLogo}
                  onClick={() => {
                    const u = { ...masterForm, logoType: "image" as const };
                    setMasterForm(u);

                  }}
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
                            const u = { ...masterForm, logoImage: null, logoType: "text" as const };
                            setMasterForm(u);

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

          {/* Subgrup 2: Nama Berita di Ticker (Badge Merah Fit) */}
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

          {/* Subgrup 5: Zona Waktu Siaran */}
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
              borderTop: "1px solid #1e293b",
              paddingTop: 12,
              marginTop: 10
            }}
          >
            <button className="primary-small" onClick={saveMaster} disabled={uploadingLogo || savingMaster || savingAll}>
              <Save size={13} /> Simpan Default Master
            </button>
            <span style={{ fontSize: 10, color: "#64748b" }}>
              Perubahan identitas grafis tersimpan ke database & terkirim ke overlay siaran.
            </span>
          </div>
        </div>

        {/* 2. KARTU PENGATURAN DEFAULT HEADLINE BERITA */}
        <div className="settings-card headline-defaults-card">
          <h3>
            <FileJson size={17} />
            Pengaturan Default Headline Berita
          </h3>
          <p>
            Nilai awal bawaan saat membuat berita baru pada tab Persiapan. Berita yang sudah dibuat sebelumnya tetap mempertahankan datanya masing-masing.
          </p>
          {loadingHeadline && <p role="status">Memuat default headline…</p>}
          {headlineLoadError && <div role="alert" className="modal-error-banner">
            {headlineLoadError}
            <button type="button" onClick={() => setHeadlineLoadAttempt((attempt) => attempt + 1)}>Muat ulang default</button>
          </div>}

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="wide">
              <span>Default Headline / Judul Utama</span>
              <input
                value={headlineDefaults.headline}
                placeholder="Contoh: BERITA UTAMA HARI INI"
                maxLength={getGraphicFieldLimit("HEADLINE", "headline")}
                onChange={(e) =>
                  patchHeadlineDefault("headline", e.target.value)
                }
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
                onChange={(e) =>
                  patchHeadlineDefault("location", e.target.value)
                }
              />
            </label>
            <label>
              <span>Default Topik / Kicker</span>
              <input
                value={headlineDefaults.kicker}
                placeholder="Contoh: BREAKING NEWS"
                maxLength={getGraphicFieldLimit("HEADLINE", "kicker")}
                onChange={(e) =>
                  patchHeadlineDefault("kicker", e.target.value)
                }
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
                onChange={(e) =>
                  patchHeadlineDefault("subline", e.target.value)
                }
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderTop: "1px solid #1e293b",
              paddingTop: 12
            }}
          >
            <button
              className="primary-small"
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

        <div className="settings-card news-anchor-defaults-card">
          <h3><FileJson size={17} /> Pengaturan Default News Anchor</h3>
          <p>Dipakai semua template. Di Produksi, P menyiapkan anchor di Preview; Spasi/Enter menayangkan. P lagi kembali ke cue berita.</p>
          {anchorState.loading && <p role="status">Memuat default news anchor…</p>}
          {anchorState.error && <div role="alert" className="modal-error-banner">{anchorState.error}
            <button type="button" onClick={() => setAnchorState(current => ({ ...current, attempt: current.attempt + 1 }))}>Muat ulang news anchor</button>
          </div>}
          <div className="form-grid">
            <label><span>Nama Anchor</span><input value={anchorDefaults.name} placeholder="Nama pembawa berita"
              maxLength={getGraphicFieldLimit("REPORTER", "name")} onChange={event => patchAnchorDefault("name", event.target.value)} /></label>
            <label><span>Jabatan Anchor</span><input value={anchorDefaults.role} placeholder="News Anchor"
              maxLength={getGraphicFieldLimit("REPORTER", "role")} onChange={event => patchAnchorDefault("role", event.target.value)} /></label>
          </div>
          <div className="settings-palette-preview" style={{ marginTop: 12 }}>
            <BroadcastPreviewBox graphic={anchorGraphic} fields={anchorGraphic?.draftFields || null} master={{ ...masterForm, showTicker: false }}
              emptyText="ISI NAMA ANCHOR UNTUK MELIHAT PREVIEW" />
          </div>
          <button type="button" className="primary-small" style={{ marginTop: 12 }} onClick={() => void saveNewsAnchorDefaultsData()}
            disabled={savingAll || savingAnchor || anchorState.loading || !anchorState.loaded}>
            <Save size={13} /> {savingAnchor ? "Menyimpan…" : "Simpan Default News Anchor"}
          </button>
          <p style={{ margin: "10px 0 0" }}>Menyimpan default hanya mengubah data bawaan; Program tetap memakai snapshot yang sedang tayang. Nama wajib diisi sebelum TAKE.</p>
        </div>

        <div className="settings-card reporter-defaults-card">
          <h3><FileJson size={17} /> Pengaturan Default Reporter Lapangan</h3>
          <p>Dipakai semua template. Di Produksi, <b>O</b> menyiapkan reporter lapangan di Preview; Spasi/→ menayangkan. O lagi kembali ke cue berita.</p>
          {reporterState.loading && <p role="status">Memuat default reporter lapangan…</p>}
          {reporterState.error && <div role="alert" className="modal-error-banner">{reporterState.error}
            <button type="button" onClick={() => setReporterState(current => ({ ...current, attempt: current.attempt + 1 }))}>Muat ulang reporter</button>
          </div>}
          <div className="form-grid">
            <label><span>Nama Reporter</span><input value={reporterDefaults.name} placeholder="Nama reporter lapangan"
              maxLength={getGraphicFieldLimit("REPORTER", "name")} onChange={event => patchReporterDefault("name", event.target.value)} /></label>
            <label><span>Jabatan Reporter</span><input value={reporterDefaults.role} placeholder="Reporter Lapangan"
              maxLength={getGraphicFieldLimit("REPORTER", "role")} onChange={event => patchReporterDefault("role", event.target.value)} /></label>
            <label><span>Lokasi Liputan</span><input value={reporterDefaults.location} placeholder="Contoh: Jakarta Selatan"
              maxLength={getGraphicFieldLimit("REPORTER", "location")} onChange={event => patchReporterDefault("location", event.target.value)} /></label>
          </div>
          <div className="settings-palette-preview" style={{ marginTop: 12 }}>
            <BroadcastPreviewBox graphic={reporterGraphic} fields={reporterGraphic?.draftFields || null} master={{ ...masterForm, showTicker: false }}
              emptyText="ISI NAMA REPORTER UNTUK MELIHAT PREVIEW" />
          </div>
          <button type="button" className="primary-small" style={{ marginTop: 12 }} onClick={() => void saveReporterDefaultsData()}
            disabled={savingAll || savingReporter || reporterState.loading || !reporterState.loaded}>
            <Save size={13} /> {savingReporter ? "Menyimpan…" : "Simpan Default Reporter Lapangan"}
          </button>
          <p style={{ margin: "10px 0 0" }}>Menyimpan default hanya mengubah data bawaan; Program tetap memakai snapshot yang sedang tayang. Nama wajib diisi sebelum TAKE.</p>
        </div>

        {/* 3. KARTU OUTPUT & INTEGRASI SWITCHER (VMIX / OBS / WIRECAST) */}
        <div className="settings-card">
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
              background: "#0b1420",
              border: "1px solid #1a3556",
              borderRadius: 4,
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
                borderBottom: "1px solid #162335"
              }}
            >
              <span style={{ fontSize: 11, color: "#8a96a8" }}>Koneksi output NewsCG (tab/Browser Source):</span>
              <span className={`state-badge ${live.overlayClientsCount > 0 ? "on-air" : "cued"}`}>
                <b>
                  {live.overlayClientsCount > 0
                    ? `${live.overlayClientsCount} klien terhubung`
                    : "Belum ada klien terhubung"}
                </b>
              </span>
            </div>

            <h4
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                color: "#74b3f6",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
            >
              <Globe size={15} /> Panduan Pemasangan di vMix / OBS Studio:
            </h4>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#9cb1c9", lineHeight: 1.6 }}>
              <li>
                Di vMix / OBS, klik <b>Add Input → Web Browser</b> (atau <b>Browser Source</b> di OBS).
              </li>
              <li>
                Masukkan URL Output berikut:{" "}
                <code style={{ background: "#162335", color: "#6cb6ff", padding: "2px 6px", borderRadius: 3 }}>
                  {outputUrl}
                </code>
              </li>
              <li>
                Atur Resolusi ke <b>1920 × 1080</b> (Full HD) dengan transparansi alpha aktif.
              </li>
              <li>
                Samakan <b>Settings → Display → Master Frame Rate</b> di vMix dengan target {master.outputFps || 30}p. Frame rate akhir tetap ditentukan oleh proyek vMix dan kemampuan browser/GPU.
              </li>
              <li>
                Pilih nomor overlay di vMix (misal Overlay 1 atau 2). Animasi grafis, ticker, dan logo siaran akan otomatis sinkron real-time saat Anda menekan TAKE / CLEAR.
              </li>
            </ol>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-small"
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
                className="secondary-small"
                style={{
                  background: "#162335",
                  border: "1px solid #233854",
                  color: "#cbd5e1",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer"
                }}
                onClick={() => window.open("/output", "_blank")}
              >
                <ExternalLink size={13} /> Buka Preview Output di Tab Baru
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PageTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: any }) {
  return (
    <header className="page-title">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
