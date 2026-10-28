import { useEffect, useRef, useState } from "react";
import { bccPalette, defaultMasterOverlayState } from "@newscg/shared";
import type { GraphicItem, MasterOverlayState, OverlayPlaybackState, TemplateType } from "@newscg/shared";
import { BroadcastPreviewBox } from "./BroadcastGraphic";
import { createOverlayPlayback } from "./overlayPlayback";

const demoMaster: MasterOverlayState = {
  ...defaultMasterOverlayState,
  broadcastTemplate: "bcc",
  showLogo: true,
  showLiveBadge: true,
  showTicker: true,
  brandText: "BCCNEWS.ID",
  tickerText: "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS",
  logoText: "BCC",
  logoSub: "NEWS"
};

const examples = {
  SOT: { title: "KEMACETAN STASIUN CITAYAM", detail: "Tanti | Pengunjung", location: "CITAYAM, JAWA BARAT", kicker: "CITAYAM, JAWA BARAT" },
  HEADLINE: { title: "KEMACETAN STASIUN CITAYAM", detail: "Kepadatan penumpang meningkat menjelang jam sibuk sore", location: "CITAYAM, JAWA BARAT", kicker: "TRANSPORTASI" },
  HIGHLIGHT: { title: "KEMACETAN STASIUN CITAYAM", detail: "", location: "", kicker: "HIGHLIGHT" },
  REPORTER: { title: "Budi Santoso", detail: "Reporter Lapangan", location: "STASIUN CITAYAM", kicker: "" },
  BREAKING: { title: "EVAKUASI KERETA ANJLOK DI BOGOR SELESAI", detail: "Jalur rel mulai dapat dilalui dua arah", location: "BOGOR, JAWA BARAT", kicker: "BREAKING NEWS" }
};

function demoFields(type: keyof typeof examples, copy: (typeof examples)[keyof typeof examples]) {
  const isHighlight = type === "HIGHLIGHT";
  const hasDetail = Boolean(copy.detail) && !isHighlight;
  return {
    headline: copy.title,
    name: copy.title,
    subline: copy.detail,
    role: copy.detail,
    location: copy.location,
    kicker: copy.kicker,
    contentMode: type === "REPORTER" ? "presenter" : type === "SOT" ? "sot" : "headline",
    headlinePresentation: isHighlight ? "bulletin" : "story",
    layoutStyle: hasDetail ? "sub" : "single",
    showDetail: hasDetail ? "true" : "false",
    showLocation: copy.location ? "true" : "false",
    showKicker: copy.kicker ? "true" : "false"
  };
}

function templateType(type: keyof typeof examples): TemplateType {
  if (type === "REPORTER") return "REPORTER";
  if (type === "SOT") return "SOT";
  if (type === "BREAKING") return "BREAKING";
  return "HEADLINE";
}

function graphic(type: TemplateType, fields: Record<string, string>, id: string): GraphicItem {
  return { id, itemId: "demo", templateType: type, sortOrder: 0, draftFields: fields, lastPushedFields: null };
}

export default function BccPreview() {
  const [variant, setVariant] = useState<keyof typeof examples>("SOT");
  const [copy, setCopy] = useState(examples.SOT);
  const [state, setState] = useState<OverlayPlaybackState>({
    graphic: null,
    fields: null,
    master: demoMaster,
    exiting: false,
    exitAll: false,
    blackout: false,
    synced: false,
    animationKey: 0
  });

  const player = useRef<ReturnType<typeof createOverlayPlayback> | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const controller = createOverlayPlayback(setState);
    player.current = controller;
    const fields = demoFields("SOT", examples.SOT);
    controller.receive({
      type: "TAKE",
      graphic: graphic("SOT", fields, "demo-0"),
      fields,
      master: demoMaster
    });

    fetch("/api/live/master")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.tickerText) {
          controller.receive({
            type: "MASTER_UPDATE",
            master: { ...demoMaster, ...data, broadcastTemplate: "bcc" }
          });
        }
      })
      .catch(() => {});

    return () => {
      controller.dispose();
      player.current = null;
    };
  }, []);

  const busy = state.exiting || state.exitAll;

  const enter = (type = variant, value = copy) => {
    const fields = demoFields(type, value);
    player.current?.receive({
      type: "TAKE",
      graphic: graphic(templateType(type), fields, `demo-${++sequence.current}`),
      fields,
      master: { ...state.master, showLogo: true, showTicker: true, showLiveBadge: true }
    });
  };

  const update = (value: typeof copy) => {
    setCopy(value);
    if (state.graphic) {
      player.current?.receive({
        type: "UPDATE",
        graphicId: state.graphic.id,
        fields: demoFields(variant, value),
        master: state.master
      });
    }
  };

  const clear = () => player.current?.receive({ type: "CLEAR", master: state.master });
  const clearAll = () => player.current?.receive({ type: "CLEAR_ALL_ANIMATED" });

  return (
    <main className="template-demo bcc-demo">
      <header>
        <div>
          <small>PAKET GRAFIS SIARAN · 1920 × 1080</small>
          <h1>BCC News <span>Marun · Krem · Oranye</span></h1>
          <p>Pratinjau lokal grafis dan animasi BCC News dengan susunan dan timing CNN.</p>
        </div>
        <a href="/">Kembali ke NewsCG</a>
      </header>

      <div style={{ display: "flex", gap: "10px", margin: "14px 0", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#ccc" }}>
          <i style={{ width: 14, height: 14, borderRadius: 2, background: bccPalette.maroon, display: "inline-block" }} />
          Marun ({bccPalette.maroon})
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#ccc" }}>
          <i style={{ width: 14, height: 14, borderRadius: 2, background: bccPalette.cream, display: "inline-block" }} />
          Krem ({bccPalette.cream})
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#ccc" }}>
          <i style={{ width: 14, height: 14, borderRadius: 2, background: bccPalette.orange, display: "inline-block" }} />
          Oranye ({bccPalette.orange})
        </span>
      </div>

      <div className="template-demo-stage">
        <BroadcastPreviewBox
          graphic={state.graphic}
          fields={state.fields}
          master={state.master}
          animationKey={state.animationKey}
          isExiting={state.exiting}
          exitAll={state.exitAll}
          blackout={state.blackout}
        />
      </div>

      <div className="template-demo-controls">
        <label>
          Jenis CG
          <select
            value={variant}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as keyof typeof examples;
              setVariant(next);
              setCopy(examples[next]);
              enter(next, examples[next]);
            }}
          >
            <option value="SOT">SOT (Narasumber + Peran)</option>
            <option value="HEADLINE">Headline + Detail + Lokasi</option>
            <option value="HIGHLIGHT">Highlight (Tab Topik)</option>
            <option value="REPORTER">Reporter Lapangan</option>
            <option value="BREAKING">Breaking News</option>
          </select>
        </label>

        <label>
          Judul / Nama
          <input
            value={copy.title}
            disabled={busy}
            onChange={(event) => update({ ...copy, title: event.target.value })}
          />
        </label>

        <label>
          Detail / Peran
          <input
            value={copy.detail}
            disabled={busy}
            onChange={(event) => update({ ...copy, detail: event.target.value })}
          />
        </label>

        <div className="template-demo-actions">
          <button type="button" disabled={busy} onClick={() => enter()}>TAKE (IN)</button>
          <button type="button" disabled={busy || !state.graphic} onClick={clear}>OUT</button>
          <button type="button" disabled={busy} onClick={clearAll}>ALL OUT</button>
        </div>
      </div>
    </main>
  );
}
