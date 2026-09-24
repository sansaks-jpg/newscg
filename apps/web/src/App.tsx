import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock3,
  Copy,
  ExternalLink,
  FileJson,
  Globe,
  Image as ImageIcon,
  LayoutList,
  LoaderCircle,
  MapPin,
  MonitorPlay,
  PencilLine,
  Save,
  Settings,
  Signal,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import type {
  AppSettings,
  HeadlineDefaults,
  LiveState,
  MasterOverlayState,
  OutputFrameRate,
  Rundown,
  TemplateType,
  TimezoneMode
} from "@newscg/shared";
import { defaultHeadlineDefaults, defaultMasterOverlayState, masterOverlayPatchSchema } from "@newscg/shared";
import { api, mutate } from "./api";
import TemplatePreview from "./TemplatePreview";
import OverlayWindow from "./OverlayWindow";
import { Preparation } from "./Newsroom";
import { SimpleProductionEditor } from "./SimpleProductionEditor";
import { BroadcastClock } from "./BroadcastGraphic";
import { BroadcastTicker } from "./BroadcastTicker";

type View = "editor" | "rundown" | "settings";
const templateMeta: Record<TemplateType, { label: string; icon: any; accent: string }> = {
  HEADLINE: { label: "Headline", icon: MonitorPlay, accent: "#f1f3f6" },
  REPORTER: { label: "Reporter / Pembawa Acara", icon: UserRound, accent: "#4e8cff" },
  SOT: { label: "SOT Narasumber", icon: UserRound, accent: "#e11d2e" },
  LOCATION: { label: "Lokasi", icon: MapPin, accent: "#f7b53d" },
  BREAKING: { label: "Breaking News", icon: AlertTriangle, accent: "#ef1b2d" }
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

export default function App() {
  if (window.location.pathname === "/templates/cnn") return <TemplatePreview />;
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
  const [actions, setActions] = useState<any[]>([]);
  const [toast, setToast] = useState("");

  const active = rundowns.find((r) => r.id === activeId) || rundowns[0];

  const reload = useCallback(async () => {
    const [r, s, l, a, m] = await Promise.all([
      api<Rundown[]>("/api/rundowns"),
      api<AppSettings>("/api/settings"),
      api<LiveState>("/api/live/state"),
      api<any[]>("/api/actions?limit=12"),
      api<MasterOverlayState>("/api/live/master")
    ]);
    setRundowns(r);
    setSettings(s);
    setLive(l);
    setActions(a);
    if (m) setMaster(m);
    setActiveId((id) => id || r[0]?.id || "");
  }, []);

  useEffect(() => {
    reload().catch((e) => setToast(e.message));
    const id = setInterval(
      () =>
        api<LiveState>("/api/live/state")
          .then(setLive)
          .catch(() => setLive((previous) => ({
            ...previous,
            connection: "STANDALONE",
            overlayClientsCount: 0,
            commandStatus: "unknown",
            error: "Koneksi ke server NewsCG terputus"
          }))),
      2000
    );
    return () => clearInterval(id);
  }, [reload]);

  async function updateMaster(patch: Partial<MasterOverlayState>) {
    try {
      const parsed = masterOverlayPatchSchema.safeParse(patch);
      if (!parsed.success) throw new Error("Pengaturan master tidak valid. Periksa isi ticker dan kecepatan (30–250 px/detik).");
      const res = await mutate<MasterOverlayState>("/api/live/master", "PATCH", parsed.data);
      setMaster(res);
      setToast("Pengaturan master diterapkan ke output NewsCG");
    } catch (e: any) {
      setToast(e.message);
      throw e;
    }
  }

  function copyOutputUrl() {
    const url = `${window.location.origin}/output`;
    navigator.clipboard.writeText(url);
    setToast(`Output URL disalin: ${url}`);
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
            rundowns={rundowns}
            onRundown={setActiveId}
            reload={reload}
            toast={setToast}
            master={master}
            live={live}
            onUpdateMaster={updateMaster}
            onSetup={() => setShowSetupModal(true)}
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
            onOpenSetupModal={() => setShowSetupModal(true)}
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      patchDraft({ logoType: "image", logoImage: dataUrl });
    };
    reader.readAsDataURL(file);
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

              <label style={{ marginTop: 10 }}>
                <span className="master-label">Isi Running Ticker Berita Default</span>
                <textarea
                  className="master-input full"
                  value={draft.tickerText || ""}
                  placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                  onChange={(e) => patchDraft({ tickerText: e.target.value })}
                  rows={4}
                />
                <small className="field-hint">Ticker berjalan sesuai target fps output yang dipilih di Settings.</small>
              </label>

              {/* Pratinjau Interaktif Ticker */}
              <div style={{ marginTop: 14 }}>
                <span className="master-label" style={{ display: "block", marginBottom: 6, color: "#38bdf8" }}>
                   PRATINJAU DRAFT TICKER (BADGE FIT & ANIMASI):
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
                   <BroadcastTicker text={draft.tickerText || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"} fps={30} />
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
                    Ukuran box siaran: <b>155 × 98 px</b>.
                    <br />
                    Rekomendasi file upload: <b>310 × 196 piksel</b> (format <b>PNG Transparan</b> atau SVG).
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
  onOpenSetupModal,
  onSaved,
  toast
}: {
  value: AppSettings;
  master: MasterOverlayState;
  live: LiveState;
  onUpdateMaster: (p: Partial<MasterOverlayState>) => Promise<void>;
  onOpenSetupModal: () => void;
  onSaved: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const [form, setForm] = useState<any>(value);
  const [masterForm, setMasterForm] = useState<MasterOverlayState>(master);
  const [headlineDefaults, setHeadlineDefaults] = useState<HeadlineDefaults>(defaultHeadlineDefaults);
  const [savingHeadline, setSavingHeadline] = useState(false);
  const masterLogoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(value), [value]);
  useEffect(() => setMasterForm(master), [master]);
  useEffect(() => {
    api<HeadlineDefaults>("/api/settings/headline-defaults")
      .then((d) => {
        if (d) setHeadlineDefaults(d);
      })
      .catch(() => {});
  }, []);

  async function save() {
    try {
      await mutate("/api/settings", "PATCH", form);
      await onUpdateMaster(masterForm);
      await saveHeadlineDefaultsData(false);
      await onSaved();
      toast("Semua pengaturan berhasil disimpan");
    } catch (error) {
      toast(`Sebagian pengaturan belum tersimpan: ${(error as Error).message}`);
    }
  }

  async function saveMaster() {
    try {
      await onUpdateMaster(masterForm);
      toast("Pengaturan default elemen master berhasil disimpan");
    } catch (error) {
      toast((error as Error).message || "Gagal menerapkan master");
    }
  }

  async function saveHeadlineDefaultsData(notify = true) {
    setSavingHeadline(true);
    try {
      const updated = await mutate<HeadlineDefaults>(
        "/api/settings/headline-defaults",
        "PATCH",
        headlineDefaults
      );
      setHeadlineDefaults(updated);
      if (notify) toast("Pengaturan default headline berita berhasil disimpan");
    } catch (e: any) {
      if (notify) toast(e.message || "Gagal menyimpan default headline");
      else throw e;
    } finally {
      setSavingHeadline(false);
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Ukuran file gambar melebihi batas 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const updated = { ...masterForm, logoType: "image" as const, logoImage: dataUrl };
      setMasterForm(updated);
      onUpdateMaster(updated);
      toast("Gambar logo berhasil diunggah");
    };
    reader.readAsDataURL(file);
  };

  const outputUrl = `${window.location.origin}/output`;

  return (
    <section className="page">
      <PageTitle
        eyebrow="GRAPHICS & CONNECTION CONFIG"
        title="Settings"
        action={
          <button className="primary-small" onClick={save}>
            <Save size={16} />
            Simpan Semua
          </button>
        }
      />
      <div className="settings-grid">
        {/* 1. KARTU PENGATURAN DEFAULT SIARAN (LOGO, NAMA BERITA TICKER, & ISI TICKER) */}
        <div className="settings-card broadcast-defaults-card">
          <h3>
            <SlidersHorizontal size={17} />
            Pengaturan Default Siaran & Ticker
          </h3>
          <p>
            Konfigurasi master bawaan yang berlaku otomatis di layar siaran. Nilai ini menjadi acuan default dan tetap dapat di-override secara manual per grafis saat produksi jika diperlukan.
          </p>

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
                  onClick={() => {
                    const u = { ...masterForm, logoType: "text" as const };
                    setMasterForm(u);
                    onUpdateMaster(u);
                  }}
                >
                  Teks Logo
                </button>
                <button
                  type="button"
                  className={`mini-pill-btn ${masterForm.logoType === "image" ? "active" : ""}`}
                  onClick={() => {
                    const u = { ...masterForm, logoType: "image" as const };
                    setMasterForm(u);
                    onUpdateMaster(u);
                  }}
                >
                  Upload Gambar
                </button>
              </div>
            </div>

            {masterForm.logoType === "image" ? (
              <div>
                <input
                  ref={masterLogoInputRef}
                  type="file"
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
                        onClick={() => masterLogoInputRef.current?.click()}
                      >
                        <Upload size={13} /> {masterForm.logoImage ? "Ganti File Gambar" : "Pilih File Gambar Logo"}
                      </button>
                      {masterForm.logoImage && (
                        <button
                          type="button"
                          className="btn-text-danger"
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
                            onUpdateMaster(u);
                            toast("Logo gambar dihapus (kembali ke teks bawaan)");
                          }}
                        >
                          <Trash2 size={12} /> Hapus
                        </button>
                      )}
                    </div>
                    <small style={{ display: "block", marginTop: 6, color: "#94a3b8", fontSize: 10, lineHeight: 1.4 }}>
                      Format rekomendasi: <b>PNG Transparan</b> atau <b>SVG</b>. Kotak logo siaran berukuran rasio 155 × 98 px.
                    </small>
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
              <span>Nama Berita di Ticker (Badge Merah — Fit Otomatis Sesuai Huruf)</span>
              <input
                value={masterForm.brandText || ""}
                placeholder="CNNINDONESIA.COM"
                onChange={(e) => setMasterForm({ ...masterForm, brandText: e.target.value })}
              />
              <small style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, display: "block" }}>
                Label merah di sebelah kiri running text. Lebar warna merah otomatis pas (fit-content) membungkus huruf tanpa ruang kosong berlebih.
              </small>
            </label>
          </div>

          {/* Subgrup 3: Isi Ticker Berita Default */}
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="wide">
              <span>Isi Running Ticker Berita Default (Animasi Berjalan Kontinu)</span>
              <textarea
                value={masterForm.tickerText || ""}
                placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                onChange={(e) => setMasterForm({ ...masterForm, tickerText: e.target.value })}
                rows={4}
                style={{ width: "100%", resize: "vertical", font: "inherit" }}
              />
              <small style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, display: "block" }}>
                Isi baru masuk pada batas segmen. Kecepatan dihitung pada kanvas 1920 × 1080.
              </small>
            </label>
          </div>

          {/* Subgrup 4: Kecepatan Running Ticker */}
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <label className="wide">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span>Kecepatan Running Ticker: <b style={{ color: "#38bdf8" }}>{masterForm.tickerSpeed || 85} px/detik</b></span>
                <div className="tab-pill-group" style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className={`mini-pill-btn ${(masterForm.tickerSpeed || 85) === 65 ? "active" : ""}`}
                    onClick={() => {
                      const u = { ...masterForm, tickerSpeed: 65 };
                      setMasterForm(u);
                      onUpdateMaster(u);
                    }}
                  >
                    Lambat (65)
                  </button>
                  <button
                    type="button"
                    className={`mini-pill-btn ${(masterForm.tickerSpeed || 85) === 85 ? "active" : ""}`}
                    onClick={() => {
                      const u = { ...masterForm, tickerSpeed: 85 };
                      setMasterForm(u);
                      onUpdateMaster(u);
                    }}
                  >
                    Standar (85)
                  </button>
                  <button
                    type="button"
                    className={`mini-pill-btn ${(masterForm.tickerSpeed || 85) === 105 ? "active" : ""}`}
                    onClick={() => {
                      const u = { ...masterForm, tickerSpeed: 105 };
                      setMasterForm(u);
                      onUpdateMaster(u);
                    }}
                  >
                    Cepat (105)
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={40}
                max={200}
                step={5}
                value={masterForm.tickerSpeed || 85}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const u = { ...masterForm, tickerSpeed: val };
                  setMasterForm(u);
                  onUpdateMaster(u);
                }}
                style={{ width: "100%", cursor: "pointer", accentColor: "#e11d48" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 10, marginTop: 2 }}>
                <span>40 px/s (Sangat Santai)</span>
                <span>85 px/s (Normal)</span>
                <span>200 px/s (Sangat Cepat)</span>
              </div>
            </label>
          </div>

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
            <button className="primary-small" onClick={saveMaster}>
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

          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="wide">
              <span>Default Headline / Judul Utama</span>
              <input
                value={headlineDefaults.headline}
                placeholder="Contoh: BERITA UTAMA HARI INI"
                maxLength={120}
                onChange={(e) =>
                  setHeadlineDefaults({ ...headlineDefaults, headline: e.target.value })
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
                maxLength={60}
                onChange={(e) =>
                  setHeadlineDefaults({ ...headlineDefaults, location: e.target.value })
                }
              />
            </label>
            <label>
              <span>Default Topik / Kicker</span>
              <input
                value={headlineDefaults.kicker}
                placeholder="Contoh: BREAKING NEWS"
                maxLength={60}
                onChange={(e) =>
                  setHeadlineDefaults({ ...headlineDefaults, kicker: e.target.value })
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
                maxLength={160}
                onChange={(e) =>
                  setHeadlineDefaults({ ...headlineDefaults, subline: e.target.value })
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
              disabled={savingHeadline}
            >
              <Save size={13} /> {savingHeadline ? "Menyimpan..." : "Simpan Default Headline"}
            </button>
            <span style={{ fontSize: 10, color: "#64748b" }}>
              Tersimpan permanen di database server sebagai template awal materi baru.
            </span>
          </div>
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
                onClick={() => {
                  navigator.clipboard.writeText(outputUrl);
                  toast("URL Output disalin ke clipboard!");
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
