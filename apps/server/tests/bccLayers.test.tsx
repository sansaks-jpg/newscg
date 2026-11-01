// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bccPalette, broadcastMotion, defaultMasterOverlayState, liputan7Motion } from "@newscg/shared";
import type { GraphicItem, OverlayEvent, WeatherForecast } from "@newscg/shared";
import OverlayWindow from "../../web/src/OverlayWindow";
import BccPreview from "../../web/src/BccPreview";

let root: Root;
let host: HTMLDivElement;
const streams: { onmessage: ((event: MessageEvent) => void) | null; close: () => void }[] = [];
const forecast: WeatherForecast = {
  adm4: "31.71.03.1001", village: "Kemayoran", city: "Jakarta Pusat", timezone: "Asia/Jakarta",
  condition: "rain", description: "Hujan Ringan", temperature: 29, minimum: 25, maximum: 30, source: "BMKG",
  validAt: "2026-10-15T09:00:00Z", expiresAt: "2026-10-15T12:00:00Z", forecastDate: "2026-10-15",
  fetchedAt: "2026-10-15T10:00:00Z", sourceUrl: "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001", isDaytime: true
};
const fetchMock = vi.fn();
const fields = {
  headline: "KEMACETAN STASIUN CITAYAM",
  subline: "Tanti | Pengunjung",
  location: "CITAYAM, JAWA BARAT",
  kicker: "CITAYAM, JAWA BARAT",
  showLocation: "true",
  showDetail: "true",
  showKicker: "true",
  layoutStyle: "sub"
};
const graphic = { id: "BCC-1", itemId: "ITEM-1", templateType: "HEADLINE", draftFields: fields, sortOrder: 0, lastPushedFields: null } as GraphicItem;
const master = {
  ...defaultMasterOverlayState,
  broadcastTemplate: "bcc" as const,
  showLogo: true,
  showTicker: true,
  showLiveBadge: true,
  brandText: "BCCNEWS.ID",
  tickerText: "INFORMASI TERKINI BCC NEWS • SIARAN LANGSUNG",
  logoText: "BCC",
  logoSub: "NEWS"
};

const element = (selector: string) => host.querySelector<HTMLElement>(selector);
const send = (event: OverlayEvent) => act(async () => {
  for (const stream of streams) stream.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
});
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  streams.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", class {
    onmessage = null;
    constructor() { streams.push(this); }
    close() { this.onmessage = null; }
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const adm4 = new URL(url, "http://localhost").searchParams.get("adm4") || forecast.adm4;
    return { ok: true, json: async () => ({ ...forecast, adm4 }) };
  });
  vi.stubGlobal("fetch", fetchMock);

  const webSrc = resolve(__dirname, "../../web/src");
  const style = document.createElement("style");
  style.textContent = ["broadcast-cnn.css", "broadcast-motion.css", "broadcast-bcc.css"]
    .map((file) => readFileSync(resolve(webSrc, file), "utf8")).join("\n");
  document.head.append(style);

  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  host.remove();
  document.head.querySelectorAll("style").forEach((node) => node.remove());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("BCC News Template ('output' and 'preview')", () => {
  it("renders BCC News lower third with maroon headline plate, cream subline plate, orange kicker tab, and left logo box", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    await advance(broadcastMotion.panelInMs);

    // Verify container uses bcc-template and data-broadcast-template="bcc"
    const lowerThird = element(".bcc-template.cg-lower-third");
    expect(lowerThird).not.toBeNull();
    expect(lowerThird?.getAttribute("data-broadcast-template")).toBe("bcc");

    // Logo box is rendered on the left
    const logoBox = element(".cg-logo-box-left");
    expect(logoBox).not.toBeNull();
    const logoImg = logoBox?.querySelector("img");
    expect(logoImg?.getAttribute("src")).toBe("/branding/bcc.png");

    // Live badge docked on top of left logo box
    const liveBadge = element(".bcc-live-badge");
    expect(liveBadge).not.toBeNull();
    expect(liveBadge?.textContent).toContain("LIVE");
    expect(liveBadge?.querySelector(".live-dot")).not.toBeNull();

    
    // Orange kicker tab
    const kickerTab = element(".cg-kicker-tab");
    expect(kickerTab).not.toBeNull();
    expect(kickerTab?.textContent).toContain("CITAYAM, JAWA BARAT");

    // Maroon headline plate
    const headlinePlate = element(".cg-headline-plate");
    expect(headlinePlate).not.toBeNull();
    expect(headlinePlate?.textContent).toContain("KEMACETAN STASIUN CITAYAM");

    // Cream subline plate
    const sublinePlate = element(".cg-subline-plate");
    expect(sublinePlate).not.toBeNull();
    expect(sublinePlate?.textContent).toContain("Tanti | Pengunjung");

    // Ticker bar with clock on the left and running text (bbcnews.id badge removed)
    const tickerBar = element(".cg-ticker-bar");
    expect(tickerBar).not.toBeNull();
    expect(element(".cg-ticker-badge")).toBeNull();
    expect(element(".cg-ticker-clock")).not.toBeNull();
    expect(element(".cg-ticker-text")?.textContent).toContain("BCC NEWS");
  });

  it("updates text content smoothly on UPDATE without recreating DOM nodes", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    await advance(broadcastMotion.panelInMs);

    const headlineNodeBefore = element(".cg-headline-plate");
    const sublineNodeBefore = element(".cg-subline-plate");

    // UPDATE event with new copy
    const updatedFields = { ...fields, headline: "PENUMPANG MEMADATI PERON 2", subline: "Situasi Terkini" };
    await send({ type: "UPDATE", graphicId: graphic.id, fields: updatedFields, master });

    expect(element(".cg-headline-plate")).toBe(headlineNodeBefore);
    expect(element(".cg-headline-plate")?.textContent).toContain("PENUMPANG MEMADATI PERON 2");
    expect(element(".cg-subline-plate")?.textContent).toContain("Situasi Terkini");
  });

  it("plays smooth exit transition on CLEAR while keeping master logo and ticker", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    await advance(broadcastMotion.panelInMs);

    await send({ type: "CLEAR", master });

    // Exit class applied to content layer
    expect(element(".cg-content-layer")?.className).toContain("cg-exit");

    // During the exit transition (e.g. at 250ms), both headline plate AND subline plate remain present
    await advance(250);
    expect(element(".cg-headline-plate")).not.toBeNull();
    expect(element(".cg-subline-plate")).not.toBeNull();
    expect(element(".cg-subline-plate")?.textContent).toContain("Tanti | Pengunjung");

    // Advance past retain time
    await advance(broadcastMotion.retainMs);

    // Headline is cleared
    expect(element(".cg-headline-plate")).toBeNull();
    expect(element(".cg-subline-plate")).toBeNull();
    // But standalone master logo and ticker remain visible
    expect(element(".cg-standalone-master-wrap")).not.toBeNull();
    expect(element(".cg-ticker-bar")).not.toBeNull();
  });

  it("handles independent detail toggle OUT smoothly with cg-detail-out class", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    await advance(broadcastMotion.panelInMs);

    expect(element(".cg-subline-plate")).not.toBeNull();

    // Toggle detail off via SWITCH_DETAIL while headline stays on air
    const singleFields = { ...fields, showDetail: "false", layoutStyle: "single" };
    await send({ type: "SWITCH_DETAIL", graphic: { ...graphic, draftFields: singleFields }, fields: singleFields, master });

    // During detail exit, subline plate receives cg-detail-out
    expect(element(".cg-subline-plate")?.className).toContain("cg-detail-out");
    expect(element(".cg-headline-plate")?.textContent).toContain("KEMACETAN STASIUN CITAYAM");

    // Advance past detail out duration
    await advance(broadcastMotion.detailOutMs + 50);

    // Subline plate is now removed, headline remains in single-layout mode
    expect(element(".cg-subline-plate")).toBeNull();
    expect(element(".cg-headline-plate")?.className).toContain("single-layout");
  });

  it("preserves persistent logo box across standby, headline entry (TAKE), and CLEAR without closing animation or unmounting (without lingering live badge)", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    // Standby: Master active, no headline on air yet -> logo box persistent, no live badge
    await send({ type: "SYNC", onAir: false, master });
    await advance(broadcastMotion.panelInMs);
    const logoNode = element(".cg-logo-box-left");
    expect(logoNode).not.toBeNull();
    expect(element(".bcc-live-badge")).not.toBeNull();
    expect(element(".bcc-live-badge")?.textContent).toBe("LIVE");
    expect(element(".bcc-live-badge .live-dot")).not.toBeNull();

    // 2. TAKE: Headline enters, persistent logo remains stationary
    await send({ type: "TAKE", graphic, fields, master });
    await advance(broadcastMotion.panelInMs);
    expect(element(".cg-headline-plate")?.textContent).toContain("KEMACETAN STASIUN CITAYAM");
    expect(element(".cg-logo-space")).not.toBeNull();
    expect(element(".cg-logo-box-left")).toBe(logoNode);

    // 3. CLEAR: Headline exits, logo remains persistent
    await send({ type: "CLEAR", master });
    expect(element(".cg-content-layer")?.className).toContain("cg-exit");
    await advance(broadcastMotion.retainMs + 100);
    expect(element(".cg-headline-plate")).toBeNull();
    expect(element(".cg-logo-box-left")).toBe(logoNode);
  });

  it("renders single headline mode with full height when subline is empty", async () => {
    const singleFields = { ...fields, subline: "", showDetail: "false", layoutStyle: "single" };
    const singleGraphic = { ...graphic, draftFields: singleFields };

    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic: singleGraphic, fields: singleFields, master });
    await advance(broadcastMotion.panelInMs);

    const headlinePlate = element(".cg-headline-plate");
    expect(headlinePlate?.className).toContain("single-layout");
    expect(element(".cg-subline-plate")).toBeNull();
  });

  it("renders SOT narasumber and role separated by divider", async () => {
    const sotFields = {
      name: "Tanti",
      role: "Pengunjung",
      contentMode: "sot",
      showSot: "true",
      location: "CITAYAM"
    };
    const sotGraphic = { ...graphic, templateType: "SOT" as const, draftFields: sotFields };

    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: true, graphic: sotGraphic, fields: sotFields, master });
    await advance(broadcastMotion.panelInMs);

    expect(element(".cg-headline-plate")?.textContent).toContain("Tanti");
    expect(element(".cg-subline-plate")?.textContent).toContain("Pengunjung");
  });

  it("renders the interactive BccPreview gallery correctly", async () => {
    await act(async () => { root.render(createElement(BccPreview)); });
    await advance(100);

    expect(host.querySelector("h1")?.textContent).toContain("BCC News");
    expect(element(".bcc-template.cg-lower-third")).not.toBeNull();
    expect(element(".cg-headline-plate")?.textContent).toContain("KEMACETAN STASIUN CITAYAM");
  });

  it("morphs weather strip in the BCC logo box immediately without requiring a CG lower-third or waiting 10 seconds", async () => {
    const bccMasterWithWeather = { ...master, showProgramLogo: true, showWeather: true };
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: false, master: bccMasterWithWeather });
    await advance(broadcastMotion.panelInMs);

    // Initial 10s: Logo is stationary, no weather strip
    expect(element(".cg-logo-box-left")).not.toBeNull();
    // Weather opens immediately with morph
    await advance(liputan7Motion.weatherMorphMs);
    expect(element(".cg-logo-box-left")?.classList.contains("bcc-weather-active")).toBe(true);
    const weatherStrip = element(".bcc-weather-strip");
    expect(weatherStrip).not.toBeNull();
    expect(element(".cg-weather-city")?.textContent).toBe("JAKARTA");
    expect(element(".cg-weather-temperature")?.textContent).toBe("29°C");

    // Turning off weather via master update smoothly exits the weather strip
    await send({ type: "MASTER_UPDATE", master: { ...bccMasterWithWeather, showWeather: false } });
    expect(element(".bcc-weather-strip")?.classList.contains("cg-weather-out")).toBe(true);
    await advance(750);
    expect(element(".bcc-weather-strip")).toBeNull();
    expect(element(".cg-logo-box-left")?.classList.contains("bcc-weather-active")).toBe(false);
  });

  it("renders and toggles BCC live badge independently from logo box", async () => {
    await act(async () => { root.render(createElement(OverlayWindow)); });
    await send({ type: "SYNC", onAir: false, master: { ...master, showLiveBadge: true, showLogo: true } });
    await advance(broadcastMotion.panelInMs);
    expect(element(".bcc-live-badge")).not.toBeNull();
    expect(element(".bcc-live-badge .live-dot")).not.toBeNull();
    expect(element(".bcc-live-badge")?.textContent).toBe("LIVE");
    expect(element(".bcc-live-badge")?.classList.contains("above-logo")).toBe(true);

    // Turning off logo retains live badge in solo mode
    await send({ type: "MASTER_UPDATE", master: { ...master, showLiveBadge: true, showLogo: false } });
    await advance(broadcastMotion.logoOutMs + 50);
    expect(element(".cg-logo-box-left")).toBeNull();
    expect(element(".bcc-live-badge")).not.toBeNull();
    expect(element(".bcc-live-badge")?.classList.contains("solo")).toBe(true);

    // Turning off live badge removes it
    await send({ type: "MASTER_UPDATE", master: { ...master, showLiveBadge: false, showLogo: false } });
    await advance(broadcastMotion.liveOutMs + 50);
    expect(element(".bcc-live-badge")).toBeNull();
  });
});

