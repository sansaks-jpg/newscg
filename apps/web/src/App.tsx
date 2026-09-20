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
  VmixInput
} from "@newscg/shared";
import { defaultMasterOverlayState } from "@newscg/shared";
import { api, mutate } from "./api";
import TemplatePreview from "./TemplatePreview";
import OverlayWindow from "./OverlayWindow";
import { Preparation, Production } from "./Newsroom";
import { AutoSquishText } from "./AutoSquishText";
import { BroadcastTemplateInfo } from "./VisualTemplatePicker";
import { BroadcastPreviewBox } from "./BroadcastGraphic";

type View = "live" | "rundown" | "graphics" | "settings";
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

  const [view, setView] = useState<View>("live");
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
          <button className="brand-compact" onClick={() => setView("live")}>
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
              ["live", Radio, "Produksi"],
              ["rundown", LayoutList, "Persiapan"],
              ["graphics", PencilLine, "Editor CG"],
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
              {id === "live" && live.onAirGraphicId ? <span className="tab-pulse-dot" /> : null}
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
        {view === "live" && (
          <Production
            onPrepare={() => setView("rundown")}
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
        {view === "graphics" && (
          <GraphicsEditor
            graphic={selected}
            all={graphics}
            master={master}
            onChoose={choose}
            onSave={saveGraphic}
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

function LiveControl({
  rundown,
  graphics,
  selected,
  onAir,
  live,
  master,
  busy,
  onChoose,
  onCueStep,
  onSave,
  onCommand,
  onTakeAndNext,
  onUpdateMaster,
  onOpenSetupModal,
  actions
}: {
  rundown?: Rundown;
  graphics: any[];
  selected: any;
  onAir: any;
  live: LiveState;
  master: MasterOverlayState;
  busy: string;
  onChoose: (id: string) => void;
  onCueStep: (dir: number) => void;
  onSave: (id: string, p: Partial<GraphicItem>) => void;
  onCommand: (c: any) => void;
  onTakeAndNext: () => void;
  onUpdateMaster: (p: Partial<MasterOverlayState>) => void;
  onOpenSetupModal: () => void;
  actions: any[];
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!rundown?.items) return [];
    if (!normalizedSearch) return rundown.items;
    return rundown.items.filter((item) => {
      const matchSlug = item.slug.toLowerCase().includes(normalizedSearch);
      const matchTitle = item.title.toLowerCase().includes(normalizedSearch);
      const matchGraphics = item.graphics.some((g) =>
        Object.values(g.draftFields).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(normalizedSearch)
        )
      );
      return matchSlug || matchTitle || matchGraphics;
    });
  }, [rundown?.items, normalizedSearch]);

  const currentIndex = graphics.findIndex((g) => g.id === selected?.id);
  const totalGraphics = graphics.length;

  return (
    <div className="live-layout">
      {/* 1. Rundown Sidebar with Quick Filter */}
      <aside className="rundown-panel">
        <div className="panel-title">
          <div>
            <small>ANTREAN RUNDOWN</small>
            <b>
              {rundown?.items.length || 0} BERITA · {totalGraphics} CG
            </b>
          </div>
          <span className="rundown-pos-chip" title="Posisi CG Terpilih">
            {currentIndex >= 0 ? `${currentIndex + 1}/${totalGraphics}` : "—"}
          </span>
        </div>

        {/* Quick Search / Filter Input */}
        <div className="rundown-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            className="rundown-search-input"
            placeholder="Cari berita / slug / teks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch("")} title="Bersihkan">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="rundown-list">
          {filteredItems.length === 0 ? (
            <div className="rundown-empty-search">
              <span>Tidak ada berita yang cocok</span>
              <button onClick={() => setSearch("")}>Reset pencarian</button>
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <div className="story-group" key={item.id}>
                <div className="story-head">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>
                      {item.slug} · {item.format}
                    </small>
                    <b>{item.title}</b>
                  </div>
                  <em>{item.graphics.length}</em>
                </div>
                {item.graphics.map((g) => {
                  const meta = templateMeta[g.templateType];
                  const Icon = meta.icon;
                  const isOn = g.id === live.onAirGraphicId;
                  const isSelected = g.id === selected?.id;
                  const preview =
                    g.draftFields.headline ||
                    g.draftFields.name ||
                    g.draftFields.location ||
                    Object.values(g.draftFields).filter(Boolean)[0] ||
                    "Belum diisi";

                  return (
                    <button
                      key={g.id}
                      onClick={() => onChoose(g.id)}
                      className={`graphic-row ${isSelected ? "selected" : ""} ${isOn ? "on-air" : ""}`}
                    >
                      <span className="graphic-icon" style={{ "--accent": meta.accent } as any}>
                        <Icon size={14} />
                      </span>
                      <span className="graphic-meta-text">
                        <b>{meta.label}</b>
                        <small>{preview}</small>
                      </span>
                      {isOn ? (
                        <span className="tag-onair pulse">ON AIR</span>
                      ) : isSelected ? (
                        <span className="tag-standby">STANDBY</span>
                      ) : (
                        <ChevronRight size={14} className="row-chevron" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 2. Main Live Control Workspace */}
      <section className="control-workspace">
        {/* Streamlined Master Bar: Minimalist & Clean */}
        <div className="master-bar">
          <div className="master-bar-group">
            <span className="master-label">PRESET:</span>
            <button
              className={`toggle-btn ${master.showLogo && !master.showTicker ? "active" : ""}`}
              onClick={() => onUpdateMaster({ showLogo: true, showTicker: false, showLiveBadge: false })}
              title="Preset 1: Hanya Logo Bug di pojok kanan bawah"
            >
              Logo Saja
            </button>
            <button
              className={`toggle-btn ${master.showLogo && master.showTicker ? "active" : ""}`}
              onClick={() => onUpdateMaster({ showLogo: true, showTicker: true, showLiveBadge: true })}
              title="Preset 2: Ticker bar + Logo box + Live badge + Jam WIB"
            >
              Ticker + Live
            </button>
          </div>

          <div className="master-bar-group">
            <span className="master-label">MASTER LAYER:</span>
            <button
              className={`toggle-btn ${master.showLogo ? "active" : ""}`}
              onClick={() => onUpdateMaster({ showLogo: !master.showLogo })}
              title="Aktifkan/Matikan Logo Box Kanan"
            >
              {master.showLogo ? "✓ LOGO" : "LOGO OFF"}
            </button>
            <button
              className={`toggle-btn ${master.showLiveBadge ? "live-active" : ""}`}
              onClick={() => onUpdateMaster({ showLiveBadge: !master.showLiveBadge })}
              title="Aktifkan/Matikan Badge LIVE di Atas Logo"
            >
              {master.showLiveBadge ? "● LIVE" : "LIVE OFF"}
            </button>
            <button
              className={`toggle-btn ${master.showTicker ? "active" : ""}`}
              onClick={() => onUpdateMaster({ showTicker: !master.showTicker })}
              title="Aktifkan/Matikan Bar Ticker Bawah"
            >
              {master.showTicker ? "✓ TICKER" : "TICKER OFF"}
            </button>
          </div>

          <div className="master-bar-spacer" />

          <div className="master-bar-group" style={{ borderRight: 0, paddingRight: 0 }}>
            <button
              className="setup-trigger-btn"
              onClick={onOpenSetupModal}
              title="Atur Brand Teks, Zona Waktu, dan Upload Logo Siaran"
            >
              <SlidersHorizontal size={13} />
              <span>Pengaturan Siaran</span>
            </button>
          </div>
        </div>

        {/* Dual Monitors: Program (ON AIR) vs Preview (STANDBY) */}
        <div className="monitors">
          <MonitorCard
            label="PROGRAM (ON AIR)"
            state={onAir ? "ON AIR" : live.commandStatus === "pending" ? "PENDING" : "STANDBY"}
            graphic={onAir}
            fields={live.onAirSnapshot}
            master={master}
            live
          />
          <MonitorCard
            label="PREVIEW (STANDBY)"
            state={selected?.status || "EMPTY"}
            graphic={selected}
            fields={selected?.draftFields}
            master={master}
          />
        </div>

        {/* Lower Workspace: Editor & Broadcast Playout Deck */}
        <div className="control-lower">
          <GraphicForm graphic={selected} onSave={onSave} />
          <div className="command-console">
            <div className="command-head">
              <div>
                <small>BROADCAST CONTROLLER</small>
                <b>
                  {selected
                    ? `${selected.item.slug} / ${templateMeta[selected.templateType as TemplateType]?.label}`
                    : "PILIH GRAFIS DARI RUNDOWN"}
                </b>
              </div>
              <StateBadge
                state={
                  live.commandStatus === "pending"
                    ? "PENDING"
                    : live.error
                    ? "ERROR"
                    : selected?.status || "EMPTY"
                }
              />
            </div>

            {/* Playout Main Triggers */}
            <div className="playout-primary-grid">
              <button
                className="take-btn"
                disabled={!selected || !!busy}
                onClick={() => onCommand("take")}
                title="Tayangkan grafis standby ke siaran (Hotkeys: SPACE atau T)"
              >
                <div className="take-btn-icon">
                  {busy === "take" ? <LoaderCircle className="spin" size={22} /> : <MonitorPlay size={22} />}
                </div>
                <div className="take-btn-label">
                  <b>TAKE (IN)</b>
                  <small>Tayangkan ke Siaran</small>
                </div>
                <kbd className="take-kbd">SPACE / T</kbd>
              </button>

              <button
                className="take-next-btn"
                disabled={!selected || !!busy}
                onClick={onTakeAndNext}
                title="Tayangkan grafis standby dan otomatis pilih CG berikutnya di rundown (Hotkey: ENTER)"
              >
                <SkipForward size={17} />
                <div className="take-next-label">
                  <b>TAKE & NEXT</b>
                  <small>Tayangkan & Cue Lanjut</small>
                </div>
                <kbd>ENTER</kbd>
              </button>
            </div>

            {/* Cue Stepper Navigation */}
            <div className="cue-stepper-row">
              <button
                className="cue-step-btn"
                onClick={() => onCueStep(-1)}
                disabled={currentIndex <= 0}
                title="Pilih grafis sebelumnya di rundown (Hotkey: Panah Atas ↑)"
              >
                <ArrowUp size={13} />
                <span>CUE PREV (↑)</span>
              </button>
              <button
                className="cue-step-btn"
                onClick={() => onCueStep(1)}
                disabled={currentIndex < 0 || currentIndex >= totalGraphics - 1}
                title="Pilih grafis berikutnya di rundown (Hotkey: Panah Bawah ↓)"
              >
                <span>CUE NEXT (↓)</span>
                <ArrowDown size={13} />
              </button>
            </div>

            {/* Secondary Actions: UPDATE & CLEAR */}
            <div className="secondary-actions">
              <button
                className={`update-live-btn ${selected?.id === live.onAirGraphicId ? "on-air-match" : ""}`}
                disabled={!selected || selected.id !== live.onAirGraphicId || !!busy}
                onClick={() => onCommand("update")}
                title="Perbarui teks siaran langsung tanpa animasi keluar (Hotkey: U)"
              >
                <RefreshCw size={15} />
                <span>UPDATE LIVE</span>
                <kbd>U</kbd>
              </button>
              <button
                className="clear-btn"
                disabled={!live.onAirGraphicId || !!busy}
                onClick={() => onCommand("clear")}
                title="Hilangkan lower third berita dengan animasi out; Logo & Ticker tetap tayang (Hotkey: C)"
              >
                <X size={15} />
                <span>CLEAR CG</span>
                <kbd>C</kbd>
              </button>
            </div>

            {/* Guarded Emergency Blackout */}
            <div className="emergency-section">
              <button
                className="blackout-btn"
                disabled={!!busy}
                onClick={() => onCommand("clear-all")}
                title="Bersihkan seluruh layer siaran dari layar (Layar Hitam Total)"
              >
                <Trash2 size={12} />
                <span>BLACK OUT / BERSIH TOTAL</span>
              </button>
            </div>

            {live.error && (
              <div className="error-callout">
                <AlertTriangle size={15} />
                <span>
                  <b>Perintah gagal</b>
                  {live.error}
                </span>
              </div>
            )}

            <div className="last-action">
              <Activity size={13} />
              <span>{actions[0]?.message || "Siap beroperasi"}</span>
              <time>
                {actions[0]?.created_at
                  ? new Date(actions[0].created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })
                  : "—"}
              </time>
            </div>
          </div>
        </div>
      </section>
    </div>
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
                <span className="master-label">Teks Brand / Saluran (Kanan Bawah)</span>
                <input
                  className="master-input full"
                  value={master.brandText || ""}
                  placeholder="CNNINDONESIA.COM"
                  onChange={(e) => onUpdate({ brandText: e.target.value })}
                />
                <small className="field-hint">Ditampilkan pada baris ticker bawah</small>
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
                <span className="master-label">Default Running Ticker Berita</span>
                <input
                  className="master-input full"
                  value={master.tickerText || ""}
                  placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI"
                  onChange={(e) => onUpdate({ tickerText: e.target.value })}
                />
                <small className="field-hint">Digunakan saat grafis tidak mengisi teks ticker khusus</small>
              </label>
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

  useEffect(() => setForm(value), [value]);

  async function save() {
    await mutate("/api/settings", "PATCH", form);
    await onSaved();
    toast("Pengaturan tersimpan");
  }

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
            Simpan
          </button>
        }
      />
      <div className="settings-grid">
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

          {/* Master Overlay Configuration Section */}
          <h3 style={{ marginTop: 22 }}>
            <SlidersHorizontal size={17} />
            Master Layer & Identitas Brand
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8a96a8", flex: 1 }}>Konfigurasi Siaran & Identitas:</span>
              <button className="primary-small" onClick={onOpenSetupModal}>
                <SlidersHorizontal size={13} />
                Buka Pengaturan Siaran & Logo
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8a96a8", flex: 1 }}>Zona Waktu Siaran:</span>
              <select
                className="master-select"
                value={master.timezone}
                onChange={(e) => onUpdateMaster({ timezone: e.target.value as TimezoneMode })}
              >
                <option value="WIB">WIB (Waktu Indonesia Barat, UTC+7)</option>
                <option value="WITA">WITA (Waktu Indonesia Tengah, UTC+8)</option>
                <option value="WIT">WIT (Waktu Indonesia Timur, UTC+9)</option>
                <option value="CUSTOM">Kustom Suffix</option>
              </select>
            </div>
          </div>
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
