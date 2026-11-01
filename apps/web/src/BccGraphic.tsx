import { useEffect, useState, type CSSProperties } from "react";
import type { BroadcastGraphicProps, MasterOverlayState } from "@newscg/shared";
import { broadcastMotion, defaultMasterOverlayState, formatEydDetail, normalizeHeadlineTopicFields } from "@newscg/shared";
import { BroadcastTicker } from "./BroadcastTicker";
import { BroadcastClock } from "./BroadcastGraphic";
import { useLayerPresence } from "./useLayerPresence";
import { AutoSquishText } from "./AutoSquishText";
import { CreditTitlePlate } from "./CreditTitlePlate";
import { useBroadcastWeather, WeatherSymbol } from "./BroadcastWeather";

const motionStyle = Object.fromEntries(
  Object.entries(broadcastMotion).map(([name, milliseconds]) => [`--cg-${name}`, `${milliseconds}ms`])
) as CSSProperties;

export function BccGraphic({
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
  onAutoClear,
  isLive = false
}: BroadcastGraphicProps) {
  const graphicStyle = { ...motionStyle } as CSSProperties;

  const showProgramLogo = Boolean(master.showLogo || master.showProgramLogo);
  const logoLayer = useLayerPresence(showProgramLogo, broadcastMotion.logoOutMs + 20);
  const liveLayer = useLayerPresence(Boolean(!exitAll && master.showLiveBadge), broadcastMotion.liveOutMs + 20);
  const tickerLayer = useLayerPresence(master.showTicker, broadcastMotion.tickerOutMs + 20);
  const exitClass = isExiting ? "cg-exit" : "";
  const isBreaking = type === "BREAKING";
  const isReporter = type === "REPORTER";
  const isSot = type === "SOT";
  const isCredits = type === "CREDITS" || Boolean(fields?.creditList);
  const isLocationOnly = type === "LOCATION";

  const effectiveFields = normalizeHeadlineTopicFields(type, fields || {});
  const hasContent = !isLocationOnly && Boolean(type && fields && (isCredits || fields.creditList || fields.headline || fields.name || fields.location || fields.text));

  // Location tag di pojok kiri atas
  const hasLocation = Boolean(effectiveFields.location && effectiveFields.location.trim().length > 0);
  const showLocationTag = !isCredits && (isLocationOnly ? hasLocation : (hasLocation && effectiveFields.showLocation !== "false"));

  const locationLayer = useLayerPresence(showLocationTag && !isExiting, broadcastMotion.locationOutMs + 20);
  const [lastLocation, setLastLocation] = useState(effectiveFields.location || "");
  useEffect(() => { if (effectiveFields.location) setLastLocation(effectiveFields.location); }, [effectiveFields.location]);

  // Content mode: "headline", "paragraph", "presenter", atau "sot"
  const contentMode = effectiveFields.contentMode || (isReporter ? "presenter" : isSot ? "sot" : "headline");

  // Kicker Tab di atas bar judul
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

  // Mode layout: jika subline tidak diisi, menjadi judul tunggal (single-layout full height)
  const hasSubline = Boolean(sublineText && sublineText.trim().length > 0);
  const isSingleLayout =
    effectiveFields.layoutStyle === "single" ||
    (!hasSubline && effectiveFields.layoutStyle !== "sub");

  // Ghost elements
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
  const isSocialActive = contentMode === "presenter" && Boolean(socialText);
  const socialLayer = useLayerPresence(isSocialActive, broadcastMotion.detailOutMs + 20);
  const [lastSocialText, setLastSocialText] = useState(socialText);
  useEffect(() => { if (socialText) setLastSocialText(socialText); }, [socialText]);

  const isDetailActive = hasSubline && !isSingleLayout && contentMode === "headline";
  const detailLayer = useLayerPresence(isDetailActive, broadcastMotion.detailOutMs + 20);

  const isSotActive = (contentMode === "sot" || isSot) && effectiveFields.showSot !== "false";
  const sotLayer = useLayerPresence(isSotActive, broadcastMotion.detailOutMs + 20);

  const [lastSubline, setLastSubline] = useState(sublineText);
  useEffect(() => { if (sublineText) setLastSubline(sublineText); }, [sublineText]);

  // Ketika sedang exiting (CLEAR), pertahankan struktur layout double/single sampai selesai exit
  const hasActiveDetailLayer = detailLayer.present || sotLayer.present || socialLayer.present;
  const isEffectiveSingleLayout = isExiting
    ? isSingleLayout
    : (isSingleLayout && !ghostSublineText && !hasActiveDetailLayer);

  // Jika detail keluar secara mandiri saat headline tetap on air (misal hotkey D)
  const isDetailPlateExiting = !isExiting && (
    (detailLayer.exiting && !sotLayer.present && !socialLayer.present) ||
    (sotLayer.exiting && !detailLayer.present && !socialLayer.present) ||
    (socialLayer.exiting && !detailLayer.present && !sotLayer.present)
  );

  // Weather (Konsep A - Morphing Logo Box)
  const weatherEnabled = Boolean(!exitAll && showProgramLogo && master.showWeather);
  const { weather, weatherLayer, displayedWeather, weatherVisible } = useBroadcastWeather(
    weatherEnabled,
    master.weatherLocations
  );

  const defaultBccTicker = "INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS";
  const tickerText = master.tickerText?.trim() || defaultBccTicker;

  return (
    <>
      {/* 1. Location Tag di Pojok Kiri Atas */}
      {type && fields && locationLayer.present ? (
        <div key={`location-${contentKey}`} style={graphicStyle} className={`cg-location-tag bcc-template ${isExiting || locationLayer.exiting ? "cg-exit" : ""} ${isMini ? "mini" : ""}`}>
          <span>{effectiveFields.location || lastLocation}</span>
        </div>
      ) : ghostLocationText ? (
        <div key="location-ghost" style={graphicStyle} className={`cg-location-tag cg-ghost-element bcc-template ${isMini ? "mini" : ""}`} title="Lokasi (Belum Aktif — Tekan L lalu TAKE / UPDATE)">
          <span className="cg-ghost-pill">[L]</span>
          <span>{ghostLocationText}</span>
        </div>
      ) : null}

      {/* 2. Lower Third Grafis BCC News */}
      <div
        style={graphicStyle}
        data-broadcast-template="bcc"
        className={`cg-lower-third bcc-template ${exitAll ? "cg-sequential-out" : ""} ${isBreaking ? "breaking" : ""} ${isReporter ? "reporter" : ""} ${isMini ? "mini" : ""} ${!tickerLayer.present ? "no-ticker" : ""}`}
      >
        {/* Layer Konten (Logo Program di Kiri + Kicker Tab + Headline Plate + Subline Plate) */}
        {/* Layer Master Permanen (Logo Box Kiri) */}
        {(logoLayer.present || liveLayer.present) && (
          <div className={`cg-standalone-master-wrap cg-persistent-master ${!tickerLayer.present ? "no-ticker" : ""}`}>
            {liveLayer.present && (
              <div className={`bcc-live-badge ${logoLayer.present ? "above-logo" : "solo"} ${liveLayer.exiting ? "cg-layer-out" : "cg-layer-in"}`}>
                <span className="live-dot" />
                <span>LIVE</span>
              </div>
            )}
            {logoLayer.present && (
              <div className={`cg-logo-box-left ${weatherVisible ? "bcc-weather-active" : ""} ${logoLayer.exiting ? "cg-layer-out" : ""}`}>
                <div className="bcc-logo-face">
                  <BccLogoRenderer master={master} />
                </div>
                {weatherLayer.present && displayedWeather && (
                  <div className={`bcc-weather-strip ${weatherLayer.exiting ? "cg-weather-out" : ""}`}>
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

        {/* Layer Konten (Kicker Tab + Headline Plate + Subline Plate) */}
        {hasContent && (
          <div key={contentKey} className={`cg-content-layer ${kickerLayer.present ? "cg-has-topic" : ""} ${exitClass}`}>
            {/* Ruang kosong penahan di sebelah kiri agar headline berdampingan dengan logo box / live badge */}
            {(logoLayer.present || liveLayer.present) && (
              <div className="cg-logo-space" aria-hidden="true" />
            )}

            {/* Wrapper Kanan (Kicker Tab + Headline Plate + Subline Plate) */}
            <div className="cg-main-wrapper">
              {/* Kicker Tab di Atas Judul */}
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

              {/* Konten Utama: Credit Title atau Bar Judul & Subline Biasa */}
              {isCredits ? (
                <div className="cg-headline-plate single-layout">
                  <CreditTitlePlate
                    fields={effectiveFields}
                    isExiting={isExiting}
                    isMini={isMini}
                    isLive={isLive}
                    onAutoClear={onAutoClear}
                    className="bcc-credits"
                  />
                </div>
              ) : (
                <>
                  {/* Bar Judul Merah Marun (Headline Plate) */}
                  <div className={`cg-headline-plate ${isEffectiveSingleLayout ? "single-layout" : ""}`}>
                    <div className="cg-copy-motion" style={{ width: "100%" }}>
                      <AutoSquishText
                        text={headlineText}
                        minScale={0.3}
                        className={isEffectiveSingleLayout ? "cg-headline-row-single" : "cg-headline-row"}
                      />
                    </div>
                  </div>

                  {/* Bar Subline / Narasumber Krem (Subline Plate) */}
                  {!isEffectiveSingleLayout && (
                    <div className={`cg-subline-plate ${isDetailPlateExiting ? "cg-detail-out" : ""}`}>
                      {sotLayer.present ? (
                        <div className={`cg-subline-row ${sotLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion" style={{ width: "100%" }}>
                            <AutoSquishText
                              text={sublineText || lastSubline}
                              minScale={0.45}
                            />
                          </div>
                        </div>
                      ) : detailLayer.present ? (
                        <div className={`cg-subline-row ${detailLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion" style={{ width: "100%" }}>
                            <AutoSquishText
                              text={sublineText || lastSubline}
                              minScale={0.45}
                            />
                          </div>
                        </div>
                      ) : socialLayer.present ? (
                        <div className={`cg-social-row ${socialLayer.exiting ? "cg-detail-out" : ""}`}>
                          <div className="cg-copy-motion" style={{ width: "100%" }}>
                            <AutoSquishText
                              text={socialText || lastSocialText}
                              minScale={0.45}
                            />
                          </div>
                        </div>
                      ) : ghostSublineText ? (
                        <div className="cg-subline-row cg-ghost-element" title="Detail (Belum Aktif — Tekan D lalu TAKE / UPDATE)">
                          <span className="cg-ghost-pill">[D]</span>
                          <AutoSquishText text={ghostSublineText} minScale={0.45} />
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 3. Baris Ticker Bawah */}
        {tickerLayer.present && (
          <div className={`cg-ticker-bar ${tickerLayer.exiting ? "cg-ticker-out" : "cg-ticker-in"}`}>
            <div className="cg-ticker-clock">
              <BroadcastClock timezone={master.timezone} customLabel={master.customTimezoneLabel} />
            </div>
            <BroadcastTicker text={tickerText} speed={master.tickerSpeed} revision={master.tickerRevision} fps={master.outputFps} />
          </div>
        )}
      </div>
    </>
  );
}

function BccLogoRenderer({ master }: { master: MasterOverlayState }) {
  if (master.logoType === "image" && master.logoImage) {
    return <img src={master.logoImage} alt="Logo Siaran" className="bcc-brand-logo-img" />;
  }

  // Jika teks kustom belum diubah atau memakai default (BCC, CNN, NEWS), tampilkan logo resmi BCC News yang diunggah
  if (!master.logoText || master.logoText === "BCC" || master.logoText === "CNN" || master.logoText === "NEWS") {
    return <img src="/branding/bcc.png" alt="BCC NEWS" className="bcc-brand-logo-img" />;
  }

  return (
    <div className="bcc-brand-logo-text">
      <AutoSquishText className="bcc-logo-head" text={master.logoText} />
      <AutoSquishText className="bcc-logo-sub" text={master.logoSub || "NEWS"} />
    </div>
  );
}
