import { useEffect, useState, type CSSProperties } from "react";
import { defaultMasterOverlayState, getLiputan7WeatherLocations, liputan7HeadlineFit, liputan7Motion, liputan7Palette, weatherIconAssets } from "@newscg/shared";
import type { BroadcastGraphicProps, WeatherCondition, WeatherDisplay } from "@newscg/shared";
import { AutoSquishText } from "./AutoSquishText";
import { BroadcastTicker } from "./BroadcastTicker";
import { BroadcastClock } from "./BroadcastGraphic";
import { useLayerPresence } from "./useLayerPresence";
import { useWeatherForecast } from "./useWeatherForecast";
import { useLiputan7WeatherCycle } from "./useLiputan7WeatherCycle";

const style = {
  ...Object.fromEntries(Object.entries(liputan7Palette).map(([key, color]) => [`--l7-${key}`, color])),
  ...Object.fromEntries(Object.entries(liputan7Motion).map(([key, duration]) => [`--l7-${key}`, `${duration}ms`]))
} as CSSProperties;

function WeatherSymbol({ condition, isDaytime }: { condition: WeatherCondition; isDaytime: boolean }) {
  const icon = !isDaytime && (condition === "sunny" || condition === "partly-cloudy")
    ? weatherIconAssets[condition].replace("-day", "-night") : weatherIconAssets[condition];
  return <img className="l7-weather-symbol" src={`/weather/meteocons/${icon}.svg`} alt="" aria-hidden="true" />;
}

export function Liputan7Graphic({ type, fields, master = defaultMasterOverlayState, contentKey = 0,
  isExiting = false, ghostPreview = false, ghostFields }: BroadcastGraphicProps) {
  const data = fields || {};
  const nameMode = type === "REPORTER" || (type === "SOT" && data.showSot !== "false") || data.contentMode === "presenter";
  const title = nameMode ? data.name || data.headline || "" : data.headline || data.text || "";
  const detail = nameMode ? data.role || data.socialHandle || data.subline || "" : data.subline || "";
  const hasContent = type && type !== "LOCATION" && Boolean(title);
  const showDetail = Boolean(detail && (nameMode || (data.layoutStyle !== "single" && data.showDetail !== "false")));
  const detailLayer = useLayerPresence(showDetail && !isExiting, isExiting ? liputan7Motion.retainMs : liputan7Motion.copyOutMs + 20, contentKey);
  const single = !showDetail && !detailLayer.present && !(ghostPreview && ghostFields?.subline);
  const [lastDetail, setLastDetail] = useState(detail);
  useEffect(() => { if (detail) setLastDetail(detail); }, [detail]);
  // Reporter lapangan memakai tab lokasi yang sama; anchor tanpa lokasi tidak menampilkannya.
  const hasLocation = Boolean(data.location?.trim()) && (type === "LOCATION" || data.showLocation !== "false");
  const locationLayer = useLayerPresence(hasLocation && !isExiting, liputan7Motion.locationInMs + 20, contentKey);
  const [lastLocation, setLastLocation] = useState(data.location || "");
  useEffect(() => { if (data.location) setLastLocation(data.location); }, [data.location]);
  const programEnabled = Boolean(master.showProgramLogo);
  const programLayer = useLayerPresence(programEnabled, Math.max(liputan7Motion.logoOutMs, liputan7Motion.weatherMorphMs) + 20);
  const tvLayer = useLayerPresence(master.showLogo, liputan7Motion.logoOutMs + 20);
  const liveLayer = useLayerPresence(master.showLiveBadge, liputan7Motion.logoOutMs + 20);
  const tickerLayer = useLayerPresence(master.showTicker, 440);
  const locations = getLiputan7WeatherLocations(master.weatherLocations);
  const { forecasts } = useWeatherForecast(programEnabled && Boolean(master.showWeather), locations);
  const hasActiveCg = Boolean((hasContent || (type === "LOCATION" && hasLocation)) && !isExiting);
  const weatherEnabled = Boolean(hasActiveCg && programEnabled && master.showWeather && forecasts.length);
  const weather = useLiputan7WeatherCycle(weatherEnabled, forecasts.map(forecast => forecast.adm4).join(","), forecasts.length);
  const forecast = forecasts[weather.index % Math.max(1, forecasts.length)];
  const weatherVisible = weather.phase !== "logo" && weather.phase !== "closing" && weatherEnabled && Boolean(forecast);
  const weatherLayer = useLayerPresence(Boolean(weatherVisible), liputan7Motion.weatherMorphMs + 20);
  const label = locations.find(location => location.adm4 === forecast?.adm4)?.label || forecast?.village || "";
  const [lastWeather, setLastWeather] = useState<WeatherDisplay | null>(null);
  useEffect(() => { if (weatherVisible && forecast) setLastWeather({ forecast, label }); }, [weatherVisible, forecast, label]);
  const displayedWeather = weatherVisible && forecast ? { forecast, label } : lastWeather;
  const tvImage = master.logoType === "image" && master.logoImage ? master.logoImage : "/branding/hoc-tv.svg";

  return <div className="liputan7-template" data-broadcast-template="liputan7" style={style}>
    {hasContent && <div key={contentKey} className={`l7-content ${isExiting ? "l7-out" : ""} ${nameMode ? "l7-anchor" : ""} ${single ? "l7-single" : ""} ${hasLocation ? "l7-has-location" : ""}`}>
      <div className="l7-panel-viewport">
      <div className="l7-red-foundation"><div className="l7-endcap" /></div>
      <div className="l7-title-plate"><div className="l7-title-surface" /><div className="l7-title-viewport"><div className="l7-title-copy"><AutoSquishText text={title}
        minScale={nameMode ? 1 : liputan7HeadlineFit.minScale}
        {...(!nameMode ? single ? liputan7HeadlineFit.single : liputan7HeadlineFit.detail : {})}
        style={{ height: "100%" }} /></div></div></div>
      <div className="l7-detail-plate">
        <div className="l7-detail-surface" />
        {detailLayer.present ? <div className={`l7-detail-viewport ${detailLayer.exiting ? "l7-detail-out" : ""}`}><div className="l7-detail-copy"><AutoSquishText text={detail || lastDetail} minScale={1} /></div></div>
          : ghostPreview && ghostFields?.subline ? <AutoSquishText className="l7-ghost" text={ghostFields.subline} minScale={1} /> : null}
      </div>
      </div>
      {data.kicker && data.showKicker !== "false" && !nameMode && <div className="l7-topic"><AutoSquishText text={data.kicker} minScale={1} /></div>}
    </div>}
    {locationLayer.present && type && fields ? <div key={`location-${contentKey}`} className={`l7-location ${isExiting || locationLayer.exiting ? "l7-out" : ""} ${type === "LOCATION" ? "l7-location-only" : ""}`}>
      <div className="l7-location-surface" /><div className="l7-location-copy"><AutoSquishText text={data.location || lastLocation} minScale={1} /></div>
    </div> : ghostPreview && ghostFields?.location && <div className="l7-location l7-ghost"><AutoSquishText text={ghostFields.location} minScale={1} /></div>}
    {programLayer.present && <div className={`l7-program ${master.programLogoImage ? "l7-custom-program" : ""} ${programLayer.exiting ? "l7-layer-out" : "l7-layer-in"} ${weatherVisible ? "l7-weather-active" : ""}`}>
      <div className="l7-program-face"><div className="l7-program-wordmark"><img src={master.programLogoImage || "/branding/liputan7.svg"} alt="Liputan7" /></div></div>
      {weatherLayer.present && displayedWeather && <div data-weather-source={displayedWeather.forecast.source || "Open-Meteo"} className={`l7-weather ${weatherLayer.exiting ? "l7-weather-out" : ""}`}>
        <div key={`${weather.cycle}-${displayedWeather.forecast.adm4}`} className={`l7-weather-row l7-city-${weather.motion} l7-city-${weather.phase}`}><div className="l7-weather-place"><AutoSquishText className="l7-weather-city" text={displayedWeather.label} minScale={1} /></div><WeatherSymbol condition={displayedWeather.forecast.condition} isDaytime={displayedWeather.forecast.isDaytime} />
          <span className="l7-weather-temperature">{displayedWeather.forecast.minimum}–{displayedWeather.forecast.maximum}°C</span></div>
      </div>}
    </div>}
    {tvLayer.present && <div className={`l7-tv-logo ${tvLayer.exiting ? "l7-layer-out" : "l7-layer-in"}`}>
      <div className="l7-tv-bug"><img src={tvImage} alt="HOC TV" /></div>
      {liveLayer.present && <span className={`l7-live ${liveLayer.exiting ? "l7-layer-out" : ""}`}>LIVE</span>}
    </div>}
    {tickerLayer.present && <div className={`l7-ticker ${tickerLayer.exiting ? "l7-layer-out" : "l7-layer-in"}`}>
      <div className="l7-clock"><BroadcastClock timezone="WIB" /></div>
      <BroadcastTicker text={master.tickerText?.trim() || ""} speed={master.tickerSpeed} revision={master.tickerRevision} fps={master.outputFps} />
    </div>}
  </div>;
}
