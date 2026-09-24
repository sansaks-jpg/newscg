import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GraphicItem,
  LiveState,
  MasterOverlayState,
  Rundown,
  RundownItem
} from "@newscg/shared";
import {
  AlertTriangle,
  Check,
  FileText,
  Keyboard,
  LoaderCircle,
  Play,
  Radio,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import { mutate } from "./api";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { ProgramMonitor } from "./ProgramMonitor";
import { tickerPresets } from "@newscg/shared";
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

  const rundownId = rundown?.id || "default";
  const storyKey = `simple-cued-story-${rundownId}`;
  const cueKey = `simple-cued-cue-${rundownId}`;

  // Pilihan berita aktif di sidebar (null jika dibersihkan via ESC)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => {
    const saved = sessionStorage.getItem(`simple-cued-story-${rundownId}`);
    return (saved && items.some((i) => i.id === saved)) ? saved : items[0]?.id || null;
  });

  const selectedItem = selectedItemId ? (items.find((i) => i.id === selectedItemId) || null) : null;

  // Cue terpilih dalam berita tersebut
  const [selectedCueId, setSelectedCueId] = useState<string | null>(() => {
    return sessionStorage.getItem(`simple-cued-cue-${rundownId}`) || null;
  });

  const selectedCue: GraphicItem | null = selectedItem?.cgRequired
    ? (selectedItem.graphics.find((g) => g.id === selectedCueId) ||
       selectedItem.graphics.find((g) => g.templateType === "HEADLINE") ||
       selectedItem.graphics[0] ||
       null)
    : null;

  useEffect(() => {
    if (!rundown?.id) return;
    const saved = sessionStorage.getItem(`simple-cued-story-${rundown.id}`);
    const valid = (saved && items.some((i) => i.id === saved)) ? saved : items[0]?.id || null;
    setSelectedItemId(valid);
    const savedCue = sessionStorage.getItem(`simple-cued-cue-${rundown.id}`);
    setSelectedCueId(savedCue || null);
  }, [rundown?.id]);

  useEffect(() => {
    if (selectedItem?.id) {
      sessionStorage.setItem(storyKey, selectedItem.id);
    } else {
      sessionStorage.removeItem(storyKey);
    }
  }, [selectedItem?.id, storyKey]);

  useEffect(() => {
    if (selectedCue?.id) {
      sessionStorage.setItem(cueKey, selectedCue.id);
      setSelectedCueId(selectedCue.id);
    } else {
      sessionStorage.removeItem(cueKey);
      setSelectedCueId(null);
    }
  }, [selectedCue?.id, cueKey]);

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
  const commandLock = useRef(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const quickEditButtonRef = useRef<HTMLButtonElement>(null);
  const closeQuickEdit = () => {
    setQuickEditOpen(false);
    requestAnimationFrame(() => quickEditButtonRef.current?.focus());
  };

  // Staged master overlay untuk keselamatan siaran (Hotkey 1 & 2 wajib tekan SPASI)
  const [stagedMaster, setStagedMaster] = useState<MasterOverlayState>(master);
  const isUserStagingMasterRef = useRef(false);

  useEffect(() => {
    if (!isUserStagingMasterRef.current) {
      setStagedMaster(master);
    }
  }, [master]);

  const isMasterChanged =
    stagedMaster.showLogo !== master.showLogo ||
    stagedMaster.showTicker !== master.showTicker ||
    stagedMaster.showLiveBadge !== master.showLiveBadge ||
    stagedMaster.tickerSpeed !== master.tickerSpeed ||
    stagedMaster.tickerText !== master.tickerText;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Muat data cue terpilih ke mini editor & komposisi
  useEffect(() => {
    if (!selectedCue) {
      setMiniDraft({ headline: "", location: "", kicker: "", subline: "" });
      return;
    }
    const f = selectedCue.draftFields || {};
    const headline = selectedCue.templateType === "REPORTER"
      ? f.name || f.headline || ""
      : f.headline || f.name || selectedItem?.title || "";
    const subline = selectedCue.templateType === "REPORTER"
      ? f.role || f.subline || ""
      : f.subline || f.role || "";
    setMiniDraft({
      headline,
      location: f.location || "",
      kicker: f.kicker || "",
      subline
    });

    setComposition({
      showLocation: f.showLocation === "true" && Boolean(f.location?.trim()),
      showKicker: f.showKicker === "true" && Boolean(f.kicker?.trim()),
      showDetail: f.showDetail === "true" && Boolean(f.subline?.trim())
    });
    setSaveStatus("idle");
  }, [selectedCue?.id]);

  // Fungsi penyimpanan autosave dengan debounce
  const flushSaveDraft = useCallback(
    async (
      draftToSave: MiniDraft,
      compToSave: PreviewComposition,
      targetCue: GraphicItem | null = selectedCue
    ): Promise<boolean> => {
      if (!targetCue) return false;
      setSaveStatus("saving");
      try {
        const patchFields: Record<string, string> = {
          ...(targetCue.draftFields || {}),
          location: draftToSave.location.trim(),
          showLocation: compToSave.showLocation ? "true" : "false",
          showKicker: compToSave.showKicker ? "true" : "false",
          showDetail: compToSave.showDetail ? "true" : "false",
          layoutStyle: compToSave.showDetail ? "sub" : "single"
        };

        if (targetCue.templateType === "REPORTER") {
          patchFields.name = draftToSave.headline.trim();
          patchFields.role = draftToSave.subline.trim() || "REPORTER";
          patchFields.headline = draftToSave.headline.trim();
          patchFields.subline = draftToSave.subline.trim();
        } else if (targetCue.templateType === "LOCATION") {
          patchFields.location = draftToSave.location.trim() || draftToSave.headline.trim();
          patchFields.headline = patchFields.location;
        } else {
          patchFields.headline = draftToSave.headline.trim();
          patchFields.subline = draftToSave.subline.trim();
          patchFields.kicker = draftToSave.kicker.trim();
        }

        await mutate(`/api/graphics/${targetCue.id}`, "PATCH", {
          draftFields: patchFields
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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (selectedCue) {
          void flushSaveDraft(miniDraft, composition, selectedCue);
        }
      }
      const currentIndex = items.findIndex((i) => i.id === selectedItem?.id);
      if (currentIndex === -1) {
        const targetIndex = direction === 1 ? 0 : items.length - 1;
        const targetItem = items[targetIndex];
        if (targetItem) {
          setSelectedItemId(targetItem.id);
          const firstHeadline =
            targetItem.graphics.find((g) => g.templateType === "HEADLINE") ||
            targetItem.graphics[0];
          if (firstHeadline) {
            setSelectedCueId(firstHeadline.id);
          }
          const el = itemRefs.current[targetItem.id];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
        return;
      }
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
    [items, selectedItem, selectedCue, miniDraft, composition, flushSaveDraft]
  );

  // Perintah Live Terpusat: Memastikan commandStatus terkonfirmasi
  const sendLiveCommand = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      const result = await mutate<{
        commandStatus: string;
        error: string | null;
        state: LiveState;
      }>(path, "POST", body, true);

      if (result.commandStatus !== "confirmed") {
        throw new Error(result.error || `Perintah belum terkonfirmasi (status: ${result.commandStatus})`);
      }
      return result;
    },
    []
  );

  const executeGraphic = useCallback(async (action: "take" | "update") => {
    if (commandLock.current || !selectedCue) return;
    if ((action === "take" && isSelectedOnAir) || (action === "update" && !isSelectedOnAir)) return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (!await flushSaveDraft(miniDraft, composition)) return;
      if (selectedCue.status !== "READY") {
        toast("Cue masih DRAFT. Setujui materi di Rundown & CG sebelum ditayangkan.");
        return;
      }
      await sendLiveCommand(`/api/live/${action}`, { graphicId: selectedCue.id, syncComposition: true });
      await reload();
      toast(action === "take" ? "TAKE diterima server NewsCG" : "UPDATE diterima server NewsCG");
    } catch (error: any) {
      toast(error.message || "Perintah grafis gagal");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [selectedCue, isSelectedOnAir, flushSaveDraft, miniDraft, composition, sendLiveCommand, reload, toast]);
  const executeTake = useCallback(() => executeGraphic("take"), [executeGraphic]);
  const executeUpdate = useCallback(() => executeGraphic("update"), [executeGraphic]);

  const executeMaster = useCallback(async (urgent = false) => {
    if (commandLock.current || (!isMasterChanged && !urgent)) return;
    commandLock.current = true;
    setBusy(true);
    try {
      await onUpdateMaster({ showLogo: stagedMaster.showLogo, showTicker: stagedMaster.showTicker,
        showLiveBadge: stagedMaster.showLiveBadge, tickerSpeed: stagedMaster.tickerSpeed,
        tickerText: stagedMaster.tickerText,
        ...(urgent ? { tickerRevision: Date.now() } : {}) });
      isUserStagingMasterRef.current = false;
      await reload();
      toast(urgent ? "Ticker diterapkan segera" : "Master diterapkan; isi ticker baru masuk pada batas segmen");
    } catch (error: any) {
      toast(error.message || "Master gagal diterapkan");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [isMasterChanged, stagedMaster, onUpdateMaster, reload, toast]);

  // OUT preserves the selected cue and any unsent draft.
  const executeClear = useCallback(async () => {
    if (commandLock.current || !live.onAirGraphicId) return;
    commandLock.current = true;
    setBusy(true);
    try {
      await sendLiveCommand("/api/live/clear");
      await reload();
      toast("OUT — Lower third keluar; cue tetap siap di Preview");
    } catch (error: any) {
      toast(error.message || "OUT gagal");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [live.onAirGraphicId, reload, toast, sendLiveCommand]);

  const executeClearAll = useCallback(async (immediate = true) => {
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      await sendLiveCommand("/api/live/clear-all", { immediate });
      isUserStagingMasterRef.current = false;
      setStagedMaster((previous) => ({ ...previous, showLogo: false, showTicker: false, showLiveBadge: false }));
      await reload();
      toast(immediate ? "CLEAR ALL — Seluruh layer dihapus segera" : "ALL OUT — Seluruh layer keluar beranimasi");
    } catch (error: any) {
      toast(error.message || "Perintah seluruh layer gagal");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [reload, toast, sendLiveCommand]);

  // Aksi Master 1: Toggle Logo di Preview (Safety: Tekan SPASI untuk kirim ke ON AIR)
  const toggleMasterLogo = useCallback(() => {
    isUserStagingMasterRef.current = true;
    setStagedMaster((prev) => {
      const nextVal = !prev.showLogo;
      toast(
        nextVal
          ? "Preview: Logo AKTIF (Tekan M untuk terapkan master)"
          : "Preview: Logo NONAKTIF (Tekan M untuk terapkan master)"
      );
      return { ...prev, showLogo: nextVal };
    });
  }, [toast]);

  // Aksi Master 2: Toggle Ticker + Live di Preview (Safety: Tekan SPASI untuk kirim ke ON AIR)
  const toggleMasterTickerLive = useCallback(() => {
    isUserStagingMasterRef.current = true;
    setStagedMaster((prev) => {
      const bothActive = prev.showTicker && prev.showLiveBadge;
      toast(
        !bothActive
          ? "Preview: Ticker+Live AKTIF (Tekan M untuk terapkan master)"
          : "Preview: Ticker+Live NONAKTIF (Tekan M untuk terapkan master)"
      );
      return {
        ...prev,
        showTicker: !bothActive,
        showLiveBadge: !bothActive
      };
    });
  }, [toast]);

  // Aksi Quick Action Headline (H) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionHeadline = useCallback(() => {
    if (!selectedCue) return;
    const nextComp = { showLocation: false, showKicker: false, showDetail: false };
    setComposition(nextComp);
    void flushSaveDraft(miniDraft, nextComp);
    toast("Preview: Headline Bersih (TAKE untuk cue baru / U untuk update)");
  }, [selectedCue, miniDraft, flushSaveDraft, toast]);

  // Aksi Quick Action Lokasi (L) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleLocation = useCallback(() => {
    if (!selectedCue) return;
    const hasLoc = Boolean(miniDraft.location.trim());
    if (!hasLoc) {
      toast("Data lokasi belum diisi");
      return;
    }
    const nextVal = !composition.showLocation;
    const nextComp = { ...composition, showLocation: nextVal };
    setComposition(nextComp);
    void flushSaveDraft(miniDraft, nextComp);
    toast(
      nextVal
        ? "Preview: Lokasi AKTIF (TAKE untuk cue baru / U untuk update)"
        : "Preview: Lokasi NONAKTIF (TAKE untuk cue baru / U untuk update)"
    );
  }, [selectedCue, miniDraft, composition, flushSaveDraft, toast]);

  // Aksi Quick Action Topik (T) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleTopic = useCallback(() => {
    if (!selectedCue) return;
    const hasKicker = Boolean(miniDraft.kicker.trim());
    if (!hasKicker) {
      toast("Topik / Kicker belum diisi");
      return;
    }
    const nextVal = !composition.showKicker;
    const nextComp = { ...composition, showKicker: nextVal };
    setComposition(nextComp);
    void flushSaveDraft(miniDraft, nextComp);
    toast(
      nextVal
        ? "Preview: Topik AKTIF (TAKE untuk cue baru / U untuk update)"
        : "Preview: Topik NONAKTIF (TAKE untuk cue baru / U untuk update)"
    );
  }, [selectedCue, miniDraft, composition, flushSaveDraft, toast]);

  // Aksi Quick Action Detail (D) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleDetail = useCallback(() => {
    if (!selectedCue) return;
    const hasDetail = Boolean(miniDraft.subline.trim());
    if (!hasDetail) {
      toast("Detail / Subline belum diisi");
      return;
    }
    const nextVal = !composition.showDetail;
    const nextComp = { ...composition, showDetail: nextVal };
    setComposition(nextComp);
    void flushSaveDraft(miniDraft, nextComp);
    toast(
      nextVal
        ? "Preview: Detail AKTIF (TAKE untuk cue baru / U untuk update)"
        : "Preview: Detail NONAKTIF (TAKE untuk cue baru / U untuk update)"
    );
  }, [selectedCue, miniDraft, composition, flushSaveDraft, toast]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isEditing = Boolean(
        target?.closest("input,textarea,select,[contenteditable=true],[role=dialog]")
      );
      const isInteractive = Boolean(target?.closest("button,a,summary,[role=button]"));

      const action = liveShortcut(event.key, {
        disabled: !shortcutsEnabled || busy || quickEditOpen,
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
        case "master":
          void executeMaster();
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
    quickEditOpen,
    navigateStory,
    toggleMasterLogo,
    toggleMasterTickerLive,
    actionHeadline,
    actionToggleLocation,
    actionToggleTopic,
    actionToggleDetail,
    executeMaster,
    executeTake,
    executeUpdate,
    executeClear,
    executeClearAll
  ]);

  // Efektif preview field yang dikirim ke renderer
  const effectivePreviewFields: Record<string, string> | null = selectedCue
    ? {
        ...(selectedCue.draftFields || {}),
        headline: miniDraft.headline,
        name: selectedCue.templateType === "REPORTER" ? miniDraft.headline : (selectedCue.draftFields?.name || miniDraft.headline),
        role: selectedCue.templateType === "REPORTER" ? miniDraft.subline : (selectedCue.draftFields?.role || miniDraft.subline),
        location: miniDraft.location,
        kicker: miniDraft.kicker,
        subline: miniDraft.subline,
        showLocation: composition.showLocation ? "true" : "false",
        showKicker: composition.showKicker ? "true" : "false",
        showDetail: composition.showDetail ? "true" : "false",
        layoutStyle: composition.showDetail ? "sub" : "single"
      }
    : null;

  const onAirTitle = live.onAirGraphicId
    ? live.onAirSnapshot?.headline || live.onAirSnapshot?.name || "Grafis aktif"
    : null;
  const pendingChanges = isSelectedOnAir && effectivePreviewFields
    ? Object.entries({ headline: "Judul", location: "Lokasi", kicker: "Topik", subline: "Detail",
        showLocation: "Tampilan lokasi", showKicker: "Tampilan topik", showDetail: "Tampilan detail" })
      .filter(([field]) => (effectivePreviewFields[field] || "").trim() !== (live.onAirSnapshot?.[field] || "").trim())
      .map(([, label]) => label)
    : [];
  const nextStoryIndex = items.findIndex(isItemOnAir) + 1;

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
            const isReady = it.cgRequired && it.graphics.length > 0 && it.graphics.every((g) => g.status === "READY");

            return (
              <div
                key={it.id}
                ref={(el) => {
                  itemRefs.current[it.id] = el;
                }}
                className={`sidebar-story-card ${isSelected ? "selected" : ""} ${onAir ? "on-air" : ""}`}
              >
                <button type="button" className="story-select-button" aria-pressed={isSelected} aria-label={`Pilih berita ${idx + 1}: ${it.title}`} onClick={() => {
                  setSelectedItemId(it.id);
                  const firstH = it.graphics.find((g) => g.templateType === "HEADLINE") || it.graphics[0];
                  setSelectedCueId(firstH?.id || null);
                }}>
                <div className="story-card-top">
                  <span className="story-number">#{idx + 1}</span>
                  <div className="story-badges">
                    {onAir && <span className="badge-onair pulse">ON AIR</span>}
                    {isSelected && <span className="badge-selected">PREVIEW</span>}
                    {!onAir && idx === nextStoryIndex && <span className="badge-selected">BERIKUTNYA</span>}
                      <span className={`badge-status ${isReady ? "ready" : "draft"}`}>{it.format}</span>
                      {!it.cgRequired && <span className="badge-status">TANPA CG</span>}
                      {it.cgRequired && !isReady && <span className="badge-status draft">PERLU DICEK</span>}
                  </div>
                </div>

                <div className="story-title" title={it.title}>
                  {it.title}
                </div>
                </button>

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
              <b>{live.onAirGraphicId ? "LOWER THIRD: AKTIF" : "LOWER THIRD: KOSONG"}</b>
            </div>

            <div className="on-air-text-box">
              <small>OUTPUT NEWS CG:</small>
              <span>{onAirTitle || "Grafis Lower Third Kosong"}</span>
            </div>
          </div>

          <div className="header-actions-group">
            <button ref={quickEditButtonRef} type="button" className="shortcut-toggle-btn" disabled={!selectedCue} onClick={() => setQuickEditOpen(true)} title="Edit teks cue terpilih tanpa meninggalkan kontrol siaran">
              <FileText size={13} /> Edit teks
            </button>
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
            <button type="button" className="master-btn" disabled={busy || !isMasterChanged} onClick={() => executeMaster()}>TERAPKAN MASTER <kbd>M</kbd></button>
            <button
              type="button"
              className={`master-btn ${stagedMaster.showLogo ? "active" : ""} ${stagedMaster.showLogo !== master.showLogo ? "staged-pending" : ""}`}
              disabled={busy}
              onClick={toggleMasterLogo}
              title="Siapkan logo di Preview (1), lalu terapkan MASTER (M)"
            >
              <span className="btn-kbd">1</span>
              <span>LOGO · {master.showLogo ? "TAYANG" : "MATI"}</span>
              <span className={`indicator-dot ${stagedMaster.showLogo ? "on" : ""}`} />
              {stagedMaster.showLogo !== master.showLogo && <span className="staged-pill">STAGE</span>}
            </button>

            <button
              type="button"
              className={`master-btn ${stagedMaster.showTicker && stagedMaster.showLiveBadge ? "active" : ""} ${(stagedMaster.showTicker !== master.showTicker || stagedMaster.showLiveBadge !== master.showLiveBadge) ? "staged-pending" : ""}`}
              disabled={busy}
              onClick={toggleMasterTickerLive}
              title="Siapkan ticker + live di Preview (2), lalu terapkan MASTER (M)"
            >
              <span className="btn-kbd">2</span>
              <span>TICKER + LIVE · {master.showTicker && master.showLiveBadge ? "TAYANG" : "BELUM LENGKAP"}</span>
              <span
                className={`indicator-dot ${stagedMaster.showTicker && stagedMaster.showLiveBadge ? "on" : ""}`}
              />
              {(stagedMaster.showTicker !== master.showTicker || stagedMaster.showLiveBadge !== master.showLiveBadge) && <span className="staged-pill">STAGE</span>}
            </button>
          </div>
        </div>

        <details className="live-ticker-settings">
          <summary>Ticker & master · {master.showLogo ? "Logo aktif" : "Logo mati"} · {master.showTicker ? "Ticker aktif" : "Ticker mati"} · {master.showLiveBadge ? "Live aktif" : "Live mati"}</summary>
          <label>Isi ticker berikutnya
            <textarea rows={3} value={stagedMaster.tickerText} disabled={busy} onChange={(event) => {
              isUserStagingMasterRef.current = true;
              setStagedMaster((previous) => ({ ...previous, tickerText: event.target.value }));
            }} />
          </label>
          <label>Kecepatan
            <select value={stagedMaster.tickerSpeed || 85} disabled={busy} onChange={(event) => {
              isUserStagingMasterRef.current = true;
              setStagedMaster((previous) => ({ ...previous, tickerSpeed: Number(event.target.value) }));
            }}>
              <option value={tickerPresets.slow}>Lambat · 65 px/detik</option>
              <option value={tickerPresets.normal}>Normal · 85 px/detik</option>
              <option value={tickerPresets.fast}>Cepat · 105 px/detik</option>
              {![65, 85, 105].includes(stagedMaster.tickerSpeed || 85) && <option value={stagedMaster.tickerSpeed}>{stagedMaster.tickerSpeed} px/detik (kustom)</option>}
            </select>
          </label>
          <button type="button" disabled={busy || !isMasterChanged} onClick={() => executeMaster()}>TERAPKAN MASTER · M</button>
          <button type="button" disabled={busy || !stagedMaster.showTicker || Boolean(live.onAirSnapshot?.ticker?.trim())} onClick={() => executeMaster(true)}>TICKER SEGERA</button>
          <small>Perubahan normal masuk saat segmen berikutnya. Ticker segera mengganti teks sekarang. Jika cue aktif memiliki ticker sendiri, ubah ticker pada cue tersebut; Ticker segera dinonaktifkan.</small>
        </details>

        {/* Monitor Pratinjau Dual Deck (Standby Stage Preview + Mini Live Monitor) */}
        <div className="production-preview-deck">
          {/* 1. MONITOR UTAMA: STANDBY STAGE PREVIEW */}
          <div className="preview-screen-wrapper">
            <div className="preview-meta-badge">
              <span className="stage-tag">PREVIEW</span>
              <span className="cue-name">
                {selectedItem ? `#${items.indexOf(selectedItem) + 1} ${selectedItem.title}` : "TIDAK ADA BERITA TERPILIH"}
              </span>
              <span className="cue-type">{selectedCue?.templateType || "OFF"}</span>
            </div>

            <BroadcastPreviewBox
              graphic={selectedCue}
              fields={effectivePreviewFields}
              master={stagedMaster}
              emptyText="LAYAR BERSIH — TEKAN ↑ / ↓ UNTUK MEMILIH BERITA"
            />
          </div>

          {/* 2. MONITOR KECIL: LIVE PROGRAM · NEWS CG */}
          <aside className="live-mini-panel" aria-label="Monitor status output NewsCG">
            <div className="live-mini-header">
              <div className="live-mini-badge">
                <span className={`dot-led ${live.onAirGraphicId ? "red pulse" : "green"}`} />
                <span>PROGRAM · NEWS CG</span>
              </div>
              {live.onAirGraphicId && (
                <button
                  type="button"
                  className="live-mini-clear-btn"
                  onClick={executeClear}
                  title="OUT lower third; master tetap tampil (Esc / C)"
                >
                  <X size={11} />
                  <span>OUT</span>
                </button>
              )}
            </div>

            <div className={`live-mini-screen-wrapper ${live.onAirGraphicId ? "is-on-air" : ""}`}>
              <ProgramMonitor />
            </div>

            <div className="live-mini-footer">
              <span className="live-mini-title" title={onAirTitle || "Tidak ada grafis tayang"}>
                {onAirTitle || (master.showLogo || master.showTicker || master.showLiveBadge ? "MASTER AKTIF" : "OUTPUT KOSONG")}
              </span>
              <span className={`live-mini-status ${live.onAirGraphicId ? "" : "off"}`}>
                STATUS APLIKASI
              </span>
            </div>
          </aside>
        </div>

        <div className="primary-actions-deck" aria-label="Perintah siaran">
          <button type="button" className="action-btn btn-take" disabled={busy || !selectedCue || selectedCue.status !== "READY" || isSelectedOnAir} onClick={executeTake} title={selectedCue?.status === "DRAFT" ? "Materi masih DRAFT. Setujui di Rundown & CG." : undefined}>
            <span className="btn-inner"><Play size={16} /><span className="btn-title">TAKE</span></span><kbd>SPACE / ENTER</kbd>
          </button>
          <button type="button" className="action-btn btn-update" disabled={busy || !selectedCue || selectedCue.status !== "READY" || !isSelectedOnAir} onClick={executeUpdate}>
            <span className="btn-inner"><RefreshCw size={16} /><span className="btn-title">UPDATE</span></span><kbd>U</kbd>
          </button>
          <button type="button" className="action-btn btn-clear" disabled={busy || !live.onAirGraphicId} onClick={executeClear}>
            <span className="btn-inner"><X size={16} /><span className="btn-title">OUT</span></span><kbd>ESC / C</kbd>
          </button>
        </div>
        <div className="live-change-summary" role="status">
          {busy ? "Mengirim perintah…" : selectedCue ? (selectedCue.status !== "READY" ? "Cue masih DRAFT — setujui di Rundown & CG sebelum TAKE atau UPDATE." : isSelectedOnAir ? "Cue sedang aktif — gunakan UPDATE untuk menerapkan perubahan." : "Cue siap di Preview — gunakan TAKE untuk menayangkan.") : selectedItem ? (selectedItem.cgRequired ? "Item ini memerlukan CG, tetapi belum punya cue. Tambahkan di Rundown & CG." : "Item ini tanpa CG lower third. Pilih item lain untuk menyiapkan cue.") : "Pilih cue dari rundown."}
          {isMasterChanged && " Perubahan master belum diterapkan (M)."}
          {isSelectedOnAir && <small>{pendingChanges.length ? `Belum diterapkan: ${pendingChanges.join(", ")}.` : "Isi Preview sama dengan snapshot Program."}</small>}
          <small>{live.overlayClientsCount} klien output terhubung · Program ini adalah monitor internal NewsCG, bukan pembacaan switcher.</small>
        </div>

        {/* Quick Actions (H, L, T, D) - Mengatur Stage Preview (Safety: TAKE untuk cue baru / U untuk update) */}
        <div className="quick-actions-bar">
          <div className="quick-action-btns">
            <button
              type="button"
              className="qa-btn"
              disabled={busy || !selectedCue}
              onClick={actionHeadline}
              title="Siapkan headline bersih di preview (Hotkey: H, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">H</span>
              <span className="qa-text">HEADLINE BERSIH</span>
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showLocation ? "active" : ""} ${!miniDraft.location.trim() ? "disabled" : ""}`}
              disabled={busy || !miniDraft.location.trim()}
              onClick={actionToggleLocation}
              title="Toggle Lokasi di preview (Hotkey: L, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">L</span>
              <span className="qa-text">LOKASI</span>
              <span className={`qa-dot ${composition.showLocation ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showKicker ? "active" : ""} ${!miniDraft.kicker.trim() ? "disabled" : ""}`}
              disabled={busy || !miniDraft.kicker.trim()}
              onClick={actionToggleTopic}
              title="Toggle Topik di preview (Hotkey: T, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">T</span>
              <span className="qa-text">TOPIK</span>
              <span className={`qa-dot ${composition.showKicker ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showDetail ? "active" : ""} ${!miniDraft.subline.trim() ? "disabled" : ""}`}
              disabled={busy || !miniDraft.subline.trim()}
              onClick={actionToggleDetail}
              title="Toggle Detail Headline di preview (Hotkey: D, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">D</span>
              <span className="qa-text">DETAIL</span>
              <span className={`qa-dot ${composition.showDetail ? "on" : ""}`} />
            </button>
          </div>
        </div>
        <div className="all-output-actions" aria-label="Kontrol seluruh output">
          <span>Seluruh layer</span>
          <button type="button" disabled={busy} onClick={() => executeClearAll(false)}>ALL OUT · Animasi</button>
          <button type="button" className="emergency-clear" disabled={busy} onClick={() => executeClearAll(true)}><Trash2 size={14} /> CLEAR ALL · Darurat <kbd>0</kbd></button>
        </div>




        {/* Mini Editor Berita Ringkas */}
        {quickEditOpen && <div className="mini-editor-card quick-edit-drawer" role="dialog" aria-label="Edit cepat teks cue" onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); closeQuickEdit(); }
        }}>
          <div className="mini-editor-header">
            <div className="mini-editor-title">
              <FileText size={13} />
              <span>EDIT CEPAT TEKS BERITA (AUTOSAVE)</span>
            </div>
            <button type="button" className="quick-edit-close" onClick={closeQuickEdit} aria-label="Tutup edit cepat"><X size={16} /></button>
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
              <label>
                {selectedCue?.templateType === "REPORTER"
                  ? "Nama Pembawa Berita / Reporter"
                  : selectedCue?.templateType === "LOCATION"
                  ? "Teks Lokasi"
                  : "Headline Utama"}
              </label>
              <input
                type="text"
                autoFocus
                placeholder={
                  selectedCue?.templateType === "REPORTER"
                    ? "Masukkan nama reporter..."
                    : selectedCue?.templateType === "LOCATION"
                    ? "Masukkan nama lokasi siaran..."
                    : selectedCue
                    ? "Masukkan judul berita utama..."
                    : "Pilih berita dari daftar untuk mengedit..."
                }
                maxLength={selectedCue?.templateType === "REPORTER" ? 60 : 120}
                disabled={busy || !selectedCue}
                value={miniDraft.headline}
                onChange={(e) => handleMiniDraftChange("headline", e.target.value)}
              />
            </div>

            <div className="mini-input-group">
              <label>Lokasi Siaran</label>
              <input
                type="text"
                placeholder={selectedCue ? "Contoh: Jakarta Pusat" : "-"}
                maxLength={60}
                disabled={busy || !selectedCue}
                value={miniDraft.location}
                onChange={(e) => handleMiniDraftChange("location", e.target.value)}
              />
            </div>

            <div className="mini-input-group">
              <label>Topik / Kicker (Atas)</label>
              <input
                type="text"
                placeholder={selectedCue ? "Contoh: BREAKING NEWS" : "-"}
                maxLength={60}
                disabled={busy || !selectedCue || selectedCue?.templateType === "REPORTER" || selectedCue?.templateType === "LOCATION"}
                value={miniDraft.kicker}
                onChange={(e) => handleMiniDraftChange("kicker", e.target.value)}
              />
            </div>

            <div className="mini-input-group span-2">
              <label>
                {selectedCue?.templateType === "REPORTER"
                  ? "Jabatan / Role"
                  : "Detail / Subline Keterangan"}
              </label>
              <input
                type="text"
                placeholder={
                  selectedCue?.templateType === "REPORTER"
                    ? "Contoh: REPORTER, PRESENTER..."
                    : selectedCue
                    ? "Penjelasan ringkas poin berita..."
                    : "-"
                }
                maxLength={selectedCue?.templateType === "REPORTER" ? 60 : 160}
                disabled={busy || !selectedCue || selectedCue?.templateType === "LOCATION"}
                value={miniDraft.subline}
                onChange={(e) => handleMiniDraftChange("subline", e.target.value)}
              />
            </div>
          </div>
        </div>}
      </main>
    </div>
  );
}
