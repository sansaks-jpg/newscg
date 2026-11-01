import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { BroadcastGraphicProps, BroadcastGhostFields, MasterOverlayState, TimezoneMode } from "@newscg/shared";
import { broadcastMotion, defaultMasterOverlayState, formatEydDetail, getBroadcastColorTheme, hasVisibleMasterLayers, normalizeHeadlineTopicFields } from "@newscg/shared";
import { MonitorPlay } from "lucide-react";
import { BroadcastTicker } from "./BroadcastTicker";
import { useLayerPresence } from "./useLayerPresence";
import { AutoSquishText } from "./AutoSquishText";
import { Liputan7Graphic } from "./Liputan7Graphic";
import { BccGraphic } from "./BccGraphic";
import { CreditTitlePlate } from "./CreditTitlePlate";
import { useBroadcastWeather, WeatherSymbol } from "./BroadcastWeather";

const motionStyle = Object.fromEntries(Object.entries(broadcastMotion).map(([name, milliseconds]) =>
  [`--cg-${name}`, `${milliseconds}ms`])) as CSSProperties;

type GhostFields = BroadcastGhostFields;

export function BroadcastGraphic(props: BroadcastGraphicProps) {
  if (props.master?.broadcastTemplate === "liputan7") return <Liputan7Graphic {...props} />;
  if (props.master?.broadcastTemplate === "bcc") return <BccGraphic {...props} />;
  return <CnnGraphic {...props} />;
}

function CnnGraphic({
  type,
  fields,
  master = defaultMasterOverlayState,
  isExiting = false,
  isMini = false,
  visualTemplate: _visualTemplate,
  contentKey = 0,
  exitAll = false,
  ghostPreview = false,
  ghostFields = null,
  onAutoClear
}: BroadcastGraphicProps) {
  const cnn = true;
  const colorTheme = getBroadcastColorTheme(master.colorTheme);
  const graphicStyle = {
    ...motionStyle,
    ...Object.fromEntries(Object.entries(colorTheme.colors).map(([name, color]) => [`--cg-color-${name}`, color]))
  } as CSSProperties;

  const showProgramLogo = Boolean(master.showLogo || master.showProgramLogo);
  const logoLayer = useLayerPresence(showProgramLogo, broadcastMotion.logoOutMs + 20);
  const liveLayer = useLayerPresence(master.showLiveBadge, broadcastMotion.liveOutMs + 20);
  const tickerLayer = useLayerPresence(master.showTicker, broadcastMotion.tickerOutMs + 20);
  const exitClass = isExiting ? "cg-exit" : "";
  const isBreaking = type === "BREAKING";
  const isReporter = type === "REPORTER";
  const isSot = type === "SOT";
  const isCredits = type === "CREDITS";
  const isLocationOnly = type === "LOCATION";

  const effectiveFields = normalizeHeadlineTopicFields(type, fields || {});
  const hasContent = !isLocationOnly && Boolean(type && fields && (isCredits || fields.creditList || fields.headline || fields.name || fields.location || fields.text));

  // Location tag di pojok kiri atas (otomatis tampil dinamis jika field lokasi diisi)
  const hasLocation = Boolean(effectiveFields.location && effectiveFields.location.trim().length > 0);
  const showLocationTag = !isCredits && (isLocationOnly ? hasLocation : (hasLocation && effectiveFields.showLocation !== "false"));

  const locationLayer = useLayerPresence(showLocationTag && !isExiting, broadcastMotion.locationOutMs + 20);
  const [lastLocation, setLastLocation] = useState(effectiveFields.location || "");
  useEffect(() => { if (effectiveFields.location) setLastLocation(effectiveFields.location); }, [effectiveFields.location]);

  // Content mode: "headline" (default), "paragraph", atau "presenter"
  const contentMode = effectiveFields.contentMode || (isReporter ? "presenter" : isSot ? "sot" : "headline");

  // Kicker Tab: Tampil hanya jika sub topik diisi oleh pengguna (dinamis tanpa paksaan default)
  const hasKicker = Boolean(effectiveFields.kicker && effectiveFields.kicker.trim().length > 0);
  const shouldShowKicker =
    !isCredits &&
    effectiveFields.showKicker !== "false" &&
    contentMode === "headline" &&
    hasKicker;

  const kickerLayer = useLayerPresence(shouldShowKicker && !isExiting, broadcastMotion.topicOutMs + 20);
  const [lastKicker, setLastKicker] = useState(effectiveFields.kicker || "");
  useEffect(() => { if (effectiveFields.kicker) setLastKicker(effectiveFields.kicker); }, [effectiveFields.kicker]);
  const kickerText = effectiveFields.kicker || (isBreaking ? "BREAKING NEWS" : "");

  // SOT standard: Title plate = Nama Narasumber, Detail plate = Jabatan (mengikuti standar Liputan7)
  const isNameMode = isReporter || isSot || contentMode === "presenter" || contentMode === "sot";
  const headlineText = isNameMode
    ? effectiveFields.name || effectiveFields.headline || (isSot ? "NAMA NARASUMBER" : "NAMA PEMBAWA BERITA")
    : effectiveFields.headline || effectiveFields.text || "";

  const rawSubline = isNameMode
    ? (effectiveFields.role || effectiveFields.subline || effectiveFields.socialHandle || "")
    : effectiveFields.subline || "";
  const sublineText = formatEydDetail(rawSubline);

  // Mode layout: jika subline tidak diisi, otomatis menjadi judul tunggal bersih (single-line full)
  const hasSubline = Boolean(sublineText && sublineText.trim().length > 0);
  const isSingleLayout =
    effectiveFields.layoutStyle === "single" ||
    (!hasSubline && effectiveFields.layoutStyle !== "sub");

  // Ghost elements (Bayangan abu-abu transparan untuk monitor standby preview)
  const ghostLocationText =
    ghostPreview && !locationLayer.present && Boolean(ghostFields?.location?.trim())
      ? ghostFields!.location!.trim()
      : null;

  const ghostKickerText =
    ghostPreview && !kickerLayer.present && contentMode === "headline" && Boolean(ghostFields?.kicker?.trim())
      ? ghostFields!.kicker!.trim()
      : null;

  const ghostSublineText =
    ghostPreview && !hasSubline && contentMode === "headline" && Boolean(ghostFields?.subline?.trim())
      ? formatEydDetail(ghostFields!.subline!.trim())
      : null;

  const rawSocial = effectiveFields.socialHandle || rawSubline;
  const socialText = rawSocial.startsWith("@") ? rawSocial : formatEydDetail(rawSocial);
  const socialLayer = useLayerPresence(contentMode === "presenter" && Boolean(socialText) && !isExiting, broadcastMotion.detailOutMs + 20);
  const [lastSocialText, setLastSocialText] = useState(socialText);
  useEffect(() => { if (socialText) setLastSocialText(socialText); }, [socialText]);
  const detailLayer = useLayerPresence(hasSubline && !isSingleLayout && !isExiting && contentMode === "headline", broadcastMotion.detailOutMs + 20);
  const sotLayer = useLayerPresence(contentMode === "sot" && effectiveFields.showSot !== "false" && !isExiting, broadcastMotion.detailOutMs + 20);
  const [lastSubline, setLastSubline] = useState(sublineText);
  useEffect(() => { if (sublineText) setLastSubline(sublineText); }, [sublineText]);
  const isEffectiveSingleLayout = isSingleLayout && !ghostSublineText && !detailLayer.present && !sotLayer.present;

  // Weather (Morphing Logo Box)
  const weatherEnabled = Boolean(!exitAll && showProgramLogo && master.showWeather);
  const { weather, weatherLayer, displayedWeather, weatherVisible } = useBroadcastWeather(
    weatherEnabled,
    master.weatherLocations
  );

  // Global ticker content
  const tickerText = master.tickerText?.trim() || "";

  const hasAnyLayer = Boolean(hasContent || locationLayer.present || tickerLayer.present || logoLayer.present || liveLayer.present || ghostLocationText);
  if (!hasAnyLayer) return null;

  return (
    <>
      {/* 1. Location Tag di Pojok Kiri Atas (Aktif atau Bayangan Ghost) */}
      {type && fields && locationLayer.present ? (
        <div key={`location-${contentKey}`} style={graphicStyle} data-color-theme={colorTheme.id} className={`cg-location-tag ${cnn ? "cnn-template" : ""} ${isExiting || locationLayer.exiting ? "cg-exit" : ""} ${isMini ? "mini" : ""}`}>
          <span>{effectiveFields.location || lastLocation}</span>
        </div>
      ) : ghostLocationText ? (
        <div key="location-ghost" style={graphicStyle} data-color-theme={colorTheme.id} className={`cg-location-tag cg-ghost-element ${cnn ? "cnn-template" : ""} ${isMini ? "mini" : ""}`} title="Lokasi (Belum Aktif — Tekan L lalu TAKE / UPDATE)">
          <span className="cg-ghost-pill">[L]</span>
          <span>{ghostLocationText}</span>
        </div>
      ) : null}

      {/* 2. Lower Third Grafis Siaran */}
      <div
        style={graphicStyle}
        data-color-theme={colorTheme.id}
        className={`cg-lower-third ${cnn ? "cnn-template" : ""} ${exitAll ? "cg-sequential-out" : ""} ${isBreaking ? "breaking" : ""} ${isReporter ? "reporter" : ""} ${isMini ? "mini" : ""} ${!tickerLayer.present ? "no-ticker" : ""}`}
      >
        {/* Layer Konten (Kicker & Main Box) — Tampil jika ada materi ON AIR */}
        {hasContent && (
          <div key={contentKey} className={`cg-content-layer ${kickerLayer.present && !isCredits ? "cg-has-topic" : ""} ${exitClass}`}>
            {/* Kicker Tab di Atas Kotak Putih */}
            {!isCredits && kickerLayer.present ? (
              <div className={`cg-kicker-tab ${kickerLayer.exiting ? "cg-kicker-out" : ""}`}>
                <AutoSquishText text={effectiveFields.kicker || lastKicker || kickerText} minScale={0.7} />
              </div>
            ) : !isCredits && ghostKickerText ? (
              <div className="cg-kicker-tab cg-ghost-element" title="Topik (Belum Aktif — Tekan T lalu TAKE / UPDATE)">
                <span className="cg-ghost-pill">[T]</span>
                <AutoSquishText text={ghostKickerText} minScale={0.7} />
              </div>
            ) : null}

            {/* Kotak Utama */}
            <div className={`cg-main-box ${isCredits ? "single-layout credits" : isEffectiveSingleLayout ? "single-layout" : ""} ${contentMode}`}>
              {isCredits ? (
                <div className="cg-text-area single-layout credits">
                  <CreditTitlePlate
                    fields={effectiveFields}
                    isExiting={isExiting}
                    isMini={isMini}
                    onAutoClear={onAutoClear}
                    className="cnn-credits"
                  />
                </div>
              ) : (
                <div className={`cg-text-area ${isEffectiveSingleLayout ? "single-layout" : ""} ${contentMode}`}>
                  {contentMode === "paragraph" ? (
                    <div className="cg-paragraph-row">
                      <div className="cg-copy-motion">
                        <AutoSquishText
                          text={headlineText}
                          minScale={0.3}
                          className="cg-paragraph-squish"
                        />
                      </div>
                    </div>
                  ) : contentMode === "presenter" ? (
                    <div className="cg-presenter-block">
                      <div className="cg-presenter-row">
                        <div className="cg-copy-motion">
                          <AutoSquishText
                            text={headlineText}
                            minScale={0.35}
                            className="cg-presenter-squish"
                          />
                        </div>
                      </div>
                      {socialLayer.present && (
                        <div className={`cg-social-row ${socialLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion">
                            <AutoSquishText
                              text={socialText || lastSocialText}
                              minScale={0.5}
                              className="cg-social-squish"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={isEffectiveSingleLayout ? "cg-headline-row-single" : "cg-headline-row"}>
                        <div className="cg-copy-motion">
                          <AutoSquishText text={headlineText} minScale={0.3} className="cg-headline-squish" />
                        </div>
                      </div>
                      {sotLayer.present ? (
                        <div className={`cg-subline-row ${sotLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion">
                            <AutoSquishText
                              text={sublineText || lastSubline}
                              minScale={0.45}
                              className="cg-subline-squish"
                            />
                          </div>
                        </div>
                      ) : detailLayer.present ? (
                        <div className={`cg-subline-row ${detailLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion">
                            <AutoSquishText
                              text={sublineText || lastSubline}
                              minScale={0.45}
                              className="cg-subline-squish"
                            />
                          </div>
                        </div>
                      ) : ghostSublineText ? (
                        <div className="cg-subline-row cg-ghost-element" title="Detail (Belum Aktif — Tekan D lalu TAKE / UPDATE)">
                          <span className="cg-ghost-pill">[D]</span>
                          <AutoSquishText
                            text={ghostSublineText}
                            minScale={0.45}
                            className="cg-subline-squish"
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              {/* Ruang kosong penahan di sebelah kanan agar headline berdampingan dengan logo box */}
              {logoLayer.present && (
                <div className="cg-logo-box cg-logo-space" aria-hidden="true" />
              )}
            </div>
          </div>
        )}

        {/* Layer Master Permanen (Logo Program & Live Badge Kanan) */}
        {(logoLayer.present || liveLayer.present) && (
          <div className={`cg-standalone-master-wrap cg-persistent-master ${!master.showTicker ? "logo-only" : ""}`}>
            {liveLayer.present && (
              <div className={`cg-standalone-live-badge ${logoLayer.present ? "above-logo" : "solo"} ${liveLayer.exiting ? "cg-layer-out" : "cg-layer-in"}`}>
                <span className="live-dot" />
                <span>LIVE</span>
              </div>
            )}
            {logoLayer.present && (
              <div className={`cg-logo-box standalone ${weatherVisible ? "cnn-weather-active" : ""} ${!tickerLayer.present ? "no-ticker" : ""} ${logoLayer.exiting ? "cg-layer-out" : "cg-layer-in"}`}>
                <div className="cnn-logo-face">
                  <LogoRenderer master={master} cnn={colorTheme.id === "cnn"} />
                </div>
                {weatherLayer.present && displayedWeather && (
                  <div className={`cnn-weather-strip ${weatherLayer.exiting ? "cg-weather-out" : ""}`}>
                    <div key={`${weather.cycle}-${displayedWeather.forecast.adm4}`} className="cg-weather-row">
                      <div className="cg-weather-place">
                        <AutoSquishText className="cg-weather-city" text={displayedWeather.label} minScale={1} />
                      </div>
                      <WeatherSymbol condition={displayedWeather.forecast.condition} isDaytime={displayedWeather.forecast.isDaytime} className="cg-weather-symbol" />
                      <span className="cg-weather-temperature">{displayedWeather.forecast.temperature}°C</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. Baris Ticker Bawah (Running Ticker + Jam Realtime di Kanan) */}
        {tickerLayer.present && (
          <div className={`cg-ticker-bar ${tickerLayer.exiting ? "cg-ticker-out" : "cg-ticker-in"}`}>
            <BroadcastTicker text={tickerText} speed={master.tickerSpeed} revision={master.tickerRevision} fps={master.outputFps} />
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
  const customImg = master.logoImage || master.programLogoImage;
  if (master.logoType === "image" && customImg) {
    return (
      <img
        src={customImg}
        alt="Logo Siaran"
        className="cg-custom-logo-img"
      />
    );
  }

  return (
    <>
      {cnn && (!master.logoText || master.logoText === "CNN") ? (
        <img className="cg-brand-cnn" src="/branding/cnn.svg" alt="CNN" />
      ) : <AutoSquishText className="cg-cnn-logo" text={master.logoText || (cnn ? "CNN" : "NEWS")} /> }
      <AutoSquishText className="cg-cnn-sub" text={master.logoSub || (cnn ? "Indonesia" : "BERITA")} />
    </>
  );
}

export function BroadcastClock({
  timezone = "WIB",
  customLabel = "WIB",
  showTimezone = true
}: {
  timezone?: TimezoneMode;
  customLabel?: string;
  showTimezone?: boolean;
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
      setTimeStr(`${hh}:${mm}${showTimezone ? ` ${label}` : ""}`);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [timezone, customLabel, showTimezone]);

  return <span>{timeStr || `09:35${showTimezone ? ` ${timezone}` : ""}`}</span>;
}

export function BroadcastPreviewBox({
  graphic,
  fields,
  master = defaultMasterOverlayState,
  emptyText,
  isExiting = false,
  exitAll = false,
  blackout = false,
  visualTemplate: _visualTemplate,
  animationKey = 0,
  studioReference = false,
  ghostPreview = false,
  ghostFields = null
}: {
  graphic: any;
  fields: Record<string, string> | null;
  master?: MasterOverlayState;
  emptyText?: string;
  isExiting?: boolean;
  exitAll?: boolean;
  blackout?: boolean;
  visualTemplate?: string;
  animationKey?: number;
  studioReference?: boolean;
  ghostPreview?: boolean;
  ghostFields?: GhostFields | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  const visible = Boolean((graphic && fields) || hasVisibleMasterLayers(master));
  const previewPresence = useLayerPresence(visible && !blackout);

  useLayoutEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        const s = Math.min(w / 1920, h / 1080);
        setScale((prev) => (Math.abs(prev - s) > 0.001 ? s : prev));
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
  }, []);

  const hasGraphic = Boolean(graphic && fields);
  const showMaster = hasVisibleMasterLayers(master);

  const stageWidth = Math.floor(1920 * scale);
  const stageHeight = Math.floor(1080 * scale);

  return (
    <div ref={containerRef} className="broadcast-preview-container">
      <div
        className="preview-16-9-viewport"
        style={{
          width: stageWidth > 0 ? stageWidth : "100%",
          height: stageHeight > 0 ? stageHeight : "auto",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div className="preview-studio-backdrop">
          {studioReference ? <img className="preview-studio-reference" src="/templates/studio-reference.png" alt="Virtual set studio referensi" /> : <>
            <div className="studio-ambient-light" />
            <div className="studio-safe-title" title="Title Safe Area 80%" />
          </>}
        </div>

        <div
          className="overlay-stage-1080"
          data-broadcast-motion
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
          {!blackout && <BroadcastGraphic
            type={graphic?.templateType || null}
            fields={fields}
            master={{ ...master, outputFps: 30 }}
            isExiting={isExiting}
            exitAll={exitAll}
            visualTemplate="cnn"
            contentKey={`cnn-${animationKey}`}
            ghostPreview={ghostPreview}
            ghostFields={ghostFields}
          />}
        </div>

        {!hasGraphic && !showMaster && (!previewPresence.present || blackout) && (
          <div className="empty-stage-center">
            <MonitorPlay size={24} />
            <span>{emptyText || "LAYAR BERSIH"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
