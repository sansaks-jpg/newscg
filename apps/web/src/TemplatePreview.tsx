import { useEffect, useRef, useState } from "react";
import { broadcastLogoUploadSpec, defaultMasterOverlayState, getBroadcastColorTheme, selectBroadcastColorTheme } from "@newscg/shared";
import type { BroadcastColorThemeId, GraphicItem, OverlayPlaybackState } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { BroadcastColorThemePicker } from "./VisualTemplatePicker";
import { createOverlayPlayback } from "./overlayPlayback";

const examples = {
  single: { label: "Headline tunggal", type: "HEADLINE" as const, headline: "PENDAFTARAN MAHASISWA BARU POLIMEDIA 2026 MENURUN", subline: "", kicker: "" },
  detail: { label: "Headline + detail", type: "HEADLINE" as const, headline: "PENDAFTARAN MAHASISWA BARU POLIMEDIA 2026 MENURUN", subline: "Informasi dan perkembangan terbaru dari kampus", kicker: "" },
  topic: { label: "Topik + headline", type: "HEADLINE" as const, headline: "INFORMASI TERBARU DARI POLIMEDIA", subline: "Laporan langsung tim redaksi", kicker: "KABAR KAMPUS" },
  presenter: { label: "Nama pembawa berita", type: "REPORTER" as const, headline: "NAMA PEMBAWA BERITA", subline: "@akunnewsanda", kicker: "" },
  sot: { label: "Nama narasumber / SOT", type: "SOT" as const, headline: "INFORMASI TERBARU DARI POLIMEDIA", subline: "Jabatan narasumber", kicker: "" }
};

function demoFields(example: (typeof examples)[keyof typeof examples]): Record<string, string> {
  return {
    visualTemplate: "cnn", headline: example.headline, subline: example.subline,
    name: example.type === "SOT" ? "NAMA NARASUMBER" : example.headline,
    role: example.subline, socialHandle: example.subline, kicker: example.kicker,
    contentMode: example.type === "REPORTER" ? "presenter" : example.type === "SOT" ? "sot" : "headline",
    layoutStyle: example.subline ? "sub" : "single",
    location: "Polimedia, Jakarta", showLocation: example.type === "REPORTER" ? "false" : "true",
    showKicker: example.kicker ? "true" : "false"
  };
}

function demoGraphic(example: (typeof examples)[keyof typeof examples], id: string): GraphicItem {
  return { id, itemId: "demo", templateType: example.type, sortOrder: 0, status: "READY",
    draftFields: demoFields(example), lastPushedFields: null };
}

export default function TemplatePreview() {
  const [initialTheme] = useState(() => getBroadcastColorTheme(
    new URLSearchParams(window.location.search).get("warna") ||
    (window.location.pathname === "/templates/cnn" ? "cnn" : "studio-navy")
  ).id);
  const [colorTheme, setColorTheme] = useState<BroadcastColorThemeId>(initialTheme);
  const [variant, setVariant] = useState<keyof typeof examples>("single");
  const [copy, setCopy] = useState<(typeof examples)[keyof typeof examples]>(examples.single);
  const [initialDemo] = useState<OverlayPlaybackState>(() => ({
    graphic: demoGraphic(examples.single, "demo-0"), fields: demoFields(examples.single),
    master: selectBroadcastColorTheme({ ...defaultMasterOverlayState, showLogo: true, showTicker: true, showLiveBadge: true,
      tickerText: "INFORMASI KAMPUS DAN MASYARAKAT • LAPORAN TERKINI DARI TIM REDAKSI" }, initialTheme),
    exiting: false, exitAll: false, blackout: false, synced: false, animationKey: 0
  }));
  const [state, setState] = useState(initialDemo);
  const playback = useRef<ReturnType<typeof createOverlayPlayback> | null>(null);
  const demoSequence = useRef(0);

  useEffect(() => {
    const controller = createOverlayPlayback(setState);
    playback.current = controller;
    controller.receive({ type: "TAKE", graphic: initialDemo.graphic!, fields: initialDemo.fields!, master: initialDemo.master });
    return () => { controller.dispose(); playback.current = null; };
  }, [initialDemo]);

  const enter = (example = copy) => {
    const master = { ...selectBroadcastColorTheme(state.master, colorTheme), showLogo: true, showTicker: true, showLiveBadge: true };
    // Remount for an explicit replay; OUT uses the production playback timeline.
    playback.current?.receive({ type: "CLEAR_ALL_IMMEDIATE" });
    playback.current?.receive({ type: "TAKE", graphic: demoGraphic(example, "demo-" + ++demoSequence.current), fields: demoFields(example), master });
  };
  const updateCopy = (next: typeof copy) => {
    setCopy(next);
    if (state.graphic) playback.current?.receive({ type: "UPDATE", graphicId: state.graphic.id, fields: demoFields(next), master: state.master });
  };
  const toggleLayer = (field: "showLogo" | "showLiveBadge" | "showTicker") => {
    playback.current?.receive({ type: "MASTER_UPDATE", master: { ...state.master, [field]: !state.master[field] } });
  };
  const theme = getBroadcastColorTheme(colorTheme);
  const disabled = state.exiting || state.exitAll;

  return (
    <main className="template-demo">
      <header><div><small>TEMPLATE WARNA STUDIO · 16:9</small><h1>{theme.label}</h1>
        <p>Bandingkan warna pada virtual set Anda dan uji animasi. Pilihan di halaman ini hanya untuk contoh.</p></div><a href="/">Kembali ke NewsCG</a></header>
      <BroadcastColorThemePicker value={colorTheme} disabled={disabled} onChange={(next) => {
        setColorTheme(next);
        playback.current?.receive({ type: "MASTER_UPDATE", master: selectBroadcastColorTheme(state.master, next) });
      }} />
      <div className="template-demo-stage">
        <BroadcastPreviewBox key={state.animationKey} blackout={state.blackout} exitAll={state.exitAll}
          graphic={state.graphic} fields={state.fields} isExiting={state.exiting} animationKey={state.animationKey}
          master={state.master} studioReference />
      </div>
      <div className="template-demo-caption">{theme.description} Animasi IN, UPDATE, dan OUT memakai urutan yang sama dengan output siaran.</div>
      <div className="template-demo-controls">
        <label>Variasi isi<select value={variant} disabled={disabled} onChange={(event) => {
          const next = event.target.value as keyof typeof examples;
          setVariant(next); setCopy(examples[next]); enter(examples[next]);
        }}>{Object.entries(examples).map(([key, example]) => <option key={key} value={key}>{example.label}</option>)}</select></label>
        <label>Headline / nama<input maxLength={120} value={copy.headline} disabled={disabled} onChange={(event) => updateCopy({ ...copy, headline: event.target.value })} /></label>
        <label>Detail / jabatan<input maxLength={160} value={copy.subline} disabled={disabled} onChange={(event) => updateCopy({ ...copy, subline: event.target.value })} /></label>
        <div className="template-demo-actions">
          <button disabled={disabled} onClick={() => enter()}>Putar IN semua</button>
          <button disabled={state.blackout || disabled} onClick={() => playback.current?.receive({ type: "CLEAR_ALL_ANIMATED" })}>Putar OUT semua</button>
        </div>
      </div>
      <div className="template-demo-actions" style={{ marginTop: 16 }}>
        <button disabled={state.blackout || disabled} onClick={() => toggleLayer("showLogo")}>Logo {state.master.showLogo ? "OUT" : "IN"}</button>
        <button disabled={state.blackout || disabled} onClick={() => toggleLayer("showLiveBadge")}>LIVE {state.master.showLiveBadge ? "OUT" : "IN"}</button>
        <button disabled={state.blackout || disabled} onClick={() => toggleLayer("showTicker")}>Ticker + jam {state.master.showTicker ? "OUT" : "IN"}</button>
      </div>
      <div className="template-demo-logo-spec">
        <b>Ketentuan logo upload</b><br />
        PNG transparan <b>{broadcastLogoUploadSpec.width} × {broadcastLogoUploadSpec.height} px</b>,
        ruang kosong sekitar {broadcastLogoUploadSpec.padding} px di tepi, maksimal 2 MB. SVG juga didukung.
        Gunakan logo yang jelas di panel terang. Unggah lewat Settings → Logo Siaran Default → Upload Gambar.
      </div>
    </main>
  );
}
