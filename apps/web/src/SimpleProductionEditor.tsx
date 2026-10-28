import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphicItem,
  LiveState,
  MasterOverlayState,
  NewsAnchorDefaults,
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
import { api, mutate } from "./api";
import { createNewsAnchorGraphic, newsAnchorDefaultsSchema } from "@newscg/shared";
import { createFieldReporterGraphic, fieldReporterGraphicId, reporterDefaultsSchema, type ReporterDefaults } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { ProgramMonitor } from "./ProgramMonitor";
import { broadcastTemplates, emptyRundownTicker, getBroadcastColorTheme, getGraphicFieldLimit, getRundownTickerSpeed, hasVisibleMasterLayers, masterControlPatch, normalizeHeadlineTopicFields, selectBroadcastColorTheme, selectBroadcastTemplate } from "@newscg/shared";
import { BroadcastColorThemePicker, BroadcastTemplatePicker } from "./VisualTemplatePicker";
import { Liputan7Settings } from "./Liputan7Settings";
import { liveShortcut, primaryGraphicAction } from "./productionFlow";
import "./simple-production.css";

type Props = {
  rundown?: Rundown;


  reload: () => Promise<void>;
  toast: (s: string) => void;
  master: MasterOverlayState;
  live: LiveState;
  onUpdateMaster: (patch: Partial<MasterOverlayState>) => Promise<void>;

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


  reload,
  toast,
  master,
  live,
  onUpdateMaster
}: Props) {
  const rundownTickerSpeed = useMemo(() => getRundownTickerSpeed(rundown?.ticker ?? emptyRundownTicker), [rundown?.ticker]);
  const [localCueFields, setLocalCueFields] = useState<Record<string, Record<string, string>>>({});
  const localCueFieldsRef = useRef(localCueFields);
  const items = useMemo(() => (rundown?.items || []).map((item) => {
    const graphics = item.graphics.map((graphic) => {
      const fields = normalizeHeadlineTopicFields(graphic.templateType, localCueFields[graphic.id] || graphic.draftFields);
      return fields === graphic.draftFields ? graphic : { ...graphic, draftFields: fields };
    });
    return graphics.some((graphic, index) => graphic !== item.graphics[index]) ? { ...item, graphics } : item;
  }), [rundown, localCueFields]);

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
  const [anchorPreview, setAnchorPreview] = useState<GraphicItem | null>(null);
  const [reporterPreview, setReporterPreview] = useState<GraphicItem | null>(null);
  const previewCue = reporterPreview || anchorPreview || selectedCue;

  useEffect(() => {
    if (!rundown?.id) return;
    void flushPendingDraftRef.current();
    const saved = sessionStorage.getItem(`simple-cued-story-${rundown.id}`);
    const valid = (saved && items.some((i) => i.id === saved)) ? saved : items[0]?.id || null;
    setSelectedItemId(valid);
    const savedCue = sessionStorage.getItem(`simple-cued-cue-${rundown.id}`);
    setSelectedCueId(savedCue || null);
    setAnchorPreview(null);
    setReporterPreview(null);
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
    !reporterPreview && !anchorPreview && selectedCue && onAirGraphicId && selectedCue.id === onAirGraphicId
  );
  const onAirCueInStory = selectedItem?.graphics.find((graphic) => graphic.id === onAirGraphicId);
  const canSwitchDetail = Boolean(selectedCue && onAirCueInStory && selectedCue.id !== onAirCueInStory.id &&
    ["HEADLINE", "SOT"].includes(selectedCue.templateType) &&
    ["HEADLINE", "SOT"].includes(onAirCueInStory.templateType));
  const canUpdate = reporterPreview
    ? onAirGraphicId === reporterPreview.id
    : anchorPreview
    ? onAirGraphicId === anchorPreview.id
    : isSelectedOnAir || canSwitchDetail;

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

  // Staged master overlay untuk keselamatan siaran (Hotkey 1 & 2 di-stage di preview; tekan M untuk kirim ke ON AIR)
  const [stagedMaster, setStagedMaster] = useState<MasterOverlayState>(master);
  const isUserStagingMasterRef = useRef(false);

  useEffect(() => {
    if (!isUserStagingMasterRef.current) {
      setStagedMaster(master);
    }
  }, [master]);

  const isMasterChanged =
    stagedMaster.broadcastTemplate !== master.broadcastTemplate ||
    stagedMaster.showProgramLogo !== master.showProgramLogo || stagedMaster.showWeather !== master.showWeather ||
    stagedMaster.programLogoImage !== master.programLogoImage ||
    JSON.stringify(stagedMaster.weatherLocations) !== JSON.stringify(master.weatherLocations) ||
    stagedMaster.showLogo !== master.showLogo ||
    stagedMaster.showTicker !== master.showTicker ||
    stagedMaster.showLiveBadge !== master.showLiveBadge ||
    (stagedMaster.broadcastTemplate === "bcc"
      ? ((stagedMaster.tickerText ?? "") !== (master.tickerText ?? "") || (stagedMaster.tickerSpeed ?? 85) !== (master.tickerSpeed ?? 85))
      : (rundown && stagedMaster.showTicker && (master.tickerRundownId !== rundown.id || master.tickerText !== (rundown.ticker?.text ?? "") || master.tickerSpeed !== rundownTickerSpeed))) ||
    getBroadcastColorTheme(stagedMaster.colorTheme).id !== getBroadcastColorTheme(master.colorTheme).id ||
    stagedMaster.brandText !== master.brandText ||
    stagedMaster.logoText !== master.logoText ||
    stagedMaster.logoSub !== master.logoSub;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef<number>(0);
  const saveSeqByCueRef = useRef<Record<string, number>>({});
  const completedSaveByCueRef = useRef<Record<string, number>>({});
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSaveRef = useRef<{ cue: GraphicItem; draft: MiniDraft; composition: PreviewComposition } | null>(null);
  const currentCueIdRef = useRef<string | null>(null);
  currentCueIdRef.current = selectedCue?.id || null;
  const editorCueIdRef = useRef<string | null>(null);
  const sotReturnRef = useRef<{ storyId: string; cueId: string; composition: PreviewComposition } | null>(null);
  const restoreCompositionRef = useRef<PreviewComposition | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Drop removed or refreshed cues after preserving any save still being sent.
  useEffect(() => {
    const cached = localCueFieldsRef.current;
    const sourceCues = new Map(rundown?.items.flatMap((item) => item.graphics).map((graphic) => [graphic.id, graphic]));
    const next = Object.fromEntries(Object.entries(cached).filter(([cueId, fields]) => {
      const pending = pendingSaveRef.current?.cue.id === cueId ||
        (saveSeqByCueRef.current[cueId] || 0) > (completedSaveByCueRef.current[cueId] || 0);
      const source = sourceCues.get(cueId);
      return pending || Boolean(source && JSON.stringify(source.draftFields) !== JSON.stringify(fields));
    }));
    if (Object.keys(next).length !== Object.keys(cached).length) {
      localCueFieldsRef.current = next;
      setLocalCueFields(next);
    }
  }, [rundown, localCueFields, saveStatus]);

  // Muat data cue terpilih ke mini editor & komposisi
  useEffect(() => {
    if (!selectedCue) {
      editorCueIdRef.current = null;
      setMiniDraft({ headline: "", location: "", kicker: "", subline: "" });
      return;
    }
    const switched = editorCueIdRef.current !== selectedCue.id;
    if (!switched && (pendingSaveRef.current?.cue.id === selectedCue.id ||
      (saveSeqByCueRef.current[selectedCue.id] || 0) > (completedSaveByCueRef.current[selectedCue.id] || 0))) return;
    editorCueIdRef.current = selectedCue.id;
    const f = selectedCue.draftFields || {};
    const headline = selectedCue.templateType === "LOCATION" ? f.location || ""
      : selectedCue.templateType === "REPORTER" || selectedCue.templateType === "SOT"
      ? f.name || f.headline || ""
      : f.headline || f.name || selectedItem?.title || "";
    const subline = selectedCue.templateType === "REPORTER" || selectedCue.templateType === "SOT"
      ? f.role || f.subline || ""
      : f.subline || f.role || "";
    const sourceCue = switched && selectedCue.templateType === "SOT" && sotReturnRef.current?.storyId === selectedItem?.id
      ? selectedItem?.graphics.find((graphic) => graphic.id === sotReturnRef.current?.cueId) : null;
    const location = switched && selectedCue.templateType === "SOT"
      ? (onAirCueInStory ? live.onAirSnapshot?.location : "") || sourceCue?.draftFields.location || f.location || ""
      : f.location || "";
    setMiniDraft({
      headline,
      location,
      kicker: f.kicker || "",
      subline
    });

    setComposition(restoreCompositionRef.current || {
      showLocation: selectedCue.templateType === "SOT" && sourceCue
        ? Boolean(sotReturnRef.current?.composition.showLocation && location.trim())
        : f.showLocation === "true" && Boolean(location.trim()),
      showKicker: f.showKicker === "true" && Boolean(f.kicker?.trim()),
      showDetail: f.showDetail === "true" && Boolean(f.subline?.trim())
    });
    restoreCompositionRef.current = null;
    if (switched) setSaveStatus("idle");
  }, [selectedCue?.id, selectedCue?.draftFields]);

  const cacheCueFields = useCallback((cueId: string, fields: Record<string, string>) => {
    const next = { ...localCueFieldsRef.current, [cueId]: fields };
    localCueFieldsRef.current = next;
    setLocalCueFields(next);
  }, []);

  // Fungsi penyimpanan autosave dengan debounce
  const flushSaveDraft = useCallback(
    (
      draftToSave: MiniDraft,
      compToSave: PreviewComposition,
      targetCue: GraphicItem | null = selectedCue
    ): Promise<boolean> => {
      if (!targetCue) return Promise.resolve(false);
      if (pendingSaveRef.current?.cue.id === targetCue.id) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        pendingSaveRef.current = null;
      }
      const currentSeq = ++saveSeqRef.current;
      saveSeqByCueRef.current = { ...saveSeqByCueRef.current, [targetCue.id]: currentSeq };
      if (currentCueIdRef.current === targetCue.id) setSaveStatus("saving");
      const patchFields: Record<string, string> = {
        ...(targetCue.draftFields || {}),
        location: draftToSave.location.trim(),
        showLocation: compToSave.showLocation ? "true" : "false",
        showKicker: compToSave.showKicker ? "true" : "false",
        showDetail: compToSave.showDetail ? "true" : "false",
        layoutStyle: compToSave.showDetail ? "sub" : "single"
      };

      if (targetCue.templateType === "REPORTER" || targetCue.templateType === "SOT") {
        patchFields.name = draftToSave.headline.trim();
        patchFields.role = draftToSave.subline.trim() || (targetCue.templateType === "REPORTER" ? "REPORTER" : "");
        patchFields.headline = targetCue.templateType === "SOT" ? (targetCue.draftFields.headline || "") : draftToSave.headline.trim();
        patchFields.subline = draftToSave.subline.trim();
      } else if (targetCue.templateType === "LOCATION") {
        patchFields.location = draftToSave.headline.trim();
        patchFields.headline = patchFields.location;
      } else {
        patchFields.headline = draftToSave.headline.trim();
        patchFields.subline = draftToSave.subline.trim();
        patchFields.kicker = draftToSave.kicker.trim();
      }

      cacheCueFields(targetCue.id, patchFields);
      const task = saveQueueRef.current.then(async () => {
        try {
          const updated = await mutate<GraphicItem>(`/api/graphics/${targetCue.id}`, "PATCH", {
            draftFields: patchFields
          });
          completedSaveByCueRef.current = { ...completedSaveByCueRef.current, [targetCue.id]: currentSeq };
          if (currentSeq === saveSeqByCueRef.current[targetCue.id] && pendingSaveRef.current?.cue.id !== targetCue.id) {
            cacheCueFields(targetCue.id, updated.draftFields || patchFields);
            if (currentCueIdRef.current === targetCue.id) setSaveStatus("saved");
          }
          try {
            await reload();
          } catch (error) {
            toast(`Perubahan tersimpan, tetapi rundown belum diperbarui: ${(error as Error).message}`);
          }
          return true;
        } catch (err: any) {
          completedSaveByCueRef.current = { ...completedSaveByCueRef.current, [targetCue.id]: currentSeq };
          if (currentSeq === saveSeqByCueRef.current[targetCue.id]) {
            cacheCueFields(targetCue.id, localCueFieldsRef.current[targetCue.id] || patchFields);
          }
          if (currentSeq === saveSeqByCueRef.current[targetCue.id] && currentCueIdRef.current === targetCue.id) {
            setSaveStatus("error");
          }
          toast(err.message || "Gagal menyimpan perubahan materi");
          return false;
        }
      });

      saveQueueRef.current = task;
      return task;
    },
    [selectedCue, cacheCueFields, reload, toast]
  );

  const flushPendingDraft = useCallback(() => {
    const pending = pendingSaveRef.current;
    return pending ? flushSaveDraft(pending.draft, pending.composition, pending.cue) : saveQueueRef.current;
  }, [flushSaveDraft]);
  const flushPendingDraftRef = useRef(flushPendingDraft);
  flushPendingDraftRef.current = flushPendingDraft;
  useEffect(() => () => { void flushPendingDraftRef.current(); }, []);

  const selectCue = useCallback((storyId: string, cueId: string | null) => {
    void flushPendingDraft();
    setAnchorPreview(null);
    setReporterPreview(null);
    setSelectedItemId(storyId);
    setSelectedCueId(cueId);
  }, [flushPendingDraft]);

  const handleMiniDraftChange = (field: keyof MiniDraft, val: string) => {
    if (!selectedCue) return;
    const updated = selectedCue.templateType === "LOCATION" && (field === "headline" || field === "location")
      ? { ...miniDraft, headline: val, location: val }
      : { ...miniDraft, [field]: val };
    setMiniDraft(updated);
    setSaveStatus("saving");

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    pendingSaveRef.current = { cue: selectedCue, draft: updated, composition };
    debounceTimerRef.current = setTimeout(() => {
      void flushPendingDraftRef.current();
    }, 500);
  };

  // Navigasi Berita: Pindah ke Berita Sebelumnya / Berikutnya
  const navigateStory = useCallback(
    (direction: -1 | 1) => {
      if (!items.length) return;
      const currentIndex = items.findIndex((i) => i.id === selectedItem?.id);
      if (currentIndex === -1) {
        const targetIndex = direction === 1 ? 0 : items.length - 1;
        const targetItem = items[targetIndex];
        if (targetItem) {
          const firstHeadline =
            targetItem.graphics.find((g) => g.templateType === "HEADLINE") ||
            targetItem.graphics[0];
          selectCue(targetItem.id, firstHeadline?.id || null);
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
          const firstHeadline =
            targetItem.graphics.find((g) => g.templateType === "HEADLINE") ||
            targetItem.graphics[0];
          selectCue(targetItem.id, firstHeadline?.id || null);
          // Scroll item ke viewport
          const el = itemRefs.current[targetItem.id];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      }
    },
    [items, selectedItem, selectCue]
  );

  const navigateSot = useCallback((direction: -1 | 0 | 1) => {
    const sotCues = selectedItem?.graphics.filter((graphic) => graphic.templateType === "SOT") || [];
    if (!sotCues.length) {
      toast("Berita ini belum memiliki cue SOT narasumber.");
      return;
    }
    const currentIndex = sotCues.findIndex((graphic) => graphic.id === selectedCue?.id);
    if (direction === 0 && currentIndex >= 0) {
      const firstHeadline = selectedItem?.graphics.find((graphic) => graphic.templateType === "HEADLINE");
      const previous = sotReturnRef.current?.storyId === selectedItem?.id
        ? selectedItem?.graphics.find((graphic) => graphic.id === sotReturnRef.current?.cueId) : null;
      const targetHeadline = previous || firstHeadline;
      if (!targetHeadline) { toast("Headline berita ini belum tersedia."); return; }
      restoreCompositionRef.current = previous ? sotReturnRef.current!.composition : {
        showLocation: targetHeadline.draftFields.showLocation === "true",
        showKicker: targetHeadline.draftFields.showKicker === "true",
        showDetail: targetHeadline.draftFields.showDetail === "true"
      };
      sotReturnRef.current = null;
      selectCue(selectedItem!.id, targetHeadline.id);
      return;
    }
    const targetIndex = direction === 0 ? (currentIndex < 0 ? 0 : currentIndex)
      : currentIndex < 0 ? (direction === 1 ? 0 : sotCues.length - 1) : currentIndex + direction;
    const target = sotCues[targetIndex];
    if (!target) {
      toast(direction === 1 ? "Tidak ada SOT berikutnya di berita ini." : "Tidak ada SOT sebelumnya di berita ini.");
      return;
    }
    if (currentIndex < 0 && selectedCue && selectedItem)
      sotReturnRef.current = { storyId: selectedItem.id, cueId: selectedCue.id, composition: { ...composition } };
    selectCue(selectedItem!.id, target.id);
  }, [selectedItem, selectedCue, composition, selectCue, toast]);

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
    if (commandLock.current || !previewCue) return;
    if ((action === "take" && onAirGraphicId === previewCue.id) || (action === "update" && !canUpdate)) return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (reporterPreview) {
        await sendLiveCommand("/api/live/reporter", { action,
          defaults: {
            name: reporterPreview.draftFields.name,
            role: reporterPreview.draftFields.role,
            location: reporterPreview.draftFields.location
          } });
        await reload();
        toast(action === "take" ? "Reporter lapangan ditayangkan" : "Reporter lapangan diperbarui");
        return;
      }
      if (anchorPreview) {
        await sendLiveCommand("/api/live/news-anchor", { action,
          defaults: { name: anchorPreview.draftFields.name, role: anchorPreview.draftFields.role } });
        await reload();
        toast(action === "take" ? "News anchor ditayangkan" : "News anchor diperbarui");
        return;
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (!await flushSaveDraft(miniDraft, composition)) return;
      await sendLiveCommand(`/api/live/${action}`, { graphicId: previewCue.id, syncComposition: true });
      await reload();
      toast(action === "take" ? "TAKE diterima server NewsCG" : "UPDATE diterima server NewsCG");
    } catch (error: any) {
      toast(error.message || "Perintah grafis gagal");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [previewCue, anchorPreview, onAirGraphicId, canUpdate, flushSaveDraft, miniDraft, composition, sendLiveCommand, reload, toast]);
  const executeUpdate = useCallback(() => executeGraphic("update"), [executeGraphic]);
  const executePrimary = useCallback(() => executeGraphic(primaryGraphicAction(canUpdate)), [executeGraphic, canUpdate]);

  const executeMaster = useCallback(async (urgent = false) => {
    if (commandLock.current || (!isMasterChanged && !urgent)) return;
    commandLock.current = true;
    setBusy(true);
    try {
      if (stagedMaster.broadcastTemplate === "bcc") {
        const patch: Partial<MasterOverlayState> = masterControlPatch(stagedMaster);
        const textChanged = (stagedMaster.tickerText ?? "") !== (master.tickerText ?? "");
        const speedChanged = (stagedMaster.tickerSpeed ?? 85) !== (master.tickerSpeed ?? 85);
        if (urgent || textChanged || speedChanged) {
          patch.tickerRevision = (master.tickerRevision ?? 0) + 1;
        }
        await onUpdateMaster(patch);
        if (!urgent) isUserStagingMasterRef.current = false;
        await reload();
        toast(urgent ? "Ticker global BCC diterapkan segera" : "Master BCC diterapkan");
      } else {
        const masterPatch = urgent ? null : masterControlPatch(stagedMaster);
        if (urgent || (stagedMaster.showTicker && rundown)) {
          if (!rundown) throw new Error("Pilih rundown sebelum menerapkan ticker");
          await mutate("/api/live/ticker", "POST", { rundownId: rundown.id, immediate: urgent }, true);
        }
        if (masterPatch) await onUpdateMaster(masterPatch);
        if (!urgent) isUserStagingMasterRef.current = false;
        await reload();
        toast(urgent ? "Ticker diterapkan segera" : "Master diterapkan; isi ticker baru masuk pada batas segmen");
      }
    } catch (error: any) {
      toast(error.message || "Master gagal diterapkan");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [isMasterChanged, stagedMaster, rundown, onUpdateMaster, reload, toast, master.tickerRevision]);

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

  const executeClearAll = useCallback(async (immediate: boolean) => {
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      await sendLiveCommand("/api/live/clear-all", { immediate });
      isUserStagingMasterRef.current = false;
      setStagedMaster((previous) => ({ ...previous, showLogo: false, showTicker: false, showLiveBadge: false, showProgramLogo: false, showWeather: false }));
      await reload();
      toast(immediate ? "CLEAR ALL — Seluruh layer dihapus segera" : "ALL OUT — Seluruh layer keluar beranimasi");
    } catch (error: any) {
      toast(error.message || "Perintah seluruh layer gagal");
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }, [reload, toast, sendLiveCommand]);

  // Aksi Master 1: Toggle Logo di Preview (Safety: Tekan M untuk kirim ke ON AIR)
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

  const toggleMasterProgram = useCallback(() => {
    isUserStagingMasterRef.current = true;
    setStagedMaster(previous => ({ ...previous, showProgramLogo: !previous.showProgramLogo }));
    toast("Preview: Logo Program diubah (Tekan M untuk terapkan master)");
  }, [toast]);

  const toggleMasterTicker = useCallback(() => {
    isUserStagingMasterRef.current = true;
    setStagedMaster(previous => ({ ...previous, showTicker: !previous.showTicker }));
    toast("Preview: Ticker diubah (Tekan M untuk terapkan master)");
  }, [toast]);

  const toggleMasterLive = useCallback(() => {
    isUserStagingMasterRef.current = true;
    setStagedMaster(previous => {
      const nextVal = !previous.showLiveBadge;
      toast(nextVal ? "Preview: LIVE AKTIF (Tekan M untuk terapkan master)" : "Preview: LIVE NONAKTIF (Tekan M untuk terapkan master)");
      return { ...previous, showLiveBadge: nextVal };
    });
  }, [toast]);

  // Aksi Master 2: Toggle Ticker + Live di Preview (Safety: Tekan M untuk kirim ke ON AIR)
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
  const actionNewsAnchor = useCallback(async () => {
    if (commandLock.current) return;
    if (anchorPreview) { setAnchorPreview(null); return; }
    commandLock.current = true;
    setBusy(true);
    try {
      const defaults = newsAnchorDefaultsSchema.parse(await api<NewsAnchorDefaults>("/api/settings/news-anchor-defaults"));
      if (!defaults.name) throw new Error("Isi Nama Anchor di Pengaturan Default News Anchor terlebih dahulu.");
      setReporterPreview(null);
      setAnchorPreview(createNewsAnchorGraphic(defaults));
      toast("Preview: News Anchor (Spasi untuk TAKE atau UPDATE; P untuk kembali ke cue)");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Default news anchor gagal dimuat");
    } finally { commandLock.current = false; setBusy(false); }
  }, [anchorPreview, toast]);

  const actionReporter = useCallback(async () => {
    if (commandLock.current) return;
    if (reporterPreview) { setReporterPreview(null); return; }
    commandLock.current = true;
    setBusy(true);
    try {
      const defaults = reporterDefaultsSchema.parse(await api<ReporterDefaults>("/api/settings/reporter-defaults"));
      if (!defaults.name) throw new Error("Isi Nama Reporter Lapangan di Pengaturan Default terlebih dahulu.");
      setAnchorPreview(null);
      setReporterPreview(createFieldReporterGraphic(defaults));
      toast("Preview: Reporter Lapangan (Spasi untuk TAKE atau UPDATE; O untuk kembali ke cue)");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Default reporter lapangan gagal dimuat");
    } finally { commandLock.current = false; setBusy(false); }
  }, [reporterPreview, toast]);

  const actionHeadline = useCallback(() => {
    setAnchorPreview(null);
    setReporterPreview(null);
    if (!selectedCue) return;
    const nextComp = { showLocation: false, showKicker: false, showDetail: false };
    setComposition(nextComp);
    void flushSaveDraft(miniDraft, nextComp);
    toast("Preview: Headline Bersih (Spasi untuk TAKE atau UPDATE)");
  }, [selectedCue, miniDraft, flushSaveDraft, toast]);

  // Aksi Quick Action Lokasi (L) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleLocation = useCallback(() => {
    if (anchorPreview) return;
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
        ? "Preview: Lokasi AKTIF (Spasi untuk TAKE atau UPDATE)"
        : "Preview: Lokasi NONAKTIF (Spasi untuk TAKE atau UPDATE)"
    );
  }, [anchorPreview, selectedCue, miniDraft, composition, flushSaveDraft, toast]);

  // Aksi Quick Action Topik (T) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleTopic = useCallback(() => {
    if (anchorPreview) return;
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
        ? "Preview: Topik AKTIF (Spasi untuk TAKE atau UPDATE)"
        : "Preview: Topik NONAKTIF (Spasi untuk TAKE atau UPDATE)"
    );
  }, [anchorPreview, selectedCue, miniDraft, composition, flushSaveDraft, toast]);

  // Aksi Quick Action Detail (D) - Safety: stage di preview, tekan SPASI untuk kirim ke ON AIR
  const actionToggleDetail = useCallback(() => {
    if (anchorPreview) return;
    if (selectedCue?.templateType === "SOT") {
      const headline = selectedItem?.graphics.find((graphic) => graphic.id === sotReturnRef.current?.cueId) ||
        selectedItem?.graphics.find((graphic) => graphic.templateType === "HEADLINE");
      if (!headline?.draftFields.subline?.trim()) { toast("Detail headline belum diisi"); return; }
      restoreCompositionRef.current = { showLocation: headline.draftFields.showLocation === "true",
        showKicker: headline.draftFields.showKicker === "true", showDetail: true };
      sotReturnRef.current = null;
      selectCue(selectedItem!.id, headline.id);
      toast("Preview: Detail headline dipilih (Spasi untuk update)");
      return;
    }
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
        ? "Preview: Detail AKTIF (Spasi untuk TAKE atau UPDATE)"
        : "Preview: Detail NONAKTIF (Spasi untuk TAKE atau UPDATE)"
    );
  }, [anchorPreview, selectedCue, selectedItem, miniDraft, composition, flushSaveDraft, selectCue, toast]);

  // Mouse click blur so Space key always drives live commands without keeping focus on buttons
  useEffect(() => {
    const handleMouseClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          "input, textarea, select, option, label, [contenteditable=true], [role=dialog], details, summary"
        ) ||
        document.activeElement instanceof HTMLSelectElement ||
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.detail >= 1 && document.activeElement instanceof HTMLButtonElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener("click", handleMouseClick);
    return () => window.removeEventListener("click", handleMouseClick);
  }, []);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const isEditing = Boolean(
        target && typeof target.closest === "function" && target.closest("input,textarea,select,[contenteditable=true],[role=dialog]")
      );
      const isInteractive = Boolean(target && typeof target.closest === "function" && target.closest("button,a,summary,[role=button]"));

      const action = liveShortcut(event.key, {
        broadcastTemplate: stagedMaster.broadcastTemplate,
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
          if (stagedMaster.broadcastTemplate === "liputan7") toggleMasterProgram();
          else toggleMasterLogo();
          break;
        case "full":
          if (stagedMaster.broadcastTemplate === "liputan7") toggleMasterLogo();
          else if (stagedMaster.broadcastTemplate === "bcc") toggleMasterLive();
          else toggleMasterTickerLive();
          break;
        case "reporter":
          void actionReporter();
          break;
        case "advance": {
          const isHighlight = selectedCue?.draftFields.headlinePresentation === "bulletin";
          if (isHighlight && selectedItem) {
            const highlightCues = selectedItem.graphics.filter(g => g.draftFields.headlinePresentation === "bulletin");
            const currentIdx = highlightCues.findIndex(g => g.id === selectedCue?.id);
            const nextCue = currentIdx >= 0 ? highlightCues[currentIdx + 1] : undefined;
            if (nextCue) {
              selectCue(selectedItem.id, nextCue.id);
            }
          } else {
            void executePrimary();
          }
          break;
        }
        case "back": {
          const isHighlight = selectedCue?.draftFields.headlinePresentation === "bulletin";
          if (isHighlight && selectedItem) {
            const highlightCues = selectedItem.graphics.filter(g => g.draftFields.headlinePresentation === "bulletin");
            const currentIdx = highlightCues.findIndex(g => g.id === selectedCue?.id);
            const prevCue = currentIdx > 0 ? highlightCues[currentIdx - 1] : undefined;
            if (prevCue) {
              selectCue(selectedItem.id, prevCue.id);
            }
          } else {
            void executeClear();
          }
          break;
        }
        case "ticker":
          toggleMasterTicker();
          break;
        case "headline":
          void actionHeadline();
          break;
        case "news-anchor":
          void actionNewsAnchor();
          break;
        case "location":
          void actionToggleLocation();
          break;
        case "sot":
          navigateSot(0);
          break;
        case "previous-sot":
          if (selectedCue?.templateType === "SOT") navigateSot(-1);
          break;
        case "next-sot":
          if (selectedCue?.templateType === "SOT") navigateSot(1);
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
          void executePrimary();
          break;
        case "update":
          void executeUpdate();
          break;
        case "clear":
          void executeClear();
          break;
        case "clear-all": {
          const hasActive = hasVisibleMasterLayers(master);
          if (hasActive) {
            void onUpdateMaster({
              showLogo: false,
              showTicker: false,
              showLiveBadge: false,
              showProgramLogo: false,
              showWeather: false
            });
            toast("MASTER OUT — Seluruh layer master dimatikan");
          } else {
            void onUpdateMaster({
              showLogo: true,
              showTicker: true,
              showLiveBadge: true,
              showProgramLogo: stagedMaster.broadcastTemplate === "liputan7",
              showWeather: false
            });
            toast("MASTER IN — Layer master diaktifkan");
          }
          break;
        }
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
    toggleMasterProgram,
    toggleMasterTicker,
    stagedMaster.broadcastTemplate,
    toggleMasterTickerLive,
    actionHeadline,
    actionNewsAnchor,
    actionToggleLocation,
    navigateSot,
    selectedCue,
    actionToggleTopic,
    actionToggleDetail,
    executeMaster,
    executePrimary,
    executeUpdate,
    executeClear,
    executeClearAll
  ]);

  // Efektif preview field yang dikirim ke renderer
  const effectivePreviewFields: Record<string, string> | null = reporterPreview ? reporterPreview.draftFields : anchorPreview ? anchorPreview.draftFields : selectedCue
    ? {
        ...(selectedCue.draftFields || {}),
        headline: selectedCue.templateType === "SOT" ? (selectedCue.draftFields.headline || "") : miniDraft.headline,
        name: selectedCue.templateType === "REPORTER" || selectedCue.templateType === "SOT" ? miniDraft.headline : (selectedCue.draftFields?.name || miniDraft.headline),
        role: selectedCue.templateType === "REPORTER" || selectedCue.templateType === "SOT" ? miniDraft.subline : (selectedCue.draftFields?.role || miniDraft.subline),
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
    ? Object.entries({ ...(selectedCue?.templateType === "SOT" || selectedCue?.templateType === "REPORTER"
        ? { name: "Nama", role: "Jabatan", ...(selectedCue.templateType === "SOT" ? { headline: "Judul" } : {}) }
        : { headline: "Judul", subline: "Detail" }), location: "Lokasi", kicker: "Topik",
        showLocation: "Tampilan lokasi", showKicker: "Tampilan topik", showDetail: "Tampilan detail" })
      .filter(([field]) => (effectivePreviewFields[field] || "").trim() !== (live.onAirSnapshot?.[field] || "").trim())
      .map(([, label]) => label)
    : [];
  const detailCue = selectedCue?.templateType === "SOT"
    ? selectedItem?.graphics.find((graphic) => graphic.id === sotReturnRef.current?.cueId) ||
      selectedItem?.graphics.find((graphic) => graphic.templateType === "HEADLINE")
    : null;
  const canShowDetail = selectedCue?.templateType === "SOT"
    ? Boolean(detailCue?.draftFields.subline?.trim()) : Boolean(miniDraft.subline.trim());
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

            return (
              <div
                key={it.id}
                ref={(el) => {
                  itemRefs.current[it.id] = el;
                }}
                className={`sidebar-story-card ${isSelected ? "selected" : ""} ${onAir ? "on-air" : ""}`}
              >
                <button type="button" className="story-select-button" aria-pressed={isSelected} aria-label={`Pilih berita ${idx + 1}: ${it.title}`} onClick={() => {
                  const firstH = it.graphics.find((g) => g.templateType === "HEADLINE") || it.graphics[0];
                  selectCue(it.id, firstH?.id || null);
                }}>
                <div className="story-card-top">
                  <span className="story-number">#{idx + 1}</span>
                  <div className="story-badges">
                    {onAir && <span className="badge-onair pulse">ON AIR</span>}
                    {isSelected && <span className="badge-selected">PREVIEW</span>}
                    {!onAir && idx === nextStoryIndex && <span className="badge-selected">BERIKUTNYA</span>}
                      <span className="badge-metadata">{it.format}</span>
                      {!it.cgRequired && <span className="badge-metadata">TANPA CG</span>}
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
                          selectCue(it.id, g.id);
                        }}
                      >
                        #{gIdx + 1} {g.draftFields.headlinePresentation === "bulletin" ? "HIGHLIGHT" : g.templateType}
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
            <button ref={quickEditButtonRef} type="button" className="shortcut-toggle-btn" disabled={busy || Boolean(anchorPreview || reporterPreview) || !selectedCue} onClick={() => setQuickEditOpen(true)} title="Edit teks cue terpilih tanpa meninggalkan kontrol siaran">
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
            {stagedMaster.broadcastTemplate === "bcc" ? (
              <>
                <button
                  type="button"
                  aria-label="Logo"
                  aria-pressed={stagedMaster.showLogo}
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
                  aria-label="Live Badge"
                  aria-pressed={stagedMaster.showLiveBadge}
                  className={`master-btn ${stagedMaster.showLiveBadge ? "active" : ""} ${stagedMaster.showLiveBadge !== master.showLiveBadge ? "staged-pending" : ""}`}
                  disabled={busy}
                  onClick={toggleMasterLive}
                  title="Siapkan live badge di Preview (2), lalu terapkan MASTER (M)"
                >
                  <span className="btn-kbd">2</span>
                  <span>LIVE · {master.showLiveBadge ? "TAYANG" : "MATI"}</span>
                  <span className={`indicator-dot ${stagedMaster.showLiveBadge ? "on" : ""}`} />
                  {stagedMaster.showLiveBadge !== master.showLiveBadge && <span className="staged-pill">STAGE</span>}
                </button>
                <button
                  type="button"
                  aria-label="Ticker"
                  aria-pressed={stagedMaster.showTicker}
                  className={`master-btn ${stagedMaster.showTicker ? "active" : ""} ${stagedMaster.showTicker !== master.showTicker ? "staged-pending" : ""}`}
                  disabled={busy}
                  onClick={toggleMasterTicker}
                  title="Siapkan ticker di Preview (3), lalu terapkan MASTER (M)"
                >
                  <span className="btn-kbd">3</span>
                  <span>TICKER · {master.showTicker ? "TAYANG" : "MATI"}</span>
                  <span className={`indicator-dot ${stagedMaster.showTicker ? "on" : ""}`} />
                  {stagedMaster.showTicker !== master.showTicker && <span className="staged-pill">STAGE</span>}
                </button>
              </>
            ) : stagedMaster.broadcastTemplate === "liputan7" ? <>
              <button type="button" aria-label="Logo Program" aria-pressed={Boolean(stagedMaster.showProgramLogo)}
                className={`master-btn ${stagedMaster.showProgramLogo ? "active" : ""} ${stagedMaster.showProgramLogo !== master.showProgramLogo ? "staged-pending" : ""}`}
                disabled={busy} onClick={toggleMasterProgram} title="Siapkan logo program dan cuacanya di Preview (1), lalu terapkan MASTER (M)">
                <span className="btn-kbd">1</span><span>LOGO PROGRAM · {master.showProgramLogo ? "TAYANG" : "MATI"}</span>
                <span className={`indicator-dot ${stagedMaster.showProgramLogo ? "on" : ""}`} />
                {stagedMaster.showProgramLogo !== master.showProgramLogo && <span className="staged-pill">STAGE</span>}
              </button>
              <button type="button" aria-label="Logo TV" aria-pressed={stagedMaster.showLogo}
                className={`master-btn ${stagedMaster.showLogo ? "active" : ""} ${stagedMaster.showLogo !== master.showLogo ? "staged-pending" : ""}`}
                disabled={busy} onClick={toggleMasterLogo} title="Siapkan logo TV di Preview (2), lalu terapkan MASTER (M)">
                <span className="btn-kbd">2</span><span>LOGO TV · {master.showLogo ? "TAYANG" : "MATI"}</span>
                <span className={`indicator-dot ${stagedMaster.showLogo ? "on" : ""}`} />
                {stagedMaster.showLogo !== master.showLogo && <span className="staged-pill">STAGE</span>}
              </button>
              <button type="button" aria-label="Ticker" aria-pressed={stagedMaster.showTicker}
                className={`master-btn ${stagedMaster.showTicker ? "active" : ""} ${stagedMaster.showTicker !== master.showTicker ? "staged-pending" : ""}`}
                disabled={busy} onClick={toggleMasterTicker} title="Siapkan ticker dan jam di Preview (3), lalu terapkan MASTER (M)">
                <span className="btn-kbd">3</span><span>TICKER · {master.showTicker ? "TAYANG" : "MATI"}</span>
                <span className={`indicator-dot ${stagedMaster.showTicker ? "on" : ""}`} />
                {stagedMaster.showTicker !== master.showTicker && <span className="staged-pill">STAGE</span>}
              </button>
            </> : <>
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
            </>}
          </div>
        </div>

        <div className="production-color-theme">
          <BroadcastTemplatePicker value={stagedMaster.broadcastTemplate} disabled={busy} onChange={value => {
            isUserStagingMasterRef.current = true;
            setStagedMaster(previous => selectBroadcastTemplate(previous, value));
          }} />
          {stagedMaster.broadcastTemplate !== "liputan7" && <BroadcastColorThemePicker compact value={stagedMaster.colorTheme} disabled={busy} onChange={(colorTheme) => {
            isUserStagingMasterRef.current = true;
            setStagedMaster((previous) => selectBroadcastColorTheme(previous, colorTheme));
          }} />}
          <small>{isMasterChanged ? "Perubahan di Preview · terapkan dengan M" : `Siaran: ${master.broadcastTemplate === "liputan7" ? broadcastTemplates.liputan7.label : getBroadcastColorTheme(master.colorTheme).label}`}</small>
        </div>
        <details className="live-ticker-settings">
          <summary>{stagedMaster.broadcastTemplate === "liputan7"
            ? `Master · Program ${master.showProgramLogo ? "aktif" : "mati"} · TV ${master.showLogo ? "aktif" : "mati"} · Ticker ${master.showTicker ? "aktif" : "mati"}`
            : stagedMaster.broadcastTemplate === "bcc"
            ? `Ticker & Master BCC · Logo ${master.showLogo ? "aktif" : "mati"} · Ticker ${master.showTicker ? "aktif" : "mati"} · Jam ${master.showLiveBadge ? "aktif" : "mati"}`
            : `Ticker & master · ${master.showLogo ? "Logo aktif" : "Logo mati"} · ${master.showTicker ? "Ticker aktif" : "Ticker mati"} · ${master.showLiveBadge ? "Live aktif" : "Live mati"}`}</summary>
          <Liputan7Settings master={stagedMaster} disabled={busy} onBusyChange={value => { commandLock.current = value; setBusy(value); }} onChange={next => { isUserStagingMasterRef.current = true; setStagedMaster(next); }} />
          {stagedMaster.broadcastTemplate === "bcc" ? (
            <>
              <label>Ticker Global BCC News
                <textarea
                  rows={3}
                  value={stagedMaster.tickerText ?? ""}
                  placeholder="INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"
                  disabled={busy}
                  onChange={(e) => {
                    isUserStagingMasterRef.current = true;
                    setStagedMaster(prev => ({ ...prev, tickerText: e.target.value }));
                  }}
                />
              </label>
              <small>Ticker BCC bersifat global dan tampil di seluruh tayangan tanpa terikat jadwal rundown.</small>
              <label>Kecepatan Ticker
                <select
                  value={stagedMaster.tickerSpeed ?? 85}
                  disabled={busy}
                  onChange={(e) => {
                    isUserStagingMasterRef.current = true;
                    setStagedMaster(prev => ({ ...prev, tickerSpeed: Number(e.target.value) }));
                  }}
                >
                  <option value={65}>Lambat (65 px/detik)</option>
                  <option value={85}>Normal (85 px/detik)</option>
                  <option value={105}>Cepat (105 px/detik)</option>
                </select>
              </label>
              <button type="button" disabled={busy || !isMasterChanged} onClick={() => executeMaster()}>TERAPKAN MASTER · M</button>
              <button type="button" disabled={busy || !stagedMaster.showTicker} onClick={() => executeMaster(true)}>TICKER SEGERA</button>
              <small>TERAPKAN MASTER menerapkan ticker global BCC. Ticker segera mereset guliran dan langsung menampilkan teks baru.</small>
            </>
          ) : (
            <>
              <label>Ticker rundown · {rundown?.title || "Belum dipilih"}
                <textarea rows={3} value={rundown?.ticker?.text ?? ""} readOnly />
              </label>
              <small>{rundown?.broadcastSchedule ? `Tayang ${rundown.broadcastSchedule.date} ${rundown.broadcastSchedule.time} ${rundown.broadcastSchedule.timezone}` : "Jadwal belum diisi"} · Edit jadwal dan materi ticker di Rundown & CG.</small>
              <label>Kecepatan
                <input readOnly value={`${rundownTickerSpeed} px/detik · ${rundown?.ticker?.speedMode === "manual" ? "Manual" : "Otomatis seimbang"}`} />
              </label>
              <button type="button" disabled={busy || !isMasterChanged} onClick={() => executeMaster()}>TERAPKAN MASTER · M</button>
              <button type="button" disabled={busy || !stagedMaster.showTicker || !rundown} onClick={() => executeMaster(true)}>TICKER SEGERA</button>
              <small>TERAPKAN MASTER memakai ticker rundown yang dipilih. Ticker segera menerapkannya dan mereset guliran. Memilih atau menyunting rundown tidak mengubah Program.</small>
            </>
          )}
        </details>

        {/* Monitor Pratinjau Dual Deck (Standby Stage Preview + Mini Live Monitor) */}
        <div className="production-preview-deck">
          {/* 1. MONITOR UTAMA: STANDBY STAGE PREVIEW */}
          <div className="preview-screen-wrapper">
            <div className="preview-meta-badge">
              <span className="stage-tag">PREVIEW</span>
              <span className="cue-name">
                {reporterPreview ? "REPORTER LAPANGAN · DEFAULT" : anchorPreview ? "NEWS ANCHOR · DEFAULT" : selectedItem ? `#${items.indexOf(selectedItem) + 1} ${selectedItem.title}` : "TIDAK ADA BERITA TERPILIH"}
              </span>
              <span className="cue-type">{previewCue?.templateType || "OFF"}</span>
            </div>

            <BroadcastPreviewBox
              graphic={previewCue}
              fields={effectivePreviewFields}
              master={stagedMaster.broadcastTemplate === "bcc"
                ? { ...stagedMaster, tickerText: stagedMaster.tickerText?.trim() || master.tickerText?.trim() || "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS", tickerSpeed: stagedMaster.tickerSpeed ?? master.tickerSpeed ?? 85 }
                : { ...stagedMaster, tickerText: rundown?.ticker?.text ?? "", tickerSpeed: rundownTickerSpeed, tickerRundownId: rundown?.id ?? null }}
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
                {onAirTitle || (hasVisibleMasterLayers(master) ? "MASTER AKTIF" : "OUTPUT KOSONG")}
              </span>
              <span className={`live-mini-status ${live.onAirGraphicId ? "" : "off"}`}>
                STATUS APLIKASI
              </span>
            </div>
          </aside>
        </div>

        <div className="primary-actions-deck" aria-label="Perintah siaran">
          <button type="button" className={`action-btn ${canUpdate ? "btn-update" : "btn-take"}`} disabled={busy || !previewCue} onClick={executePrimary}>
            <span className="btn-inner">{canUpdate ? <RefreshCw size={16} /> : <Play size={16} />}<span className="btn-title">{canUpdate ? "UPDATE" : "TAKE"}</span></span><kbd>SPACE / ENTER</kbd>
          </button>
          <button type="button" className="action-btn btn-clear" disabled={busy || !live.onAirGraphicId} onClick={executeClear}>
            <span className="btn-inner"><X size={16} /><span className="btn-title">OUT</span></span><kbd>ESC / C</kbd>
          </button>
        </div>
        <div className="live-change-summary" role="status">
          {busy ? "Memproses…" : reporterPreview ? `Reporter Lapangan: ${reporterPreview.draftFields.name}. Spasi untuk ${canUpdate ? "UPDATE" : "TAKE"}; O untuk kembali ke cue.` : anchorPreview ? `News Anchor: ${anchorPreview.draftFields.name}. Spasi untuk ${canUpdate ? "UPDATE" : "TAKE"}; P untuk kembali ke cue.` : selectedCue ? (canUpdate ? "Tekan Spasi untuk memperbarui Program." : "Cue di Preview. Tekan Spasi untuk menayangkan.") : selectedItem ? (selectedItem.cgRequired ? "Item ini memerlukan CG, tetapi belum punya cue. Tambahkan di Rundown & CG." : "Item ini tanpa CG lower third. Pilih item lain untuk menyiapkan cue.") : "Pilih cue dari rundown atau tekan P/O untuk default."}
          {isMasterChanged && " Perubahan master belum diterapkan (M)."}
          {isSelectedOnAir && <small>{pendingChanges.length ? `Belum diterapkan: ${pendingChanges.join(", ")}.` : "Isi Preview sama dengan snapshot Program."}</small>}
          <small>{live.overlayClientsCount} klien output terhubung · Program ini adalah monitor internal NewsCG, bukan pembacaan switcher.</small>
        </div>

        {/* Quick Actions (H, K, L, T, D) - Menyiapkan cue Preview sebelum TAKE / UPDATE */}
        <div className="quick-actions-bar">
          <div className="quick-action-btns">
            <button type="button" className={`qa-btn ${anchorPreview ? "active" : ""}`} disabled={busy}
              onClick={() => void actionNewsAnchor()} title="P: siapkan news anchor dari default; Spasi untuk TAKE / UPDATE. P lagi kembali ke cue.">
              <span className="qa-kbd">P</span><span className="qa-text">NEWS ANCHOR</span>
            </button>
            <button type="button" className={`qa-btn ${reporterPreview ? "active" : ""}`} disabled={busy}
              onClick={() => void actionReporter()} title="O: siapkan reporter lapangan dari default; Spasi untuk TAKE / UPDATE. O lagi kembali ke cue.">
              <span className="qa-kbd">O</span><span className="qa-text">REPORTER LAPANGAN</span>
            </button>
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
              disabled={busy || Boolean(anchorPreview || reporterPreview) || !miniDraft.location.trim()}
              onClick={actionToggleLocation}
              title="Toggle Lokasi di preview (Hotkey: L, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">L</span>
              <span className="qa-text">LOKASI</span>
              <span className={`qa-dot ${composition.showLocation ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${selectedCue?.templateType === "SOT" ? "active" : ""} ${!selectedItem?.graphics.some((graphic) => graphic.templateType === "SOT") ? "disabled" : ""}`}
              disabled={busy || !selectedItem?.graphics.some((graphic) => graphic.templateType === "SOT")}
              onClick={() => navigateSot(0)}
              title="K: buka/tutup LT SOT; panah kiri/kanan: pilih narasumber"
            >
              <span className="qa-kbd">K</span>
              <span className="qa-text">SOT NARASUMBER</span>
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showKicker ? "active" : ""} ${!miniDraft.kicker.trim() ? "disabled" : ""}`}
              disabled={busy || Boolean(anchorPreview || reporterPreview) || !miniDraft.kicker.trim()}
              onClick={actionToggleTopic}
              title="Toggle Topik di preview (Hotkey: T, lalu TAKE atau UPDATE)"
            >
              <span className="qa-kbd">T</span>
              <span className="qa-text">TOPIK</span>
              <span className={`qa-dot ${composition.showKicker ? "on" : ""}`} />
            </button>

            <button
              type="button"
              className={`qa-btn ${composition.showDetail ? "active" : ""} ${!canShowDetail ? "disabled" : ""}`}
              disabled={busy || Boolean(anchorPreview || reporterPreview) || !canShowDetail}
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
          <button type="button" disabled={busy} onClick={() => executeClearAll(false)}>ALL OUT · Animasi <kbd>0</kbd></button>
          <button type="button" className="emergency-clear" disabled={busy} onClick={() => executeClearAll(true)}><Trash2 size={14} /> CLEAR ALL · Darurat</button>
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
                {selectedCue?.templateType === "SOT"
                  ? "Nama Narasumber"
                  : selectedCue?.templateType === "REPORTER"
                  ? "Nama Pembawa Berita / Reporter"
                  : selectedCue?.templateType === "LOCATION"
                  ? "Teks Lokasi"
                  : "Headline Utama"}
              </label>
              <input
                type="text"
                autoFocus
                placeholder={
                  selectedCue?.templateType === "SOT"
                    ? "Masukkan nama narasumber..."
                    : selectedCue?.templateType === "REPORTER"
                    ? "Masukkan nama reporter..."
                    : selectedCue?.templateType === "LOCATION"
                    ? "Masukkan nama lokasi siaran..."
                    : selectedCue
                    ? "Masukkan judul berita utama..."
                    : "Pilih berita dari daftar untuk mengedit..."
                }
                maxLength={getGraphicFieldLimit(selectedCue?.templateType || "HEADLINE",
                  selectedCue?.templateType === "REPORTER" || selectedCue?.templateType === "SOT" ? "name"
                    : selectedCue?.templateType === "LOCATION" ? "location" : "headline")}
                disabled={busy || !selectedCue}
                value={miniDraft.headline}
                onChange={(e) => handleMiniDraftChange("headline", e.target.value)}
              />
            </div>

            <div className="mini-input-group">
              <label>Lokasi Siaran · L</label>
              <input
                type="text"
                placeholder={selectedCue ? "Contoh: Jakarta Pusat" : "-"}
                maxLength={getGraphicFieldLimit(selectedCue?.templateType || "HEADLINE", "location")}
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
                maxLength={getGraphicFieldLimit(selectedCue?.templateType || "HEADLINE", "kicker")}
                disabled={busy || !selectedCue || selectedCue?.templateType === "REPORTER" || selectedCue?.templateType === "SOT" || selectedCue?.templateType === "LOCATION"}
                value={miniDraft.kicker}
                onChange={(e) => handleMiniDraftChange("kicker", e.target.value)}
              />
            </div>

            <div className="mini-input-group span-2">
              <label>
                {selectedCue?.templateType === "SOT"
                  ? "Jabatan / Institusi Narasumber"
                  : selectedCue?.templateType === "REPORTER"
                  ? "Jabatan / Role"
                  : "Detail / Subline Keterangan"}
              </label>
              <input
                type="text"
                placeholder={
                  selectedCue?.templateType === "SOT"
                    ? "Contoh: Kasie Ops Basarnas Banten"
                    : selectedCue?.templateType === "REPORTER"
                    ? "Contoh: REPORTER, PRESENTER..."
                    : selectedCue
                    ? "Penjelasan ringkas poin berita..."
                    : "-"
                }
                maxLength={getGraphicFieldLimit(selectedCue?.templateType || "HEADLINE",
                  selectedCue?.templateType === "REPORTER" || selectedCue?.templateType === "SOT" ? "role" : "subline")}
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
