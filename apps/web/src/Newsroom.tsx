import { useEffect, useRef, useState } from "react";
import type { GraphicItem, HeadlineDefaults, LiveState, MasterOverlayState, Rundown, RundownItem, TemplateType } from "@newscg/shared";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Edit3,
  Layers,
  LoaderCircle,
  MapPin,
  MonitorPlay,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  SkipForward,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { liveShortcut, takeThenAdvance } from "./productionFlow";
import { api, mutate } from "./api";
import { BroadcastTemplateInfo } from "./VisualTemplatePicker";
import { ProgramPreview } from "./ProgramPreview";
import { BroadcastPreviewBox } from "./BroadcastGraphic";

const duration = (seconds: number) =>
  `${seconds < 0 ? "+" : ""}${Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, "0")}:${(Math.abs(seconds) % 60).toString().padStart(2, "0")}`;

const graphicLabel = (g: GraphicItem) =>
  g.templateType === "REPORTER"
    ? `CG · ${g.draftFields.name || "Nama"}`
    : g.templateType === "LOCATION"
    ? `Lokasi · ${g.draftFields.location || "Lokasi"}`
    : `${g.draftFields.showLocation === "true" ? "Headline + Lokasi" : "Headline"}${
        g.draftFields.subline && g.draftFields.layoutStyle !== "single" ? " + Detail" : ""
      }`;

const isReady = (item: RundownItem) =>
  item.estimatedDurationSeconds > 0 &&
  item.graphics.length > 0 &&
  item.graphics.every((g) => g.status === "READY");

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
};

// =====================================================================
// PANEL PERSIAPAN (PREPARATION / RUNDOWN MANAGEMENT)
// =====================================================================
export function Preparation({ rundown, rundowns, onRundown, reload, toast, onSetup, master }: Props) {
  const [editing, setEditing] = useState<RundownItem | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [showRenameModal, setShowRenameModal] = useState(false);

  async function move(item: RundownItem, offset: number) {
    if (!rundown || pending) return;
    const items = [...rundown.items];
    const index = items.findIndex((i) => i.id === item.id);
    const other = items[index + offset];
    if (!other) return;
    setPending(true);
    try {
      items[index] = other;
      items[index + offset] = item;
      for (const [sortOrder, row] of items.entries()) {
        await mutate(`/api/items/${row.id}`, "PATCH", { sortOrder });
      }
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

  const items = rundown?.items || [];
  const filteredItems = items.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.slug.toLowerCase().includes(search.toLowerCase())
  );
  const totalDuration = items.reduce((s, i) => s + i.estimatedDurationSeconds, 0);
  const readyCount = items.filter(isReady).length;
  const draftCount = items.length - readyCount;

  return (
    <section className="prep-container">
      {/* Top Header & Rundown Selector */}
      <header className="prep-header-bar">
        <div className="prep-brand-info">
          <div className="prep-tag">01 / PRA PRODUKSI</div>
          <div className="prep-title-group">
            <h1>{rundown?.programName || "Manajemen Rundown"}</h1>
            <span className="prep-edition-badge">{rundown?.title || "Edisi Siaran"}</span>
            {rundown && (
              <button
                className="prep-rename-btn"
                onClick={() => setShowRenameModal(true)}
                title="Ubah nama program & edisi"
              >
                <Edit3 size={12} />
                <span>Ubah Edisi</span>
              </button>
            )}
          </div>
        </div>

        <div className="prep-actions-group">
          <select
            className="prep-select-rundown"
            aria-label="Pilih Rundown"
            value={rundown?.id || ""}
            onChange={(e) => {
              onRundown(e.target.value);
              setEditing(null);
            }}
          >
            {rundowns.map((r) => (
              <option key={r.id} value={r.id}>
                {r.programName} · {r.title}
              </option>
            ))}
          </select>

          <button
            className="btn-prep-secondary"
            onClick={async () => {
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
              }
            }}
          >
            <Plus size={13} />
            <span>Rundown Baru</span>
          </button>

          {rundown && (
            <button
              className="btn-prep-danger"
              disabled={pending}
              onClick={deleteCurrentRundown}
              title="Hapus rundown saat ini beserta seluruh berita di dalamnya"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "rgba(225, 29, 72, 0.12)",
                border: "1px solid rgba(225, 29, 72, 0.35)",
                color: "#ff8891",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              <Trash2 size={13} />
              <span>Hapus Rundown</span>
            </button>
          )}

          <button
            className="btn-prep-primary"
            disabled={!rundown}
            onClick={() => setEditing("new")}
          >
            <Plus size={14} />
            <span>Tambah Berita</span>
          </button>

          <button className="btn-prep-settings" onClick={onSetup} title="Pengaturan Ticker & Logo">
            <SlidersHorizontal size={13} />
            <span>Pengaturan</span>
          </button>
        </div>
      </header>

      {/* Metrics Summary Strip */}
      {rundown && (
        <div className="prep-metrics-strip">
          <div className="metric-box">
            <small>TOTAL BERITA</small>
            <b>{items.length} Segmen</b>
          </div>
          <div className="metric-box">
            <small>ESTIMASI DURASI SIARAN</small>
            <b>{duration(totalDuration)}</b>
          </div>
          <div className="metric-box">
            <small>SIAP TAYANG</small>
            <b className="text-ready">{readyCount} Berita</b>
          </div>
          <div className="metric-box">
            <small>PERLU DICEK</small>
            <b className={draftCount > 0 ? "text-warn" : ""}>{draftCount} Berita</b>
          </div>

          <div className="prep-filter-box">
            <Search size={13} />
            <input
              type="text"
              placeholder="Filter berita / slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modern Table List of Stories */}
      {rundown && (
        <div className="prep-table-card">
          <div className="prep-table-header">
            <div className="col-ord">#</div>
            <div className="col-fmt">FORMAT</div>
            <div className="col-main">BERITA & SLUG</div>
            <div className="col-dur">DURASI</div>
            <div className="col-cues">MATERI CG (CUE)</div>
            <div className="col-stat">STATUS</div>
            <div className="col-act">AKSI</div>
          </div>

          <div className="prep-table-body">
            {filteredItems.map((item, index) => {
              const ready = isReady(item);
              const realIndex = rundown.items.findIndex((i) => i.id === item.id);

              return (
                <div key={item.id} className="prep-row-item">
                  <div className="col-ord">
                    <span className="order-num">{String(realIndex + 1).padStart(2, "0")}</span>
                    <div className="order-btns">
                      <button
                        disabled={pending || realIndex === 0}
                        onClick={() => move(item, -1)}
                        title="Naikkan urutan"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        disabled={pending || realIndex === rundown.items.length - 1}
                        onClick={() => move(item, 1)}
                        title="Turunkan urutan"
                      >
                        <ArrowDown size={11} />
                      </button>
                    </div>
                  </div>

                  <div className="col-fmt">
                    <span className={`format-chip fmt-${item.format.toLowerCase()}`}>
                      {item.format}
                    </span>
                  </div>

                  <div className="col-main">
                    <strong className="story-title-text">{item.title}</strong>
                    <span className="story-slug-code">{item.slug}</span>
                  </div>

                  <div className="col-dur">
                    <span className="dur-badge">{duration(item.estimatedDurationSeconds)}</span>
                  </div>

                  <div className="col-cues">
                    <div className="cue-pills-list">
                      {item.graphics.map((g) => (
                        <span
                          key={g.id}
                          className={`cg-chip cg-${g.templateType.toLowerCase()} ${
                            g.status === "READY" ? "ready" : "draft"
                          }`}
                          title={`${graphicLabel(g)} (${g.status})`}
                        >
                          {g.templateType === "REPORTER" ? (
                            <>
                              <UserRound size={10} />
                              <span>{g.draftFields.name || "Nama"}</span>
                            </>
                          ) : g.templateType === "LOCATION" ? (
                            <>
                              <MapPin size={10} />
                              <span>{g.draftFields.location || "Lokasi"}</span>
                            </>
                          ) : (
                            <>
                              <MonitorPlay size={10} />
                              <span>{g.draftFields.headline?.slice(0, 18) || "Headline"}…</span>
                            </>
                          )}
                        </span>
                      ))}
                      {item.graphics.length === 0 && (
                        <span className="cg-chip-empty">Belum ada CG</span>
                      )}
                    </div>
                  </div>

                  <div className="col-stat">
                    <span className={`status-pill ${ready ? "is-ready" : "is-warn"}`}>
                      {ready ? "✓ Siap Tayang" : "⚠ Perlu Dicek"}
                    </span>
                  </div>

                  <div className="col-act">
                    <button
                      className="btn-act-edit"
                      onClick={() => setEditing(item)}
                      title="Edit materi berita dan daftar grafis"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      className="btn-act-delete"
                      onClick={() => removeItem(item)}
                      title="Hapus berita dari rundown"
                      disabled={pending}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {!filteredItems.length && (
              <div className="prep-table-empty">
                <span>
                  {search
                    ? "Tidak ada berita yang cocok dengan pencarian"
                    : "Rundown ini masih kosong. Klik 'Tambah Berita' untuk memulai."}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Rename Rundown */}
      {showRenameModal && rundown && (
        <RenameRundownModal
          rundown={rundown}
          onClose={() => setShowRenameModal(false)}
          onSaved={async () => {
            await reload();
            setShowRenameModal(false);
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
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reload();
            setEditing(null);
            toast("Berita dan seluruh materi CG berhasil disimpan");
          }}
        />
      )}
    </section>
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
  const [saving, setSaving] = useState(false);

  return (
    <div className="nr-modal-backdrop">
      <form
        className="modal-box rename-modal"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await mutate(`/api/rundowns/${rundown.id}`, "PATCH", {
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
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="modal-body form-grid">
          <label>
            <span>Nama Program Siaran</span>
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Seputar Berita Utama"
            />
          </label>
          <label>
            <span>Edisi / Tanggal</span>
            <input
              required
              maxLength={100}
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
type DraftGraphic = {
  id?: string;
  templateType: TemplateType;
  status: "DRAFT" | "READY";
  draftFields: Record<string, string>;
  sortOrder: number;
};

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
  const [seconds, setSeconds] = useState(item?.estimatedDurationSeconds || 60);
  const [graphics, setGraphics] = useState<DraftGraphic[]>(() => {
    if (item && item.graphics.length > 0) {
      return item.graphics.map((g) => ({ ...g, draftFields: { ...g.draftFields } }));
    }
    // Default otomatis untuk Berita Baru: langsung tampilkan 1 cue HEADLINE siap isi
    return [
      {
        templateType: "HEADLINE",
        status: "READY",
        sortOrder: 0,
        draftFields: {
          headline: item?.title || "",
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) {
      api<HeadlineDefaults>("/api/settings/headline-defaults")
        .then((def) => {
          if (def) {
            setGraphics((gs) => {
              if (gs.length > 0 && gs[0]?.templateType === "HEADLINE" && !gs[0].draftFields.headline) {
                return gs.map((g, idx) =>
                  idx === 0
                    ? {
                        ...g,
                        draftFields: {
                          ...g.draftFields,
                          headline: def.headline || g.draftFields.headline || "",
                          location: def.location || g.draftFields.location || "",
                          kicker: def.kicker || g.draftFields.kicker || "",
                          subline: def.subline || g.draftFields.subline || "",
                          showKicker: def.kicker ? "true" : "false"
                        }
                      }
                    : g
                );
              }
              return gs;
            });
            if (def.headline && !title) {
              setTitle(def.headline);
            }
          }
        })
        .catch(() => {});
    }
  }, [item]);

  function handleTitleChange(newTitle: string) {
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

  function add(type: TemplateType) {
    const base = graphics.find((g) => g.templateType === "HEADLINE")?.draftFields;
    setGraphics((gs) => {
      const newIndex = gs.length;
      setPreviewIndex(newIndex);
      return [
        ...gs,
        {
          templateType: type,
          status: "READY",
          sortOrder: newIndex,
          draftFields:
            type === "REPORTER"
              ? { name: "", role: "", contentMode: "presenter", layoutStyle: "sub", showLocation: "false", visualTemplate: "cnn" }
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
                  visualTemplate: "cnn"
                }
        }
      ];
    });
  }

  function addTieredFlow() {
    const headline = title.trim() || "HEADLINE BERITA";
    const baseLocation = graphics.find((g) => g.draftFields.location)?.draftFields.location || "";
    const baseSubline = graphics.find((g) => g.draftFields.subline)?.draftFields.subline || "";

    setGraphics([
      {
        templateType: "HEADLINE",
        status: "READY",
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
        status: "READY",
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
        status: "READY",
        sortOrder: 2,
        draftFields: {
          headline,
          location: baseLocation || "JAKARTA",
          subline: baseSubline || "Keterangan rincian informasi lengkap terkait berita...",
          layoutStyle: "sub",
          showLocation: baseLocation ? "true" : "false",
          showKicker: "false",
          contentMode: "headline"
        }
      }
    ]);
  }

  function field(index: number, key: string, value: string) {
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
        showLocation: currentPreviewCue.draftFields.location ? "true" : "false"
      }
    : null;

  return (
    <div className="nr-modal-backdrop">
      <form
        className="story-editor-modal"
        onSubmit={async (e) => {
          e.preventDefault();
          if (seconds < 1 || seconds > 21600) {
            setError("Durasi harus antara 00:01 dan 360:00.");
            return;
          }
          setSaving(true);
          setError("");
          try {
            await mutate(`/api/rundowns/${rundown.id}/story`, "PUT", {
              itemId: item?.id,
              title,
              slug,
              format,
              estimatedDurationSeconds: seconds,
              sortOrder: item?.sortOrder ?? rundown.items.length,
              graphics: graphics.map((g, i) => ({ ...g, sortOrder: i }))
            });
            await onSaved();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="modal-header">
          <div>
            <small>EDITOR MATERI BERITA</small>
            <h2>{item ? "Edit Berita & Materi CG" : "Tambah Berita Baru"}</h2>
          </div>
          <button type="button" className="btn-close-modal" disabled={saving} onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="story-editor-scroll-area">
          {/* Metadata Berita */}
          <div className="editor-card story-meta-card">
            <h3 className="section-title">Informasi Segmen Berita</h3>
            <div className="editor-form-grid">
              <label className="field-full">
                <span>Judul Berita</span>
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Masukkan judul berita utama..."
                />
              </label>

              <label>
                <span>Kode Slug</span>
                <input
                  required
                  maxLength={30}
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

          {/* Materi Grafis (Cues) */}
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
                <button type="button" onClick={() => add("REPORTER")}>
                  + Tambah Narasumber
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
                <div key={g.id || index} className="cue-editor-card">
                  <div className="cue-editor-header">
                    <div className="cue-header-left">
                      <span className="cue-number">#{index + 1}</span>
                      <b>
                        {g.templateType === "REPORTER"
                          ? "CG NAMA / NARASUMBER"
                          : g.templateType === "LOCATION"
                          ? "CG LOKASI"
                          : "LOWER THIRD HEADLINE"}
                      </b>
                    </div>

                    <div className="cue-header-right">
                      <select
                        aria-label={`Status grafis ${index + 1}`}
                        value={g.status}
                        onChange={(e) =>
                          setGraphics((gs) =>
                            gs.map((x, i) =>
                              i === index
                                ? { ...x, status: e.target.value as "READY" | "DRAFT" }
                                : x
                            )
                          )
                        }
                        className={`status-select ${g.status === "READY" ? "ready" : "draft"}`}
                      >
                        <option value="DRAFT">DRAFT (Perlu Dicek)</option>
                        <option value="READY">SIAP TAYANG</option>
                      </select>

                      <button
                        type="button"
                        className="btn-remove-cue"
                        onClick={() => setGraphics((gs) => gs.filter((_, i) => i !== index))}
                        title="Hapus materi CG ini"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="cue-editor-body">
                    <BroadcastTemplateInfo />
                    {g.templateType === "REPORTER" ? (
                      <div className="cue-fields-grid">
                        <label>
                          <span>Nama Lengkap Narasumber / Presenter</span>
                          <input
                            required
                            maxLength={60}
                            value={g.draftFields.name || ""}
                            onChange={(e) => field(index, "name", e.target.value)}
                            placeholder="Contoh: Dr. Ir. Budi Santoso, M.Sc"
                          />
                        </label>
                        <label>
                          <span>Jabatan / Institusi / Media Sosial</span>
                          <input
                            maxLength={60}
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
                            maxLength={50}
                            value={g.draftFields.location || ""}
                            onChange={(e) => field(index, "location", e.target.value)}
                            placeholder="Contoh: JAKARTA PUSAT"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="cue-fields-grid">
                        <label className="field-full">
                          <span>Headline Utama (Wajib) <strong style={{ color: "#ef4444" }}>*</strong></span>
                          <input
                            required
                            maxLength={120}
                            value={g.draftFields.headline || ""}
                            onChange={(e) => field(index, "headline", e.target.value)}
                            placeholder="Judul headline utama yang wajib diisi..."
                          />
                        </label>
                        <label>
                          <span>Sub Topik di Atas / Kicker (Opsional)</span>
                          <input
                            maxLength={60}
                            value={g.draftFields.kicker || ""}
                            onChange={(e) => field(index, "kicker", e.target.value)}
                            placeholder="Contoh: BREAKING NEWS (kosongkan jika tidak ada)"
                          />
                        </label>
                        <label>
                          <span>Detail Headline / Keterangan (Opsional)</span>
                          <input
                            maxLength={140}
                            value={g.draftFields.subline || ""}
                            onChange={(e) => field(index, "subline", e.target.value)}
                            placeholder="Keterangan tambahan (kosongkan jika tidak ada)"
                          />
                        </label>
                        <label className="field-full">
                          <span>Lokasi Liputan (Opsional)</span>
                          <input
                            maxLength={50}
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

          {/* Panel Preview Siaran Real-Time (WYSIWYG) */}
          <div className="editor-card story-preview-card">
            <div className="story-preview-header">
              <div className="preview-header-left">
                <span className="dot-led green pulse" />
                <div>
                  <h3 className="section-title">PREVIEW GRAFIS SIARAN (REAL-TIME)</h3>
                  <span className="preview-subtitle">
                    Visual siaran langsung (WYSIWYG 1080p) otomatis merespons teks yang diisi pada form di atas
                  </span>
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
                        #{i + 1} {g.templateType === "REPORTER" ? "Narasumber" : g.templateType === "LOCATION" ? "Lokasi" : "Headline"}
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
                    ? { id: "draft-preview", templateType: currentPreviewCue.templateType }
                    : null
                }
                fields={effectivePreviewFields}
                master={master}
                emptyText="Ketik headline pada form di atas untuk melihat visual siaran..."
              />
            </div>
            <div className="story-preview-caption">
              <span>● Visual di atas adalah representasi langsung (*alpha overlay*) di layar siaran.</span>
            </div>
          </div>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-footer">
          <span className="modal-tip">Semua perubahan tersimpan di database materi siaran.</span>
          <div className="footer-actions">
            <button type="button" className="btn-modal-cancel" disabled={saving} onClick={onClose}>
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

// =====================================================================
// PANEL PRODUKSI (vMIX MULTIVIEW & BROADCAST SWITCHER)
// =====================================================================
type Timer = { itemId: string; title: string; endAt: number | null; remaining: number };

export function Production({
  rundown,
  rundowns,
  onRundown,
  reload,
  toast,
  master: initialMaster,
  live: initialLive,
  onSetup,
  onPrepare
}: Props) {
  const [itemId, setItemId] = useState(() => sessionStorage.getItem("newscg-cued-story") || "");
  const [cueId, setCueId] = useState(() => sessionStorage.getItem("newscg-cued-graphic") || "");
  const [search, setSearch] = useState("");
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [quickDraft, setQuickDraft] = useState<Record<string, string>>({});
  const pendingRevision = useRef<{ id: string; fields: Record<string, string> } | null>(null);

  useEffect(() => {
    sessionStorage.setItem("newscg-cued-story", itemId);
  }, [itemId]);

  useEffect(() => {
    sessionStorage.setItem("newscg-cued-graphic", cueId);
  }, [cueId]);

  const [live, setLive] = useState(initialLive);
  const [master, setMaster] = useState(initialMaster);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [commandFeedback, setCommandFeedback] = useState<{ text: string; error: boolean }>({ text: "Pilih materi di rundown, cek preview, lalu TAKE.", error: false });
  const [reporterForm, setReporterForm] = useState(false);
  const [reporterName, setReporterName] = useState("");
  const [reporterRole, setReporterRole] = useState("");
  const editLock = useRef(false);
  const [editBusy, setEditBusy] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  const [reviewed, setReviewed] = useState<string[]>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem("newscg-reviewed") || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    sessionStorage.setItem("newscg-reviewed", JSON.stringify(reviewed));
  }, [reviewed]);

  const [timer, setTimer] = useState<Timer | null>(() => {
    try {
      const t = JSON.parse(sessionStorage.getItem("newscg-timer") || "null");
      return t &&
        typeof t.remaining === "number" &&
        typeof t.itemId === "string" &&
        (t.endAt === null || typeof t.endAt === "number")
        ? t
        : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setLive(initialLive);
  }, [initialLive]);

  useEffect(() => {
    setMaster(initialMaster);
  }, [initialMaster]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("newscg-timer", JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    let mounted = true;
    const id = setInterval(() => {
      api<MasterOverlayState>("/api/live/master")
        .then((m) => {
          if (mounted) setMaster(m);
        })
        .catch(() => {});
    }, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const item = rundown?.items.find((i) => i.id === itemId) || rundown?.items[0] || null;
  const cue = item?.graphics.find((g) => g.id === cueId) || item?.graphics[0] || null;

  useEffect(() => {
    if (cue) {
      const pending = pendingRevision.current;
      setQuickDraft(pending?.id === cue.id ? pending.fields : cue.draftFields || {});
      pendingRevision.current = null;
    } else {
      setQuickDraft({});
    }
  }, [cue?.id]);
  useEffect(() => { if (!showQuickEdit) setQuickDraft(cue?.draftFields || {}); }, [cue?.draftFields, showQuickEdit]);

  const quickDirty = showQuickEdit && JSON.stringify(quickDraft) !== JSON.stringify(cue?.draftFields || {});
  const allGraphics = rundowns.flatMap((r) => r.items.flatMap((i) => i.graphics));
  const onAir = allGraphics.find((g) => g.id === live.onAirGraphicId) || null;
  const remaining = timer?.endAt ? Math.ceil((timer.endAt - now) / 1000) : timer?.remaining || 0;
  const reviewedKey = (i: RundownItem) =>
    JSON.stringify({ ...i, graphics: i.graphics.map(({ lastPushedFields, ...g }) => g) });

  function select(i: RundownItem) {
    if (quickDirty) { toast("Simpan atau batalkan revisi sebelum pindah materi."); return; }
    setItemId(i.id);
    const defaultCue = i.graphics.find((g) => g.templateType === "HEADLINE") || i.graphics[0];
    if (defaultCue) {
      setCueId(defaultCue.id);
      setQuickDraft(defaultCue.draftFields);
    }
    setShowQuickEdit(false);
  }

  async function command(action: string, graphic?: GraphicItem): Promise<boolean> {
    if (lock.current) return false;
    if (action === "update" && (!graphic || graphic.id !== live.onAirGraphicId)) return false;
    if (graphic && graphic.status !== "READY") {
      toast("CG masih berstatus draft. Silakan tandai siap tayang.");
      return false;
    }
    lock.current = true;
    setBusy(true);
    setCommandFeedback({ text: "Mengirim perintah ke output…", error: false });
    try {
      const result = await mutate<{ state: LiveState; error?: string; commandStatus: string }>(
        `/api/live/${action}`,
        "POST",
        graphic ? { graphicId: graphic.id } : {},
        true
      );
      setLive(result.state);
      if (result.commandStatus !== "confirmed")
        throw new Error(result.error || "Output belum terkonfirmasi");
      setCommandFeedback({ text: `${action === "take" ? "TAKE" : action === "update" ? "UPDATE LIVE" : action === "clear-all" ? "BERSIH TOTAL" : "CLEAR CG"} terkonfirmasi`, error: false });
      await reload().catch(() => toast("Perintah berhasil. Daftar materi belum tersinkron; coba muat ulang."));
      return true;
    } catch (e) {
      setCommandFeedback({ text: (e as Error).message, error: true });
      toast((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function takeAndNext() {
    if (!cue || lock.current || quickDirty) return;
    const currentCue = cue;
    await takeThenAdvance(() => command("take", currentCue), () => {
    if (item && rundown) {
      const cueIndex = item.graphics.findIndex((g) => g.id === currentCue.id);
      const nextGraphic = item.graphics[cueIndex + 1];
      if (cueIndex >= 0 && nextGraphic) {
        setCueId(nextGraphic.id);
      } else {
        const itemIndex = rundown.items.findIndex((i) => i.id === item.id);
        const nextStory = rundown.items[itemIndex + 1];
        if (itemIndex >= 0 && nextStory) {
          select(nextStory);
        }
      }
    }
    });
  }

  async function toggleMaster(key: "showLogo" | "showLiveBadge" | "showTicker") {
    if (lock.current || editLock.current) return;
    lock.current = true; setBusy(true);
    try {
      const updated = await mutate<MasterOverlayState>("/api/live/master", "PATCH", { [key]: !master[key] });
      setMaster(updated); await reload();
    } catch (error) { toast((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function base(mode: "empty" | "logo" | "full") {
    if (lock.current || editBusy) return;
    if (mode === "empty") { await command("clear-all"); return; }
    lock.current = true; setBusy(true);
    try {
      const updated = await mutate<MasterOverlayState>("/api/live/master", "PATCH", {
        showLogo: true, showTicker: mode === "full", showLiveBadge: mode === "full"
      });
      setMaster(updated); await reload();
      setCommandFeedback({ text: "Layer master diperbarui. Headline tetap tayang.", error: false });
    } catch (error) { toast((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function saveRevision(updateLive = false) {
    if (!cue || editLock.current || busy) return;
    const mainText = cue.templateType === "REPORTER" ? quickDraft.name : cue.templateType === "LOCATION" ? quickDraft.location : quickDraft.headline;
    if (!mainText?.trim()) { toast("Teks utama wajib diisi."); return; }
    if (quickDraft.showLocation === "true" && !quickDraft.location?.trim()) { toast("Isi lokasi atau nonaktifkan lokasi."); return; }
    if (updateLive && cue.id !== live.onAirGraphicId) return;
    editLock.current = true; setEditBusy(true);
    try {
      const patched = await mutate<GraphicItem>(`/api/graphics/${cue.id}`, "PATCH", { draftFields: quickDraft, status: "READY" });
      if (updateLive) {
        const confirmed = await command("update", patched);
        if (!confirmed) return;
      } else await reload();
      setShowQuickEdit(false);
      toast(updateLive ? "UPDATE LIVE terkonfirmasi" : "Tersimpan ke PREVIEW. Siaran belum berubah.");
    } catch (error) { toast((error as Error).message); }
    finally { editLock.current = false; setEditBusy(false); }
  }
  const saveQuickDraft = () => saveRevision(false);
  const saveAndUpdateLive = () => saveRevision(true);

  function selectCue(g: GraphicItem) {
    if (quickDirty) {
      toast("Simpan atau batalkan revisi sebelum memilih materi lain.");
      return;
    }
    setCueId(g.id);
    setQuickDraft(g.draftFields);
    setShowQuickEdit(false);
    const label = g.draftFields.headline || g.draftFields.name || g.draftFields.location || graphicLabel(g);
    setCommandFeedback({
      text: `Materi "${label}" dimuat ke PREVIEW. Tekan TAKE untuk menayangkan.`,
      error: false
    });
  }

  function selectVariant(variant: "clean" | "location" | "detail") {
    if (!item || busy || editBusy) return;
    if (quickDirty) { toast("Simpan atau batalkan revisi sebelum memilih variasi."); return; }
    const headlines = item.graphics.filter((graphic) => graphic.templateType === "HEADLINE" || graphic.templateType === "BREAKING");
    if (!headlines.length) {
      toast("Belum ada headline pada berita ini.");
      return;
    }
    const specific = headlines.find((graphic) => {
      const f = graphic.draftFields;
      if (variant === "detail") return Boolean(f.subline);
      if (variant === "location") return Boolean(f.location);
      return !f.subline && !f.location;
    });
    const target = specific || headlines[0];
    if (target) {
      selectCue(target);
    }
  }

  function stageToggle(kind: "location" | "detail") {
    if (!cue || busy || editBusy) return;
    if (cue.templateType === "REPORTER" || cue.templateType === "LOCATION") {
      toast("Pilih headline untuk mengatur lokasi dan detail."); return;
    }
    const source = showQuickEdit ? quickDraft : cue.draftFields;
    const updated = { ...source };
    if (kind === "location") updated.showLocation = source.showLocation === "true" ? "false" : "true";
    else updated.layoutStyle = source.layoutStyle !== "single" && source.subline ? "single" : "sub";
    setQuickDraft(updated); setShowQuickEdit(true);
    setCommandFeedback({ text: "Perubahan hanya di PREVIEW. Simpan atau UPDATE LIVE setelah diperiksa.", error: false });
  }
  const toggleLiveLocation = () => stageToggle("location");
  const toggleLiveDetail = () => stageToggle("detail");

  function addNewReporterCue() {
    setReporterForm(true);
  }
  async function saveReporter() {
    if (!item || !reporterName.trim() || editLock.current || busy) return;
    editLock.current = true; setEditBusy(true);
    try {
      const newCue = await mutate<GraphicItem>(`/api/items/${item.id}/graphics`, "POST", {
        templateType: "REPORTER", status: "READY", sortOrder: item.graphics.length,
        draftFields: { name: reporterName.trim(), role: reporterRole.trim(), contentMode: "presenter",
          layoutStyle: "sub", showLocation: "false", visualTemplate: "cnn" }
      });
      await reload(); setCueId(newCue.id); setReporterForm(false); setReporterName(""); setReporterRole("");
      toast("Narasumber siap di PREVIEW. Tekan TAKE untuk menayangkan.");
    } catch (error) { toast((error as Error).message); }
    finally { editLock.current = false; setEditBusy(false); }
  }

  function findQuick(kind: string) {
    const match =
      kind === "cg"
        ? item?.graphics.find((g) => g.templateType === "REPORTER")
        : item?.graphics.find(
            (g) =>
              (g.templateType === "HEADLINE" || g.templateType === "BREAKING") &&
              (kind === "location"
                ? g.draftFields.showLocation === "true"
                : kind === "detail"
                ? Boolean(g.draftFields.subline && g.draftFields.layoutStyle !== "single")
                : g.draftFields.showLocation !== "true" &&
                  (!g.draftFields.subline || g.draftFields.layoutStyle === "single"))
          );
    return match;
  }

  function quick(kind: string) {
    if (quickDirty) { toast("Simpan atau batalkan revisi sebelum memilih materi."); return; }
    if (kind === "cg") {
      const reporter = item?.graphics.find((g) => g.templateType === "REPORTER");
      if (reporter) {
        selectCue(reporter);
      } else {
        addNewReporterCue();
      }
    } else if (kind === "headline") {
      selectVariant("clean");
    } else if (kind === "location") {
      selectVariant("location");
    } else if (kind === "detail") {
      selectVariant("detail");
    }
  }

  function stepCue(dir: number) {
    if (!item?.graphics.length || busy || editBusy) return;
    if (quickDirty) { toast("Simpan atau batalkan revisi sebelum pindah cue."); return; }
    const curIdx = item.graphics.findIndex((g) => g.id === cue?.id);
    const nextIdx = curIdx + dir;
    const nextGraphic = item.graphics[nextIdx];
    if (nextIdx >= 0 && nextGraphic) {
      setCueId(nextGraphic.id);
    } else if (dir > 0 && rundown) {
      const itemIdx = rundown.items.findIndex((i) => i.id === item.id);
      const nextStory = rundown.items[itemIdx + 1];
      if (itemIdx >= 0 && nextStory) {
        select(nextStory);
      }
    } else if (dir < 0 && rundown) {
      const itemIdx = rundown.items.findIndex((i) => i.id === item.id);
      if (itemIdx > 0) {
        const prevItem = rundown.items[itemIdx - 1];
        if (prevItem) {
          setItemId(prevItem.id);
          const lastCue = prevItem.graphics[prevItem.graphics.length - 1];
          if (lastCue) setCueId(lastCue.id);
        }
      }
    }
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const action = liveShortcut(event.key, {
        disabled: reporterForm || busy || editBusy || !shortcutsEnabled || Boolean(document.querySelector(".modal-overlay,.nr-modal-backdrop")),
        editing: Boolean(target?.closest("input,textarea,select,[contenteditable=true],[role=dialog]")),
        interactive: Boolean(target?.closest("button,a,summary,[role=button]")),
        repeat: event.repeat, modified: event.ctrlKey || event.metaKey || event.altKey,
      });
      if (!action) return;
      event.preventDefault();
      if (action === "clear-all") void command("clear-all");
      else if (action === "logo" || action === "full") void base(action);
      else if (action === "headline" || action === "location" || action === "detail") quick(action);
      else if (action === "take" && cue && !quickDirty) void command("take", cue);
      else if (action === "update" && cue?.id === live.onAirGraphicId && cue && !quickDirty) void command("update", cue);
      else if (action === "clear") void command("clear");
      else if (action === "next") stepCue(1);
      else if (action === "previous") stepCue(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const index = rundown?.items.findIndex((i) => i.id === item?.id) ?? -1;
  const next = rundown?.items[index + 1];
  const visibleItems =
    rundown?.items.filter((i) =>
      `${i.title} ${i.slug}`.toLowerCase().includes(search.toLowerCase())
    ) || [];

  const quickCues = [
    { key: "cg", label: "Nama", shortcut: "3" },
    { key: "headline", label: "Headline", shortcut: "4" },
    { key: "location", label: "Lokasi", shortcut: "5" },
    { key: "detail", label: "Detail", shortcut: "6" }
  ];

  const programLabel = onAir
    ? live.onAirSnapshot?.headline || live.onAirSnapshot?.name || live.onAirSnapshot?.location || graphicLabel(onAir)
    : master.showTicker
    ? "Ticker + jam · Master aktif"
    : master.showLogo
    ? "Logo Bug Saja"
    : master.showLiveBadge ? "Badge LIVE aktif" : "Output Bersih (Clean Feed)";

  const headlineCue =
    item?.graphics.find((g) => g.templateType === "HEADLINE" || g.templateType === "BREAKING") ||
    item?.graphics[0];

  return (
    <div className="vmix-production-shell">
      {/* =========================================================
          BAGIAN ATAS: MULTIVIEWER & TRANSITION CONSOLE (Studio Switcher)
          ========================================================= */}
      <section className="vmix-multiview-deck">
        {/* 1. MONITOR PREVIEW (STANDBY) */}
        <div className="vmix-monitor-card monitor-preview">
          <header className="monitor-header">
            <div className="monitor-badge-group">
              <span className="dot-led green" />
              <b className="monitor-title">PREVIEW</b>
              <span className="monitor-tag standby">STANDBY</span>
            </div>
            <span className="monitor-res">1080p · STANDBY</span>
          </header>

          <div className="monitor-screen-area">
            <BroadcastPreviewBox
              graphic={cue}
              fields={showQuickEdit && cue ? quickDraft : cue?.draftFields || null}
              master={master}
              emptyText="PILIH CUE GRAFIS"
            />
          </div>

          <footer className="monitor-footer">
            <span className="monitor-cue-name">
              {cue
                ? `${cue.draftFields.headline || cue.draftFields.name || graphicLabel(cue)}`
                : "Belum ada materi standby"}
            </span>
            <span className="monitor-type-badge">
              {quickDirty ? "REVISI BELUM DISIMPAN" : cue ? `${cue.templateType} · ${cue.status}` : "NO CUE"}
            </span>
          </footer>
        </div>

        {/* 2. SWITCHER TRANSITION CONSOLE (Center Hardware Console) */}
        <aside className="vmix-transition-console">
          <div className="console-target">
            <div className="console-target-header">
              <span className="target-label-tag">STANDBY CUE</span>
              <div className="console-stepper-mini">
                <button
                  className="cue-mini-btn"
                  onClick={() => stepCue(-1)}
                  title="Pilih Cue Sebelumnya (↑)"
                >
                  <ArrowUp size={11} />
                </button>
                <button
                  className="cue-mini-btn"
                  onClick={() => stepCue(1)}
                  title="Pilih Cue Berikutnya (↓)"
                >
                  <ArrowDown size={11} />
                </button>
              </div>
            </div>
            <strong className="target-title">
              {cue?.draftFields.headline || cue?.draftFields.name || cue?.draftFields.location || "Pilih materi"}
            </strong>
            <div className="target-status-line">
              <span className={`target-pill ${cue?.status === "READY" ? "ready" : "draft"}`}>
                {cue?.status === "READY" ? "SIAP TAKE" : "DRAFT"}
              </span>
              <small className="target-hint">{cue ? graphicLabel(cue) : "Belum dipilih"}</small>
            </div>
          </div>

          {/* Main Transition Buttons */}
          <div className="transition-primary-group">
            <button
              className="btn-vmix-take"
              disabled={busy || editBusy || quickDirty || !cue || cue.status !== "READY"}
              onClick={() => cue && command("take", cue)}
              title="Tayangkan materi standby ke siaran (Hotkey: SPACE / T)"
            >
              <div className="btn-take-inner">
                {busy ? <LoaderCircle className="spin" size={20} /> : <MonitorPlay size={20} />}
                <span className="take-text">TAKE</span>
              </div>
              <kbd className="take-kbd">SPACE</kbd>
            </button>

            <div className="transition-secondary-grid">
              <button
                className="btn-vmix-take-next"
                disabled={busy || editBusy || quickDirty || !cue || cue.status !== "READY"}
                onClick={takeAndNext}
                title="Tayangkan dan langsung pilih cue berikutnya (Hotkey: ENTER)"
              >
                <SkipForward size={13} />
                <span>TAKE & NEXT</span>
                <kbd>ENTER</kbd>
              </button>

              <button
                className={`btn-vmix-update ${
                  cue && cue.id === live.onAirGraphicId ? "on-air-sync" : ""
                }`}
                disabled={busy || editBusy || quickDirty || !cue || cue.status !== "READY" || cue.id !== live.onAirGraphicId}
                onClick={() => cue && command("update", cue)}
                title="Perbarui teks siaran langsung tanpa animasi keluar (Hotkey: U)"
              >
                <RefreshCw size={12} />
                <span>UPDATE</span>
                <kbd>U</kbd>
              </button>

              <button
                className="btn-vmix-clear"
                disabled={busy || !live.onAirGraphicId}
                onClick={() => command("clear")}
                title="Keluarkan CG Lower Third dengan animasi out (Hotkey: ESC / C)"
              >
                <X size={13} />
                <span>CLEAR CG</span>
                <kbd>ESC</kbd>
              </button>

              <button
                className="btn-vmix-blackout"
                disabled={busy}
                onClick={() => command("clear-all")}
                title="Kosongkan seluruh layer siaran termasuk Master (Hotkey: 0)"
              >
                <Trash2 size={12} />
                <span>ALL CLEAR</span>
                <kbd>0</kbd>
              </button>
            </div>
          </div>

          <p className={`console-feedback ${commandFeedback.error ? "error" : ""}`} role="status" aria-live="polite">
            {quickDirty ? "Revisi belum disimpan. Simpan ke preview sebelum TAKE." : commandFeedback.text}
          </p>

          {/* Master Layer Switches */}
          <div className="transition-master-group">
            <span className="master-live-label">LAYER MASTER (LANGSUNG ON AIR)</span>
            <div className="master-toggles">
              <button
                className={`master-toggle-btn toggle-logo ${master.showLogo ? "active" : ""}`}
                aria-pressed={master.showLogo}
                disabled={busy || editBusy}
                onClick={() => toggleMaster("showLogo")}
                title="Toggle Logo Bug Siaran"
              >
                <span className="toggle-indicator" />
                <span>LOGO</span>
              </button>
              <button
                className={`master-toggle-btn toggle-live ${master.showLiveBadge ? "active" : ""}`}
                aria-pressed={master.showLiveBadge}
                disabled={busy || editBusy}
                onClick={() => toggleMaster("showLiveBadge")}
                title="Toggle Indikator LIVE"
              >
                <span className="toggle-indicator" />
                <span>LIVE</span>
              </button>
              <button
                className={`master-toggle-btn toggle-ticker ${master.showTicker ? "active" : ""}`}
                aria-pressed={master.showTicker}
                disabled={busy || editBusy}
                onClick={() => toggleMaster("showTicker")}
                title="Toggle Running Ticker & Jam"
              >
                <span className="toggle-indicator" />
                <span>TICKER</span>
              </button>
            </div>
          </div>
        </aside>

        {/* 3. MONITOR PROGRAM (ON AIR) */}
        <div className={`vmix-monitor-card monitor-program ${live.onAirGraphicId ? "is-live" : ""}`}>
          <header className="monitor-header">
            <div className="monitor-badge-group">
              <span className={`dot-led red ${live.onAirGraphicId ? "pulse" : ""}`} />
              <b className="monitor-title">PROGRAM</b>
              <span className={`monitor-tag ${live.onAirGraphicId ? "on-air" : "idle"}`}>
                {live.onAirGraphicId ? "ON AIR" : "CG KOSONG"}
              </span>
            </div>
            <span className="monitor-res">1080p · ON AIR</span>
          </header>

          <div className="monitor-screen-area">
            <ProgramPreview graphic={onAir} fields={live.onAirSnapshot} master={master} />
          </div>

          <footer className="monitor-footer">
            <span className="monitor-cue-name">{programLabel}</span>
            <span className="monitor-type-badge live-state">
              {live.onAirGraphicId ? "LIVE ON AIR" : master.showLogo || master.showTicker || master.showLiveBadge ? "MASTER AKTIF" : "OUTPUT BERSIH"}
            </span>
          </footer>
        </div>
      </section>

      {/* =========================================================
          BAGIAN BAWAH: INPUTS & RUNDOWN DECK
          ========================================================= */}
      <section className="vmix-bottom-deck">
        {/* SISI KIRI: RUNDOWN BERITA & TIMER */}
        <aside className="vmix-rundown-panel">
          <header className="deck-panel-header">
            <div className="panel-title-row">
              <b className="panel-title-text">RUNDOWN</b>
              <span className="rundown-stats-badge">
                {index >= 0 ? `${index + 1}/${rundown?.items.length || 0}` : "—"}
              </span>
            </div>
            <div className="panel-search-bar">
              <Search size={12} />
              <input
                type="text"
                placeholder="Filter berita…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X size={11} />
                </button>
              )}
            </div>
          </header>

          {/* Segment Timer Strip */}
          <div className="rundown-timer-strip">
            <div className="timer-readout">
              <Clock3 size={12} className="timer-icon" />
              <span className="timer-label">
                {timer && timer.itemId === item?.id
                  ? timer.endAt
                    ? "SISA"
                    : "JEDA"
                  : "ESTIMASI"}
              </span>
              <strong className={`timer-digits ${timer && remaining <= 10 ? "urgent" : ""}`}>
                {duration(
                  timer && timer.itemId === item?.id
                    ? remaining
                    : item?.estimatedDurationSeconds || 0
                )}
              </strong>
            </div>

            <div className="timer-actions">
              {timer && timer.itemId === item?.id ? (
                <>
                  <button
                    className="timer-action-btn pause"
                    onClick={() =>
                      setTimer((t) =>
                        t
                          ? {
                              ...t,
                              endAt: t.endAt ? null : Date.now() + t.remaining * 1000,
                              remaining
                            }
                          : null
                      )
                    }
                  >
                    {timer.endAt ? "Jeda" : "Lanjut"}
                  </button>
                  <button className="timer-action-btn finish" onClick={() => setTimer(null)}>
                    Stop
                  </button>
                </>
              ) : (
                <button
                  className="timer-action-btn start"
                  disabled={!item || (item.estimatedDurationSeconds || 0) <= 0}
                  onClick={() =>
                    item &&
                    setTimer({
                      itemId: item.id,
                      title: item.title,
                      endAt: Date.now() + item.estimatedDurationSeconds * 1000,
                      remaining: item.estimatedDurationSeconds
                    })
                  }
                >
                  <Play size={10} />
                  <span>Mulai</span>
                </button>
              )}

              <button
                className="timer-action-btn next"
                disabled={!next}
                onClick={() => next && select(next)}
                title="Lanjut ke berita berikutnya"
              >
                <SkipForward size={10} />
              </button>
            </div>
          </div>

          {/* List Item Rundown */}
          <div className="rundown-items-scroll">
            {visibleItems.map((i, storyIndex) => {
              const isSelected = i.id === item?.id;
              const isItemOnAir = i.graphics.some((g) => g.id === live.onAirGraphicId);
              const isItemReviewed = reviewed.includes(reviewedKey(i));

              return (
                <button
                  key={i.id}
                  className={`rundown-row-card ${isSelected ? "selected" : ""} ${
                    isItemOnAir ? "on-air" : ""
                  }`}
                  onClick={() => select(i)}
                >
                  <span className="row-num">
                    {String((rundown?.items.indexOf(i) ?? storyIndex) + 1).padStart(2, "0")}
                  </span>
                  <div className="row-main">
                    <div className="row-title">{i.title}</div>
                    <div className="row-meta">
                      <span className={`format-tag fmt-${i.format.toLowerCase()}`}>{i.format}</span>
                      <span className="cg-count">{i.graphics.length} CG</span>
                      {isItemOnAir && <span className="tag-onair">LIVE</span>}
                      {isItemReviewed && !isItemOnAir && <span className="tag-checked">✓ Cek</span>}
                      {!isReady(i) && !isItemOnAir && <span className="tag-draft">Draft</span>}
                    </div>
                  </div>
                  <span className="row-dur">{duration(i.estimatedDurationSeconds)}</span>
                </button>
              );
            })}

            {!visibleItems.length && (
              <div className="empty-rundown-notice">
                <span>{search ? "Berita tidak ditemukan" : "Rundown masih kosong"}</span>
                {!search && (
                  <button className="btn-goto-prep" onClick={onPrepare}>
                    + Tambah di Persiapan
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* SISI KANAN: GRAPHIC CUES DECK */}
        <main className="vmix-inputs-panel">
          <header className="inputs-panel-header">
            <div className="active-story-info">
              <span className="story-slug-label">
                {item ? `${item.slug} · FORMAT ${item.format}` : "MATERI BERITA"}
              </span>
              <h2 className="story-title-label">{item?.title || "Pilih berita dari rundown"}</h2>
            </div>

            <div className="header-quick-actions">
              {/* Review Toggle Button */}
              <button
                className={`review-btn ${
                  item && reviewed.includes(reviewedKey(item)) ? "is-reviewed" : ""
                }`}
                disabled={!item}
                onClick={() =>
                  item &&
                  setReviewed((keys) =>
                    keys.includes(reviewedKey(item))
                      ? keys.filter((k) => k !== reviewedKey(item))
                      : [...keys, reviewedKey(item)]
                  )
                }
                title="Tandai berita ini sudah dicek produser"
              >
                <Check size={12} />
                <span>{item && reviewed.includes(reviewedKey(item)) ? "Sudah Dicek" : "Tandai Dicek"}</span>
              </button>

              {/* Quick Edit Toggle Button */}
              <button
                className={`quick-edit-toggle-btn ${showQuickEdit ? "active" : ""}`}
                disabled={!cue}
                onClick={() => {
                  if (quickDirty) {
                    toast("Simpan atau batalkan revisi terlebih dahulu.");
                    return;
                  }
                  setShowQuickEdit(!showQuickEdit);
                }}
                title="Buka / Tutup Form Revisi Teks"
              >
                <Edit3 size={12} />
                <span>{showQuickEdit ? "Tutup Editor" : "Revisi Teks"}</span>
              </button>
            </div>
          </header>

          {/* Quick Edit Box Inline */}
          {showQuickEdit && cue && (
            <div className="vmix-quick-edit-box">
              <div className="quick-edit-title-bar">
                <span className="quick-edit-title-text">
                  REVISI TEKS · CUE {cue.templateType}
                </span>
                <button
                  className="quick-edit-close-btn"
                  aria-label="Batalkan revisi"
                  onClick={() => {
                    pendingRevision.current = null;
                    setQuickDraft(cue.draftFields);
                    setShowQuickEdit(false);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <BroadcastTemplateInfo />
              <div className="quick-edit-fields">
                {cue.templateType === "REPORTER" ? (
                  <>
                    <label>
                      <span>NAMA PEMBAWA / NARASUMBER</span>
                      <input
                        value={quickDraft.name || quickDraft.headline || ""}
                        maxLength={60}
                        placeholder="Contoh: Budi Santoso"
                        onChange={(e) =>
                          setQuickDraft((d) => ({
                            ...d,
                            name: e.target.value,
                            headline: e.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>JABATAN / MEDIA SOSIAL</span>
                      <input
                        value={quickDraft.role || quickDraft.socialHandle || ""}
                        maxLength={60}
                        placeholder="Contoh: Pengamat Kebijakan Publik"
                        onChange={(e) =>
                          setQuickDraft((d) => ({
                            ...d,
                            role: e.target.value,
                            socialHandle: e.target.value
                          }))
                        }
                      />
                    </label>
                  </>
                ) : cue.templateType === "LOCATION" ? (
                  <label className="field-full">
                    <span>NAMA LOKASI</span>
                    <input
                      value={quickDraft.location || ""}
                      maxLength={50}
                      placeholder="Contoh: JAKARTA PUSAT"
                      onChange={(e) => setQuickDraft((d) => ({ ...d, location: e.target.value }))}
                    />
                  </label>
                ) : (
                  <>
                    <label className="field-full">
                      <span>HEADLINE BERITA</span>
                      <input
                        value={quickDraft.headline || ""}
                        maxLength={120}
                        placeholder="Teks judul berita..."
                        onChange={(e) => setQuickDraft((d) => ({ ...d, headline: e.target.value }))}
                      />
                    </label>
                    <label className="field-full">
                      <span>SUB TOPIK DI ATAS / KICKER (OPSIONAL)</span>
                      <input
                        value={quickDraft.kicker || ""}
                        maxLength={60}
                        placeholder="Contoh: BREAKING NEWS (kosongkan jika tidak ada)"
                        onChange={(e) => setQuickDraft((d) => ({ ...d, kicker: e.target.value }))}
                      />
                    </label>
                    <label className="field-full">
                      <span>KETERANGAN / SUBLINE</span>
                      <input
                        value={quickDraft.subline || ""}
                        maxLength={140}
                        placeholder="Teks keterangan pendukung..."
                        onChange={(e) => setQuickDraft((d) => ({ ...d, subline: e.target.value }))}
                      />
                    </label>
                  </>
                )}
              </div>
              {cue.templateType !== "REPORTER" && (
                <label className="quick-location-field">
                  <span>Lokasi Liputan</span>
                  <input
                    maxLength={50}
                    placeholder="Contoh: JAKARTA"
                    value={quickDraft.location || ""}
                    onChange={(event) =>
                      setQuickDraft((draft) => ({ ...draft, location: event.target.value }))
                    }
                  />
                </label>
              )}
              <div className="quick-edit-action-bar">
                <button
                  className="btn-cancel-draft"
                  disabled={editBusy || busy}
                  onClick={() => {
                    pendingRevision.current = null;
                    setQuickDraft(cue.draftFields);
                    setShowQuickEdit(false);
                  }}
                >
                  Batal
                </button>
                <button className="btn-save-draft" disabled={editBusy || busy} onClick={saveQuickDraft}>
                  <Save size={12} />
                  <span>Simpan ke Preview</span>
                </button>
                {cue.id === live.onAirGraphicId && (
                  <button
                    className="btn-update-live-inline"
                    disabled={editBusy || busy}
                    onClick={saveAndUpdateLive}
                  >
                    <RefreshCw size={12} />
                    <span>Update Langsung ke Siaran</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {reporterForm && (
            <form
              className="live-reporter-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveReporter();
              }}
            >
              <h3>+ Siapkan Narasumber / Pembicara</h3>
              <label>
                <span>Nama</span>
                <input
                  autoFocus
                  required
                  maxLength={60}
                  placeholder="Nama pembicara"
                  value={reporterName}
                  onChange={(event) => setReporterName(event.target.value)}
                />
              </label>
              <label>
                <span>Jabatan / Keterangan</span>
                <input
                  maxLength={60}
                  placeholder="Contoh: Direktur Operasional"
                  value={reporterRole}
                  onChange={(event) => setReporterRole(event.target.value)}
                />
              </label>
              <div className="form-buttons">
                <button type="button" onClick={() => setReporterForm(false)}>
                  Batal
                </button>
                <button type="submit" disabled={editBusy || !reporterName.trim()}>
                  Simpan ke Preview
                </button>
              </div>
            </form>
          )}

          {/* Grid Input Tiles Cue Grafis Berita */}
          <div className="vmix-input-tiles-grid">
            {item ? (
              <>
                {item.graphics.map((g, n) => {
                  const isCueSelected = cue?.id === g.id;
                  const isCueOnAir = g.id === live.onAirGraphicId;
                  const f = g.draftFields;
                  const isHeadline = g.templateType === "HEADLINE" || g.templateType === "BREAKING";
                  const isReporter = g.templateType === "REPORTER";
                  const isLocationOnly = g.templateType === "LOCATION";

                  return (
                    <div
                      key={g.id}
                      className={`vmix-input-tile ${
                        isHeadline ? "variant-clean" : isReporter ? "variant-reporter" : "variant-location"
                      } ${isCueSelected ? "standby-active" : ""} ${isCueOnAir ? "onair-active" : ""}`}
                      onClick={() => selectCue(g)}
                    >
                      <div className="tile-top-bar">
                        <span className="tile-input-num">
                          {String(n + 1).padStart(2, "0")} · {g.templateType}
                        </span>
                        <div className="tile-status-pill">
                          {isCueOnAir ? (
                            <span className="pill-onair">ON AIR</span>
                          ) : isCueSelected ? (
                            <span className="pill-standby">PREVIEW</span>
                          ) : g.status === "READY" ? (
                            <span className="pill-ready">SIAP</span>
                          ) : (
                            <span className="pill-draft">DRAFT</span>
                          )}
                          {n < 9 && <kbd className="tile-kbd">{n + 1}</kbd>}
                        </div>
                      </div>

                      <div className="tile-content-area">
                        <div className="tile-template-tag">
                          {isReporter ? "NARASUMBER" : isLocationOnly ? "LOKASI SAJA" : "HEADLINE"}
                        </div>

                        {isHeadline && (
                          <>
                            {f.kicker && (
                              <div className="tile-kicker-badge" style={{ fontSize: "0.68rem", color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", marginBottom: "2px" }}>
                                {f.kicker}
                              </div>
                            )}
                            <div className="tile-text-preview headline-main">
                              {f.headline || item.title}
                            </div>
                            {f.location && (
                              <div className="tile-location-chip" style={{ marginTop: "4px" }}>
                                <MapPin size={10} />
                                <span>{f.location}</span>
                              </div>
                            )}
                            {f.subline && (
                              <div className="tile-subline-snippet" style={{ marginTop: "4px" }}>
                                {f.subline}
                              </div>
                            )}
                          </>
                        )}

                        {isReporter && (
                          <>
                            <div className="tile-text-preview reporter-name">
                              {f.name || "Nama Pembicara"}
                            </div>
                            <div className="tile-subline-snippet">
                              {f.role || f.socialHandle || "Jabatan / Instansi"}
                            </div>
                          </>
                        )}

                        {isLocationOnly && (
                          <>
                            <div className="tile-text-preview headline-main">
                              {f.location || "Nama Lokasi"}
                            </div>
                            <div className="tile-sub-hint">Visual Lokasi Tunggal</div>
                          </>
                        )}
                      </div>

                      <div className="tile-bottom-bar">
                        <button
                          className="tile-btn-preview"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCue(g);
                          }}
                          title="Muat ke Preview"
                        >
                          <span>PREVIEW</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {item.graphics.length === 0 && (
                  <div className="empty-cues-tile-notice" style={{ gridColumn: "1 / -1", padding: "28px 16px", textAlign: "center", background: "#111827", borderRadius: "8px", border: "1px dashed #374151" }}>
                    <p style={{ color: "#9ca3af", marginBottom: "12px", fontSize: "0.85rem" }}>
                      Belum ada materi grafis pada berita ini.
                    </p>
                    <button
                      className="btn-goto-prep"
                      onClick={onPrepare}
                      style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}
                    >
                      + Tambah Grafis di Tab Persiapan
                    </button>
                  </div>
                )}

                {/* Tombol Cepat Tambah Narasumber */}
                <div
                  className="vmix-input-tile btn-tile-add-reporter"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      addNewReporterCue();
                    }
                  }}
                  onClick={addNewReporterCue}
                  title="Tambah Nama Narasumber Baru untuk Berita Ini"
                >
                  <div className="add-tile-inner">
                    <div className="add-icon-circle">
                      <UserRound size={16} />
                    </div>
                    <b>+ Narasumber</b>
                    <small>Nama & Jabatan Pembicara</small>
                  </div>
                </div>
              </>
            ) : (
              <div className="vmix-empty-inputs">
                <span>Pilih salah satu berita dari antrean rundown di sebelah kiri.</span>
              </div>
            )}
          </div>
        </main>
      </section>

      {/* Status Bar Bawah */}
      <footer className="vmix-status-footer">
        <div className="footer-status-left">
          <span
            className={`status-indicator-dot ${
              live.onAirGraphicId || master.showLogo || master.showTicker ? "live" : ""
            }`}
          />
          <span>{busy ? "Mengirim perintah ke siaran…" : `Output: ${programLabel}`}</span>
        </div>
        <div className="footer-status-right">
          <button
            className={`keyboard-status-btn ${shortcutsEnabled ? "enabled" : ""}`}
            onClick={() => setShortcutsEnabled((v) => !v)}
            title="Klik untuk aktifkan/nonaktifkan tombol pintasan keyboard"
          >
            <span className="kbd-dot" />
            <span>Keyboard: {shortcutsEnabled ? "Aktif (SPACE / ENTER / U / ESC)" : "Nonaktif"}</span>
          </button>
          <span>·</span>
          <span>Klien: <b>{live.overlayClientsCount}</b></span>
          <span>·</span>
          <span>Resolusi: <b>1080p</b></span>
          <span>·</span>
          <span>Mode: <b>{live.outputMode.toUpperCase()}</b></span>
        </div>
      </footer>

      {live.error && (
        <div className="global-error-banner" role="alert">
          <AlertTriangle size={15} />
          <span>{live.error}</span>
        </div>
      )}
    </div>
  );
}
