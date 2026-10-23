import { describe, expect, it, vi } from "vitest";
import { masterOverlayPatchSchema, selectBroadcastTemplate, defaultMasterOverlayState } from "@newscg/shared";
import { createWeatherService } from "../src/weather.js";

const adm4 = "31.71.03.1001";
const payload = () => ({ lokasi: { adm4, desa: "Kemayoran", kotkab: "Jakarta Pusat", timezone: "Asia/Jakarta" }, data: [{ cuaca: [[
  { utc_datetime: "2026-10-15 06:00:00", local_datetime: "2026-10-15 13:00:00", t: 26, weather_desc: "Cerah" },
  { utc_datetime: "2026-10-15 09:00:00", local_datetime: "2026-10-15 16:00:00", t: 30, weather_desc: "Hujan Ringan" },
  { utc_datetime: "2026-10-15 12:00:00", local_datetime: "2026-10-15 19:00:00", t: 29, weather_desc: "Berawan" },
  { utc_datetime: "2026-10-15 15:00:00", local_datetime: "2026-10-15 22:00:00", t: 25, weather_desc: "Berawan" }
], [{ utc_datetime: "2026-10-16 00:00:00", local_datetime: "2026-10-16 07:00:00", t: 45, weather_desc: "Cerah" }]] }] });
const timestamp = Date.parse("2026-10-15T10:00:00Z");
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("automatic BMKG weather", () => {
  it("uses the current UTC forecast slot, daily local min/max and real source identity", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    const result = await createWeatherService(fetcher, () => timestamp)(adm4);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`);
    expect(result).toMatchObject({ adm4, condition: "rain", temperature: 30, minimum: 25, maximum: 30,
      validAt: "2026-10-15T09:00:00.000Z", expiresAt: "2026-10-15T12:00:00.000Z", forecastDate: "2026-10-15", source: "BMKG" });
  });
  it("deduplicates simultaneous monitor/output requests and caches a fresh response", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    const get = createWeatherService(fetcher, () => timestamp);
    const [a, b] = await Promise.all([get(adm4), get(adm4)]);
    expect(a).toEqual(b);
    expect(await get(adm4)).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not serve an expired slot from the ten-minute cache", async () => {
    let now = Date.parse("2026-10-15T11:59:00Z");
    const fetcher = vi.fn(async () => response(payload()));
    const get = createWeatherService(fetcher, () => now);
    expect((await get(adm4)).temperature).toBe(30);
    now += 2 * 60000;
    expect((await get(adm4)).temperature).toBe(29);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses the local forecast hour to select a night icon after sunset", async () => {
    const forecast = await createWeatherService(async () => response(payload()), () => Date.parse("2026-10-15T12:30:00Z"))(adm4);
    expect(forecast.isDaytime).toBe(false);
  });
  it("keeps an upcoming forecast's real validity time instead of claiming a current observation", async () => {
    const upcoming = payload(); upcoming.data[0]!.cuaca = [[{
      utc_datetime: "2026-10-15 11:00:00", local_datetime: "2026-10-15 19:00:00", t: 27, weather_desc: "Cerah"
    }]];
    upcoming.lokasi.timezone = "Asia/Makassar";
    const result = await createWeatherService(async () => response(upcoming), () => timestamp)(adm4);
    expect(result).toMatchObject({ validAt: "2026-10-15T11:00:00.000Z", expiresAt: "2026-10-15T14:00:00.000Z",
      timezone: "Asia/Makassar", isDaytime: false, temperature: 27 });
  });
  it.each(["2026-10-10T10:00:00Z", "2026-10-20T10:00:00Z"])("refuses data outside the broadcast forecast window (%s)", async now => {
    await expect(createWeatherService(async () => response(payload()), () => Date.parse(now))(adm4)).rejects.toThrow("belum mencakup waktu siaran");
  });
  it("rejects invalid location codes before making any external request", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    await expect(createWeatherService(fetcher)("https://example.com")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed or mismatched upstream data", async () => {
    await expect(createWeatherService(async () => response({}), () => timestamp)(adm4)).rejects.toThrow("Cuaca otomatis belum tersedia");
    const wrong = payload(); wrong.lokasi.adm4 = "31.71.01.1001";
    await expect(createWeatherService(async () => response(wrong), () => timestamp)(adm4)).rejects.toThrow("Wilayah balasan BMKG");
  });
  it("backs off upstream failures and retries without inventing a forecast", async () => {
    let now = timestamp;
    const fetcher = vi.fn(async () => response({}, 503));
    const get = createWeatherService(fetcher, () => now);
    await expect(get(adm4)).rejects.toThrow("HTTP 503");
    await expect(get(adm4)).rejects.toThrow("satu menit");
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 61000;
    fetcher.mockImplementation(async () => response(payload()));
    expect((await get(adm4)).source).toBe("BMKG");
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
