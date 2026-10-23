// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { broadcastMotion, defaultMasterOverlayState, defaultWeatherLocations, liputan7Motion } from "@newscg/shared";
import type { GraphicItem, OverlayEvent, WeatherForecast } from "@newscg/shared";
import OverlayWindow from "../../web/src/OverlayWindow";
import { ProgramMonitor } from "../../web/src/ProgramMonitor";
import { SimpleProductionEditor } from "../../web/src/SimpleProductionEditor";
import Liputan7Preview from "../../web/src/Liputan7Preview";

let root: Root;
let host: HTMLDivElement;
const streams: { onmessage: ((event: MessageEvent) => void) | null; close: () => void }[] = [];
const fields = { headline: "HEADLINE UTAMA", subline: "DETAIL BERITA", location: "JAKARTA", showLocation: "true", showDetail: "true", layoutStyle: "sub" };
const graphic = { id: "A", itemId: "I", templateType: "HEADLINE", draftFields: fields, sortOrder: 0, lastPushedFields: null } as GraphicItem;
const master = { ...defaultMasterOverlayState, broadcastTemplate: "liputan7" as const, showLogo: true, showTicker: true,
  showLiveBadge: true, showProgramLogo: true, showWeather: true, tickerText: "TICKER RUNDOWN" };
const forecast: WeatherForecast = { adm4: "31.71.03.1001", village: "Kemayoran", city: "Jakarta Pusat", timezone: "Asia/Jakarta",
  condition: "rain", description: "Hujan Ringan", temperature: 29, minimum: 25, maximum: 30, source: "BMKG",
  validAt: "2026-10-15T09:00:00Z", expiresAt: "2026-10-15T12:00:00Z", forecastDate: "2026-10-15",
  fetchedAt: "2026-10-15T10:00:00Z", sourceUrl: "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001", isDaytime: true };
const fetchMock = vi.fn();
const element = (selector: string) => host.querySelector<HTMLElement>(selector);
const send = (event: OverlayEvent) => act(async () => {
  for (const stream of streams) stream.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
});
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T10:00:00Z")); streams.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", class {
    onmessage = null;
    constructor() { streams.push(this); }
    close() { this.onmessage = null; }
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const adm4 = new URL(url, "http://localhost").searchParams.get("adm4") || forecast.adm4;
    return { ok: true, json: async () => ({ ...forecast, adm4 }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  const style = document.createElement("style");
  style.textContent = ["broadcast-cnn.css", "broadcast-motion.css", "broadcast-palettes.css", "broadcast-liputan7.css"]
    .map(file => readFileSync(resolve(process.cwd(), "../web/src", file), "utf8")).join("\n");
  document.head.append(style);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); document.head.innerHTML = "";
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe.each([{ name: "output", Component: OverlayWindow }, { name: "Program", Component: ProgramMonitor }])("Liputan7 ($name)", ({ Component }) => {
  it("assigns reference IN animations, palette and positions to every real rendered layer", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    expect(element(".cnn-template")).toBeNull();
    for (const [selector, animation] of [[".l7-red-foundation", "l7-foundation-in"], [".l7-title-surface", "l7-plate-in"],
      [".l7-title-copy", "l7-copy-in"], [".l7-detail-surface", "l7-plate-in"], [".l7-detail-copy", "l7-copy-in"],
      [".l7-location-surface", "l7-location-in"], [".l7-program", "l7-logo-in"], [".l7-tv-logo", "l7-logo-in"],
      [".l7-ticker", "l7-logo-in"]]) {
      expect(element(selector), selector).not.toBeNull();
      expect(getComputedStyle(element(selector)!).animation, selector).toContain(animation);
    }
    expect(element(".liputan7-template")!.style.getPropertyValue("--l7-burgundy")).toBe("#790D16");
    expect(getComputedStyle(element(".l7-content")!)).toMatchObject({ left: "384px", top: "826px", width: "1466px", height: "146px" });
    expect(getComputedStyle(element(".l7-title-copy")!).fontWeight).toBe("500");
    expect(element(".l7-weather")).toBeNull();
    await advance(liputan7Motion.weatherLogoHoldMs);
    expect(getComputedStyle(element(".l7-weather")!).animation).toContain("l7-weather-in");
    expect(element(".l7-weather-symbol")?.getAttribute("src")).toBe("/weather/meteocons/rain.svg");
    expect(getComputedStyle(element(".l7-tv-logo")!)).toMatchObject({ right: "116px", top: "54px" });
    expect(element(".l7-location")?.textContent).toBe("JAKARTA");
    expect(element(".l7-weather-temperature")?.textContent).toBe("25–30°C");
    expect(element(".l7-weather")?.dataset.weatherSource).toBe("BMKG");
    expect(element(".l7-tv-logo img")?.getAttribute("src")).toBe("/branding/hoc-tv.svg");
    expect(element(".l7-program img")?.getAttribute("src")).toBe("/branding/liputan7.svg");
    expect(element(".l7-clock")?.textContent).toMatch(/\d{2}:\d{2} WIB/);
    expect(getComputedStyle(element(".l7-clock")!).padding).toBe("0px 22px");
  });
  it("anchors the HIGHLIGHT topic tab to the left edge above the headline", async () => {
    const bulletinFields = { headline: "KEMARAU → HARGA SAYURAN", kicker: "HIGHLIGHT", showKicker: "true",
      headlinePresentation: "bulletin", contentMode: "headline", layoutStyle: "single",
      showLocation: "false", showDetail: "false" };
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields: bulletinFields, master });
    const topic = element(".l7-topic");
    expect(topic).not.toBeNull();
    expect(topic?.textContent).toBe("HIGHLIGHT");
    expect(topic?.parentElement?.classList.contains("l7-content")).toBe(true);
    expect(getComputedStyle(topic!)).toMatchObject({ position: "absolute", left: "0px", bottom: "146px" });
    // The tab must not stay pinned to the right edge of the panel.
    expect(getComputedStyle(topic!).right).not.toBe("20px");
  });
  it("stacks the HIGHLIGHT tab above the location tab when both are visible", async () => {
    const stackedFields = { headline: "KEMARAU → HARGA SAYURAN", kicker: "HIGHLIGHT", showKicker: "true",
      location: "JAKARTA", showLocation: "true", headlinePresentation: "bulletin", contentMode: "headline",
      layoutStyle: "single", showDetail: "false" };
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields: stackedFields, master });
    const topic = element(".l7-topic");
    expect(element(".l7-content")?.classList.contains("l7-has-location")).toBe(true);
    expect(topic).not.toBeNull();
    expect(getComputedStyle(topic!)).toMatchObject({ position: "absolute", left: "0px", bottom: "178px" });
  });
  it("keeps UPDATE mounted and CLEAR plays OUT before retaining only the persistent masters", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    const plate = element(".l7-title-plate"); const logo = element(".l7-program"); const tv = element(".l7-tv-logo");
    await send({ type: "UPDATE", graphicId: graphic.id, fields: { ...fields, headline: "JUDUL DIUPDATE" }, master });
    expect(element(".l7-title-plate")).toBe(plate); expect(element(".l7-program")).toBe(logo); expect(element(".l7-tv-logo")).toBe(tv);
    expect(element(".l7-title-copy")?.textContent).toBe("JUDUL DIUPDATE");
    await send({ type: "CLEAR", master });
    expect(getComputedStyle(element(".l7-title-copy")!).animation).toContain("l7-copy-out");
    expect(getComputedStyle(element(".l7-title-surface")!).animation).toContain("l7-plate-out");
    expect(getComputedStyle(element(".l7-red-foundation")!).animation).toContain("l7-foundation-out");
    expect(getComputedStyle(element(".l7-location-surface")!).animation).toContain("l7-location-out");
    await advance(liputan7Motion.copyOutMs + 25);
    expect(element(".l7-content")!.classList.contains("l7-single")).toBe(false);
    await advance(liputan7Motion.retainMs - liputan7Motion.copyOutMs - 25);
    expect(element(".l7-content")).toBeNull(); expect(element(".l7-program")).toBe(logo); expect(element(".l7-tv-logo")).toBe(tv);
  });
  it("opens the weather strip without shrinking the logo, rotates all seven cities, and cancels on blackout", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    expect(element(".l7-weather")).toBeNull();
    await advance(liputan7Motion.weatherLogoHoldMs - 1);
    expect(element(".l7-weather")).toBeNull();
    await advance(1 + liputan7Motion.weatherMorphMs);
    expect(element(".l7-program")?.classList.contains("l7-weather-active")).toBe(true);
    const strip = element(".l7-weather");
    for (let index = 0; index < 7; index++) {
      expect(element(".l7-weather-city")?.textContent).toBe(defaultWeatherLocations[index]!.label);
      expect(element(".l7-weather")).toBe(strip);
      await advance(liputan7Motion.weatherHoldMs - 1);
      expect(element(".l7-weather-city")?.textContent).toBe(defaultWeatherLocations[index]!.label);
      await advance(1);
      if (index < 6) await advance(liputan7Motion.weatherCityOutMs + liputan7Motion.weatherCityInMs);
    }
    expect(element(".l7-program")?.classList.contains("l7-weather-active")).toBe(false);
    expect(getComputedStyle(element(".l7-weather")!).animation).toContain("l7-weather-out");
    await advance(liputan7Motion.weatherMorphMs + 20);
    expect(element(".l7-weather")).toBeNull();
    await advance(liputan7Motion.weatherLogoHoldMs - 21);
    expect(element(".l7-weather")).toBeNull();
    await advance(1);
    expect(element(".l7-weather-city")?.textContent).toBe("JAKARTA");
    await send({ type: "CLEAR_ALL_IMMEDIATE" });
    await advance(60000);
    expect(element(".liputan7-template")).toBeNull();
  });
  it("starts a new single-line cue without the previous cue's retained detail or location", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await send({ type: "CLEAR", master });
    await advance(liputan7Motion.retainMs);
    const nextFields = { headline: "JUDUL BARU TANPA DETAIL" };
    await send({ type: "TAKE", graphic: { ...graphic, id: "B", draftFields: nextFields }, fields: nextFields, master });
    expect(element(".l7-content")?.classList.contains("l7-single")).toBe(true);
    expect(element(".l7-detail-copy")).toBeNull();
    expect(element(".l7-location")).toBeNull();
    expect(host.textContent).not.toContain("DETAIL BERITA");
  });
  it("keeps the logo wait through CG updates and starts a fresh wait after weather is re-enabled", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await advance(9000);
    await send({ type: "UPDATE", graphicId: graphic.id, fields: { ...fields, headline: "JUDUL BARU" }, master });
    await advance(1000);
    expect(element(".l7-weather-city")?.textContent).toBe("JAKARTA");
    expect(element(".l7-program")?.textContent).not.toContain("BMKG");
    await send({ type: "MASTER_UPDATE", master: { ...master, showWeather: false } });
    await advance(liputan7Motion.weatherMorphMs + 20);
    expect(element(".l7-weather")).toBeNull();
    await send({ type: "MASTER_UPDATE", master });
    expect(element(".l7-weather")).toBeNull();
    await advance(9999);
    expect(element(".l7-weather")).toBeNull();
    await advance(1);
    expect(element(".l7-weather-city")?.textContent).toBe("JAKARTA");
  });
  it("stops weather with CG OUT, then sequential ALL OUT clears ticker, program and TV", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await advance(liputan7Motion.weatherLogoHoldMs + liputan7Motion.weatherMorphMs);
    await send({ type: "CLEAR_ALL_ANIMATED" });
    expect(getComputedStyle(element(".l7-weather")!).animation).toContain("l7-weather-out");
    await advance(liputan7Motion.retainMs);
    expect(element(".l7-content")).toBeNull(); expect(element(".l7-program")).not.toBeNull();
    expect(element(".l7-weather")).toBeNull();
    await advance(broadcastMotion.tickerOutMs + 20);
    expect(getComputedStyle(element(".l7-program")!).animation).toContain("l7-logo-out");
    expect(getComputedStyle(element(".l7-tv-logo")!).animation).not.toContain("l7-logo-out");
    await advance(Math.max(liputan7Motion.logoOutMs, liputan7Motion.weatherMorphMs) + 20);
    expect(element(".l7-program")).toBeNull();
    expect(getComputedStyle(element(".l7-tv-logo")!).animation).toContain("l7-logo-out");
    await advance(liputan7Motion.logoOutMs + 20);
    expect(element(".liputan7-template")).toBeNull();
  });
  it("treats weather and LIVE as children of the program and TV masters", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await send({ type: "MASTER_UPDATE", master: { ...master, showProgramLogo: false } });
    await advance(Math.max(liputan7Motion.logoOutMs, liputan7Motion.weatherMorphMs) + 20);
    expect(element(".l7-program")).toBeNull(); expect(element(".l7-weather")).toBeNull();
    expect(element(".l7-tv-logo")).not.toBeNull(); expect(element(".l7-ticker")).not.toBeNull();
    await send({ type: "SYNC", onAir: false, graphic: null, fields: null,
      master: { ...master, showProgramLogo: false, showLogo: false, showTicker: false } });
    expect(element(".liputan7-template")).toBeNull();
  });
  it("restores a program-logo-only SYNC and supports anchor and SOT names without showing a headline", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "SYNC", onAir: false, graphic: null, fields: null,
      master: { ...master, showLogo: false, showTicker: false, showLiveBadge: false, showWeather: false } });
    expect(element(".l7-program")).not.toBeNull(); expect(element(".empty-stage-center")).toBeNull();
    for (const type of ["REPORTER", "SOT"] as const) {
      await send({ type: "CLEAR_ALL_IMMEDIATE" });
      await send({ type: "TAKE", graphic: { ...graphic, templateType: type }, fields: { name: "Nama Anchor", role: "Presenter", headline: "JUDUL BUKAN NAMA" }, master });
      expect(element(".l7-title-copy")?.textContent).toBe("Nama Anchor");
      expect(element(".l7-detail-copy")?.textContent).toBe("Presenter");
      expect(element(".l7-location")).toBeNull();
    }
  });
  it("shows the location tab for a field reporter that carries a location", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic: { ...graphic, templateType: "REPORTER" }, fields: {
      name: "Raka Pratama", role: "Reporter Lapangan", location: "Jakarta Selatan",
      showLocation: "true", contentMode: "presenter", layoutStyle: "sub" }, master });
    expect(element(".l7-title-copy")?.textContent).toBe("Raka Pratama");
    expect(element(".l7-detail-copy")?.textContent).toBe("Reporter Lapangan");
    expect(element(".l7-location")?.textContent).toBe("Jakarta Selatan");
  });
  it("keeps empty output on the full program logo and restarts the weather wait after every CLEAR", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "SYNC", onAir: false, graphic: null, fields: null, master });
    await advance(60000);
    expect(element(".l7-program")).not.toBeNull();
    expect(element(".l7-weather")).toBeNull();
    expect(element(".l7-program")?.classList.contains("l7-weather-active")).toBe(false);
    await send({ type: "TAKE", graphic, fields, master });
    await advance(9999);
    expect(element(".l7-weather")).toBeNull();
    await advance(1 + liputan7Motion.weatherMorphMs);
    expect(element(".l7-weather-city")?.textContent).toBe("JAKARTA");
    await send({ type: "CLEAR", master });
    expect(getComputedStyle(element(".l7-weather")!).animation).toContain("l7-weather-out");
    expect(element(".l7-program")?.classList.contains("l7-weather-active")).toBe(false);
    await advance(liputan7Motion.retainMs);
    await advance(60000);
    expect(element(".l7-weather")).toBeNull();
    expect(element(".l7-content")).toBeNull();
    expect(element(".l7-tv-logo")).not.toBeNull();
    expect(element(".l7-ticker")).not.toBeNull();
    await send({ type: "TAKE", graphic, fields, master });
    await advance(9999);
    expect(element(".l7-weather")).toBeNull();
    await advance(1);
    expect(element(".l7-weather-city")?.textContent).toBe("JAKARTA");
  });
});

describe("package selection and local gallery", () => {
  it("stages three independent master buttons and hotkeys without sending live commands", async () => {
    const updateMaster = vi.fn(async () => {});
    await act(async () => root.render(createElement(SimpleProductionEditor, { master,
      live: { connection: "STANDALONE", commandStatus: "idle", selectedGraphicId: null, onAirGraphicId: null,
        actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: null, error: null, overlayClientsCount: 0 },
      reload: vi.fn(async () => {}), toast: vi.fn(), onUpdateMaster: updateMaster })));
    for (const label of ["Logo Program", "Logo TV", "Ticker"]) expect(element(`.master-btn[aria-label="${label}"]`)).not.toBeNull();
    expect(element(".master-btn-group")?.textContent).not.toContain("TICKER + LIVE");
    await act(async () => element('.master-btn[aria-label="Logo Program"]')!.click());
    expect(element('.master-btn[aria-label="Logo Program"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(element('.master-btn[aria-label="Logo TV"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(element('.master-btn[aria-label="Ticker"]')!.getAttribute("aria-pressed")).toBe("true");
    for (const key of ["1", "2", "3"]) await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
    expect(element('.master-btn[aria-label="Logo Program"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(element('.master-btn[aria-label="Logo TV"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(element('.master-btn[aria-label="Ticker"]')!.getAttribute("aria-pressed")).toBe("false");
    expect(updateMaster).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/weather"))).toBe(true);
  });
  it("ships local licensed Meteocons animation files and real medium/regular font files", () => {
    const publicDirectory = resolve(process.cwd(), "../web/public");
    for (const name of ["clear-day", "clear-night", "partly-cloudy-day", "partly-cloudy-night", "overcast", "rain", "thunderstorms-rain", "fog"]) {
      const svg = readFileSync(resolve(publicDirectory, "weather/meteocons", `${name}.svg`), "utf8");
      expect(svg).toContain("<animate"); expect(svg).toContain('repeatCount="indefinite"');
      expect(svg).not.toMatch(/<script|https?:\/\/[^" ]+\.(js|css)/i);
    }
    expect(readFileSync(resolve(publicDirectory, "weather/meteocons/LICENSE"), "utf8")).toContain("MIT License");
    for (const weight of ["Regular", "Medium"]) {
      const font = readFileSync(resolve(publicDirectory, `fonts/barlow/BarlowSemiCondensed-${weight}.woff2`));
      expect(font.subarray(0, 4).toString()).toBe("wOF2");
    }
  });
  it("stages Liputan7 without changing Program and sends it only on explicit MASTER", async () => {
    const updateMaster = vi.fn(async () => {});
    await act(async () => root.render(createElement(SimpleProductionEditor, { master: defaultMasterOverlayState,
      live: { connection: "STANDALONE", commandStatus: "idle", selectedGraphicId: null, onAirGraphicId: null,
        actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: null, error: null, overlayClientsCount: 0 },
      reload: vi.fn(async () => {}), toast: vi.fn(), onUpdateMaster: updateMaster })));
    const select = element(".broadcast-template-select select") as HTMLSelectElement;
    await act(async () => { select.value = "liputan7"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(updateMaster).not.toHaveBeenCalled();
    expect(element(".preview-screen-wrapper .l7-program")).not.toBeNull();
    expect(element(".live-mini-screen-wrapper .liputan7-template")).toBeNull();
    const button = Array.from(host.querySelectorAll("button")).find(button => button.textContent?.startsWith("TERAPKAN MASTER"))!;
    await act(async () => button.click());
    expect(updateMaster).toHaveBeenCalledWith(expect.objectContaining({ broadcastTemplate: "liputan7", showProgramLogo: true, showWeather: true }));
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/weather"))).toBe(true);
  });
  it("the gallery renders the same package without SSE or live mutations", async () => {
    await act(async () => root.render(createElement(Liputan7Preview)));
    expect(streams).toHaveLength(0); expect(element(".l7-content")).not.toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/weather"))).toBe(true);
  });
  it("the gallery offers the HIGHLIGHT preset with the template topic tab on the left", async () => {
    await act(async () => root.render(createElement(Liputan7Preview)));
    const select = element(".template-demo-controls select") as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.value)).toContain("HIGHLIGHT");
    await act(async () => { select.value = "HIGHLIGHT"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await advance(liputan7Motion.retainMs + liputan7Motion.panelInMs + 500);
    expect(element(".l7-title-copy")?.textContent).toBe("KEMARAU → HARGA SAYURAN");
    const topic = element(".l7-topic");
    expect(topic?.textContent).toBe("HIGHLIGHT");
    expect(getComputedStyle(topic!)).toMatchObject({ left: "0px", bottom: "146px" });
    expect(streams).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/weather"))).toBe(true);
  });
});
