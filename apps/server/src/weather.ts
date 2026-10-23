import { bmkgResponseSchema, liputan7Motion, weatherForecastSchema, weatherLocationSchema } from "@newscg/shared";
import type { WeatherCondition, WeatherForecast } from "@newscg/shared";

const slotMs = 3 * 60 * 60 * 1000;
export function createWeatherService(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, WeatherForecast>();
  const inFlight = new Map<string, Promise<WeatherForecast>>();
  const retryAfter = new Map<string, number>();
  async function load(adm4: string): Promise<WeatherForecast> {
    const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`;
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`BMKG mengembalikan HTTP ${response.status}`);
    const data = bmkgResponseSchema.parse(await response.json());
    if (data.lokasi.adm4 !== adm4) throw new Error("Wilayah balasan BMKG tidak sesuai permintaan");
    const points = data.data[0]!.cuaca.flat().map(point => ({ ...point, time: Date.parse(`${point.utc_datetime.replace(" ", "T")}Z`) }))
      .filter(point => Number.isFinite(point.time)).sort((a, b) => a.time - b.time);
    const timestamp = now();
    const current = points.find(point => point.time <= timestamp && timestamp < point.time + slotMs) ||
      points.find(point => point.time > timestamp && point.time - timestamp <= slotMs);
    if (!current) throw new Error("Prakiraan BMKG belum mencakup waktu siaran saat ini");
    const forecastDate = current.local_datetime.slice(0, 10);
    const temperatures = points.filter(point => point.local_datetime.startsWith(forecastDate)).map(point => point.t);
    const description = current.weather_desc;
    const text = description.toLowerCase();
    const condition: WeatherCondition = /petir/.test(text) ? "storm" : /hujan/.test(text) ? "rain" :
      /kabut|asap|udara kabur/.test(text) ? "fog" : /cerah berawan/.test(text) ? "partly-cloudy" :
      /cerah/.test(text) ? "sunny" : "cloudy";
    const forecast = weatherForecastSchema.parse({
      adm4, village: data.lokasi.desa, city: data.lokasi.kotkab, timezone: data.lokasi.timezone,
      condition, description, temperature: current.t, minimum: Math.min(...temperatures), maximum: Math.max(...temperatures),
      validAt: new Date(current.time).toISOString(), expiresAt: new Date(current.time + slotMs).toISOString(), forecastDate,
      fetchedAt: new Date(timestamp).toISOString(), source: "BMKG", sourceUrl: url,
      isDaytime: Number(current.local_datetime.slice(11, 13)) >= 6 && Number(current.local_datetime.slice(11, 13)) < 18
    });
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(adm4, forecast);
    return forecast;
  }
  return async (value: string): Promise<WeatherForecast> => {
    const adm4 = weatherLocationSchema.shape.adm4.parse(value);
    const cached = cache.get(adm4);
    if (cached && now() - Date.parse(cached.fetchedAt) < liputan7Motion.weatherRefreshMs && now() < Date.parse(cached.expiresAt)) return cached;
    const pending = inFlight.get(adm4);
    if (pending) return pending;
    if ((retryAfter.get(adm4) || 0) > now()) throw new Error("BMKG belum tersedia. Mencoba kembali setelah satu menit.");
    const request = load(adm4).catch((error: unknown) => {
      if (retryAfter.size >= 128) retryAfter.delete(retryAfter.keys().next().value!);
      retryAfter.set(adm4, now() + 60000);
      throw new Error(`Cuaca otomatis belum tersedia: ${error instanceof Error ? error.message : "Balasan BMKG tidak valid"}`);
    }).finally(() => inFlight.delete(adm4));
    inFlight.set(adm4, request);
    return request;
  };
}

export const getWeatherForecast = createWeatherService();
