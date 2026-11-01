import { useEffect, useState } from "react";
import type { WeatherCondition, WeatherDisplay, WeatherLocation } from "@newscg/shared";
import { getLiputan7WeatherLocations, liputan7Motion, weatherIconAssets } from "@newscg/shared";
import { useWeatherForecast } from "./useWeatherForecast";
import { useLiputan7WeatherCycle } from "./useLiputan7WeatherCycle";
import { useLayerPresence } from "./useLayerPresence";

export function WeatherSymbol({ condition, isDaytime, className }: { condition: WeatherCondition; isDaytime: boolean; className?: string }) {
  const icon = !isDaytime && (condition === "sunny" || condition === "partly-cloudy")
    ? weatherIconAssets[condition].replace("-day", "-night") : weatherIconAssets[condition];
  return <img className={className || "cg-weather-symbol"} src={`/weather/meteocons/${icon}.svg`} alt="" aria-hidden="true" />;
}

export function useBroadcastWeather(enabled: boolean, locations?: WeatherLocation[]) {
  const locs = getLiputan7WeatherLocations(locations);
  const { forecasts } = useWeatherForecast(enabled, locs);
  const weatherEnabled = Boolean(enabled && forecasts.length > 0);
  const weather = useLiputan7WeatherCycle(weatherEnabled, forecasts.map(f => f.adm4).join(","), forecasts.length);
  const forecast = forecasts[weather.index % Math.max(1, forecasts.length)];
  const weatherVisible = weather.phase !== "logo" && weather.phase !== "closing" && weatherEnabled && Boolean(forecast);
  const weatherLayer = useLayerPresence(Boolean(weatherVisible), liputan7Motion.weatherMorphMs + 20);
  const label = locs.find(l => l.adm4 === forecast?.adm4)?.label || forecast?.village || "";

  const [lastWeather, setLastWeather] = useState<WeatherDisplay | null>(null);
  useEffect(() => {
    if (weatherVisible && forecast) {
      setLastWeather({ forecast, label });
    }
  }, [weatherVisible, forecast, label]);

  const displayedWeather = weatherVisible && forecast ? { forecast, label } : lastWeather;

  return {
    forecasts,
    weather,
    forecast,
    weatherVisible,
    weatherLayer,
    displayedWeather
  };
}
