import { useEffect, useRef, useState } from "react";
import { defaultMasterOverlayState, liputan7Motion, liputan7Palette } from "@newscg/shared";
import type { GraphicItem, MasterOverlayState, OverlayPlaybackState, TemplateType } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { createOverlayPlayback } from "./overlayPlayback";
import { Liputan7Settings } from "./Liputan7Settings";

const demoMaster: MasterOverlayState = { ...defaultMasterOverlayState, broadcastTemplate: "liputan7",
  showProgramLogo: true, showWeather: true, showLogo: true, showLiveBadge: true, showTicker: true,
  tickerText: "CONTOH TICKER LIPUTAN7 • INFORMASI INI HANYA UNTUK PRATINJAU GRAFIS" };
const examples = {
  HIGHLIGHT: { title: "KEMARAU → HARGA SAYURAN", detail: "", location: "", kicker: "HIGHLIGHT" },
  HEADLINE: { title: "CONTOH HEADLINE UTAMA LIPUTAN7", detail: "Detail berita ditampilkan pada bidang biru di bawah judul", location: "JAKARTA, INDONESIA", kicker: "" },
  TOPIC: { title: "HARGA PANGAN DI PASAR LENTENG AGUNG", detail: "", location: "", kicker: "EKONOMI" },
  REPORTER: { title: "Nama Pembawa Berita", detail: "Presenter", location: "", kicker: "" },
  SOT: { title: "Nama Narasumber", detail: "Jabatan narasumber", location: "", kicker: "" }
};
function demoFields(type: keyof typeof examples, copy: (typeof examples)[keyof typeof examples]) {
  const isHighlight = type === "HIGHLIGHT";
  const hasDetail = Boolean(copy.detail) && !isHighlight;
  return { headline: copy.title, name: copy.title, subline: copy.detail, role: copy.detail,
    location: copy.location, kicker: copy.kicker,
    contentMode: type === "REPORTER" ? "presenter" : type === "SOT" ? "sot" : "headline",
    headlinePresentation: isHighlight ? "bulletin" : "story",
    layoutStyle: hasDetail ? "sub" : "single", showDetail: hasDetail ? "true" : "false",
    showLocation: copy.location ? "true" : "false", showKicker: copy.kicker ? "true" : "false" };
}
function templateType(type: keyof typeof examples): TemplateType {
  return type === "REPORTER" ? "REPORTER" : type === "SOT" ? "SOT" : "HEADLINE";
}
function graphic(type: TemplateType, fields: Record<string, string>, id: string): GraphicItem {
  return { id, itemId: "demo", templateType: type, sortOrder: 0, draftFields: fields, lastPushedFields: null };
}

export default function Liputan7Preview() {
  const [uploading, setUploading] = useState(false);
  const [variant, setVariant] = useState<keyof typeof examples>("HEADLINE");
  const [copy, setCopy] = useState(examples.HEADLINE);
  const [state, setState] = useState<OverlayPlaybackState>({ graphic: null, fields: null, master: demoMaster,
    exiting: false, exitAll: false, blackout: false, synced: false, animationKey: 0 });
  const player = useRef<ReturnType<typeof createOverlayPlayback> | null>(null);
  const sequence = useRef(0);
  const weatherReplay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const controller = createOverlayPlayback(setState);
    player.current = controller;
    const fields = demoFields("HEADLINE", examples.HEADLINE);
    controller.receive({ type: "TAKE", graphic: graphic("HEADLINE", fields, "demo-0"), fields, master: demoMaster });
    return () => { controller.dispose(); player.current = null; clearTimeout(weatherReplay.current); };
  }, []);
  const busy = state.exiting || state.exitAll || uploading;
  const enter = (type = variant, value = copy) => {
    const fields = demoFields(type, value);
    player.current?.receive({ type: "TAKE", graphic: graphic(templateType(type), fields, `demo-${++sequence.current}`), fields,
      master: { ...state.master, showProgramLogo: true, showLogo: true, showTicker: true, showWeather: true, showLiveBadge: true } });
  };
  const update = (value: typeof copy) => {
    setCopy(value);
    if (state.graphic) player.current?.receive({ type: "UPDATE", graphicId: state.graphic.id, fields: demoFields(variant, value), master: state.master });
  };
  return <main className="template-demo l7-demo">
    <header><div><small>PAKET GRAFIS SIARAN · 1920 × 1080</small><h1>Liputan7 <span>HOC TV</span></h1><p>Pratinjau lokal untuk mencoba grafis dan animasi. Kontrol di halaman ini hanya mengubah contoh.</p></div><a href="/">Kembali ke NewsCG</a></header>
    <div className="l7-palette">{Object.values(liputan7Palette).map(color => <span key={color}><i style={{ background: color }} />{color}</span>)}</div>
    <div className="template-demo-stage"><BroadcastPreviewBox graphic={state.graphic} fields={state.fields} master={state.master}
      animationKey={state.animationKey} isExiting={state.exiting} exitAll={state.exitAll} blackout={state.blackout} studioReference /></div>
    <div className="template-demo-controls">
      <label>Jenis CG<select value={variant} disabled={busy} onChange={event => {
        const next = event.target.value as keyof typeof examples;
        setVariant(next); setCopy(examples[next]); enter(next, examples[next]);
      }}><option value="HEADLINE">Headline + lokasi + detail</option><option value="HIGHLIGHT">Highlight (tab topik)</option><option value="TOPIC">Topik + headline</option><option value="REPORTER">Nama anchor</option><option value="SOT">Nama narasumber</option></select></label>
      <label>Headline / nama<input value={copy.title} maxLength={variant === "REPORTER" || variant === "SOT" ? 60 : 120} disabled={busy} onChange={event => update({ ...copy, title: event.target.value })} /></label>
      <label>Topik / kicker<input value={copy.kicker} maxLength={60} disabled={busy} onChange={event => update({ ...copy, kicker: event.target.value })} /></label>
      <label>Detail / jabatan<input value={copy.detail} maxLength={160} disabled={busy} onChange={event => update({ ...copy, detail: event.target.value })} /></label>
      <label>Lokasi<input value={copy.location} maxLength={60} disabled={busy} onChange={event => update({ ...copy, location: event.target.value })} /></label>
    </div>
    <div className="template-demo-actions">
      <button disabled={busy} onClick={() => enter()}>Putar IN CG</button>
      <button disabled={busy || !state.graphic} onClick={() => player.current?.receive({ type: "CLEAR", master: state.master })}>Putar OUT CG</button>
      <button disabled={busy || state.blackout} onClick={() => player.current?.receive({ type: "CLEAR_ALL_ANIMATED" })}>Putar OUT semua</button>
      <button disabled={busy} onClick={() => {
        clearTimeout(weatherReplay.current);
        const master = { ...state.master, showProgramLogo: true };
        player.current?.receive({ type: "MASTER_UPDATE", master: { ...master, showWeather: false } });
        weatherReplay.current = setTimeout(() => player.current?.receive({ type: "MASTER_UPDATE", master: { ...master, showWeather: true } }), liputan7Motion.weatherMorphMs + 40);
      }}>Putar cuaca</button>
    </div>
    <Liputan7Settings master={state.master} disabled={busy} onBusyChange={setUploading} onChange={master => player.current?.receive({ type: "MASTER_UPDATE", master })} />
    <p className="l7-demo-downloads">Logo vektor: <a href="/branding/hoc-tv.svg" download>HOC TV</a> · <a href="/branding/liputan7.svg" download>Liputan7</a></p>
  </main>;
}
