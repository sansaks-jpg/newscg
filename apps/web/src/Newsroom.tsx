import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableGraphic, GraphicItem, HeadlineDefaults, LiveState, MasterOverlayState, Rundown, RundownItem, TemplateType } from "@newscg/shared";
import { emptyRundownTicker, getGraphicFieldLimit, getRundownTickerSpeed, headlineBulletinPreset, headlineDefaultsSchema, headlinePresentationSchema, normalizeHeadlineTopicFields, rundownInputSchema, rundownItemInputSchema } from "@newscg/shared";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { api, mutate } from "./api";
import { BroadcastTemplateInfo } from "./VisualTemplatePicker";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { RundownBroadcastEditor } from "./RundownBroadcastEditor";
import { ShimmerButton } from "./MagicUi";

type Props = {
  rundown?: Rundown;
  rundowns: Rundown[];
  onRundown: (id: string) => void;
  reload: () => Promise<void>;
  toast: (s: string) => void;
  master: MasterOverlayState;
  live: LiveState;
  onSetup: () => void;
  onPrepare?: () => void;
  onSendToPreview?: () => void;
};

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
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

function buildAiAgentPrompt(apiBaseUrl: string): string {
  const cleanBase = (apiBaseUrl || "http://localhost:3001").replace(/\/+$/, "");
  return `Kamu adalah Asisten Produser Siaran Berita & Operator CG untuk NewsCG.
Tugas kamu adalah membaca berkas/naskah rundown siaran yang saya berikan (bisa berupa file Excel, PDF, naskah Word, foto/screenshot jadwal siaran fisik di studio, atau teks chat naskah berita), membedah struktur beritanya, lalu membuat paket rundown lengkap ke server NewsCG melalui REST API.

--- PANDUAN KONEKSI & DOKUMENTASI API ---
1. Base URL Server NewsCG: ${cleanBase}
2. Kamu BISA dan HARUS menginspeksi dokumentasi API resmi NewsCG terlebih dahulu melalui terminal / HTTP (curl):
   - GET ${cleanBase}/api/agent (Service Discovery & ringkasan operasi)
   - GET ${cleanBase}/api/agent/guide.md (Panduan lengkap REST API)
   - GET ${cleanBase}/api/agent/rundown-guide.md (Panduan konversi rundown file ke schema)
   - GET ${cleanBase}/api/agent/cg-guide.md (Panduan jenis CG & varian visual)

--- ATURAN STRUKTUR PAYLOAD (POST /api/rundowns) ---
Kirimkan permintaan HTTP POST dengan header "Content-Type: application/json; charset=utf-8" berisi struktur JSON:
{
  "programName": "NAMA PROGRAM (mis. BCC NEWS UTAMA / SEPUTAR INDONESIA)",
  "title": "EDISI SIARAN (mis. Edisi Siang - 29 Oktober 2026)",
  "broadcastSchedule": {
    "date": "YYYY-MM-DD",
    "time": "HH:mm",
    "timezone": "WIB" // atau "WITA" / "WIT"
  },
  "ticker": {
    "text": "BERITA BERJALAN 1 • BERITA BERJALAN 2 • BERITA BERJALAN 3",
    "forDate": "YYYY-MM-DD",
    "speedMode": "auto",
    "sources": []
  },
  "items": [
    {
      "slug": "HL-01",
      "title": "Judul Berita 1",
      "format": "PKG", // format: PKG / LIVE / VTR / RDR / SOT / TEL
      "cgRequired": true,
      "estimatedDurationSeconds": 120,
      "sortOrder": 0,
      "graphics": [
        {
          "templateType": "HEADLINE", // jenis: HEADLINE / SOT / REPORTER / BREAKING / LOCATION
          "sortOrder": 0,
          "draftFields": {
            "headline": "JUDUL CG HURUF BESAR",
            "subline": "Penjelasan ringkas / lead berita",
            "kicker": "TOPIK / KICKER",
            "showKicker": "true",
            "location": "JAKARTA",
            "showLocation": "true",
            "showDetail": "true"
          }
        }
      ]
    }
  ]
}

--- PANDUAN CG / LOWER THIRD YANG DIDUKUNG ---
- HEADLINE: Berisi 'headline', 'subline', 'kicker' (topik tab), 'showKicker': "true", 'location', 'showLocation': "true". (Jika pembuka bulletin / highlight, gunakan kicker: "HIGHLIGHT" dan showKicker: "true").
- SOT: Berisi 'headline' (topik kutipan), 'name' (nama narasumber), 'role' (jabatan/institusi), 'location', 'showLocation': "true".
- REPORTER: Berisi 'name' (nama reporter), 'role' (default: "Reporter Lapangan"), 'location', 'showLocation': "true".
- BREAKING: Berisi 'headline' berita darurat berurgensi tinggi.
- LOCATION: Berisi 'location' penanda lokasi siaran pojok kiri atas.

--- LANGKAH EKSEKUSI ---
1. Eksekusi perintah curl untuk membuat rundown:
   curl -X POST ${cleanBase}/api/rundowns \\
     -H "Content-Type: application/json; charset=utf-8" \\
     -d '<JSON_PAYLOAD>'
2. Lakukan verifikasi readback:
   curl ${cleanBase}/api/rundowns/<RUNDOWN_ID>
3. Beritahu pengguna bahwa rundown telah berhasil dibuat beserta ID dan ringkasan daftar beritanya. Pengguna dapat langsung melihat, menyunting, mengubah urutan, atau menghapus materi secara bebas di dashboard web NewsCG.

--- MATERI RUNDOWN DARI SAYA ---
[LAMPIRKAN / TEMPELKAN BERKAS RUNDOWN (EXCEL/PDF/WORD/FOTO/TEKS) DI BAWAH INI]`;
}

// =====================================================================
// PANEL PERSIAPAN (PREPARATION / RUNDOWN MANAGEMENT)
// =====================================================================
export function Preparation({
  rundown,
  rundowns,
  onRundown,
  reload,
  toast,
  master,
  live,
  onSendToPreview
}: Props) {
  const [editing, setEditing] = useState<RundownItem | "new" | null>(null);
  useEffect(() => setEditing(null), [rundown?.id]);
  const editingTrigger = useRef<HTMLButtonElement | null>(null);
  const closeEditor = () => {
    setEditing(null);
    requestAnimationFrame(() => editingTrigger.current?.focus());
  };
  const [pending, setPending] = useState(false);
  const creatingRundown = useRef(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [renameTarget, setRenameTarget] = useState<Rundown | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);

  const items = rundown?.items || [];
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(() => items[0]?.id || null);

  useEffect(() => {
    if (!items.length) {
      setSelectedStoryId(null);
      return;
    }
    if (!selectedStoryId || !items.some((i) => i.id === selectedStoryId)) {
      setSelectedStoryId(items[0]?.id || null);
    }
  }, [rundown?.id, items, selectedStoryId]);

  const selectedStory = useMemo(
    () => items.find((i) => i.id === selectedStoryId) || items[0] || null,
    [items, selectedStoryId]
  );

  const selectedStoryIndex = selectedStory ? items.findIndex((i) => i.id === selectedStory.id) : -1;
  const primaryCue: GraphicItem | null = useMemo(() => {
    if (!selectedStory) return null;
    return (
      selectedStory.graphics.find((g) => g.templateType === "HEADLINE") ||
      selectedStory.graphics[0] ||
      null
    );
  }, [selectedStory]);

  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [inspectorSaveState, setInspectorSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const sotCues = useMemo(
    () => selectedStory?.graphics.filter((g) => g.templateType === "SOT") || [],
    [selectedStory]
  );
  const [selectedSotIndex, setSelectedSotIndex] = useState(0);
  useEffect(() => {
    setSelectedSotIndex(0);
    setSelectedCueId(primaryCue?.id || selectedStory?.graphics[0]?.id || null);
    setInspectorSaveState("idle");
  }, [selectedStory?.id]);

  const activeInspectorCue: GraphicItem | null = useMemo(() => {
    if (!selectedStory) return null;
    if (selectedCueId) {
      const found = selectedStory.graphics.find((g) => g.id === selectedCueId);
      if (found) return found;
    }
    return primaryCue;
  }, [selectedStory, selectedCueId, primaryCue]);

  // Inline inspector state for selectedStory
  const [inspHeadline, setInspHeadline] = useState("");
  const [inspDetail, setInspDetail] = useState("");
  const [inspLocation, setInspLocation] = useState("");
  const [inspKicker, setInspKicker] = useState("");
  const [inspSotName, setInspSotName] = useState("");
  const [inspSotRole, setInspSotRole] = useState("");
  const inspectorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedStory) {
      setInspHeadline("");
      setInspDetail("");
      setInspLocation("");
      setInspKicker("");
      setInspSotName("");
      setInspSotRole("");
      return;
    }
    const f = primaryCue ? normalizeHeadlineTopicFields(primaryCue.templateType, primaryCue.draftFields) : {};
    setInspHeadline(f.headline || selectedStory.title || "");
    setInspDetail(f.subline || "");
    setInspLocation(f.location || "");
    setInspKicker(f.kicker || "");
  }, [selectedStory?.id, primaryCue?.id, primaryCue?.draftFields]);

  const currentSotCue = sotCues[selectedSotIndex] || null;
  useEffect(() => {
    if (currentSotCue) {
      setInspSotName(currentSotCue.draftFields.name || "");
      setInspSotRole(currentSotCue.draftFields.role || "");
    } else {
      setInspSotName("");
      setInspSotRole("");
    }
  }, [currentSotCue?.id, currentSotCue?.draftFields]);

  const saveInspectorFields = async (nextH: string, nextD: string, nextL: string, nextK?: string) => {
    if (!selectedStory || !primaryCue) return;
    setInspectorSaveState("saving");
    try {
      const kickerVal = nextK !== undefined ? nextK : inspKicker;
      const nextFields: Record<string, string> = {
        ...primaryCue.draftFields,
        headline: nextH,
        subline: nextD,
        location: nextL,
        kicker: kickerVal,
        showLocation: nextL.trim() ? "true" : "false",
        showDetail: nextD.trim() ? "true" : "false",
        showKicker: kickerVal.trim() ? "true" : "false",
        layoutStyle: nextD.trim() ? "sub" : "single"
      };
      await mutate(`/api/graphics/${primaryCue.id}`, "PATCH", { draftFields: nextFields });
      if (nextH.trim() && nextH.trim() !== selectedStory.title) {
        await mutate(`/api/items/${selectedStory.id}`, "PATCH", { title: nextH.trim() });
      }
      await reload();
      setInspectorSaveState("saved");
    } catch (e: any) {
      setInspectorSaveState("idle");
      toast(e.message || "Gagal menyimpan perubahan story");
    }
  };

  const handleInspectorInput = (field: "headline" | "detail" | "location" | "kicker", val: string) => {
    const nextH = field === "headline" ? val : inspHeadline;
    const nextD = field === "detail" ? val : inspDetail;
    const nextL = field === "location" ? val : inspLocation;
    const nextK = field === "kicker" ? val : inspKicker;
    if (field === "headline") setInspHeadline(val);
    if (field === "detail") setInspDetail(val);
    if (field === "location") setInspLocation(val);
    if (field === "kicker") setInspKicker(val);
    if (primaryCue) setSelectedCueId(primaryCue.id);
    setInspectorSaveState("saving");
    if (inspectorTimerRef.current) clearTimeout(inspectorTimerRef.current);
    inspectorTimerRef.current = setTimeout(() => {
      void saveInspectorFields(nextH, nextD, nextL, nextK);
    }, 450);
  };

  const handleSotInlineInput = (field: "name" | "role", val: string) => {
    if (!currentSotCue) return;
    const nextName = field === "name" ? val : inspSotName;
    const nextRole = field === "role" ? val : inspSotRole;
    if (field === "name") setInspSotName(val);
    if (field === "role") setInspSotRole(val);
    setSelectedCueId(currentSotCue.id);
    setInspectorSaveState("saving");
    if (inspectorTimerRef.current) clearTimeout(inspectorTimerRef.current);
    inspectorTimerRef.current = setTimeout(async () => {
      try {
        await mutate(`/api/graphics/${currentSotCue.id}`, "PATCH", {
          draftFields: {
            ...currentSotCue.draftFields,
            headline: inspHeadline || selectedStory?.title || "",
            name: nextName,
            role: nextRole
          }
        });
        await reload();
        setInspectorSaveState("saved");
      } catch (e: any) {
        setInspectorSaveState("idle");
        toast(e.message || "Gagal menyimpan narasumber SOT");
      }
    }, 450);
  };

  const addQuickSotToSelectedStory = async () => {
    if (!rundown || !selectedStory || pending) return;
    setPending(true);
    try {
      const nextGraphics = [
        ...selectedStory.graphics.map((g, i) => ({
          id: g.id,
          templateType: g.templateType,
          sortOrder: i,
          draftFields: g.draftFields
        })),
        {
          templateType: "SOT" as const,
          sortOrder: selectedStory.graphics.length,
          draftFields: {
            headline: inspHeadline || selectedStory.title || "JUDUL BERITA",
            name: "NAMA NARASUMBER",
            role: "Jabatan / Institusi",
            location: inspLocation || "",
            contentMode: "sot",
            showLocation: inspLocation ? "true" : "false",
            visualTemplate: "cnn"
          }
        }
      ];
      const updated = await mutate<RundownItem>(`/api/rundowns/${rundown.id}/story`, "PUT", {
        itemId: selectedStory.id,
        title: selectedStory.title,
        slug: selectedStory.slug,
        format: selectedStory.format,
        cgRequired: true,
        estimatedDurationSeconds: selectedStory.estimatedDurationSeconds,
        sortOrder: selectedStory.sortOrder,
        graphics: nextGraphics
      });
      await reload();
      const newSots = updated?.graphics?.filter((g) => g.templateType === "SOT") || [];
      if (newSots.length > 0) {
        setSelectedSotIndex(newSots.length - 1);
        setSelectedCueId(newSots[newSots.length - 1]!.id);
      }
      toast("Slot Narasumber (SOT) ditambahkan ke story ini");
    } catch (e: any) {
      toast(e.message || "Gagal menambahkan narasumber");
    } finally {
      setPending(false);
    }
  };

  const removeQuickSotFromSelectedStory = async (sotCueId: string) => {
    if (!rundown || !selectedStory || pending) return;
    setPending(true);
    try {
      const nextGraphics = selectedStory.graphics
        .filter((g) => g.id !== sotCueId)
        .map((g, i) => ({
          id: g.id,
          templateType: g.templateType,
          sortOrder: i,
          draftFields: g.draftFields
        }));
      await mutate<RundownItem>(`/api/rundowns/${rundown.id}/story`, "PUT", {
        itemId: selectedStory.id,
        title: selectedStory.title,
        slug: selectedStory.slug,
        format: selectedStory.format,
        cgRequired: selectedStory.cgRequired,
        estimatedDurationSeconds: selectedStory.estimatedDurationSeconds,
        sortOrder: selectedStory.sortOrder,
        graphics: nextGraphics
      });
      await reload();
      setSelectedSotIndex(0);
      setSelectedCueId(primaryCue?.id || null);
      toast("Narasumber (SOT) dihapus");
    } catch (e: any) {
      toast(e.message || "Gagal menghapus narasumber");
    } finally {
      setPending(false);
    }
  };

  const setInspectorMode = async (modeType: "headline" | "highlight" | "bulletin") => {
    if (!selectedStory || !primaryCue) return;
    try {
      const nextFields: Record<string, string> =
        modeType === "headline"
          ? {
              ...primaryCue.draftFields,
              headlinePresentation: "story",
              kicker: primaryCue.draftFields.kicker === "HIGHLIGHT" || primaryCue.draftFields.kicker === "BULLETIN" ? "" : (primaryCue.draftFields.kicker || ""),
              showKicker: "false"
            }
          : modeType === "highlight"
          ? {
              ...primaryCue.draftFields,
              ...headlineBulletinPreset,
              kicker: "HIGHLIGHT",
              showKicker: "true"
            }
          : {
              ...primaryCue.draftFields,
              ...headlineBulletinPreset,
              kicker: "BULLETIN",
              showKicker: "true"
            };
      await mutate(`/api/graphics/${primaryCue.id}`, "PATCH", { draftFields: nextFields });
      await reload();
      toast(`Tipe story diubah ke ${modeType === "headline" ? "Headline" : modeType === "highlight" ? "Highlight" : "Bulletin"}`);
    } catch (e: any) {
      toast(e.message || "Gagal mengubah tipe story");
    }
  };

  async function duplicateSelectedStory() {
    if (!rundown || !selectedStory || pending) return;
    setPending(true);
    try {
      const created = await mutate<RundownItem>(`/api/rundowns/${rundown.id}/story`, "PUT", {
        title: `${selectedStory.title} (Salinan)`,
        slug: `${selectedStory.slug}-COPY`.slice(0, 24),
        format: selectedStory.format,
        cgRequired: selectedStory.cgRequired,
        estimatedDurationSeconds: selectedStory.estimatedDurationSeconds,
        sortOrder: rundown.items.length,
        graphics: selectedStory.graphics.map((g, idx) => ({
          templateType: g.templateType,
          sortOrder: idx,
          draftFields: { ...g.draftFields }
        }))
      });
      await reload();
      if (created?.id) setSelectedStoryId(created.id);
      toast(`Story "${selectedStory.title}" berhasil diduplikat`);
    } catch (e: any) {
      toast(e.message || "Gagal menduplikat story");
    } finally {
      setPending(false);
    }
  }

  function sendStoryToPreview() {
    if (!rundown || !selectedStory) return;
    sessionStorage.setItem(`simple-cued-story-${rundown.id}`, selectedStory.id);
    const targetCueId = activeInspectorCue?.id || primaryCue?.id;
    if (targetCueId) {
      sessionStorage.setItem(`simple-cued-cue-${rundown.id}`, targetCueId);
    }
    toast(`Story #${selectedStoryIndex + 1} disiapkan di Kontrol Preview`);
    onSendToPreview?.();
  }

  // Keyboard shortcuts in Rundown tab: `/`, `N`, `Ctrl+D`, `PgUp`, `PgDn`
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inInput = Boolean(
        target && typeof target.closest === "function" && target.closest("input,textarea,select,[contenteditable=true],[role=dialog]")
      );
      if (inInput || editing || renameTarget || showAiModal || showExcelModal) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if ((event.key === "n" || event.key === "N") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (rundown) {
          event.preventDefault();
          setEditing("new");
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelectedStory();
      } else if (event.key === "PageDown" && sotCues.length > 0) {
        event.preventDefault();
        setSelectedSotIndex((prev) => Math.min(sotCues.length - 1, prev + 1));
      } else if (event.key === "PageUp" && sotCues.length > 0) {
        event.preventDefault();
        setSelectedSotIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, renameTarget, showAiModal, showExcelModal, rundown, selectedStory, sotCues.length]);

  async function move(item: RundownItem, offset: number) {
    if (!rundown || pending) return;
    const list = [...rundown.items];
    const index = list.findIndex((i) => i.id === item.id);
    const other = list[index + offset];
    if (!other) return;
    setPending(true);
    try {
      list[index] = other;
      list[index + offset] = item;
      const itemIds = list.map((row) => row.id);
      await mutate(`/api/rundowns/${rundown.id}/reorder`, "POST", { itemIds });
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function removeItem(item: RundownItem) {
    if (!rundown || pending) return;
    const confirmed = window.confirm(
      `Hapus berita "${item.title}"?\nSemua materi grafis pada berita ini juga akan dihapus.`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      await mutate(`/api/items/${item.id}`, "DELETE");
      await reload();
      toast(`Berita "${item.title}" berhasil dihapus`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function deleteCurrentRundown() {
    if (!rundown || pending) return;
    const confirmed = window.confirm(
      `Hapus rundown "${rundown.programName} · ${rundown.title}" beserta seluruh berita di dalamnya?\n\nTindakan ini permanen dan tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setPending(true);
    try {
      await mutate(`/api/rundowns/${rundown.id}`, "DELETE");
      await reload();
      const remaining = rundowns.filter((r) => r.id !== rundown.id);
      if (remaining[0]) {
        onRundown(remaining[0].id);
      }
      toast(`Rundown "${rundown.title}" berhasil dihapus`);
    } catch (e: any) {
      toast(e.message || "Gagal menghapus rundown");
    } finally {
      setPending(false);
    }
  }

  const importFileInputRef = useRef<HTMLInputElement>(null);

  async function exportCurrentRundown() {
    if (!rundown) return;
    try {
      const data = await api<any>(`/api/rundowns/${rundown.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const safeTitle = `${rundown.programName}_${rundown.title}`.replace(/[/\\?%*:|"<>]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle || rundown.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(`Rundown "${rundown.title}" berhasil diekspor`);
    } catch (e: any) {
      toast(e.message || "Gagal mengekspor rundown");
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setPending(true);
    try {
      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Berkas bukan format JSON yang valid");
      }
      const imported = await mutate<Rundown>("/api/rundowns/import", "POST", json);
      await reload();
      onRundown(imported.id);
      toast(`Rundown "${imported.title}" berhasil diimpor`);
    } catch (e: any) {
      toast(e.message || "Gagal mengimpor rundown");
    } finally {
      setPending(false);
    }
  }

  const filteredItems = items.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.slug.toLowerCase().includes(search.toLowerCase())
  );

  const rundownSpeed = useMemo(
    () => getRundownTickerSpeed(rundown?.ticker ?? emptyRundownTicker),
    [rundown?.ticker]
  );

  const tickerPreviewText =
    rundown?.ticker?.text?.trim() ||
    items.map((i) => i.title.toUpperCase()).join("  •  ") ||
    "BELUM ADA TEKS TICKER RUNDOWN";

  const isStoryOnAir = (story: RundownItem) =>
    Boolean(live.onAirGraphicId && story.graphics.some((g) => g.id === live.onAirGraphicId));

  const inspectorPresentation =
    primaryCue?.draftFields.headlinePresentation === "bulletin"
      ? primaryCue.draftFields.kicker === "BULLETIN"
        ? "bulletin"
        : "highlight"
      : "headline";

  return (
    <section className="prep-container">
      {/* Main 2-Column Workspace Grid matching Rundown.dc.html */}
      <div className="rundown-workspace-grid">
        {/* LEFT PANEL: TOOLBAR + TABLE + TICKER RUNDOWN */}
        <section className="p rundown-left-panel">
          {/* Edition Identity & File Actions Bar */}
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #252C38",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "#0F131A",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12
            }}
          >
            <div className="prep-title-group" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {rundowns.length > 0 && (
                <select
                  aria-label="Pilih Edisi Rundown"
                  className="i"
                  style={{ width: "auto", minWidth: 210, height: 32, marginTop: 0, padding: "0 10px", fontSize: 12.5, fontWeight: 700 }}
                  value={rundown?.id || ""}
                  onChange={(e) => onRundown(e.target.value)}
                >
                  {rundowns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.programName} · {r.title}
                    </option>
                  ))}
                </select>
              )}
              <span className="sr-only-text">{rundown?.programName} · {rundown?.title}</span>
              {rundown && (
                <button
                  type="button"
                  className="b"
                  style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                  onClick={() => setRenameTarget(rundown)}
                  title="Ubah nama program & edisi"
                >
                  <Edit3 size={12} />
                  <span>Ubah Edisi</span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className="b"
                style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                disabled={pending}
                onClick={async () => {
                  if (pending || creatingRundown.current) return;
                  creatingRundown.current = true;
                  setPending(true);
                  try {
                    const r = await mutate<Rundown>("/api/rundowns", "POST", {
                      programName: "Program Berita",
                      title: "Edisi Baru",
                      items: []
                    });
                    await reload();
                    onRundown(r.id);
                    toast("Rundown baru berhasil dibuat");
                  } catch (e) {
                    toast((e as Error).message);
                  } finally {
                    creatingRundown.current = false;
                    setPending(false);
                  }
                }}
              >
                <Plus size={12} />
                <span>Rundown Baru</span>
              </button>

              {rundown && (
                <button
                  type="button"
                  className="b"
                  style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                  disabled={pending}
                  onClick={exportCurrentRundown}
                  title="Ekspor rundown saat ini ke berkas JSON"
                >
                  <Download size={12} />
                  <span>Ekspor</span>
                </button>
              )}

              <button
                type="button"
                className="b"
                style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                disabled={pending}
                onClick={() => importFileInputRef.current?.click()}
                title="Impor rundown dari berkas JSON"
              >
                <Upload size={12} />
                <span>Impor</span>
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />

              <button
                type="button"
                className="b"
                style={{ height: 30, padding: "0 10px", fontSize: 12 }}
                onClick={() => setShowAiModal(true)}
                title="Salin prompt & panduan untuk AI Agent"
              >
                <Sparkles size={12} />
                <span>Prompt AI Agent</span>
              </button>

              {rundown && (
                <button
                  type="button"
                  className="b"
                  style={{ height: 30, padding: "0 10px", fontSize: 12, borderColor: "#D93036", color: "#FF6369" }}
                  disabled={pending}
                  onClick={deleteCurrentRundown}
                  title="Hapus rundown saat ini"
                >
                  <Trash2 size={12} />
                  <span>Hapus Rundown</span>
                </button>
              )}
            </div>
          </div>

          {/* Primary Toolbar from Rundown.dc.html */}
          <div className="ph">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                data-label="+ Story baru"
                data-key="N"
                className="b btn-tambah-berita-styled"
                style={{ background: "#2A3A55" }}
                disabled={!rundown}
                onClick={(event) => {
                  editingTrigger.current = event.currentTarget;
                  setEditing("new");
                }}
              >
                <span className="sr-only-text">Tambah Berita</span>
              </button>

              <button
                type="button"
                className="b"
                disabled={!rundown || pending}
                onClick={() => setShowExcelModal(true)}
              >
                Tempel dari Excel <span className="k">Ctrl+V</span>
              </button>

              <button
                type="button"
                className="b"
                disabled={!rundown || !selectedStory || pending}
                onClick={() => void duplicateSelectedStory()}
              >
                Duplikat <span className="k">Ctrl+D</span>
              </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="k">/</span>
              <input
                ref={searchInputRef}
                className="i"
                style={{ width: 240, margin: 0 }}
                placeholder="Cari story"
                aria-label="Cari story"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>

          {/* Story Table from Rundown.dc.html */}
          <div className="rundown-table-scroll">
            <table className="rundown-table">
              <thead className="l">
                <tr>
                  <th style={{ width: 52 }}></th>
                  <th style={{ width: 38 }}>#</th>
                  <th style={{ width: 84 }}>Status</th>
                  <th style={{ width: 96 }}>Tipe</th>
                  <th>Headline</th>
                  <th style={{ width: 150 }}>Lokasi</th>
                  <th style={{ width: 54 }}>SOT</th>
                  <th style={{ width: 68 }}>Ticker</th>
                  <th style={{ width: 108 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const realIndex = items.findIndex((i) => i.id === item.id);
                  const isSelected = selectedStory?.id === item.id;
                  const onAir = isStoryOnAir(item);
                  const headCue = item.graphics.find((g) => g.templateType === "HEADLINE") || item.graphics[0];
                  const headFields = headCue ? normalizeHeadlineTopicFields(headCue.templateType, headCue.draftFields) : {};
                  const itemSots = item.graphics.filter((g) => g.templateType === "SOT").length;
                  const tipeLabel = !item.cgRequired
                    ? "Tanpa CG"
                    : headCue?.draftFields.headlinePresentation === "bulletin"
                    ? "Highlight"
                    : headCue?.templateType === "SOT"
                    ? "SOT"
                    : "Headline";
                  const headlineText = headFields.headline || item.title;
                  const locationText = headFields.location || "—";
                  const inTicker = Boolean(
                    rundown?.ticker?.text &&
                      headlineText &&
                      rundown.ticker.text.toLowerCase().includes(headlineText.slice(0, 14).toLowerCase())
                  );

                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? "on" : ""}
                      onClick={() => setSelectedStoryId(item.id)}
                      onDoubleClick={() => setEditing(item)}
                    >
                      <td className="m" style={{ color: "#6B7686" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span>⋮⋮</span>
                          <button
                            type="button"
                            style={{ background: "none", border: 0, color: "#98A3B3", padding: 2, cursor: "pointer" }}
                            disabled={pending || realIndex === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void move(item, -1);
                            }}
                            title="Naikkan urutan"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            style={{ background: "none", border: 0, color: "#98A3B3", padding: 2, cursor: "pointer" }}
                            disabled={pending || realIndex === items.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              void move(item, 1);
                            }}
                            title="Turunkan urutan"
                          >
                            <ArrowDown size={11} />
                          </button>
                        </span>
                      </td>
                      <td className="m">{realIndex + 1}</td>
                      <td>
                        <span className={`st ${onAir ? "r" : ""}`}>
                          {onAir ? "ON AIR" : "SIAP"}
                        </span>
                      </td>
                      <td>{tipeLabel}</td>
                      <td style={{ fontWeight: 600 }}>{headlineText}</td>
                      <td>{locationText}</td>
                      <td className="m">{itemSots}</td>
                      <td>{inTicker || realIndex < 2 ? "Ya" : "Tidak"}</td>
                      <td>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            className="b"
                            style={{ height: 28, padding: "0 8px", fontSize: 11 }}
                            onClick={(event) => {
                              event.stopPropagation();
                              editingTrigger.current = event.currentTarget;
                              setEditing(item);
                            }}
                            title="Edit materi berita dan daftar grafis"
                          >
                            <Edit3 size={11} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="b"
                            style={{ height: 28, padding: "0 8px", fontSize: 11, color: "#FF6369" }}
                            disabled={pending}
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeItem(item);
                            }}
                            title="Hapus berita dari rundown"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredItems.length && (
              <div style={{ padding: 32, textAlign: "center", color: "#98A3B3" }}>
                {search ? (
                  <span>Tidak ada story yang cocok dengan pencarian "{search}"</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <FileSpreadsheet size={26} />
                    <b>Rundown Ini Belum Memiliki Story</b>
                    <span style={{ fontSize: 12 }}>Klik "+ Story baru" atau "Tempel dari Excel" untuk mulai mengisi berita.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Ticker Rundown Section matching Rundown.dc.html */}
          <div style={{ marginTop: "auto", borderTop: "1px solid #252C38", padding: "14px 16px" }}>
            <div className="fl">
              <span className="l">Ticker rundown</span>
              <span className="m" style={{ fontSize: 12, color: "#98A3B3" }}>
                Kecepatan {rundownSpeed} px/dtk
              </span>
            </div>
            <div
              className="m"
              style={{
                marginTop: 10,
                background: "#0F131A",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                color: "#C5CDD9",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {tickerPreviewText}
            </div>
            {rundown && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, color: "#98A3B3", cursor: "pointer", fontWeight: 600 }}>
                  Atur jadwal siaran &amp; teks ticker rundown
                </summary>
                <div style={{ marginTop: 10 }}>
                  <RundownBroadcastEditor key={rundown.id} rundown={rundown} reload={reload} toast={toast} />
                </div>
              </details>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: STORY INSPECTOR (Clean & Functional as in Rundown.dc.html + Mini Preview) */}
        <aside className="p rundown-inspector-panel" aria-label="Inspektur Story">
          {selectedStory ? (
            <>
              <div className="fl inspector-head-row">
                <div>
                  <div className="fl" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <b style={{ fontSize: 15 }}>Story #{selectedStoryIndex + 1}</b>
                    <span className={`st ${isStoryOnAir(selectedStory) ? "r" : ""}`}>
                      {isStoryOnAir(selectedStory) ? "ON AIR" : "SIAP"}
                    </span>
                    <span className="inspector-save-pill" style={{ color: inspectorSaveState === "saved" ? "#3DD68C" : "#98A3B3" }}>
                      {inspectorSaveState === "saving"
                        ? "Menyimpan…"
                        : inspectorSaveState === "saved"
                        ? "✓ Tersimpan"
                        : "Auto-save"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="b"
                  style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                  onClick={(event) => {
                    editingTrigger.current = event.currentTarget;
                    setEditing(selectedStory);
                  }}
                  title="Buka modal editor lengkap untuk mengatur seluruh cue"
                >
                  <Edit3 size={12} /> Detail Cue
                </button>
              </div>

              {isStoryOnAir(selectedStory) && (
                <div className="ui-notice">
                  Story sedang ON AIR. Perubahan baru tayang setelah UPDATE <span className="k">U</span> di Kontrol.
                </div>
              )}

              {/* Compact 16:9 Live Preview Box */}
              <div className="inspector-mini-preview-box">
                <div className="fl inspector-mini-preview-head">
                  <span className="l" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <i className="dt" style={{ background: "#3DD68C" }} />
                    Pratinjau CG · {activeInspectorCue?.templateType === "SOT" ? "SOT" : inspectorPresentation === "highlight" ? "Highlight" : inspectorPresentation === "bulletin" ? "Bulletin" : "Headline"}
                  </span>
                  {selectedStory.graphics.length > 1 && (
                    <div className="inspector-cue-pills">
                      {selectedStory.graphics.map((g, gIdx) => (
                        <button
                          key={g.id}
                          type="button"
                          className={`inspector-cue-pill ${activeInspectorCue?.id === g.id ? "active" : ""}`}
                          onClick={() => {
                            setSelectedCueId(g.id);
                            if (g.templateType === "SOT") {
                              const sIdx = sotCues.findIndex((s) => s.id === g.id);
                              if (sIdx >= 0) setSelectedSotIndex(sIdx);
                            }
                          }}
                        >
                          #{gIdx + 1} {g.templateType === "SOT" ? "SOT" : g.draftFields.headlinePresentation === "bulletin" ? "HL" : "HEAD"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="inspector-mini-preview-stage">
                  <BroadcastPreviewBox
                    graphic={activeInspectorCue}
                    fields={
                      activeInspectorCue?.templateType === "SOT"
                        ? {
                            ...activeInspectorCue.draftFields,
                            headline: inspHeadline || selectedStory.title,
                            name: inspSotName || activeInspectorCue.draftFields.name || "NAMA NARASUMBER",
                            role: inspSotRole || activeInspectorCue.draftFields.role || "Jabatan"
                          }
                        : {
                            ...(primaryCue?.draftFields || {}),
                            headline: inspHeadline || selectedStory.title,
                            subline: inspDetail,
                            location: inspLocation,
                            kicker: inspKicker || primaryCue?.draftFields.kicker || "",
                            showLocation: inspLocation.trim() ? "true" : "false",
                            showDetail: inspDetail.trim() ? "true" : "false",
                            showKicker: (inspKicker || primaryCue?.draftFields.kicker || "").trim() ? "true" : "false",
                            layoutStyle: inspDetail.trim() ? "sub" : "single"
                          }
                    }
                    master={{ ...master, tickerText: rundown?.ticker?.text ?? "", tickerSpeed: rundownSpeed }}
                    emptyText="STORY TANPA CG"
                  />
                </div>
              </div>

              <div className="inspector-field-block">
                <div className="seg" role="group" aria-label="Tipe sajian story">
                  <button
                    type="button"
                    className={inspectorPresentation === "headline" ? "on" : ""}
                    onClick={() => {
                      if (primaryCue) setSelectedCueId(primaryCue.id);
                      void setInspectorMode("headline");
                    }}
                  >
                    Headline
                  </button>
                  <button
                    type="button"
                    className={inspectorPresentation === "highlight" ? "on" : ""}
                    onClick={() => {
                      if (primaryCue) setSelectedCueId(primaryCue.id);
                      void setInspectorMode("highlight");
                    }}
                  >
                    Highlight
                  </button>
                  <button
                    type="button"
                    className={inspectorPresentation === "bulletin" ? "on" : ""}
                    onClick={() => {
                      if (primaryCue) setSelectedCueId(primaryCue.id);
                      void setInspectorMode("bulletin");
                    }}
                  >
                    Bulletin
                  </button>
                </div>
              </div>

              <label className="l inspector-label-block">
                <span>Headline</span>
                <input
                  className="i"
                  value={inspHeadline}
                  placeholder="Masukkan judul headline utama..."
                  onChange={(e) => handleInspectorInput("headline", e.target.value)}
                />
              </label>

              <label className="l inspector-label-block">
                <span>Detail</span>
                <input
                  className="i"
                  value={inspDetail}
                  placeholder="Detail / subline berita..."
                  onChange={(e) => handleInspectorInput("detail", e.target.value)}
                />
              </label>

              <div className="inspector-two-col">
                <label className="l inspector-label-block">
                  <span>Lokasi</span>
                  <input
                    className="i"
                    value={inspLocation}
                    placeholder="Lokasi liputan..."
                    onChange={(e) => handleInspectorInput("location", e.target.value)}
                  />
                </label>
                <label className="l inspector-label-block">
                  <span>Topik / Kicker</span>
                  <input
                    className="i"
                    value={inspKicker}
                    placeholder="Contoh: EKONOMI"
                    onChange={(e) => handleInspectorInput("kicker", e.target.value)}
                  />
                </label>
              </div>

              {/* Narasumber (SOT) Section */}
              <div className="inspector-field-block">
                <div className="fl" style={{ marginBottom: 6 }}>
                  <span className="l">Narasumber (SOT)</span>
                  <span className="l" style={{ display: "inline-flex", gap: 4 }}>
                    <span className="k">PgUp</span> <span className="k">PgDn</span>
                  </span>
                </div>

                {sotCues.length > 0 ? (
                  <div className="inspector-sot-inline-list">
                    {sotCues.map((sot, idx) => {
                      const isActiveSot = selectedSotIndex === idx;
                      return (
                        <div
                          key={sot.id}
                          className={`inspector-sot-inline-card ${isActiveSot ? "active" : ""}`}
                          onClick={() => {
                            setSelectedSotIndex(idx);
                            setSelectedCueId(sot.id);
                          }}
                        >
                          <div className="fl">
                            <button
                              type="button"
                              className="inspector-sot-select-btn"
                              onClick={() => {
                                setSelectedSotIndex(idx);
                                setSelectedCueId(sot.id);
                              }}
                            >
                              <span className="n">SOT {idx + 1}</span>
                              <span>{isActiveSot ? (inspSotName || "Narasumber") : (sot.draftFields.name || "Narasumber")}</span>
                            </button>
                            <button
                              type="button"
                              className="inspector-sot-remove-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeQuickSotFromSelectedStory(sot.id);
                              }}
                            >
                              Hapus
                            </button>
                          </div>
                          {isActiveSot && (
                            <div className="inspector-sot-inline-inputs">
                              <input
                                className="i"
                                style={{ height: 32, marginTop: 0, fontSize: 12 }}
                                value={inspSotName}
                                placeholder="Nama narasumber..."
                                onChange={(e) => handleSotInlineInput("name", e.target.value)}
                              />
                              <input
                                className="i"
                                style={{ height: 32, marginTop: 0, fontSize: 12 }}
                                value={inspSotRole}
                                placeholder="Jabatan / institusi..."
                                onChange={(e) => handleSotInlineInput("role", e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#98A3B3", marginBottom: 6 }}>
                    Belum ada narasumber (SOT) pada story ini.
                  </div>
                )}

                <button
                  type="button"
                  className="b"
                  style={{ width: "100%", marginTop: 6, height: 36 }}
                  disabled={pending}
                  onClick={() => void addQuickSotToSelectedStory()}
                >
                  + Tambah narasumber
                </button>
              </div>

              <button
                type="button"
                className="b inspector-send-preview-btn"
                onClick={sendStoryToPreview}
              >
                Kirim ke Preview <span className="k">Enter</span>
              </button>
            </>
          ) : (
            <div style={{ margin: "auto", textAlign: "center", color: "#98A3B3", fontSize: 13 }}>
              Pilih story di tabel sebelah kiri atau buat story baru untuk menyunting.
            </div>
          )}
        </aside>
      </div>

      {/* Modal Tempel dari Excel */}
      {showExcelModal && rundown && (
        <ExcelPasteModal
          rundown={rundown}
          onClose={() => setShowExcelModal(false)}
          onOpenAi={() => {
            setShowExcelModal(false);
            setShowAiModal(true);
          }}
          onSaved={async () => {
            await reload();
            setShowExcelModal(false);
            toast("Baris dari Excel berhasil ditambahkan ke rundown");
          }}
          toast={toast}
        />
      )}

      {/* Modal Rename Rundown */}
      {renameTarget && (
        <RenameRundownModal
          rundown={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={async () => {
            await reload();
            setRenameTarget(null);
            toast("Nama rundown berhasil diperbarui");
          }}
          toast={toast}
        />
      )}

      {/* Modal Editor Berita & CG */}
      {editing && rundown && (
        <StoryEditor
          item={editing === "new" ? null : editing}
          rundown={rundown}
          master={master}
          onClose={closeEditor}
          onSaved={async () => {
            await reload();
            closeEditor();
            toast("Berita dan seluruh materi CG berhasil disimpan");
          }}
        />
      )}

      {/* Modal Panduan & Salin Prompt AI Agent */}
      {showAiModal && (
        <AiAgentRundownModal
          onClose={() => setShowAiModal(false)}
          toast={toast}
        />
      )}
    </section>
  );
}

function ExcelPasteModal({
  rundown,
  onClose,
  onOpenAi,
  onSaved,
  toast
}: {
  rundown: Rundown;
  onClose: () => void;
  onOpenAi: () => void;
  onSaved: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [saving, setSaving] = useState(false);

  const importRows = async () => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      toast("Tempelkan minimal 1 baris teks dari Excel/Spreadsheet");
      return;
    }
    setSaving(true);
    try {
      let order = rundown.items.length;
      for (const line of lines) {
        const cols = line.split("\t").map((c) => c.trim());
        const headline = cols[0] || "BERITA BARU";
        const location = cols[1] || "";
        const subline = cols[2] || "";
        await mutate(`/api/rundowns/${rundown.id}/story`, "PUT", {
          title: headline,
          slug: `XL-${order + 1}`,
          format: "PKG",
          cgRequired: true,
          estimatedDurationSeconds: 60,
          sortOrder: order,
          graphics: [
            {
              templateType: "HEADLINE",
              sortOrder: 0,
              draftFields: {
                headline,
                location,
                subline,
                kicker: "",
                contentMode: "headline",
                layoutStyle: subline ? "sub" : "single",
                showLocation: location ? "true" : "false",
                showKicker: "false",
                showDetail: subline ? "true" : "false"
              }
            }
          ]
        });
        order++;
      }
      await onSaved();
    } catch (e: any) {
      toast(e.message || "Gagal mengimpor baris Excel");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nr-modal-backdrop" onClick={onClose}>
      <div
        className="modal-box p"
        role="dialog"
        aria-modal="true"
        aria-label="Tempel dari Excel"
        style={{ maxWidth: 560, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fl" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 16 }}>Tempel dari Excel / Spreadsheet</b>
          <button type="button" className="b" style={{ height: 32, padding: "0 10px" }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#98A3B3", margin: "0 0 10px" }}>
          Salin baris dari Excel (format kolom: <b>Headline [Tab] Lokasi [Tab] Detail</b>) lalu tempel di bawah ini, atau gunakan AI Agent untuk berkas Excel/PDF kompleks.
        </p>
        <textarea
          className="i"
          style={{ height: 150, padding: 10, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}
          placeholder={"POLIMEDIA MENGGELAR RAPAT TERBATAS\tJAKARTA SELATAN\tRAPAT DIHADIRI DOSEN\nBERITA KEDUA HARI INI\tBANDUNG\tDETAIL BERITA KEDUA"}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <div className="fl" style={{ marginTop: 14 }}>
          <button type="button" className="b" onClick={onOpenAi}>
            <Sparkles size={13} /> Buka Prompt AI Agent
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="b" onClick={onClose} disabled={saving}>Batal</button>
            <button type="button" className="b" style={{ background: "#2A3A55" }} onClick={() => void importRows()} disabled={saving}>
              {saving ? "Menambahkan…" : "Tambahkan ke Rundown"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal Ubah Nama Program & Edisi
function RenameRundownModal({
  rundown,
  onClose,
  onSaved,
  toast
}: {
  rundown: Rundown;
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const [name, setName] = useState(rundown.programName);
  const [title, setTitle] = useState(rundown.title);
  const [targetId] = useState(rundown.id);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const openerRef = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => openerRef.current?.focus();
  }, []);
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !saving) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])"
    ) || []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return (
    <div className="nr-modal-backdrop">
      <form
        ref={dialogRef}
        className="modal-box rename-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ubah identitas rundown"
        onKeyDown={onDialogKeyDown}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await mutate(`/api/rundowns/${targetId}`, "PATCH", {
              programName: name,
              title
            });
            await onSaved();
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="modal-header">
          <h3>Ubah Identitas Rundown</h3>
          <button type="button" className="btn-close-modal" disabled={saving} onClick={onClose} aria-label="Tutup dialog ubah rundown">
            <X size={14} />
          </button>
        </div>
        <div className="modal-body form-grid">
          <label>
            <span>Nama Program Siaran</span>
            <input
              required
              maxLength={rundownInputSchema.shape.programName.maxLength ?? undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Seputar Berita Utama"
            />
          </label>
          <label>
            <span>Edisi / Tanggal</span>
            <input
              required
              maxLength={rundownInputSchema.shape.title.maxLength ?? undefined}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Edisi Petang · 19 September 2026"
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="btn-modal-save" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================================================================
// MODAL EDITOR MATERI BERITA & GRAFIS
// =====================================================================
function StoryEditor({
  item,
  rundown,
  master,
  onClose,
  onSaved
}: {
  item: RundownItem | null;
  rundown: Rundown;
  master?: MasterOverlayState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [slug, setSlug] = useState(item?.slug || `NEWS-${rundown.items.length + 1}`);
  const [format, setFormat] = useState(item?.format || "PKG");
  const [cgRequired, setCgRequired] = useState(item?.cgRequired ?? true);
  const [seconds, setSeconds] = useState(item?.estimatedDurationSeconds || 60);
  const [graphics, setGraphics] = useState<EditableGraphic[]>(() => {
    if (item) {
      return item.graphics.map((g) => ({ id: g.id, templateType: g.templateType,
        sortOrder: g.sortOrder, draftFields: { ...normalizeHeadlineTopicFields(g.templateType, g.draftFields) } }));
    }
    return [
      {
        templateType: "HEADLINE",
        sortOrder: 0,
        draftFields: {
          headline: "",
          kicker: "",
          subline: "",
          location: "",
          contentMode: "headline",
          layoutStyle: "sub",
          showLocation: "true",
          showKicker: "false",
          visualTemplate: "cnn"
        }
      }
    ];
  });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [error, setError] = useState("");
  const [defaultsLoading, setDefaultsLoading] = useState(!item);
  const [defaultsLoadError, setDefaultsLoadError] = useState("");
  const [defaultsLoadAttempt, setDefaultsLoadAttempt] = useState(0);
  const titleEdited = useRef(false);
  const defaultSeedActive = useRef(!item);
  const editedSeedFields = useRef(new Set<string>());
  const storyFieldsBeforeHighlight = useRef(new Map<number, Record<string, string>>());
  const [saving, setSaving] = useState(false);
  const submitInFlight = useRef(false);
  const savedStoryId = useRef(item?.id ?? null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const hasUnsavedEdits = () => {
    if (title !== (item?.title || "")) return true;
    if (slug !== (item?.slug || "")) return true;
    if (format !== (item?.format || "PKG")) return true;
    if (seconds !== (item?.estimatedDurationSeconds || 60)) return true;
    if (cgRequired !== (item?.cgRequired ?? true)) return true;
    return false;
  };
  const requestClose = () => {
    if (hasUnsavedEdits()) {
      if (!window.confirm("Ada perubahan materi yang belum disimpan. Tetap tutup editor?")) {
        return;
      }
    }
    onClose();
  };
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !saving) {
      event.stopPropagation();
      requestClose();
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"
    ) || []).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  useEffect(() => {
    if (item) return;
    let active = true;
    setDefaultsLoading(true);
    setDefaultsLoadError("");
    api<HeadlineDefaults>("/api/settings/headline-defaults")
      .then((data) => {
        const def = headlineDefaultsSchema.parse(data);
        if (active) {
          setGraphics((gs) => {
            if (defaultSeedActive.current && gs[0]?.templateType === "HEADLINE") {
              return gs.map((g, idx) =>
                idx === 0
                  ? {
                      ...g,
                      draftFields: {
                        ...g.draftFields,
                        ...Object.fromEntries(Object.entries(def).map(([key, value]) => [
                          key, editedSeedFields.current.has(key) ? g.draftFields[key] || "" : value || g.draftFields[key] || ""
                        ])),
                        showKicker: editedSeedFields.current.has("kicker")
                          ? g.draftFields.showKicker ?? "false"
                          : def.kicker ? "true" : g.draftFields.showKicker ?? "false"
                      }
                    }
                  : g
              );
            }
            return gs;
          });
          setTitle((current) => titleEdited.current || current ? current : def.headline);
        }
      })
      .catch((reason: unknown) => {
        if (active) setDefaultsLoadError(`Default materi belum dimuat: ${reason instanceof Error ? reason.message : "Permintaan gagal"}. Anda dapat mengisi berita secara manual atau mencoba lagi.`);
      })
      .finally(() => { if (active) setDefaultsLoading(false); });
    return () => { active = false; };
  }, [item, defaultsLoadAttempt]);

  function handleTitleChange(newTitle: string) {
    titleEdited.current = true;
    editedSeedFields.current.add("headline");
    setTitle(newTitle);
    setGraphics((gs) => {
      if (gs.length > 0 && gs[0] && (gs[0].templateType === "HEADLINE" || gs[0].templateType === "BREAKING")) {
        const currentHeadline = gs[0].draftFields.headline || "";
        if (!currentHeadline || currentHeadline === title) {
          return gs.map((g, i) =>
            i === 0 ? { ...g, draftFields: { ...g.draftFields, headline: newTitle } } : g
          );
        }
      }
      return gs;
    });
  }

  function add(type: TemplateType, bulletin = false) {
    const base = graphics.find((g) => g.templateType === "HEADLINE")?.draftFields;
    setPreviewIndex(graphics.length);
    setGraphics((gs) => {
      const newIndex = gs.length;
      return [
        ...gs,
        {
          templateType: type,
          sortOrder: newIndex,
          draftFields:
            type === "REPORTER"
              ? { name: "", role: "", contentMode: "presenter", layoutStyle: "sub", showLocation: "false", visualTemplate: "cnn" }
              : type === "SOT"
              ? { headline: base?.headline || title, name: "", role: "", contentMode: "sot", showLocation: "false", visualTemplate: "cnn" }
              : type === "LOCATION"
              ? { location: base?.location || "", contentMode: "location", layoutStyle: "single", showLocation: "true", visualTemplate: "cnn" }
              : {
                  headline: base?.headline || title,
                  kicker: "",
                  subline: "",
                  location: base?.location || "",
                  contentMode: "headline",
                  layoutStyle: "sub",
                  showLocation: "true",
                  showKicker: "false",
                  visualTemplate: "cnn",
                  ...(type === "BREAKING" ? { kicker: "BREAKING NEWS", showKicker: "true" } : {}),
                  ...(bulletin ? headlineBulletinPreset : {})
                }
        }
      ];
    });
  }

  function addTieredFlow() {
    if (graphics.length > 0) {
      const confirmed = window.confirm(
        "Peringatan: Alur 3 bertingkat akan menggantikan cue yang ada pada berita ini. Lanjutkan pembuatan?"
      );
      if (!confirmed) return;
    }
    defaultSeedActive.current = false;
    storyFieldsBeforeHighlight.current.clear();
    const headline = title.trim() || "HEADLINE BERITA";
    const baseLocation = graphics.find((g) => g.draftFields.location)?.draftFields.location || "";
    const baseSubline = graphics.find((g) => g.draftFields.subline)?.draftFields.subline || "";

    setGraphics([
      {
        templateType: "HEADLINE",
        sortOrder: 0,
        draftFields: {
          headline,
          location: baseLocation,
          subline: "",
          layoutStyle: "single",
          showLocation: "false",
          showKicker: "false",
          contentMode: "headline"
        }
      },
      {
        templateType: "HEADLINE",
        sortOrder: 1,
        draftFields: {
          headline,
          location: baseLocation || "JAKARTA",
          subline: "",
          layoutStyle: "single",
          showLocation: "true",
          showKicker: "false",
          contentMode: "headline"
        }
      },
      {
        templateType: "HEADLINE",
        sortOrder: 2,
        draftFields: {
          headline,
          location: baseLocation || "JAKARTA",
          subline: baseSubline || "Keterangan tambahan berita...",
          layoutStyle: "sub",
          showLocation: "true",
          showKicker: "true",
          contentMode: "headline"
        }
      }
    ]);
    setPreviewIndex(0);
  }

  function field(index: number, key: string, value: string) {
    if (index === 0) editedSeedFields.current.add(key);
    setPreviewIndex(index);
    setGraphics((gs) =>
      gs.map((g, i) => (i === index ? { ...g, draftFields: { ...g.draftFields, [key]: value } } : g))
    );
  }

  const currentPreviewCue = graphics[previewIndex] || graphics[0] || null;
  const effectivePreviewFields = currentPreviewCue
    ? {
        ...currentPreviewCue.draftFields,
        headline:
          currentPreviewCue.draftFields.headline ||
          (currentPreviewCue.templateType === "HEADLINE" ? title : "") ||
          "",
        showLocation:
          currentPreviewCue.draftFields.showLocation !== undefined
            ? currentPreviewCue.draftFields.showLocation
            : currentPreviewCue.draftFields.location
            ? "true"
            : "false"
      }
    : null;

  return (
    <div className="nr-modal-backdrop">
      <form
        ref={dialogRef}
        className="story-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={item ? "Edit berita dan materi CG" : "Tambah berita baru"}
        onKeyDown={onDialogKeyDown}
        onSubmit={async (e) => {
          e.preventDefault();
          if (submitInFlight.current) return;
          if (seconds < 1 || seconds > 21600) {
            setError("Durasi harus antara 00:01 dan 360:00.");
            return;
          }
          submitInFlight.current = true;
          setSaving(true);
          setError("");
          try {
            const saved = await mutate<RundownItem>(`/api/rundowns/${rundown.id}/story`, "PUT", {
              itemId: savedStoryId.current,
              title,
              slug,
              format,
              cgRequired,
              estimatedDurationSeconds: seconds,
              sortOrder: item?.sortOrder ?? rundown.items.length,
              graphics: graphics.map((g, i) => ({ ...g, sortOrder: i }))
            });
            if (saved.id) savedStoryId.current = saved.id;
            await onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            submitInFlight.current = false;
            setSaving(false);
          }
        }}
      >
        <div className="modal-header">
          <div>
            <small>EDITOR MATERI BERITA</small>
            <h2>{item ? "Edit Berita & Materi CG" : "Tambah Berita Baru"}</h2>
          </div>
          <button type="button" className="btn-close-modal" aria-label="Tutup editor materi" disabled={saving} onClick={requestClose}>
            <X size={15} />
          </button>
        </div>

        <div className="story-editor-scroll-area">
          <div className="story-editor-left-col">
            {defaultsLoading && <p role="status">Memuat default materi…</p>}
            {defaultsLoadError && (
              <div className="modal-error-banner" role="alert">
                {defaultsLoadError}
                <button type="button" onClick={() => setDefaultsLoadAttempt((attempt) => attempt + 1)}>Muat ulang default</button>
              </div>
            )}
            <div className="editor-card story-meta-card">
            <h3 className="section-title">Informasi Segmen Berita</h3>
            <div className="editor-form-grid">
              <label className="field-full">
                <span>Judul Berita</span>
                <input
                  autoFocus
                  required
                  maxLength={rundownItemInputSchema.shape.title.maxLength ?? undefined}
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Masukkan judul berita utama..."
                />
              </label>

              <label>
                <span>Kode Slug</span>
                <input
                  required
                  maxLength={rundownItemInputSchema.shape.slug.maxLength ?? undefined}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="NEWS-01"
                />
              </label>

              <label>
                <span>Format Siaran</span>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  {["PKG", "VO", "LIVE", "READER", "LAINNYA"].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Kebutuhan CG</span>
                <select value={cgRequired ? "required" : "none"} onChange={(e) => setCgRequired(e.target.value === "required")}>
                  <option value="required">Butuh CG lower third</option>
                  <option value="none">Tanpa CG lower third</option>
                </select>
              </label>

              <div className="duration-input-group">
                <span>Estimasi Durasi Video</span>
                <div className="duration-inputs">
                  <label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={360}
                      value={Math.floor(seconds / 60)}
                      onChange={(e) =>
                        setSeconds(Number(e.target.value) * 60 + (seconds % 60))
                      }
                    />
                    <small>Menit</small>
                  </label>
                  <b>:</b>
                  <label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={59}
                      value={seconds % 60}
                      onChange={(e) =>
                        setSeconds(Math.floor(seconds / 60) * 60 + Number(e.target.value))
                      }
                    />
                    <small>Detik</small>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="editor-card graphics-list-card">
            <div className="graphics-card-header">
              <div>
                <h3 className="section-title">Daftar Materi CG (Lower Third)</h3>
                <p>Siapkan cue headline, nama narasumber, dan lokasi siaran.</p>
              </div>

              <div className="add-cg-buttons">
                <button type="button" onClick={() => add("HEADLINE")}>
                  + Tambah Headline
                </button>
                <button type="button" onClick={() => add("HEADLINE", true)}>
                  + Highlight Berita
                </button>
                <button type="button" onClick={() => add("BREAKING")}>
                  + Breaking News
                </button>
                <button type="button" onClick={() => add("REPORTER")}>
                  + Tambah Narasumber
                </button>
                <button type="button" onClick={() => add("SOT")}>
                  + Tambah SOT Narasumber
                </button>
                <button type="button" onClick={() => add("LOCATION")}>
                  + Tambah Lokasi Saja
                </button>
                <button
                  type="button"
                  className="btn-preset-tiered"
                  onClick={addTieredFlow}
                  title="Otomatis buat 3 varian bertingkat: 1. Headline Bersih, 2. + Lokasi, 3. + Banyak Info"
                >
                  ✨ Buat 3 Alur Bertingkat
                </button>
              </div>
            </div>

            <div className="cue-cards-container">
              {graphics.map((g, index) => (
                <div
                  key={g.id || index}
                  className={`cue-editor-card ${previewIndex === index ? "active-preview" : ""}`}
                  onClick={() => setPreviewIndex(index)}
                >
                  <div className="cue-editor-header">
                    <div className="cue-header-left">
                      <span className="cue-number">#{index + 1}</span>
                      <b>
                        {g.templateType === "SOT"
                          ? "CG SOT NARASUMBER"
                          : g.templateType === "REPORTER"
                          ? "CG NAMA / REPORTER"
                          : g.templateType === "LOCATION"
                          ? "CG LOKASI"
                          : g.templateType === "BREAKING"
                          ? "BREAKING NEWS"
                          : g.draftFields.headlinePresentation === "bulletin"
                          ? "HIGHLIGHT BERITA"
                          : "LOWER THIRD HEADLINE"}
                      </b>
                      {previewIndex === index && (
                        <span className="st g" style={{ marginLeft: 6 }}>DIPRATINJAU</span>
                      )}
                    </div>

                    <div className="cue-header-right">
                      <button
                        type="button"
                        className="btn-remove-cue"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (index === 0) defaultSeedActive.current = false;
                          const remaining = new Map<number, Record<string, string>>();
                          for (const [cueIndex, fields] of storyFieldsBeforeHighlight.current) {
                            if (cueIndex !== index) remaining.set(cueIndex > index ? cueIndex - 1 : cueIndex, fields);
                          }
                          storyFieldsBeforeHighlight.current = remaining;
                          setGraphics((gs) => gs.filter((_, i) => i !== index));
                          setPreviewIndex((current) => current > index ? current - 1 : current === index ? Math.max(0, current - 1) : current);
                        }}
                        title="Hapus materi CG ini"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="cue-editor-body">
                    <BroadcastTemplateInfo colorTheme={master?.colorTheme} broadcastTemplate={master?.broadcastTemplate} />
                    {g.templateType === "SOT" ? (
                      <div className="cue-fields-grid">
                        <label className="field-full">
                          <span>Headline Berita (Wajib)</span>
                          <input
                            required
                            maxLength={getGraphicFieldLimit(g.templateType, "headline")}
                            value={g.draftFields.headline || ""}
                            onChange={(e) => field(index, "headline", e.target.value)}
                            placeholder="Judul berita di baris atas LT SOT"
                          />
                        </label>
                        <label>
                          <span>Nama Narasumber (Wajib)</span>
                          <input
                            required
                            maxLength={getGraphicFieldLimit(g.templateType, "name")}
                            value={g.draftFields.name || ""}
                            onChange={(e) => field(index, "name", e.target.value)}
                            placeholder="Contoh: RISKI DWIANTO"
                          />
                        </label>
                        <label>
                          <span>Jabatan / Keterangan (Opsional)</span>
                          <input
                            maxLength={getGraphicFieldLimit(g.templateType, "role")}
                            value={g.draftFields.role || ""}
                            onChange={(e) => field(index, "role", e.target.value)}
                            placeholder="Contoh: Kasie Ops Basarnas Banten"
                          />
                        </label>
                      </div>
                    ) : g.templateType === "REPORTER" ? (
                      <div className="cue-fields-grid">
                        <label>
                          <span>Nama Lengkap Narasumber / Presenter</span>
                          <input
                            required
                            maxLength={getGraphicFieldLimit(g.templateType, "name")}
                            value={g.draftFields.name || ""}
                            onChange={(e) => field(index, "name", e.target.value)}
                            placeholder="Contoh: Dr. Ir. Budi Santoso, M.Sc"
                          />
                        </label>
                        <label>
                          <span>Jabatan / Institusi / Media Sosial</span>
                          <input
                            maxLength={getGraphicFieldLimit(g.templateType, "role")}
                            value={g.draftFields.role || ""}
                            onChange={(e) => field(index, "role", e.target.value)}
                            placeholder="Contoh: Pakar Klimatologi BMKG"
                          />
                        </label>
                      </div>
                    ) : g.templateType === "LOCATION" ? (
                      <div className="cue-fields-grid">
                        <label className="field-full">
                          <span>Nama Lokasi Liputan</span>
                          <input
                            required
                            maxLength={getGraphicFieldLimit(g.templateType, "location")}
                            value={g.draftFields.location || ""}
                            onChange={(e) => field(index, "location", e.target.value)}
                            placeholder="Contoh: JAKARTA PUSAT"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="cue-fields-grid">
                        {g.templateType === "HEADLINE" && (
                          <label>
                            <span>Jenis Headline</span>
                            <select
                              value={g.draftFields.headlinePresentation || "story"}
                              onChange={(e) => {
                                const presentation = headlinePresentationSchema.parse(e.target.value);
                                if (index === 0) defaultSeedActive.current = false;
                                setPreviewIndex(index);
                                if (presentation === "bulletin" && g.draftFields.headlinePresentation !== "bulletin") {
                                  storyFieldsBeforeHighlight.current.set(index, { ...g.draftFields });
                                }
                                const previousStoryFields = storyFieldsBeforeHighlight.current.get(index);
                                if (presentation === "story") storyFieldsBeforeHighlight.current.delete(index);
                                setGraphics((gs) => gs.map((cue, i) => {
                                  if (i !== index) return cue;
                                  const isDefaultHighlight = cue.draftFields.headlinePresentation === "bulletin" &&
                                    cue.draftFields.kicker === headlineBulletinPreset.kicker;
                                  const draftFields = presentation === "bulletin"
                                    ? {
                                        ...cue.draftFields,
                                        ...headlineBulletinPreset,
                                        kicker: cue.draftFields.kicker?.trim() || headlineBulletinPreset.kicker,
                                        showKicker: "true"
                                      }
                                    : {
                                        ...cue.draftFields,
                                        headlinePresentation: "story",
                                        ...Object.fromEntries((["contentMode", "layoutStyle", "showLocation", "showDetail", "visualTemplate"] as const)
                                          .filter((f) => previousStoryFields?.[f] !== undefined)
                                          .map((f) => [f, previousStoryFields![f]])),
                                        ...(isDefaultHighlight ? {
                                          kicker: previousStoryFields?.kicker || "",
                                          showKicker: previousStoryFields?.showKicker ?? "false"
                                        } : {})
                                      };
                                  return { ...cue, draftFields };
                                }));
                              }}
                            >
                              <option value="story">Judul berita biasa</option>
                              <option value="bulletin">Highlight / ringkasan berita</option>
                            </select>
                          </label>
                        )}
                        <label className="field-full">
                          <span>Headline Utama (Wajib) <strong style={{ color: "#ef4444" }}>*</strong></span>
                          <input
                            required
                            maxLength={getGraphicFieldLimit(g.templateType, "headline")}
                            value={g.draftFields.headline || ""}
                            onChange={(e) => field(index, "headline", e.target.value)}
                            placeholder="Judul headline utama yang wajib diisi..."
                          />
                        </label>
                        <label>
                          <span>Sub Topik di Atas / Kicker (Opsional)</span>
                          <input
                            maxLength={getGraphicFieldLimit(g.templateType, "kicker")}
                            value={g.draftFields.kicker || ""}
                            onChange={(e) => field(index, "kicker", e.target.value)}
                            placeholder="Contoh: BREAKING NEWS (kosongkan jika tidak ada)"
                          />
                        </label>
                        <label>
                          <span>Detail Headline / Keterangan (Opsional)</span>
                          <input
                            maxLength={getGraphicFieldLimit(g.templateType, "subline")}
                            value={g.draftFields.subline || ""}
                            onChange={(e) => field(index, "subline", e.target.value)}
                            placeholder="Keterangan tambahan (kosongkan jika tidak ada)"
                          />
                        </label>
                        <label className="field-full">
                          <span>Lokasi Liputan (Opsional)</span>
                          <input
                            maxLength={getGraphicFieldLimit(g.templateType, "location")}
                            value={g.draftFields.location || ""}
                            onChange={(e) => field(index, "location", e.target.value)}
                            placeholder="Contoh: JAKARTA PUSAT (kosongkan jika tidak ada)"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {!graphics.length && (
                <div className="empty-cues-banner">
                  <span>Belum ada CG pada berita ini. Klik tombol di atas untuk menambahkan.</span>
                </div>
              )}
            </div>
          </div>
          </div>

          <div className="editor-card story-preview-card">
            <div className="story-preview-header">
              <div className="preview-header-left">
                <span className="dot-led green pulse" />
                <div>
                  <h3 className="section-title">PRATINJAU CG LIVE (16:9)</h3>
                </div>
              </div>

              {graphics.length > 1 && (
                <div className="preview-cue-switcher">
                  <span className="preview-switch-label">Preview Cue:</span>
                  <div className="preview-switch-pills">
                    {graphics.map((g, i) => (
                      <button
                        key={g.id || i}
                        type="button"
                        className={`preview-pill-btn ${previewIndex === i ? "active" : ""}`}
                        onClick={() => setPreviewIndex(i)}
                      >
                        #{i + 1} {g.templateType === "SOT" ? "SOT Narasumber" : g.templateType === "REPORTER" ? "Reporter" : g.templateType === "LOCATION" ? "Lokasi" : g.templateType === "BREAKING" ? "Breaking" : g.draftFields.headlinePresentation === "bulletin" ? "Highlight" : "Headline"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="story-preview-screen-wrapper">
              <BroadcastPreviewBox
                graphic={
                  currentPreviewCue
                    ? { id: "editor-preview", templateType: currentPreviewCue.templateType }
                    : null
                }
                fields={effectivePreviewFields}
                master={master}
                emptyText="Ketik headline pada form di sebelah kiri untuk melihat visual siaran..."
              />
            </div>

            {/* Interactive Cue Summary & Quick Add in Preview Column */}
            <div className="story-preview-summary-box">
              <div className="fl" style={{ marginBottom: 8 }}>
                <span className="l">Daftar Urutan Cue di Berita Ini ({graphics.length})</span>
                <span style={{ fontSize: 11, color: "#98A3B3" }}>Klik untuk pratinjau</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {graphics.map((g, idx) => {
                  const isCurrent = previewIndex === idx;
                  const cueLabel =
                    g.templateType === "SOT"
                      ? `SOT · ${g.draftFields.name || "Narasumber"}`
                      : g.templateType === "REPORTER"
                      ? `Reporter · ${g.draftFields.name || "Presenter"}`
                      : g.templateType === "LOCATION"
                      ? `Lokasi · ${g.draftFields.location || "Lokasi"}`
                      : g.draftFields.headlinePresentation === "bulletin"
                      ? `Highlight · ${g.draftFields.headline || title || "Belum diisi"}`
                      : `Headline · ${g.draftFields.headline || title || "Belum diisi"}`;
                  return (
                    <button
                      key={g.id || idx}
                      type="button"
                      className={`it ${isCurrent ? "on" : ""}`}
                      style={{ padding: "8px 10px", fontSize: 12 }}
                      onClick={() => setPreviewIndex(idx)}
                    >
                      <span className="n">#{idx + 1}</span>
                      <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cueLabel}
                      </span>
                      <span className={`st ${isCurrent ? "g" : ""}`}>
                        {isCurrent ? "AKTIF" : g.templateType}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #252C38", fontSize: 11.5, color: "#98A3B3", lineHeight: 1.5 }}>
                <b style={{ color: "#C5CDD9" }}>Panduan Operator:</b> Cue <b>#1</b> otomatis disiapkan saat berita dipilih di tab <b>Kontrol</b>. Gunakan tombol <span className="k">K</span> / <span className="k">PgDn</span> saat siaran untuk berpindah cepat ke cue <b>SOT Narasumber</b>.
              </div>
            </div>
          </div>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-footer">
          <div className="footer-actions ml-auto">
            <button type="button" className="btn-modal-cancel" disabled={saving} onClick={requestClose}>
              Batal
            </button>
            <button type="submit" className="btn-modal-save" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan Berita & CG"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Modal Panduan & Salin Prompt untuk AI Agent
function AiAgentRundownModal({
  onClose,
  toast
}: {
  onClose: () => void;
  toast: (s: string) => void;
}) {
  const initialBase =
    typeof window !== "undefined" && window.location.port === "5173"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3001";

  const [baseUrl, setBaseUrl] = useState(initialBase);
  const [copied, setCopied] = useState(false);

  const promptText = useMemo(() => buildAiAgentPrompt(baseUrl), [baseUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(promptText);
    if (ok) {
      setCopied(true);
      toast("Prompt AI Agent berhasil disalin ke clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast("Gagal menyalin otomatis. Silakan salin teks di kotak secara manual.");
    }
  };

  return (
    <div className="nr-modal-backdrop" onClick={onClose}>
      <div
        className="modal-box ai-agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-modal-heading"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ai-modal-header">
          <div className="ai-modal-title">
            <span className="ai-modal-badge">
              <Sparkles size={15} />
            </span>
            <div>
              <h2 id="ai-modal-heading">Prompt AI Agent</h2>
              <small>Buat Rundown dari Excel, PDF, Word, atau Foto</small>
            </div>
          </div>
          <button
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Tutup panduan AI"
          >
            <X size={17} />
          </button>
        </div>

        <div className="ai-modal-body">
          <div className="ai-server-config">
            <label htmlFor="ai-server-base-url">
              <Terminal size={14} className="text-sky-400" />
              <span>URL Server NewsCG:</span>
            </label>
            <input
              id="ai-server-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:3001"
              title="URL Server NewsCG yang dapat diakses oleh AI agent"
            />
          </div>

          <div className="ai-prompt-container">
            <div className="ai-prompt-header">
              <span>
                <Bot size={13} className="text-pink-400" />
                <span>Salin &amp; lampirkan berkas rundown ke AI:</span>
              </span>
              <ShimmerButton variant="ai" onClick={handleCopy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? "Prompt Disalin!" : "Salin Prompt untuk AI"}</span>
              </ShimmerButton>
            </div>
            <div className="ai-prompt-box">
              <pre>{promptText}</pre>
            </div>
          </div>
        </div>

        <div className="ai-modal-footer">
          <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
            <Check size={14} /> Seluruh hasil AI otomatis tampil dan dapat diedit di web
          </span>
          <div className="ai-modal-footer-actions">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
