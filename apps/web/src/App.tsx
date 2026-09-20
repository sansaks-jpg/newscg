import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Gauge,
  Globe,
  Image as ImageIcon,
  Keyboard,
  LayoutList,
  LoaderCircle,
  MapPin,
  MonitorPlay,
  PencilLine,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Signal,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  WifiOff,
  X
} from "lucide-react";
import type {
  AppSettings,
  GraphicItem,
  LiveState,
  MasterOverlayState,
  Rundown,
  RundownItem,
  TemplateType,
  TimezoneMode,
  VmixInput,
  HeadlineDefaults
} from "@newscg/shared";
import { defaultHeadlineDefaults, defaultMasterOverlayState } from "@newscg/shared";
import { api, mutate } from "./api";
import TemplatePreview from "./TemplatePreview";
import OverlayWindow from "./OverlayWindow";
import { Preparation } from "./Newsroom";
import { SimpleProductionEditor } from "./SimpleProductionEditor";
import { AutoSquishText } from "./AutoSquishText";
import { BroadcastTemplateInfo } from "./VisualTemplatePicker";
import { BroadcastPreviewBox, BroadcastClock } from "./BroadcastGraphic";
import { BroadcastTicker } from "./BroadcastTicker";

type View = "editor" | "rundown" | "settings";
const templateMeta: Record<TemplateType, { label: string; icon: any; accent: string }> = {
  HEADLINE: { label: "Headline", icon: MonitorPlay, accent: "#f1f3f6" },
  REPORTER: { label: "Reporter / Pembawa Acara", icon: UserRound, accent: "#4e8cff" },
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
  mode: "mock",
  outputMode: "web",
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>(blankLive);
  const [master, setMaster] = useState<MasterOverlayState>(defaultMasterOverlayState);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");

  const active = rundowns.find((r) => r.id === activeId) || rundowns[0];
  const graphics = useMemo(
    () => active?.items.flatMap((i) => i.graphics.map((g) => ({ ...g, item: i }))) || [],
    [active]
  );
  const selected = graphics.find((g) => g.id === selectedId) || null;
  const onAir = graphics.find((g) => g.id === live.onAirGraphicId) || null;

  const reload = useCallback(async () => {
    const [r, s, l, a, m] = await Promise.all([
      api<Rundown[]>("/api/rundowns"),
      api<AppSettings>("/api/settings"),
      api<LiveState>("/api/vmix/status"),
      api<any[]>("/api/actions?limit=12"),
      api<MasterOverlayState>("/api/live/master").catch(() => defaultMasterOverlayState)
    ]);
    setRundowns(r);
    setSettings(s);
    setLive(l);
    setActions(a);
    if (m) setMaster(m);
    setActiveId((id) => id || r[0]?.id || "");
    setSelectedId((id) => id || r[0]?.items.flatMap((i) => i.graphics)[0]?.id || null);
  }, []);

  useEffect(() => {
    reload().catch((e) => setToast(e.message));
    const id = setInterval(
      () =>
        api<LiveState>("/api/vmix/status")
          .then(setLive)
          .catch(() => {}),
      2000
    );
    return () => clearInterval(id);
  }, [reload]);

  const cueStep = useCallback(
    (dir: number) => {
      if (!graphics.length) return;
      const cur = graphics.findIndex((g) => g.id === selectedId);
      const next = Math.max(0, Math.min(graphics.length - 1, cur + dir));
      if (graphics[next]) {
        choose(graphics[next].id);
      }
    },
    [graphics, selectedId]
  );

  const takeAndNext = useCallback(async () => {
    if (!selected || busy) return;
    const currentId = selected.id;
    await runCommand("take");
    const idx = graphics.findIndex((g) => g.id === currentId);
    if (idx >= 0 && idx < graphics.length - 1) {
      const nextGraphic = graphics[idx + 1];
      if (nextGraphic) {
        choose(nextGraphic.id);
      }
    }
  }, [selected, busy, graphics]);


  async function choose(id: string) {
    setSelectedId(id);
    try {
      setLive(await mutate("/api/live/prepare", "POST", { graphicId: id }));
    } catch (e: any) {
      setToast(e.message);
    }
  }

  async function runCommand(command: "take" | "update" | "clear" | "clear-all") {
    if ((command !== "clear" && command !== "clear-all" && !selected) || busy) return;
    setBusy(command);
    setLive((s) => ({ ...s, commandStatus: "pending", error: null }));
    try {
      const url = command === "clear-all" ? "/api/live/clear-all" : `/api/live/${command}`;
      const body = command === "clear" || command === "clear-all" ? {} : { graphicId: selected!.id };
      const result = await mutate<any>(url, "POST", body, true);
      setLive(result.state);
      setToast(result.error || `${command.toUpperCase()} terkonfirmasi`);
      await reload();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy("");
    }
  }

  async function saveGraphic(id: string, patch: Partial<GraphicItem>) {
    try {
      await mutate(`/api/graphics/${id}`, "PATCH", patch);
      await reload();
      setToast("Draft tersimpan");
    } catch (e: any) {
      setToast(e.message);
    }
  }

  async function updateMaster(patch: Partial<MasterOverlayState>) {
    try {
      const res = await mutate<MasterOverlayState>("/api/live/master", "PATCH", patch);
      setMaster(res);
      setToast("Master broadcast layer diperbarui");
    } catch (e: any) {
      setToast(e.message);
    }
  }

  function copyOutputUrl() {
    const url = `${window.location.origin}/output`;
    navigator.clipboard.writeText(url);
    setToast(`Output URL disalin: ${url}`);
  }

  const status =
    live.outputMode === "web"
      ? live.overlayClientsCount > 0
        ? { label: `OVERLAY: ${live.overlayClientsCount} AKTIF`, kind: "ok" }
        : { label: "OVERLAY STANDALONE", kind: "mock" }
      : live.connection === "MOCK"
      ? { label: "MODE MOCK", kind: "mock" }
      : live.connection === "CONNECTED"
      ? { label: "CONNECTED", kind: "ok" }
      : { label: live.connection, kind: "bad" };

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
              ["editor", PencilLine, "Editor CG"],
              ["rundown", LayoutList, "Persiapan"],
              ["settings", Settings, "Pengaturan"]
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

function StateBadge({ state }: { state: string }) {
  const key = state.toLowerCase().replaceAll(" ", "-");
  return (
    <span className={`state-badge ${key}`}>
      {state === "ON AIR" ? (
        <CircleDot size={12} />
      ) : state === "PENDING" ? (
        <LoaderCircle size={12} />
      ) : state === "READY" ? (
        <Check size={12} />
      ) : (
        <AlertTriangle size={12} />
      )}{" "}
      {state}
    </span>
  );
}

function MonitorCard({
  label,
  state,
  graphic,
  fields,
  master,
  live = false
}: {
  label: string;
  state: string;
  graphic: any;
  fields: any;
  master: MasterOverlayState;
  live?: boolean;
}) {
  return (
    <article className={`monitor-card ${live ? "live" : ""}`}>
      <header>
        <span>
          <i />
          {label}
        </span>
        <StateBadge state={state} />
      </header>
      <div className="video-stage">
        <div className="studio-bg">
          <span className="grid-lines" />
          <span className="studio-orbit one" />
          <span className="studio-orbit two" />
        </div>
        <BroadcastPreviewBox
          graphic={graphic}
          fields={fields}
          master={master}
          emptyText={live ? "OVERLAY BERSIH" : "PILIH CG DARI RUNDOWN"}
        />
      </div>
      <footer>
        <span>
          {graphic
            ? `${graphic.item?.slug || "ON AIR"} · ${templateMeta[graphic.templateType as TemplateType].label}`
            : "Tidak ada grafis aktif"}
        </span>
        <time>{live && graphic ? "TERVERIFIKASI" : "PREVIEW 1080P"}</time>
      </footer>
    </article>
  );
}

type FieldConfig = {
  key: string;
  label: string;
  max: number;
  wide?: boolean;
  placeholder?: string;
  hideIfSingle?: boolean;
};

function GraphicForm({ graphic, onSave }: { graphic: any; onSave: (id: string, p: any) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showFormatOptions, setShowFormatOptions] = useState(false);

  useEffect(() => {
    setDraft(graphic?.draftFields || {});
    setShowFormatOptions(false);
  }, [graphic?.id]);

  if (!graphic)
    return (
      <div className="editor-card empty-editor">
        <PencilLine size={24} />
        <span>Pilih grafis dari daftar rundown untuk melihat atau menyunting teks.</span>
      </div>
    );

  const isLocationOnly = graphic.templateType === "LOCATION";
  const contentMode: "headline" | "paragraph" | "presenter" =
    (draft.contentMode as any) || (graphic.templateType === "REPORTER" ? "presenter" : "headline");

  const isSingle = (draft.layoutStyle || "sub") === "single";
  const showKicker = draft.showKicker !== "false";
  const showLocation = draft.showLocation === "true";

  const handleModeChange = (mode: "headline" | "paragraph" | "presenter") => {
    const updated: Record<string, string> = { ...draft, contentMode: mode };
    if (mode === "paragraph") {
      updated.showKicker = "false";
      updated.showLocation = "false";
      if (!updated.headline) updated.headline = "Make Up and Hair Do by Wardah Color Expert";
    } else if (mode === "presenter") {
      updated.showKicker = "false";
      if (!updated.name) updated.name = updated.headline || "LIANITA RUCHYAT";
      if (!updated.socialHandle) updated.socialHandle = "@lianitaruch";
    }
    setDraft(updated);
    onSave(graphic.id, { draftFields: updated });
  };

  const handleToggleKicker = (enabled: boolean) => {
    const updated: Record<string, string> = { ...draft, showKicker: enabled ? "true" : "false" };
    setDraft(updated);
    onSave(graphic.id, { draftFields: updated });
  };

  const handleToggleLocation = (enabled: boolean) => {
    const updated: Record<string, string> = { ...draft, showLocation: enabled ? "true" : "false" };
    setDraft(updated);
    onSave(graphic.id, { draftFields: updated });
  };

  const handleLayoutStyle = (style: "single" | "sub") => {
    const updated: Record<string, string> = { ...draft, layoutStyle: style };
    setDraft(updated);
    onSave(graphic.id, { draftFields: updated });
  };

  return (
    <div className="editor-card">
      <div className="section-heading">
        <div className="editor-head-left">
          <small>DRAFT EDITOR</small>
          <b>
            {templateMeta[graphic.templateType as TemplateType]?.label} ·{" "}
            <span style={{ color: "#9ca3af", fontWeight: 400 }}>{graphic.item?.slug}</span>
          </b>
        </div>
        <div className="editor-head-actions">
          {!isLocationOnly && (
            <button
              type="button"
              className={`format-toggle-btn ${showFormatOptions ? "open" : ""}`}
              onClick={() => setShowFormatOptions(!showFormatOptions)}
              title="Buka / tutup opsi format tampilan grafis"
            >
              <SlidersHorizontal size={12} />
              <span>{showFormatOptions ? "Tutup Format" : "Opsi Format"}</span>
              {showFormatOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <span className="autosave" title="Perubahan tersimpan otomatis sebagai draft">
            <CircleDot size={11} />
            TERISOLASI
          </span>
        </div>
      </div>

      <BroadcastTemplateInfo />

      {showFormatOptions && !isLocationOnly && (
        <div className="editor-controls-row">
          <div>
            <span className="master-label">TIPE KONTEN GRAFIS:</span>
            <div className="mode-btn-group">
              <button
                type="button"
                className={`mode-choice-btn ${contentMode === "headline" ? "active" : ""}`}
                onClick={() => handleModeChange("headline")}
              >
                <b>Headline Berita</b>
                <span>Standar / Single Headline</span>
              </button>
              <button
                type="button"
                className={`mode-choice-btn ${contentMode === "paragraph" ? "active" : ""}`}
                onClick={() => handleModeChange("paragraph")}
              >
                <b>Paragraf / Keterangan</b>
                <span>Sentence case (Wardah style)</span>
              </button>
              <button
                type="button"
                className={`mode-choice-btn ${contentMode === "presenter" ? "active" : ""}`}
                onClick={() => handleModeChange("presenter")}
              >
                <b>Presenter & Sosmed</b>
                <span>Nama pembawa acara + @IG</span>
              </button>
            </div>
          </div>

          <div className="toggles-group">
            {contentMode === "headline" && (
              <label className="toggle-checkbox-label" title="Sembunyikan jika ingin headline saja tanpa segmen/kicker di atasnya">
                <input
                  type="checkbox"
                  checked={showKicker}
                  onChange={(e) => handleToggleKicker(e.target.checked)}
                />
                <span>Tampilkan Kicker Tab (Atas)</span>
              </label>
            )}

            <label className="toggle-checkbox-label" title="Matikan jika siaran langsung dari Studio agar tidak ada tag lokasi">
              <input
                type="checkbox"
                checked={showLocation}
                onChange={(e) => handleToggleLocation(e.target.checked)}
              />
              <span>Tampilkan Lokasi di Layar</span>
            </label>

            {contentMode === "headline" && (
              <div style={{ display: "inline-flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
                <span className="master-label">FORMAT:</span>
                <button
                  type="button"
                  className={`toggle-btn ${isSingle ? "active" : ""}`}
                  onClick={() => handleLayoutStyle("single")}
                >
                  Gede Semua (Gambar 5)
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${!isSingle ? "active" : ""}`}
                  onClick={() => handleLayoutStyle("sub")}
                >
                  Headline + Sub
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Field Input sesuai mode */}
      <div className="field-grid">
        {contentMode === "paragraph" ? (
          <>
            <label className="wide">
              <span>
                Teks Paragraf / Keterangan Tunggal (Sentence case)
                <em>{(draft.headline?.length || 0)}/140</em>
              </span>
              <input
                value={draft.headline || ""}
                maxLength={140}
                placeholder="Make Up and Hair Do by Wardah Color Expert"
                onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
            <label className="wide">
              <span>
                Running Ticker Berita (Bawah)
                <em>{(draft.ticker?.length || 0)}/160</em>
              </span>
              <input
                value={draft.ticker || ""}
                maxLength={160}
                placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
          </>
        ) : contentMode === "presenter" ? (
          <>
            <label className="wide">
              <span>
                Nama Pembawa Berita / Presenter (Huruf Kapital)
                <em>{(draft.name?.length || draft.headline?.length || 0)}/60</em>
              </span>
              <input
                value={draft.name || draft.headline || ""}
                maxLength={60}
                placeholder="LIANITA RUCHYAT"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value, headline: e.target.value }))
                }
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
            <label className="wide">
              <span>
                Akun Instagram / Media Sosial
                <em>{(draft.socialHandle?.length || 0)}/60</em>
              </span>
              <input
                value={draft.socialHandle || ""}
                maxLength={60}
                placeholder="@lianitaruch"
                onChange={(e) => setDraft((d) => ({ ...d, socialHandle: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
            {showLocation && (
              <label>
                <span>
                  Lokasi (Pojok Kiri Atas)
                  <em>{(draft.location?.length || 0)}/50</em>
                </span>
                <input
                  value={draft.location || ""}
                  maxLength={50}
                  placeholder="Jakarta Timur"
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  onBlur={() => onSave(graphic.id, { draftFields: draft })}
                />
              </label>
            )}
            <label className="wide">
              <span>
                Running Ticker Berita (Bawah)
                <em>{(draft.ticker?.length || 0)}/160</em>
              </span>
              <input
                value={draft.ticker || ""}
                maxLength={160}
                placeholder="LAPORAN LANGSUNG DARI STUDIO / LOKASI KEJADIAN"
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
          </>
        ) : (
          /* Mode Headline Standar / Studio Mode (Gambar 5) */
          <>
            {showKicker && (
              <label>
                <span>
                  Label Segmen Kicker (Atas)
                  <em>{(draft.kicker?.length || 0)}/60</em>
                </span>
                <input
                  value={draft.kicker ?? (graphic.templateType === "BREAKING" ? "BREAKING NEWS" : "TOPIK UTAMA")}
                  maxLength={60}
                  placeholder="TOPIK UTAMA"
                  onChange={(e) => setDraft((d) => ({ ...d, kicker: e.target.value }))}
                  onBlur={() => onSave(graphic.id, { draftFields: draft })}
                />
              </label>
            )}
            {showLocation && (
              <label>
                <span>
                  Lokasi (Pojok Kiri Atas)
                  <em>{(draft.location?.length || 0)}/60</em>
                </span>
                <input
                  value={draft.location || ""}
                  maxLength={60}
                  placeholder="Surabaya, Jawa Timur"
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  onBlur={() => onSave(graphic.id, { draftFields: draft })}
                />
              </label>
            )}
            <label className="wide">
              <span>
                Headline / Judul Berita
                <em>{(draft.headline?.length || 0)}/120</em>
              </span>
              <input
                value={draft.headline || ""}
                maxLength={120}
                placeholder="PENCARIAN 5 JURNALIS HILANG, 20 KAPAL DIKERAHKAN"
                onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
            {!isSingle && (
              <label className="wide">
                <span>
                  Sub-judul / Detail Keterangan
                  <em>{(draft.subline?.length || 0)}/160</em>
                </span>
                <input
                  value={draft.subline || ""}
                  maxLength={160}
                  placeholder="Salah Satu Keluarga Korban Tak Menemukan Data Ayahnya di Data Penumpang"
                  onChange={(e) => setDraft((d) => ({ ...d, subline: e.target.value }))}
                  onBlur={() => onSave(graphic.id, { draftFields: draft })}
                />
              </label>
            )}
            <label className="wide">
              <span>
                Running Ticker Berita (Bawah)
                <em>{(draft.ticker?.length || 0)}/160</em>
              </span>
              <input
                value={draft.ticker || ""}
                maxLength={160}
                placeholder="SHERLY TJOANDA CURHAT KENA PHP ATR/BPN PIMPINAN NUSRON WAHID"
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value }))}
                onBlur={() => onSave(graphic.id, { draftFields: draft })}
              />
            </label>
          </>
        )}
      </div>

      <div className="draft-note">
        <ShieldCheck size={14} />
        <span>
          Perubahan otomatis tersimpan sebagai draft. Tampilan siaran tidak terpengaruh sebelum Anda klik <b>UPDATE LIVE</b>.
        </span>
        <button onClick={() => onSave(graphic.id, { draftFields: draft, status: "READY" })}>
          <Save size={13} />
          Siap Tayang
        </button>
      </div>
    </div>
  );
}

function BroadcastSetupModal({
  master,
  onUpdate,
  onClose
}: {
  master: MasterOverlayState;
  onUpdate: (patch: Partial<MasterOverlayState>) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"broadcast" | "logo">("broadcast");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onUpdate({ logoType: "image", logoImage: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box broadcast-setup-modal" onClick={(e) => e.stopPropagation()}>
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
                  value={master.brandText || ""}
                  placeholder="CNNINDONESIA.COM"
                  onChange={(e) => onUpdate({ brandText: e.target.value })}
                />
                <small className="field-hint">Warna merah pada layar siaran otomatis fit membungkus teks tanpa space kosong.</small>
              </label>

              <label style={{ marginTop: 10 }}>
                <span className="master-label">Zona Waktu Siaran</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <select
                    className="master-select full"
                    value={master.timezone}
                    onChange={(e) => onUpdate({ timezone: e.target.value as TimezoneMode })}
                  >
                    <option value="WIB">WIB — Waktu Indonesia Barat (UTC+7)</option>
                    <option value="WITA">WITA — Waktu Indonesia Tengah (UTC+8)</option>
                    <option value="WIT">WIT — Waktu Indonesia Timur (UTC+9)</option>
                    <option value="CUSTOM">Custom Label Zona Waktu</option>
                  </select>
                  {master.timezone === "CUSTOM" && (
                    <input
                      className="master-input"
                      style={{ width: 90 }}
                      placeholder="Label"
                      value={master.customTimezoneLabel || ""}
                      onChange={(e) => onUpdate({ customTimezoneLabel: e.target.value })}
                    />
                  )}
                </div>
              </label>

              <label style={{ marginTop: 10 }}>
                <span className="master-label">Isi Running Ticker Berita Default</span>
                <input
                  className="master-input full"
                  value={master.tickerText || ""}
                  placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                  onChange={(e) => onUpdate({ tickerText: e.target.value })}
                />
                <small className="field-hint">Animasi teks berjalan mulus 60fps berputar tanpa henti (seamless loop).</small>
              </label>

              {/* Pratinjau Interaktif Ticker */}
              <div style={{ marginTop: 14 }}>
                <span className="master-label" style={{ display: "block", marginBottom: 6, color: "#38bdf8" }}>
                  PRATINJAU LANGSUNG TICKER (BADGE FIT & ANIMASI):
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
                    <span>{master.brandText || "CNNINDONESIA.COM"}</span>
                  </div>
                  <BroadcastTicker text={master.tickerText || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"} />
                  <div className="cg-ticker-clock" style={{ height: "100%", fontSize: 20 }}>
                    <BroadcastClock timezone={master.timezone} customLabel={master.customTimezoneLabel} />
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
                className={`toggle-btn ${master.logoType === "text" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
                onClick={() => onUpdate({ logoType: "text" })}
              >
                Teks Bawaan (CNN Indonesia)
              </button>
              <button
                className={`toggle-btn ${master.logoType === "image" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: "8px 12px" }}
                onClick={() => onUpdate({ logoType: "image" })}
              >
                Upload Gambar Logo Kustom
              </button>
            </div>

            {master.logoType === "text" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label>
                  <span className="master-label">Teks Logo Utama</span>
                  <input
                    className="master-input full"
                    style={{ marginTop: 4 }}
                    value={master.logoText || "CNN"}
                    onChange={(e) => onUpdate({ logoText: e.target.value })}
                  />
                </label>
                <label>
                  <span className="master-label">Teks Sub-Logo</span>
                  <input
                    className="master-input full"
                    style={{ marginTop: 4 }}
                    value={master.logoSub || "Indonesia"}
                    onChange={(e) => onUpdate({ logoSub: e.target.value })}
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
                {master.logoImage && (
                  <button
                    style={{
                      marginTop: 8,
                      background: "transparent",
                      border: 0,
                      color: "#ff7d87",
                      fontSize: 11,
                      cursor: "pointer"
                    }}
                    onClick={() => onUpdate({ logoImage: null, logoType: "text" })}
                  >
                    Hapus logo kustom (kembali ke teks bawaan)
                  </button>
                )}
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <span className="master-label">PRATINJAU LOGO DI DALAM KOTAK SIARAN:</span>
              <div className="logo-preview-box">
                {master.logoType === "image" && master.logoImage ? (
                  <img src={master.logoImage} alt="Logo Preview" className="cg-custom-logo-img" />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span className="cg-cnn-logo" style={{ fontSize: 36 }}>
                      {master.logoText || "CNN"}
                    </span>
                    <span className="cg-cnn-sub" style={{ fontSize: 12 }}>
                      {master.logoSub || "Indonesia"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="primary-small" onClick={onClose}>
            Selesai & Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

function RundownEditor({
  rundown,
  live,
  reload,
  toast
}: {
  rundown: Rundown;
  live: LiveState;
  reload: () => Promise<void>;
  toast: (s: string) => void;
}) {
  async function add() {
    const n = rundown.items.length + 1;
    await mutate(`/api/rundowns/${rundown.id}/items`, "POST", {
      slug: `NEWS-${String(n).padStart(2, "0")}`,
      title: "Berita baru",
      format: "READER",
      estimatedDurationSeconds: 60,
      sortOrder: n
    });
    await reload();
  }

  async function move(item: RundownItem, dir: number) {
    const idx = rundown.items.findIndex((i) => i.id === item.id);
    const other = rundown.items[idx + dir];
    if (!other) return;
    await Promise.all([
      mutate(`/api/items/${item.id}`, "PATCH", { sortOrder: other.sortOrder }),
      mutate(`/api/items/${other.id}`, "PATCH", { sortOrder: item.sortOrder })
    ]);
    await reload();
  }

  async function remove(item: RundownItem) {
    try {
      await mutate(`/api/items/${item.id}`, "DELETE");
      await reload();
    } catch (e: any) {
      toast(e.message);
    }
  }

  async function addGraphic(item: RundownItem) {
    await mutate(`/api/items/${item.id}/graphics`, "POST", {
      templateType: "HEADLINE",
      sortOrder: item.graphics.length + 1,
      status: "DRAFT",
      draftFields: {
        kicker: "TOPIK UTAMA",
        headline: "HEADLINE BARU",
        subline: "",
        layoutStyle: "sub"
      }
    });
    await reload();
  }

  return (
    <section className="page">
      <PageTitle
        eyebrow="RUNDOWN MANAGER"
        title={rundown.title}
        action={
          <button className="primary-small" onClick={add}>
            <Plus size={16} />
            Tambah berita
          </button>
        }
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Slug / Judul</th>
              <th>Format</th>
              <th>Durasi</th>
              <th>Grafis</th>
              <th>Status</th>
              <th className="right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rundown.items.map((item, i) => (
              <tr key={item.id}>
                <td className="order">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <b>{item.slug}</b>
                  <span>{item.title}</span>
                </td>
                <td>
                  <span className="format-pill">{item.format}</span>
                </td>
                <td>
                  {Math.floor(item.estimatedDurationSeconds / 60)}:
                  {String(item.estimatedDurationSeconds % 60).padStart(2, "0")}
                </td>
                <td>
                  <div className="mini-graphics">
                    {item.graphics.map((g) => (
                      <i
                        key={g.id}
                        title={g.templateType}
                        style={{ background: templateMeta[g.templateType].accent }}
                      />
                    ))}
                    <button onClick={() => addGraphic(item)}>
                      <Plus size={12} />
                    </button>
                  </div>
                </td>
                <td>
                  <StateBadge
                    state={
                      item.graphics.length && item.graphics.every((g) => g.status === "READY")
                        ? "READY"
                        : "DRAFT"
                    }
                  />
                </td>
                <td>
                  <div className="row-actions">
                    <button disabled={i === 0} onClick={() => move(item, -1)}>
                      <ArrowUp size={15} />
                    </button>
                    <button disabled={i === rundown.items.length - 1} onClick={() => move(item, 1)}>
                      <ArrowDown size={15} />
                    </button>
                    <button
                      disabled={item.graphics.some((g) => g.id === live.onAirGraphicId)}
                      onClick={() => remove(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ImportExport rundown={rundown} reload={reload} toast={toast} />
    </section>
  );
}

function ImportExport({
  rundown,
  reload,
  toast
}: {
  rundown: Rundown;
  reload: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const body = JSON.parse(await file.text());
      await mutate("/api/rundowns/import", "POST", body);
      await reload();
      toast("Rundown berhasil diimpor");
    } catch (e: any) {
      toast(e.message);
    }
  }

  return (
    <div className="import-export">
      <div>
        <FileJson size={20} />
        <span>
          <b>Backup rundown</b>
          <small>Ekspor atau pulihkan rundown dengan JSON tervalidasi.</small>
        </span>
      </div>
      <button onClick={() => window.open(`/api/rundowns/${rundown.id}/export`, "_blank")}>
        <Download size={15} />
        Ekspor JSON
      </button>
      <button onClick={() => ref.current?.click()}>
        <Upload size={15} />
        Impor JSON
      </button>
      <input
        ref={ref}
        hidden
        type="file"
        accept="application/json"
        onChange={(e) => importFile(e.target.files?.[0])}
      />
    </div>
  );
}

function GraphicsEditor({
  graphic,
  all,
  master,
  onChoose,
  onSave
}: {
  graphic: any;
  all: any[];
  master: MasterOverlayState;
  onChoose: (id: string) => void;
  onSave: (id: string, p: any) => void;
}) {
  return (
    <section className="page graphics-page">
      <PageTitle eyebrow="GRAPHICS EDITOR" title="Template & draft CG" />
      <div className="graphics-workbench">
        <aside>
          <small>PUSTAKA GRAFIS</small>
          {all.map((g) => {
            const Icon = templateMeta[g.templateType as TemplateType].icon;
            return (
              <button
                className={g.id === graphic?.id ? "active" : ""}
                key={g.id}
                onClick={() => onChoose(g.id)}
              >
                <Icon size={16} />
                <span>
                  <b>{templateMeta[g.templateType as TemplateType].label}</b>
                  <small>{g.item.title}</small>
                </span>
                <StateBadge state={g.status} />
              </button>
            );
          })}
        </aside>
        <div className="graphic-canvas">
          <MonitorCard
            label="PROGRAM PREVIEW"
            state={graphic?.status || "EMPTY"}
            graphic={graphic}
            fields={graphic?.draftFields}
            master={master}
          />
          <GraphicForm graphic={graphic} onSave={onSave} />
        </div>
      </div>
    </section>
  );
}

function SettingsView({
  value,
  master,
  onUpdateMaster,
  onOpenSetupModal,
  onSaved,
  toast
}: {
  value: AppSettings;
  master: MasterOverlayState;
  onUpdateMaster: (p: Partial<MasterOverlayState>) => void;
  onOpenSetupModal: () => void;
  onSaved: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const [form, setForm] = useState<any>(value);
  const [inputs, setInputs] = useState<VmixInput[]>([]);
  const [testing, setTesting] = useState(false);
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
    await mutate("/api/settings", "PATCH", form);
    await onUpdateMaster(masterForm);
    await saveHeadlineDefaultsData();
    await onSaved();
    toast("Semua pengaturan berhasil disimpan");
  }

  async function saveMaster() {
    await onUpdateMaster(masterForm);
    toast("Pengaturan default elemen master berhasil disimpan");
  }

  async function saveHeadlineDefaultsData() {
    setSavingHeadline(true);
    try {
      const updated = await mutate<HeadlineDefaults>(
        "/api/settings/headline-defaults",
        "PATCH",
        headlineDefaults
      );
      setHeadlineDefaults(updated);
      toast("Pengaturan default headline berita berhasil disimpan");
    } catch (e: any) {
      toast(e.message || "Gagal menyimpan default headline");
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

  async function test() {
    setTesting(true);
    try {
      const r = await mutate<any>("/api/vmix/test", "POST", {});
      toast(r.message);
      if (r.ok) setInputs(await api("/api/vmix/inputs"));
    } catch (e: any) {
      toast(e.message);
    } finally {
      setTesting(false);
    }
  }

  function updateMapping(type: TemplateType, guid: string) {
    const input = inputs.find((i) => i.guid === guid);
    setForm((f: any) => ({
      ...f,
      mappings: f.mappings.map((m: any) =>
        m.templateType === type ? { ...m, inputGuid: guid, inputTitle: input?.title || m.inputTitle } : m
      )
    }));
  }

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
              <input
                value={masterForm.tickerText || ""}
                placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                onChange={(e) => setMasterForm({ ...masterForm, tickerText: e.target.value })}
              />
              <small style={{ color: "#94a3b8", fontSize: 10, marginTop: 4, display: "block" }}>
                Animasi running text berputar mulus 60fps tanpa jeda (looping seamless kontinu).
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
                    className={`mini-pill-btn ${(masterForm.tickerSpeed || 85) === 55 ? "active" : ""}`}
                    onClick={() => {
                      const u = { ...masterForm, tickerSpeed: 55 };
                      setMasterForm(u);
                      onUpdateMaster(u);
                    }}
                  >
                    Lambat (55)
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
                    className={`mini-pill-btn ${(masterForm.tickerSpeed || 85) === 130 ? "active" : ""}`}
                    onClick={() => {
                      const u = { ...masterForm, tickerSpeed: 130 };
                      setMasterForm(u);
                      onUpdateMaster(u);
                    }}
                  >
                    Cepat (130)
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
                <span>85 px/s (Standar Siaran TV)</span>
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
              onClick={saveHeadlineDefaultsData}
              disabled={savingHeadline}
            >
              <Save size={13} /> {savingHeadline ? "Menyimpan..." : "Simpan Default Headline"}
            </button>
            <span style={{ fontSize: 10, color: "#64748b" }}>
              Tersimpan permanen di database server sebagai template awal materi baru.
            </span>
          </div>
        </div>

        {/* 2. KARTU OUTPUT & INTEGRASI SWITCHER */}
        <div className="settings-card">
          <h3>
            <Globe />
            Mode Output Grafis
          </h3>
          <div className="form-grid">
            <label className="wide">
              <span>Pilihan Arsitektur Output</span>
              <select
                value={form.outputMode || "web"}
                onChange={(e) => setForm({ ...form, outputMode: e.target.value })}
              >
                <option value="web">Web Browser Overlay (Singular.live style — Rekomendasi)</option>
                <option value="vmix-gt">vMix GT Title API (Direct HTTP API vMix)</option>
              </select>
            </label>
          </div>
          {!form.outputMode || form.outputMode === "web" ? (
            <div
              style={{
                marginTop: 14,
                background: "#0b1420",
                border: "1px solid #1a3556",
                borderRadius: 4,
                padding: 12
              }}
            >
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
                <Globe size={15} /> Cara Pakai di vMix (Singular.live style):
              </h4>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#9cb1c9", lineHeight: 1.6 }}>
                <li>
                  Di vMix / OBS, klik <b>Add Input → Web Browser</b>.
                </li>
                <li>
                  Masukkan URL Output:{" "}
                  <code style={{ background: "#162335", color: "#6cb6ff", padding: "2px 5px", borderRadius: 3 }}>
                    {outputUrl}
                  </code>
                </li>
                <li>
                  Atur Resolusi ke <b>1920 x 1080</b>.
                </li>
                <li>
                  Selesai! Animasi grafis akan muncul otomatis secara real-time saat Anda menekan TAKE / CLEAR.
                </li>
              </ol>
              <button
                style={{ marginTop: 10 }}
                className="primary-small"
                onClick={() => {
                  navigator.clipboard.writeText(outputUrl);
                  toast("URL Output disalin ke clipboard!");
                }}
              >
                <Copy size={13} /> Salin URL Output vMix
              </button>
            </div>
          ) : (
            <div className="security-note" style={{ marginTop: 12 }}>
              <ShieldCheck />
              <span>
                <b>Mode vMix GT Title Aktif</b>Aplikasi akan mengirim perintah HTTP API langsung ke vMix host untuk mengisi input GT Title.
              </span>
            </div>
          )}
        </div>

        {form.outputMode === "vmix-gt" ? (
          <div className="settings-card">
            <h3>
              <Signal />
              Koneksi vMix HTTP API
            </h3>
            <div className="form-grid">
              <label>
                <span>Mode adapter</span>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                  <option value="mock">Mock — simulasi lokal</option>
                  <option value="http">HTTP — perangkat vMix</option>
                </select>
              </label>
              <label>
                <span>Host / IP privat</span>
                <input
                  value={form.vmixHost}
                  onChange={(e) => setForm({ ...form, vmixHost: e.target.value })}
                />
              </label>
              <label>
                <span>Port</span>
                <input
                  type="number"
                  value={form.vmixPort}
                  onChange={(e) => setForm({ ...form, vmixPort: Number(e.target.value) })}
                />
              </label>
              <label>
                <span>Overlay khusus</span>
                <select
                  value={form.overlayNumber}
                  onChange={(e) => setForm({ ...form, overlayNumber: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Username</span>
                <input
                  value={form.username || ""}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  type="password"
                  placeholder={value.passwordConfigured ? "••••••••" : "Opsional"}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </label>
            </div>
            <button className="test-btn" onClick={test}>
              {testing ? <LoaderCircle className="spin" /> : <Activity />}Test Connection & Refresh Inputs
            </button>
            <h3 style={{ marginTop: 20 }}>
              <Gauge />
              Mapping GT Title
            </h3>
            <div className="mapping-list">
              {form.mappings.map((m: any) => {
                const meta = templateMeta[m.templateType as TemplateType];
                const Icon = meta.icon;
                return (
                  <div key={m.templateType}>
                    <span className="mapping-icon" style={{ background: meta.accent }}>
                      <Icon />
                    </span>
                    <span>
                      <b>{meta.label}</b>
                      <small>{m.inputGuid}</small>
                    </span>
                    <select
                      value={m.inputGuid}
                      onChange={(e) => updateMapping(m.templateType, e.target.value)}
                    >
                      <option value={m.inputGuid}>{m.inputTitle}</option>
                      {inputs
                        .filter((i) => i.guid !== m.inputGuid)
                        .map((i) => (
                          <option key={i.guid} value={i.guid}>
                            {i.title} · {i.guid.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="settings-card">
            <h3>
              <Signal />
              Status Output Browser
            </h3>
            <p>
              Halaman output web transparan dirancang agar siap dimasukkan ke switcher siaran apa pun (vMix,
              OBS Studio, Wirecast, Tricaster).
            </p>
            <div style={{ background: "#0d1016", border: "1px solid #1b2029", borderRadius: 4, padding: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12
                }}
              >
                <span style={{ fontSize: 11, color: "#8a96a8" }}>Client Overlay Terhubung:</span>
                <span className="state-badge on-air">
                  <b>{value.outputMode === "web" ? "Aktif" : "Standby"}</b>
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary-small" onClick={() => window.open("/output", "_blank")}>
                  <ExternalLink size={13} /> Preview Output di Tab Baru
                </button>
              </div>
            </div>
          </div>
        )}
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
