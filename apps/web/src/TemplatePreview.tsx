import { useEffect, useRef, useState } from "react";
import { defaultMasterOverlayState } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";

const examples = {
  single: { label: "Headline tunggal", headline: "PENCARIAN 5 JURNALIS HILANG, 20 KAPAL DIKERAHKAN", subline: "", kicker: "" },
  detail: { label: "Headline + detail", headline: "PENCARIAN 5 JURNALIS HILANG, 20 KAPAL DIKERAHKAN", subline: "Area Pencarian Diperluas hingga 3.962 Mil Laut", kicker: "" },
  topic: { label: "Topik + headline", headline: "22 KORBAN BERHASIL DIEVAKUASI", subline: "Sejumlah Korban Harus Ditandu Lantaran Kondisinya Lemah", kicker: "TENGGELAMNYA KM VIRGO TRANSPORT 8" },
  presenter: { label: "Nama / narasumber", headline: "NAMA PEMBAWA BERITA", subline: "@akunanda", kicker: "" },
};

export default function TemplatePreview() {
  const [variant, setVariant] = useState<keyof typeof examples>("detail");
  const [copy, setCopy] = useState(examples.detail);
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clearTimeout(timer.current);
    setVisible(true); setExiting(false); setAnimationKey((key) => key + 1);
  };
  const fields = {
    visualTemplate: "cnn", headline: copy.headline, subline: copy.subline,
    name: copy.headline, socialHandle: copy.subline, kicker: copy.kicker,
    contentMode: variant === "presenter" ? "presenter" : "headline",
    layoutStyle: variant === "single" ? "single" : "sub",
    location: "Pandeglang, Banten", showLocation: variant === "presenter" ? "false" : "true",
    showKicker: copy.kicker ? "true" : "false",
  };
  return (
    <main className="template-demo">
      <header><div><small>KOLEKSI TEMPLATE · 16:9</small><h1>CNN Indonesia — Putih</h1>
        <p>Uji teks dan animasi di sini. Preview ini tidak mengubah materi atau output siaran.</p></div><a href="/">Kembali ke NewsCG</a></header>
      <div className="template-demo-stage">
        <BroadcastPreviewBox graphic={visible ? { id: "demo", templateType: "HEADLINE" } : null}
          fields={visible ? fields : null} visualTemplate="cnn" isExiting={exiting} animationKey={animationKey}
          master={{ ...defaultMasterOverlayState, showLogo: true, showTicker: true, showLiveBadge: true }} />
      </div>
      <div className="template-demo-controls">
        <label>Variasi isi<select value={variant} onChange={(event) => {
          const next = event.target.value as keyof typeof examples;
          setVariant(next); setCopy(examples[next]); enter();
        }}>{Object.entries(examples).map(([key, example]) => <option key={key} value={key}>{example.label}</option>)}</select></label>
        <label>Headline / nama<input maxLength={120} value={copy.headline} onChange={(event) => setCopy({ ...copy, headline: event.target.value })} /></label>
        <label>Subjudul / jabatan<input maxLength={160} value={copy.subline} onChange={(event) => setCopy({ ...copy, subline: event.target.value })} /></label>
        <div className="template-demo-actions"><button onClick={enter}>Putar IN</button><button disabled={!visible || exiting} onClick={() => {
          clearTimeout(timer.current); setExiting(true);
          timer.current = setTimeout(() => { setVisible(false); setExiting(false); }, 560);
        }}>Putar OUT</button></div>
      </div>
    </main>
  );
}
