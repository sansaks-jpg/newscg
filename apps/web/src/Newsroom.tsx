import { useEffect, useRef, useState } from "react";
import type { EditableGraphic, GraphicItem, HeadlineDefaults, LiveState, MasterOverlayState, Rundown, RundownItem, TemplateType } from "@newscg/shared";
import { getGraphicFieldLimit, headlineBulletinPreset, headlineDefaultsSchema, headlinePresentationSchema, rundownInputSchema, rundownItemInputSchema } from "@newscg/shared";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  MapPin,
  MonitorPlay,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import { api, mutate } from "./api";
import { BroadcastTemplateInfo } from "./VisualTemplatePicker";
import { BroadcastPreviewBox } from "./BroadcastGraphic";

const duration = (seconds: number) =>
  `${seconds < 0 ? "+" : ""}${Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, "0")}:${(Math.abs(seconds) % 60).toString().padStart(2, "0")}`;

const graphicLabel = (g: GraphicItem) =>
  g.templateType === "SOT"
    ? `SOT · ${g.draftFields.name || "Narasumber"}`
    : g.templateType === "REPORTER"
    ? `CG · ${g.draftFields.name || "Nama"}`
    : g.templateType === "LOCATION"
    ? `Lokasi · ${g.draftFields.location || "Lokasi"}`
    : `${g.draftFields.showLocation === "true" ? "Headline + Lokasi" : "Headline"}${
        g.draftFields.subline && g.draftFields.layoutStyle !== "single" ? " + Detail" : ""
      }`;

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
  const editingTrigger = useRef<HTMLButtonElement | null>(null);
  const closeEditor = () => {
    setEditing(null);
    requestAnimationFrame(() => editingTrigger.current?.focus());
  };
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<Rundown | null>(null);

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
      const itemIds = items.map((row) => row.id);
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

  const items = rundown?.items || [];
  const filteredItems = items.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.slug.toLowerCase().includes(search.toLowerCase())
  );
  const totalDuration = items.reduce((s, i) => s + i.estimatedDurationSeconds, 0);
  const noCgCount = items.filter((item) => !item.cgRequired).length;

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
                onClick={() => setRenameTarget(rundown)}
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
              className="btn-prep-secondary"
              disabled={pending}
              onClick={exportCurrentRundown}
              title="Ekspor rundown saat ini ke berkas JSON"
            >
              <Download size={13} />
              <span>Ekspor</span>
            </button>
          )}

          <button
            className="btn-prep-secondary"
            disabled={pending}
            onClick={() => importFileInputRef.current?.click()}
            title="Impor rundown dari berkas JSON"
          >
            <Upload size={13} />
            <span>Impor</span>
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />

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
            onClick={(event) => { editingTrigger.current = event.currentTarget; setEditing("new"); }}
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
            <b>{items.length} Item Rundown</b>
          </div>
          <div className="metric-box">
            <small>ESTIMASI DURASI SIARAN</small>
            <b>{duration(totalDuration)}</b>
          </div>
          <div className="metric-box">
            <small>TANPA CG</small>
            <b>{noCgCount} Item</b>
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
            <div className="col-act">AKSI</div>
          </div>

          <div className="prep-table-body">
            {filteredItems.map((item) => {
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
                          className={`cg-chip cg-${g.templateType.toLowerCase()}`}
                          title={graphicLabel(g)}
                        >
                          {g.templateType === "SOT" || g.templateType === "REPORTER" ? (
                            <>
                              <UserRound size={10} />
                              <span>{g.draftFields.name || (g.templateType === "SOT" ? "SOT" : "Nama")}</span>
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
                        <span className="cg-chip-empty">{item.cgRequired ? "Belum ada CG" : "CG tidak diperlukan"}</span>
                      )}
                    </div>
                  </div>

                  <div className="col-act">
                    <button
                      className="btn-act-edit"
                      onClick={(event) => { editingTrigger.current = event.currentTarget; setEditing(item); }}
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
      'button:not([disabled]), input:not([disabled])'
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
        sortOrder: g.sortOrder, draftFields: { ...g.draftFields } }));
    }
    // Default otomatis untuk Berita Baru: langsung tampilkan 1 cue HEADLINE siap isi
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
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !saving) {
      event.stopPropagation();
      onClose();
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
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
              cgRequired,
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
          {defaultsLoading && <p role="status">Memuat default materi…</p>}
          {defaultsLoadError && <div className="modal-error-banner" role="alert">
            {defaultsLoadError}
            <button type="button" onClick={() => setDefaultsLoadAttempt((attempt) => attempt + 1)}>Muat ulang default</button>
          </div>}
          {/* Metadata Berita */}
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
                <button type="button" onClick={() => add("HEADLINE", true)}>
                  + Headline Pembuka
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
                <div key={g.id || index} className="cue-editor-card">
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
                          ? "HEADLINE PEMBUKA"
                          : "LOWER THIRD HEADLINE"}
                      </b>
                    </div>

                    <div className="cue-header-right">
                      <button
                        type="button"
                        className="btn-remove-cue"
                        onClick={() => {
                          if (index === 0) defaultSeedActive.current = false;
                          setGraphics((gs) => gs.filter((_, i) => i !== index));
                        }}
                        title="Hapus materi CG ini"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="cue-editor-body">
                    <BroadcastTemplateInfo colorTheme={master?.colorTheme} />
                    {g.templateType === "SOT" ? (
                      <div className="cue-fields-grid">
                        <label className="field-full">
                          <span>Headline Berita (Wajib)</span>
                          <input required maxLength={getGraphicFieldLimit(g.templateType, "headline")} value={g.draftFields.headline || ""}
                            onChange={(e) => field(index, "headline", e.target.value)}
                            placeholder="Judul berita di baris atas LT SOT" />
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
                        {g.templateType === "HEADLINE" && <>
                          <label>
                            <span>Jenis Headline</span>
                            <select value={g.draftFields.headlinePresentation || "story"}
                              onChange={(e) => {
                                const presentation = headlinePresentationSchema.parse(e.target.value);
                                if (index === 0) defaultSeedActive.current = false;
                                setPreviewIndex(index);
                                setGraphics((gs) => gs.map((cue, i) => i === index ? {
                                  ...cue, draftFields: { ...cue.draftFields,
                                    ...(presentation === "bulletin" ? headlineBulletinPreset : {}),
                                    headlinePresentation: presentation }
                                } : cue));
                              }}>
                              <option value="story">Judul berita biasa</option>
                              <option value="bulletin">Headline pembuka / ringkasan</option>
                            </select>
                          </label>
                          {g.draftFields.headlinePresentation === "bulletin" && <label>
                            <span>Label Headline Pembuka</span>
                            <input required maxLength={getGraphicFieldLimit("HEADLINE", "headlineLabel")}
                              value={g.draftFields.headlineLabel ?? "HEADLINE"}
                              onChange={(e) => field(index, "headlineLabel", e.target.value)} />
                          </label>}
                        </>}
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

          {/* Panel Preview Siaran Real-Time (WYSIWYG) */}
          <div className="editor-card story-preview-card">
            <div className="story-preview-header">
              <div className="preview-header-left">
                <span className="dot-led green pulse" />
                <div>
                    <h3 className="section-title">PRATINJAU CG</h3>
                  <span className="preview-subtitle">
                    Perubahan form terlihat di sini sebelum disimpan; output siaran tidak berubah.
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
                        #{i + 1} {g.templateType === "SOT" ? "SOT Narasumber" : g.templateType === "REPORTER" ? "Reporter" : g.templateType === "LOCATION" ? "Lokasi" : g.templateType === "BREAKING" ? "Breaking" : g.draftFields.headlinePresentation === "bulletin" ? "Headline Pembuka" : "Headline"}
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
                emptyText="Ketik headline pada form di atas untuk melihat visual siaran..."
              />
            </div>
            <div className="story-preview-caption">
              <span>Simpan materi CG, lalu gunakan TAKE di Kontrol Siaran untuk menayangkan.</span>
            </div>
          </div>
        </div>

        {error && <div className="modal-error-banner">{error}</div>}

        <div className="modal-footer">
          <span className="modal-tip">Perubahan belum tersimpan sampai tombol Simpan ditekan.</span>
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
