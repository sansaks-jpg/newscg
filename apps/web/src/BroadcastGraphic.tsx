import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MasterOverlayState, TemplateType, TimezoneMode } from "@newscg/shared";
import { defaultMasterOverlayState } from "@newscg/shared";
import { MonitorPlay } from "lucide-react";
import { BroadcastTicker } from "./BroadcastTicker";
import { useLayerPresence } from "./useLayerPresence";
import { AutoSquishText } from "./AutoSquishText";

export function BroadcastGraphic({
  type,
  fields,
  master = defaultMasterOverlayState,
  isExiting = false,
  isMini = false,
  visualTemplate,
  contentKey = 0,
  exitAll = false
}: {
  type?: TemplateType | null;
  fields?: Record<string, string> | null;
  master?: MasterOverlayState;
  isExiting?: boolean;
  isMini?: boolean;
  visualTemplate?: string;
  contentKey?: string | number;
  exitAll?: boolean;
}) {
  const cnn = true;
  const logoLayer = useLayerPresence(master.showLogo && !exitAll);
  const liveLayer = useLayerPresence(master.showLiveBadge && !exitAll);
  const tickerLayer = useLayerPresence(master.showTicker && !exitAll);
  const exitClass = isExiting ? "cg-exit" : "";
  const isBreaking = type === "BREAKING";
  const isReporter = type === "REPORTER";
  const isLocationOnly = type === "LOCATION";

  const effectiveFields = fields || {};
  const hasContent = !isLocationOnly && Boolean(type && fields && (fields.headline || fields.name || fields.location || fields.text));

  // Location tag di pojok kiri atas (otomatis tampil dinamis jika field lokasi diisi)
  const hasLocation = Boolean(effectiveFields.location && effectiveFields.location.trim().length > 0);
  const showLocationTag = isLocationOnly ? hasLocation : (hasLocation && effectiveFields.showLocation !== "false");

  const locationLayer = useLayerPresence(showLocationTag && !isExiting);
  const [lastLocation, setLastLocation] = useState(effectiveFields.location || "");
  useEffect(() => { if (effectiveFields.location) setLastLocation(effectiveFields.location); }, [effectiveFields.location]);

  // Content mode: "headline" (default), "paragraph", atau "presenter"
  const contentMode = effectiveFields.contentMode || (isReporter ? "presenter" : "headline");

  // Kicker Tab: Tampil hanya jika sub topik diisi oleh pengguna (dinamis tanpa paksaan default)
  const hasKicker = Boolean(effectiveFields.kicker && effectiveFields.kicker.trim().length > 0);
  const shouldShowKicker =
    effectiveFields.showKicker !== "false" &&
    contentMode === "headline" &&
    hasKicker;

  const kickerLayer = useLayerPresence(shouldShowKicker && !isExiting);
  const [lastKicker, setLastKicker] = useState(effectiveFields.kicker || "");
  useEffect(() => { if (effectiveFields.kicker) setLastKicker(effectiveFields.kicker); }, [effectiveFields.kicker]);
  const kickerText = effectiveFields.kicker || (isBreaking ? "BREAKING NEWS" : "");

  const headlineText = (isReporter || contentMode === "presenter")
    ? effectiveFields.name || effectiveFields.headline || "NAMA PEMBAWA BERITA"
    : effectiveFields.headline || effectiveFields.text || "";

  const sublineText = isReporter
    ? (effectiveFields.role || effectiveFields.socialHandle || "")
    : effectiveFields.subline || "";

  // Mode layout: jika subline tidak diisi, otomatis menjadi judul tunggal bersih (single-line full)
  const hasSubline = Boolean(sublineText && sublineText.trim().length > 0);
  const isSingleLayout =
    effectiveFields.layoutStyle === "single" ||
    (!hasSubline && effectiveFields.layoutStyle !== "sub");

  const brandText = effectiveFields.brand || master.brandText || "CNNINDONESIA.COM";
  const tickerText =
    effectiveFields.ticker ||
    master.tickerText ||
    (isReporter
      ? "LAPORAN LANGSUNG DARI STUDIO / LOKASI KEJADIAN"
      : "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI");

  return (
    <>
      {/* 1. Location Tag di Pojok Kiri Atas (Muncul jika ada lokasi luar studio & showLocation true) */}
      {locationLayer.present && (
        <div key={`location-${contentKey}`} className={`cg-location-tag ${cnn ? "cnn-template" : ""} ${isExiting || locationLayer.exiting ? "cg-exit" : ""} ${isMini ? "mini" : ""}`}>
          <span>{effectiveFields.location || lastLocation}</span>
        </div>
      )}

      {/* 2. Lower Third Grafis Siaran */}
      <div
        className={`cg-lower-third ${cnn ? "cnn-template" : ""} ${exitAll ? "cg-all-exit" : ""} ${isBreaking ? "breaking" : ""} ${isReporter ? "reporter" : ""} ${isMini ? "mini" : ""} ${!tickerLayer.present ? "no-ticker" : ""}`}
      >
        {/* Layer Konten (Kicker & Main White Box) — Tampil jika ada materi ON AIR */}
        {hasContent && (
          <div key={contentKey} className={`cg-content-layer ${exitClass}`}>
            {/* Kicker Tab di Atas Kotak Putih (Opsional sesuai Gambar 5 / Gambar 3) */}
            {kickerLayer.present && (
              <div className={`cg-kicker-tab ${kickerLayer.exiting ? "cg-kicker-out" : ""}`}>
                <AutoSquishText text={effectiveFields.kicker || lastKicker || kickerText} minScale={0.7} />
              </div>
            )}

            {/* Kotak Utama Putih */}
            <div className={`cg-main-box ${isSingleLayout ? "single-layout" : ""} ${contentMode}`}>
              <div className={`cg-text-area ${isSingleLayout ? "single-layout" : ""} ${contentMode}`}>
                {/* Varian A: Paragraf / Keterangan Tunggal (Gambar 3 - Sentence Case Wardah Style) */}
                {contentMode === "paragraph" ? (
                  <div className="cg-paragraph-row">
                    <AutoSquishText
                      text={headlineText}
                      minScale={0.3}
                      className="cg-paragraph-squish"
                    />
                  </div>
                ) : contentMode === "presenter" ? (
                  /* Varian B: Nama Pembawa Acara + Akun Instagram (Gambar 4) */
                  <div className="cg-presenter-block">
                    <div className="cg-presenter-row">
                      <AutoSquishText
                        text={headlineText}
                        minScale={0.35}
                        className="cg-presenter-squish"
                      />
                    </div>
                    {(effectiveFields.socialHandle || sublineText) && (
                      <div className="cg-social-row">
                        
                        <AutoSquishText
                          text={effectiveFields.socialHandle || sublineText}
                          minScale={0.5}
                          className="cg-social-squish"
                        />
                      </div>
                    )}
                  </div>
                ) : isSingleLayout ? (
                  /* Varian C: Headline Tunggal Gede Semua (Gambar 5 - Studio Style) */
                  <div className="cg-headline-row-single">
                    <AutoSquishText
                      text={headlineText}
                      minScale={0.3}
                      className="cg-headline-squish-single"
                    />
                  </div>
                ) : (
                  /* Varian D: Headline Utama + Subline Keterangan */
                  <>
                    <div className="cg-headline-row">
                      <AutoSquishText
                        text={headlineText}
                        minScale={0.35}
                        className="cg-headline-squish"
                      />
                    </div>
                    {sublineText && (
                      <div className="cg-subline-row">
                        <AutoSquishText
                          text={sublineText}
                          minScale={0.45}
                          className="cg-subline-squish"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Logo Box terintegrasi jika konten aktif dan logo master aktif */}
              {logoLayer.present && (
                <div className="cg-logo-box cg-logo-space" aria-hidden="true" />
              )}
            </div>

          </div>
        )}

        {/* Jika konten lower third sedang kosong tapi Logo atau Live aktif */}
        {(logoLayer.present || liveLayer.present) && (
          <div className={`cg-standalone-master-wrap cg-persistent-master ${!master.showTicker ? "logo-only" : ""}`}>
            {liveLayer.present && (
              <div className={`cg-standalone-live-badge ${logoLayer.present ? "above-logo" : "solo"} ${liveLayer.exiting ? "cg-layer-out" : "cg-layer-in"}`}>
                <span className="live-dot" />
                <span>LIVE</span>
              </div>
            )}
            {logoLayer.present && (
              <div className={`cg-logo-box standalone ${!tickerLayer.present ? "no-ticker" : ""} ${logoLayer.exiting ? "cg-layer-out" : "cg-layer-in"}`}>
                <LogoRenderer master={master} cnn={cnn} />
              </div>
            )}
          </div>
        )}

        {/* 3. Baris Ticker Bawah (Badge Merah + Running Ticker + Jam Realtime) */}
        {tickerLayer.present && (
          <div className={`cg-ticker-bar ${tickerLayer.exiting ? "cg-ticker-out" : "cg-ticker-in"}`}>
            <div className="cg-ticker-badge" title="Nama Berita / Kategori Ticker">
              <AutoSquishText text={brandText} style={{ width: "max-content", maxWidth: "100%" }} />
            </div>
            <BroadcastTicker text={tickerText} />
            <div className="cg-ticker-clock">
              <BroadcastClock
                timezone={master.timezone}
                customLabel={master.customTimezoneLabel}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function LogoRenderer({ master, cnn = false }: { master: MasterOverlayState; cnn?: boolean }) {
  if (master.logoType === "image" && master.logoImage) {
    return (
      <img
        src={master.logoImage}
        alt="Logo Siaran"
        className="cg-custom-logo-img"
      />
    );
  }

  return (
    <>
      {cnn && (!master.logoText || master.logoText === "CNN") ? (
        <img className="cg-brand-cnn" src="/branding/cnn.svg" alt="CNN" />
      ) : <AutoSquishText className="cg-cnn-logo" text={master.logoText || "CNN"} /> }
      <AutoSquishText className="cg-cnn-sub" text={master.logoSub || "Indonesia"} />
    </>
  );
}

export function BroadcastClock({
  timezone = "WIB",
  customLabel = "WIB"
}: {
  timezone?: TimezoneMode;
  customLabel?: string;
}) {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      let targetOffsetMinutes = 7 * 60; // Default WIB UTC+7
      let label = "WIB";

      if (timezone === "WITA") {
        targetOffsetMinutes = 8 * 60; // UTC+8
        label = "WITA";
      } else if (timezone === "WIT") {
        targetOffsetMinutes = 9 * 60; // UTC+9
        label = "WIT";
      } else if (timezone === "CUSTOM") {
        label = customLabel || "WIB";
      }

      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const targetDate = new Date(utc + targetOffsetMinutes * 60000);
      const hh = String(targetDate.getHours()).padStart(2, "0");
      const mm = String(targetDate.getMinutes()).padStart(2, "0");
      setTimeStr(`${hh}:${mm} ${label}`);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timezone, customLabel]);

  return <span>{timeStr || `09:35 ${timezone}`}</span>;
}

export function BroadcastPreviewBox({
  graphic,
  fields,
  master = defaultMasterOverlayState,
  emptyText,
  isExiting = false,
  visualTemplate,
  animationKey = 0
}: {
  graphic: any;
  fields: Record<string, string> | null;
  master?: MasterOverlayState;
  emptyText?: string;
  isExiting?: boolean;
  visualTemplate?: string;
  animationKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  const visible = Boolean((graphic && fields) || master.showLogo || master.showTicker || master.showLiveBadge);

  useLayoutEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        // Strict proportional 16:9 fitting inside viewport (matching 1920x1080 canvas)
        const s = Math.min(w / 1920, h / 1080);
        setScale(s);
      }
    };

    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [visible]);

  const hasGraphic = Boolean(graphic && fields);
  const showMaster = master.showLogo || master.showTicker || master.showLiveBadge;

  const stageWidth = Math.floor(1920 * scale);
  const stageHeight = Math.floor(1080 * scale);

  return (
    <div ref={containerRef} className="broadcast-preview-container">
      {/* 16:9 Viewport Box - Strictly proportional to 1920x1080 */}
      <div
        className="preview-16-9-viewport"
        style={{
          width: stageWidth > 0 ? stageWidth : "100%",
          height: stageHeight > 0 ? stageHeight : "auto",
          position: "relative",
          overflow: "hidden"
        }}
      >
        {/* Studio Ambient Stage Backdrop */}
        <div className="preview-studio-backdrop">
          <div className="studio-ambient-light" />
          <div className="studio-safe-title" title="Title Safe Area 80%" />
        </div>

        {/* 1920x1080 Stage identical to /output */}
        <div
          className="overlay-stage-1080"
          style={{
            width: 1920,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none"
          }}
        >
          <BroadcastGraphic
            type={graphic?.templateType || null}
            fields={fields}
            master={master}
            isExiting={isExiting}
            visualTemplate="cnn"
            contentKey={`${graphic?.id || "preview"}-cnn-${animationKey}`}
          />
        </div>

        {!hasGraphic && !showMaster && (
          <div className="empty-stage-center">
            <MonitorPlay size={24} />
            <span>{emptyText || "LAYAR BERSIH"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
