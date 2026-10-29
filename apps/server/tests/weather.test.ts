import { describe, expect, it, vi } from "vitest";
import { masterOverlayPatchSchema, selectBroadcastTemplate, defaultMasterOverlayState } from "@newscg/shared";
import { createWeatherService } from "../src/weather.js";
import { getCachedWeather } from "../src/db.js";

const adm4 = "31.71.03.1001";
const openMeteoPayload = () => ({
  latitude: -6.22,
  longitude: 106.85,
  timezone: "Asia/Jakarta",
  current: {
    time: "2026-10-15T10:00",
    temperature_2m: 30,
    weather_code: 61,
    is_day: 1
  },
  daily: {
    time: ["2026-10-15"],
    temperature_2m_max: [33],
    temperature_2m_min: [25]
  }
});

const timestamp = Date.parse("2026-10-15T10:00:00Z");
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("automatic Open-Meteo weather", () => {
  it("uses Open-Meteo forecast coordinates, WMO mapping, and daily min/max", async () => {
    const fetcher = vi.fn(async () => response(openMeteoPayload()));
    const result = await createWeatherService(fetcher, () => timestamp)(adm4);
    expect(fetcher.mock.calls[0]?.[0]).toContain("https://api.open-meteo.com/v1/forecast");
    expect(result).toMatchObject({
      adm4,
      condition: "rain",
      description: "Hujan Ringan",
      temperature: 30,
      minimum: 25,
      maximum: 33,
      source: "Open-Meteo",
      forecastDate: "2026-10-15"
    });
    // Check SQLite cache was saved
    expect(getCachedWeather(adm4)).not.toBeNull();
  });

  it("deduplicates simultaneous monitor/output requests and caches a fresh response", async () => {
    const fetcher = vi.fn(async () => response(openMeteoPayload()));
    const get = createWeatherService(fetcher, () => timestamp);
    const [a, b] = await Promise.all([get(adm4), get(adm4)]);
    expect(a).toEqual(b);
    expect(await get(adm4)).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves offline fallback from SQLite cache if network fetch fails", async () => {
    const failingFetcher = vi.fn(async () => { throw new Error("Offline"); });
    const get = createWeatherService(failingFetcher, () => timestamp);
    const result = await get(adm4);
    expect(result.adm4).toBe(adm4);
    expect(result.source).toBe("Open-Meteo");
  });

  it("rejects invalid location codes before making any external request", async () => {
    const fetcher = vi.fn(async () => response(openMeteoPayload()));
    await expect(createWeatherService(fetcher)("https://example.com")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Liputan7 shared master contract", () => {
  it("selects the package immutably and preserves the custom TV logo and ticker snapshot", () => {
    const original = { ...defaultMasterOverlayState, logoType: "image" as const, logoImage: "/uploads/custom.svg", tickerText: "TICKER RUNDOWN" };
    const next = selectBroadcastTemplate(original, "liputan7");
    expect(next).toMatchObject({ broadcastTemplate: "liputan7", showProgramLogo: true, showWeather: true, logoImage: original.logoImage, tickerText: original.tickerText });
    expect(original.broadcastTemplate).toBe("cnn");
    expect(masterOverlayPatchSchema.parse({ broadcastTemplate: "liputan7", showProgramLogo: true, showWeather: true })).toMatchObject({ broadcastTemplate: "liputan7" });
    expect(masterOverlayPatchSchema.safeParse({ weatherLocations: [{ adm4, label: "A" }, { adm4, label: "B" }] }).success).toBe(false);
  });
});
