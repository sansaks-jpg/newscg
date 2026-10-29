import { useEffect, useState } from "react";
import { defaultWeatherLocations, liputan7Motion, weatherForecastSchema } from "@newscg/shared";
import type { WeatherForecast, WeatherLocation } from "@newscg/shared";

/** Preview and output share the server cache; weather data never changes live commands. */
export function useWeatherForecast(enabled: boolean, locations: WeatherLocation[] = defaultWeatherLocations) {
  const locationKey = locations.map(location => location.adm4).join(",");
  const [result, setResult] = useState<{ key: string; forecasts: WeatherForecast[]; error: string }>({ key: "", forecasts: [], error: "" });
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    const refresh = async () => {
      const settled = await Promise.allSettled(locationKey.split(",").filter(Boolean).map(async adm4 => {
        const response = await fetch(`/api/weather?adm4=${encodeURIComponent(adm4)}`, { signal: abort.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Prakiraan BMKG belum tersedia");
        const forecast = weatherForecastSchema.parse(body);
        if (forecast.adm4 !== adm4 || Date.parse(forecast.expiresAt) <= Date.now()) throw new Error("Prakiraan BMKG sudah kedaluwarsa atau wilayah tidak cocok");
        return forecast;
      }));
      if (disposed) return;
      const forecasts = settled.flatMap(item => item.status === "fulfilled" ? [item.value] : []);
      const error = settled.flatMap(item => item.status === "rejected" ? [item.reason instanceof Error ? item.reason.message : "Cuaca gagal dimuat"] : []).join("; ");
      if (error) console.warn("Cuaca otomatis (BMKG):", error);
      setResult({ key: locationKey, forecasts, error });
      const expiresIn = forecasts.length ? Math.min(...forecasts.map(forecast => Date.parse(forecast.expiresAt) - Date.now())) : liputan7Motion.weatherRefreshMs;
      timer = setTimeout(refresh, error ? 60000 : Math.max(1000, Math.min(liputan7Motion.weatherRefreshMs, expiresIn)));
    };
    void refresh();
    return () => { disposed = true; abort.abort(); clearTimeout(timer); };
  }, [enabled, locationKey]);
  return enabled && result.key === locationKey ? result : { forecasts: [], error: "" };
}
