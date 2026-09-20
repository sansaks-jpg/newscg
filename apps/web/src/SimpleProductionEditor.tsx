import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  GraphicItem,
  LiveState,
  LiveVariantAction,
  MasterOverlayState,
  Rundown,
  RundownItem
} from "@newscg/shared";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CircleDot,
  FileText,
  Keyboard,
  Layers,
  LoaderCircle,
  MapPin,
  MonitorPlay,
  Play,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2,
  Tv,
  X
} from "lucide-react";
import { api, mutate } from "./api";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { liveShortcut } from "./productionFlow";
import "./simple-production.css";

type Props = {
  rundown?: Rundown;
  rundowns: Rundown[];
  onRundown: (id: string) => void;
  reload: () => Promise<void>;
  toast: (s: string) => void;
  master: MasterOverlayState;
  live: LiveState;
  onUpdateMaster: (patch: Partial<MasterOverlayState>) => Promise<void>;
  onSetup?: () => void;
};

type MiniDraft = {
  headline: string;
  location: string;
  kicker: string;
  subline: string;
};

type PreviewComposition = {
  showLocation: boolean;
  showKicker: boolean;
  showDetail: boolean;
};

export function SimpleProductionEditor({
  rundown,
  rundowns,
  onRundown,
  reload,
  toast,
  master,
  live,
  onUpdateMaster
}: Props) {
  const items = rundown?.items || [];

  // Pilihan berita aktif di sidebar
  const [selectedItemId, setSelectedItemId] = useState<string>(() => {
    return sessionStorage.getItem("simple-cued-story") || items[0]?.id || "";
  });

  const selectedItem = items.find((i) => i.id === selectedItemId) || items[0] || null;

  // Cue terpilih dalam berita tersebut
  const [selectedCueId, setSelectedCueId] = useState<string>(() => {
    return sessionStorage.getItem("simple-cued-cue") || "";
  });

  const selectedCue: GraphicItem | null =
    selectedItem?.graphics.find((g) => g.id === selectedCueId) ||
    selectedItem?.graphics.find((g) => g.templateType === "HEADLINE") ||
    selectedItem?.graphics[0] ||
    null;

  useEffect(() => {
    if (selectedItem?.id) {
      sessionStorage.setItem("simple-cued-story", selectedItem.id);
    }
  }, [selectedItem?.id]);

  useEffect(() => {
    if (selectedCue?.id) {
      sessionStorage.setItem("simple-cued-cue", selectedCue.id);
      setSelectedCueId(selectedCue.id);
    }
  }, [selectedCue?.id]);

  // Status On-Air berita
  const onAirGraphicId = live.onAirGraphicId;
  const isSelectedOnAir = Boolean(
    selectedCue && onAirGraphicId && selectedCue.id === onAirGraphicId
  );

  // Cari apakah berita tertentu sedang ON AIR
  const isItemOnAir = useCallback(
    (item: RundownItem) => {
      return item.graphics.some((g) => g.id === onAirGraphicId);
    },
    [onAirGraphicId]
  );

  // State komposisi visibilitas untuk preview
  const [composition, setComposition] = useState<PreviewComposition>({
    showLocation: true,
    showKicker: false,
    showDetail: false
  });

  // Mini editor draft
  const [miniDraft, setMiniDraft] = useState<MiniDraft>({
    headline: "",
    location: "",
    kicker: "",
    subline: ""
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Muat data cue terpilih ke mini editor & komposisi
  useEffect(() => {
    if (!selectedCue) {
      setMiniDraft({ headline: "", location: "", kicker: "", subline: "" });
      return;
    }
    const f = selectedCue.draftFields || {};
    setMiniDraft({
      headline: f.headline || f.name || selectedItem?.title || "",
      location: f.location || "",
      kicker: f.kicker || "",
      subline: f.subline || f.role || ""
    });

    setComposition({
      showLocation: f.showLocation !== "false" && Boolean(f.location?.trim()),
      showKicker: f.showKicker !== "false" && Boolean(f.kicker?.trim()),
      showDetail: f.layoutStyle === "sub" && Boolean(f.subline?.trim())
    });
    setSaveStatus("idle");
  }, [selectedCue?.id]);

  // Fungsi penyimpanan autosave dengan debounce
  const flushSaveDraft = useCallback(
    async (draftToSave: MiniDraft, compToSave: PreviewComposition): Promise<boolean> => {
      if (!selectedCue) return false;
      setSaveStatus("saving");
      try {
        const patchFields: Record<string, string> = {
          ...selectedCue.draftFields,
          headline: draftToSave.headline.trim(),
          location: draftToSave.location.trim(),
          kicker: draftToSave.kicker.trim(),
          subline: draftToSave.subline.trim(),
          showLocation: compToSave.showLocation ? "true" : "false",
          showKicker: compToSave.showKicker ? "true" : "false",
          layoutStyle: compToSave.showDetail ? "sub" : "single"
        };
        await mutate(`/api/graphics/${selectedCue.id}`, "PATCH", {
          draftFields: patchFields,
          status: "READY"
        });
        setSaveStatus("saved");
        return true;
      } catch (err: any) {
        setSaveStatus("error");
        toast(err.message || "Gagal menyimpan perubahan draft");
        return false;
      }
    },
    [selectedCue, toast]
  );

  const handleMiniDraftChange = (field: keyof MiniDraft, val: string) => {
    const updated = { ...miniDraft, [field]: val };
    setMiniDraft(updated);
    setSaveStatus("saving");

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void flushSaveDraft(updated, composition);
    }, 500);
  };

  // Navigasi Berita: Pindah ke Berita Sebelumnya / Berikutnya
  const navigateStory = useCallback(
    (direction: -1 | 1) => {
      if (!items.length) return;
      const currentIndex = items.findIndex((i) => i.id === selectedItem?.id);
      if (currentIndex === -1) return;
      const targetIndex = currentIndex + direction;
      if (targetIndex >= 0 && targetIndex < items.length) {
        const targetItem = items[targetIndex];
        if (targetItem) {
          setSelectedItemId(targetItem.id);
          const firstHeadline =
            targetItem.graphics.find((g) => g.templateType === "HEADLINE") ||
            targetItem.graphics[0];
          if (firstHeadline) {
            setSelectedCueId(firstHeadline.id);
          }
          // Scroll item ke viewport
          const el = itemRefs.current[targetItem.id];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      }
    },
    [items, selectedItem]
  );

  // Perintah Live: TAKE
  const executeTake = useCallback(
    async (options?: { presentation?: "clean" }) => {
      if (!selectedCue || busy) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        await flushSaveDraft(miniDraft, composition);
      }
      setBusy(true);
      try {
        const body: any = { graphicId: selectedCue.id };
        if (options?.presentation === "clean") {
          body.presentation = "clean";
        }
        await mutate("/api/live/take", "POST", body, true);
        await reload();
        toast("TAKE terkonfirmasi — Grafis tayang ON AIR");
      } catch (e: any) {
        toast(e.message);
      } finally {
        setBusy(false);
      }
    },
    [selectedCue, busy, miniDraft, composition, flushSaveDraft, reload, toast]
  );

  // Perintah Live: UPDATE LIVE
  const executeUpdate = useCallback(async () => {
    if (!selectedCue || !isSelectedOnAir || busy) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      await flushSaveDraft(miniDraft, composition);
    }
    setBusy(true);
    try {
      await mutate("/api/live/update", "POST", { graphicId: selectedCue.id }, true);
      await reload();
      toast("UPDATE LIVE terkonfirmasi — Teks siaran diperbarui");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }, [selectedCue, isSelectedOnAir, busy, miniDraft, composition, flushSaveDraft, reload, toast]);

  // Perintah Live: CLEAR CG
  const executeClear = useCallback(async () => {
    if (busy || !live.onAirGraphicId) return;
    setBusy(true);
    try {
      await mutate("/api/live/clear", "POST", {}, true);
      await reload();
      toast("CLEAR CG terkonfirmasi — Lower third dinonaktifkan");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }, [busy, live.onAirGraphicId, reload, toast]);

  // Perintah Live: ALL CLEAR
  const executeClearAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await mutate("/api/live/clear-all", "POST", {}, true);
      await reload();
      toast("ALL CLEAR terkonfirmasi — Seluruh layer dikosongkan");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }, [busy, reload, toast]);

  // Aksi Master 1: Toggle Logo
  const toggleMasterLogo = useCallback(async () => {
    if (busy) return;
    try {
      await onUpdateMaster({ showLogo: !master.showLogo });
    } catch (e: any) {
      toast(e.message);
    }
  }, [busy, master.showLogo, onUpdateMaster, toast]);

  // Aksi Master 2: Toggle Ticker + Live
  const toggleMasterTickerLive = useCallback(async () => {
    if (busy) return;
    try {
      const bothActive = master.showTicker && master.showLiveBadge;
      await onUpdateMaster({
        showTicker: !bothActive,
        showLiveBadge: !bothActive
      });
    } catch (e: any) {
      toast(e.message);
    }
  }, [busy, master.showTicker, master.showLiveBadge, onUpdateMaster, toast]);

  // Aksi Quick Action Headline (H)
  const actionHeadline = useCallback(async () => {
    if (!selectedCue) return;
    if (isSelectedOnAir) {
      // Jika sudah on air, reset ke clean headline tanpa animasi masuk ulang
      try {
        await mutate(
          "/api/live/variant",
          "POST",
          { graphicId: selectedCue.id, action: "clean-headline" as LiveVariantAction },
          true
        );
        setComposition({ showLocation: false, showKicker: false, showDetail: false });
        await reload();
      } catch (e: any) {
        toast(e.message);
      }
    } else {
      // Jika belum on air, take sebagai clean headline
      setComposition({ showLocation: false, showKicker: false, showDetail: false });
      await executeTake({ presentation: "clean" });
    }
  }, [selectedCue, isSelectedOnAir, reload, toast, executeTake]);

  // Aksi Quick Action Lokasi (L)
  const actionToggleLocation = useCallback(async () => {
    if (!selectedCue) return;
    const hasLoc = Boolean(miniDraft.location.trim());
    if (!hasLoc) {
      toast("Data lokasi belum diisi");
      return;
    }

    if (isSelectedOnAir) {
      try {
        await mutate(
          "/api/live/variant",
          "POST",
          { graphicId: selectedCue.id, action: "toggle-location" as LiveVariantAction },
          true
        );
        setComposition((c) => ({ ...c, showLocation: !c.showLocation }));
        await reload();
      } catch (e: any) {
        toast(e.message);
      }
    } else {
      const nextComp = { ...composition, showLocation: !composition.showLocation };
      setComposition(nextComp);
      void flushSaveDraft(miniDraft, nextComp);
    }
  }, [selectedCue, miniDraft, isSelectedOnAir, composition, reload, toast, flushSaveDraft]);

  // Aksi Quick Action Topik (T)
  const actionToggleTopic = useCallback(async () => {
    if (!selectedCue) return;
    const hasKicker = Boolean(miniDraft.kicker.trim());
    if (!hasKicker) {
      toast("Topik / Kicker belum diisi");
      return;
    }

    if (isSelectedOnAir) {
      try {
        await mutate(
          "/api/live/variant",
          "POST",
          { graphicId: selectedCue.id, action: "toggle-kicker" as LiveVariantAction },
          true
        );
        setComposition((c) => ({ ...c, showKicker: !c.showKicker }));
        await reload();
      } catch (e: any) {
        toast(e.message);
      }
    } else {
      const nextComp = { ...composition, showKicker: !composition.showKicker };
      setComposition(nextComp);
      void flushSaveDraft(miniDraft, nextComp);
    }
  }, [selectedCue, miniDraft, isSelectedOnAir, composition, reload, toast, flushSaveDraft]);

  // Aksi Quick Action Detail (D)
  const actionToggleDetail = useCallback(async () => {
    if (!selectedCue) return;
    const hasDetail = Boolean(miniDraft.subline.trim());
    if (!hasDetail) {
      toast("Detail / Subline belum diisi");
      return;
    }

    if (isSelectedOnAir) {
      try {
        await mutate(
          "/api/live/variant",
          "POST",
          { graphicId: selectedCue.id, action: "toggle-detail" as LiveVariantAction },
          true
        );
        setComposition((c) => ({ ...c, showDetail: !c.showDetail }));
        await reload();
      } catch (e: any) {
        toast(e.message);
      }
    } else {
      const nextComp = { ...composition, showDetail: !composition.showDetail };
      setComposition(nextComp);
      void flushSaveDraft(miniDraft, nextComp);
    }
  }, [selectedCue, miniDraft, isSelectedOnAir, composition, reload, toast, flushSaveDraft]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditing = Boolean(
        target?.closest("input,textarea,select,[contenteditable=true],[role=dialog]")
      );
      const isInteractive = Boolean(target?.closest("button,a,summary,[role=button]"));

      const action = liveShortcut(event.key, {
        disabled: !shortcutsEnabled || busy,
        editing: isEditing,
        interactive: isInteractive,
        repeat: event.repeat,
        modified: event.ctrlKey || event.metaKey || event.altKey
      });

      if (!action) return;
      event.preventDefault();

      switch (action) {
        case "previous":
          navigateStory(-1);
          break;
        case "next":
          navigateStory(1);
          break;
        case "logo":
          void toggleMasterLogo();
          break;
        case "full":
          void toggleMasterTickerLive();
          break;
        case "headline":
          void actionHeadline();
          break;
        case "location":
          void actionToggleLocation();
          break;
        case "topic":
          void actionToggleTopic();
          break;
        case "detail":
          void actionToggleDetail();
          break;
        case "take":
          void executeTake();
          break;
        case "update":
          void executeUpdate();
          break;
        case "clear":
          void executeClear();
          break;
        case "clear-all":
          void executeClearAll();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    shortcutsEnabled,
    busy,
    navigateStory,
    toggleMasterLogo,
    toggleMasterTickerLive,
    actionHeadline,
    actionToggleLocation,
    actionToggleTopic,
    actionToggleDetail,
    executeTake,
    executeUpdate,
    executeClear,
    executeClearAll
  ]);

  // Efektif preview field yang dikirim ke renderer
  const effectivePreviewFields: Record<string, string> = {
    ...(selectedCue?.draftFields || {}),
    headline: miniDraft.headline,
    location: miniDraft.location,
    kicker: miniDraft.kicker,
    subline: miniDraft.subline,
    showLocation: composition.showLocation ? "true" : "false",
    showKicker: composition.showKicker ? "true" : "false",
    layoutStyle: composition.showDetail ? "sub" : "single"
  };

  // Label On-Air sekarang
  const onAirGraphic = items
    .flatMap((i) => i.graphics)
    .find((g) => g.id === live.onAirGraphicId);
  const onAirTitle = onAirGraphic
    ? live.onAirSnapshot?.headline ||
      live.onAirSnapshot?.name ||
      onAirGraphic.draftFields.headline ||
      "Grafis On Air"
    : null;

  return (
    <div className="simple-cg-workspace">
      {/* 1. SIDEBAR RUNDOWN BERITA */}
      <aside className="cg-story-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-title">
            <Radio size={14} className="text-red-500" />
            <span>RUNDOWN BERITA</span>
          </div>
          <span className="sidebar-count-badge">
            {items.findIndex((i) => i.id === selectedItem?.id) + 1 || 0} / {items.length}
          </span>
        </div>

        <div className="sidebar-story-list">
          {items.map((it, idx) => {
            const isSelected = it.id === selectedItem?.id;
            const onAir = isItemOnAir(it);
            const isReady = it.graphics.length > 0 && it.graphics.every((g) => g.status === "READY");

            return (
              <div
                key={it.id}
                ref={(el) => {
                  itemRefs.current[it.id] = el;
                }}
                className={`sidebar-story-card ${isSelected ? "selected" : ""} ${onAir ? "on-air" : ""}`}
                onClick={() => {
                  setSelectedItemId(it.id);
                  const firstH =
                    it.graphics.find((g) => g.templateType === "HEADLINE") || it.graphics[0];
                  if (firstH) setSelectedCueId(firstH.id);
                }}
              >
                <div className="story-card-top">
                  <span className="story-number">#{idx + 1}</span>
                  <div className="story-badges">
                    {onAir && <span className="badge-onair pulse">ON AIR</span>}
                    {isSelected && !onAir && <span className="badge-selected">CUE</span>}
                    <span className={`badge-status ${isReady ? "ready" : "draft"}`}>
                      {it.format}
                    </span>
                  </div>
                </div>

                <div className="story-title" title={it.title}>
                  {it.title}
                </div>

                {/* Sub-cues jika ada lebih dari 1 grafis */}
                {it.graphics.length > 1 && (
                  <div className="story-cues-pills">
                    {it.graphics.map((g, gIdx) => (
                      <button
                        key={g.id}
                        type="button"
                        className={`cue-pill ${g.id === selectedCue?.id ? "active" : ""} ${g.id === onAirGraphicId ? "on-air-pill" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemId(it.id);
                          setSelectedCueId(g.id);
                        }}
                      >
                        #{gIdx + 1} {g.templateType}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer-hint">
          <span>Gunakan <b>↑</b> dan <b>↓</b> untuk berpindah berita</span>
        </div>
      </aside>

      {/* 2. MAIN PRODUCTION WORKSPACE */}
      <main className="cg-production-main">
        {/* Top Header Status */}
        <header className="production-header-bar">
          <div className="header-status-group">
            <div className={`status-pill ${live.onAirGraphicId ? "is-live" : "is-standby"}`}>
              <span className={`dot-led ${live.onAirGraphicId ? "red pulse" : "green"}`} />
              <b>{live.onAirGraphicId ? "PROGRAM: ON AIR" : "STANDBY (OFF AIR)"}</b>
            </div>

            <div className="on-air-text-box">
              <small>ON AIR:</small>
              <span>{onAirTitle || "Grafis Lower Third Kosong"}</span>
            </div>
          </div>

          <div className="header-actions-group">
            <button
              type="button"
              className={`shortcut-toggle-btn ${shortcutsEnabled ? "active" : ""}`}
              onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
              title="Aktif/Nonaktifkan Tombol Pintas Keyboard"
            >
              <Keyboard size={13} />
              <span>HOTKEYS: {shortcutsEnabled ? "ON" : "OFF"}</span>
            </button>
          </div>
        </header>

        {/* Master Layer Quick Controls Bar */}
        <div className="master-controls-bar">
          <span className="master-label">MASTER LAYER:</span>
          <div className="master-btn-group">
            <button
              type="button"
              className={`master-btn ${master.showLogo ? "active" : ""}`}
              onClick={toggleMasterLogo}
            >
              <span className="btn-kbd">1</span>
              <span>LOGO</span>
              <span className={`indicator-dot ${master.showLogo ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`master-btn ${master.showTicker && master.showLiveBadge ? "active" : ""}`}
              onClick={toggleMasterTickerLive}
            >
              <span className="btn-kbd">2</span>
              <span>TICKER + LIVE</span>
              <span
                className={`indicator-dot ${master.showTicker && master.showLiveBadge ? "on" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Monitor Pratinjau 16:9 */}
        <div className="production-preview-deck">
          <div className="preview-screen-wrapper">
            <div className="preview-meta-badge">
              <span className="cue-name">
                {selectedItem ? `#${items.indexOf(selectedItem) + 1} ${selectedItem.title}` : "Belum ada berita"}
              </span>
              <span className="cue-type">{selectedCue?.templateType || "CG"}</span>
            </div>

            <BroadcastPreviewBox
              graphic={selectedCue}
              fields={effectivePreviewFields}
              master={master}
              emptyText="PILIH BERITA DARI DAFTAR"
            />
          </div>
        </div>

        {/* Quick Actions (H, L, T, D) */}
        <div className="quick-actions-bar">
          <div className="quick-action-btns">
            <button
              type="button"
              className={`qa-btn ${isSelectedOnAir ? "is-live" : ""}`}
              onClick={actionHeadline}
              title="Tayangkan headline bersih (Hotkey: H)"
            >
              <span className="qa-kbd">H</span>
              <span className="qa-text">HEADLINE BERSIH</span>
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showLocation ? "active" : ""} ${!miniDraft.location.trim() ? "disabled" : ""}`}
              disabled={!miniDraft.location.trim()}
              onClick={actionToggleLocation}
              title="Toggle Lokasi (Hotkey: L)"
            >
              <span className="qa-kbd">L</span>
              <span className="qa-text">LOKASI</span>
              <span className={`qa-dot ${composition.showLocation ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showKicker ? "active" : ""} ${!miniDraft.kicker.trim() ? "disabled" : ""}`}
              disabled={!miniDraft.kicker.trim()}
              onClick={actionToggleTopic}
              title="Toggle Topik / Kicker (Hotkey: T)"
            >
              <span className="qa-kbd">T</span>
              <span className="qa-text">TOPIK</span>
              <span className={`qa-dot ${composition.showKicker ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showDetail ? "active" : ""} ${!miniDraft.subline.trim() ? "disabled" : ""}`}
              disabled={!miniDraft.subline.trim()}
              onClick={actionToggleDetail}
              title="Toggle Detail Headline (Hotkey: D)"
            >
              <span className="qa-kbd">D</span>
              <span className="qa-text">DETAIL</span>
              <span className={`qa-dot ${composition.showDetail ? "on" : ""}`} />
            </button>
          </div>
        </div>

        {/* Primary Broadcast Buttons (TAKE, UPDATE, CLEAR, ALL CLEAR) */}
        <div className="primary-actions-deck">
          <button
            type="button"
            className="action-btn btn-take"
            disabled={busy || !selectedCue}
            onClick={() => executeTake()}
          >
            <div className="btn-inner">
              <Play size={16} fill="currentColor" />
              <span className="btn-title">TAKE</span>
            </div>
            <kbd className="btn-key">SPACE / ENTER</kbd>
          </button>

          <button
            type="button"
            className="action-btn btn-update"
            disabled={busy || !selectedCue || !isSelectedOnAir}
            onClick={executeUpdate}
          >
            <div className="btn-inner">
              <RefreshCw size={14} className={busy ? "spin" : ""} />
              <span className="btn-title">UPDATE LIVE</span>
            </div>
            <kbd className="btn-key">U</kbd>
          </button>

          <button
            type="button"
            className="action-btn btn-clear"
            disabled={busy || !live.onAirGraphicId}
            onClick={executeClear}
          >
            <div className="btn-inner">
              <X size={15} />
              <span className="btn-title">CLEAR CG</span>
            </div>
            <kbd className="btn-key">ESC / C</kbd>
          </button>

          <button
            type="button"
            className="action-btn btn-allclear"
            disabled={busy}
            onClick={executeClearAll}
          >
            <div className="btn-inner">
              <Trash2 size={14} />
              <span className="btn-title">ALL CLEAR</span>
            </div>
            <kbd className="btn-key">0</kbd>
          </button>
        </div>

        {/* Mini Editor Berita Ringkas */}
        <div className="mini-editor-card">
          <div className="mini-editor-header">
            <div className="mini-editor-title">
              <FileText size={13} />
              <span>EDIT CEPAT TEKS BERITA (AUTOSAVE)</span>
            </div>
            <div className="save-indicator">
              {saveStatus === "saving" && (
                <span className="save-status saving">
                  <LoaderCircle size={12} className="spin" /> Menyimpan...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="save-status saved">
                  <Check size={12} /> Tersimpan
                </span>
              )}
              {saveStatus === "error" && (
                <span className="save-status error">
                  <AlertTriangle size={12} /> Gagal menyimpan
                </span>
              )}
            </div>
          </div>

          <div className="mini-editor-grid">
            <div className="mini-input-group span-2">
              <label>Headline Utama</label>
              <input
                type="text"
                placeholder="Masukkan judul berita utama..."
                maxLength={120}
                value={miniDraft.headline}
                onChange={(e) => handleMiniDraftChange("headline", e.target.value)}
              />
            </div>

            <div className="mini-input-group">
              <label>Lokasi Siaran</label>
              <input
                type="text"
                placeholder="Contoh: Jakarta Pusat"
                maxLength={60}
                value={miniDraft.location}
                onChange={(e) => handleMiniDraftChange("location", e.target.value)}
              />
            </div>

            <div className="mini-input-group">
              <label>Topik / Kicker (Atas)</label>
              <input
                type="text"
                placeholder="Contoh: BREAKING NEWS"
                maxLength={60}
                value={miniDraft.kicker}
                onChange={(e) => handleMiniDraftChange("kicker", e.target.value)}
              />
            </div>

            <div className="mini-input-group span-2">
              <label>Detail / Subline Keterangan</label>
              <input
                type="text"
                placeholder="Penjelasan ringkas poin berita..."
                maxLength={160}
                value={miniDraft.subline}
                onChange={(e) => handleMiniDraftChange("subline", e.target.value)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
