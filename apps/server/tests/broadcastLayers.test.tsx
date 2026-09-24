// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { broadcastMotion, defaultMasterOverlayState } from "@newscg/shared";
import type { GraphicItem, OverlayEvent } from "@newscg/shared";
import OverlayWindow from "../../web/src/OverlayWindow";
import { ProgramMonitor } from "../../web/src/ProgramMonitor";

let root: Root;
let host: HTMLDivElement;
const streams: TestEventSource[] = [];
class TestEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor() { streams.push(this); }
  close() { this.onmessage = null; }
}
const master = { ...defaultMasterOverlayState, showLogo: true, showTicker: true, showLiveBadge: true };
const fields = { headline: "HEADLINE PERTAMA", subline: "Keterangan berita", kicker: "TOPIK",
  location: "JAKARTA", layoutStyle: "sub", showLocation: "true", showKicker: "true", showDetail: "true" };
const graphic = { id: "headline-1", templateType: "HEADLINE", draftFields: fields } as GraphicItem;
const element = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const send = async (event: OverlayEvent) => act(async () => {
  for (const stream of streams) stream.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
});
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  streams.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", TestEventSource);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  const style = document.createElement("style");
  // Load both the legacy template and the new motion rules in application order.
  style.textContent = ["broadcast-cnn.css", "broadcast-motion.css"]
    .map((file) => readFileSync(resolve(process.cwd(), "../web/src", file), "utf8")).join("\n");
  document.head.append(style);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([{ name: "output", Component: OverlayWindow }, { name: "Program", Component: ProgramMonitor }])("broadcast layer lifecycle ($name)", ({ Component }) => {
  it("assigns IN animations to every visible layer, including headline text and clock", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    for (const [selector, name] of [
      [".cg-main-box", "news-panel-in"], [".cg-headline-row", "news-text-in"],
      [".cg-subline-row", "news-detail-in"], [".cg-kicker-tab", "news-topic-in"],
      [".cg-location-tag", "news-location-in"], [".cg-logo-box.standalone", "news-logo-in"],
      [".cg-standalone-live-badge", "news-topic-in"], [".cg-ticker-bar", "news-ticker-in"],
      [".cg-ticker-clock", "news-detail-in"]
    ]) {
      const node = element(selector!);
      expect(node, selector).not.toBeNull();
      expect(getComputedStyle(node!).animation, selector).toContain(name);
    }
  });

  it("retains the headline throughout OUT in both Program and /output", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await advance(700);
    await send({ type: "CLEAR", master });
    expect(getComputedStyle(element(".cg-main-box")!).animation).toContain("news-panel-out");
    expect(getComputedStyle(element(".cg-headline-row")!).animation).toContain("news-text-out");
    await advance(broadcastMotion.panelOutDelayMs + broadcastMotion.panelOutMs - 1);
    expect(element(".cg-main-box")).not.toBeNull();
    await advance(21);
    expect(element(".cg-main-box")).toBeNull();
    expect(element(".cg-ticker-bar")).not.toBeNull();
    expect(element(".cg-logo-box.standalone")).not.toBeNull();
  });

  it("updates text and adds detail without replacing the headline or restarting master layers", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields: { ...fields, subline: "", layoutStyle: "single" }, master });
    const panel = element(".cg-main-box");
    const headline = element(".cg-headline-row-single");
    const ticker = element(".cg-ticker-track");
    await send({ type: "UPDATE", graphicId: graphic.id, fields: { ...fields, headline: "JUDUL DIPERBARUI" }, master });
    expect(element(".cg-main-box")).toBe(panel);
    expect(element(".cg-headline-row")).toBe(headline);
    expect(element(".cg-ticker-track")).toBe(ticker);
    expect(headline?.textContent).toBe("JUDUL DIPERBARUI");
    expect(getComputedStyle(element(".cg-subline-row")!).animation).toContain("news-detail-in");
    await send({ type: "UPDATE", graphicId: graphic.id, fields: { ...fields, subline: "", layoutStyle: "single", showKicker: "false" }, master });
    expect(getComputedStyle(element(".cg-subline-row")!).animation).toContain("news-text-out");
    expect(getComputedStyle(element(".cg-kicker-tab")!).animation).toContain("news-topic-out");
    await advance(broadcastMotion.topicOutMs + 20);
    expect(element(".cg-subline-row")).toBeNull();
    expect(element(".cg-kicker-tab")).toBeNull();
    expect(element(".cg-main-box")).toBe(panel);
  });

  it("animates master layers OUT and allows IN again before removal", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "MASTER_UPDATE", master });
    await send({ type: "MASTER_UPDATE", master: defaultMasterOverlayState });
    expect(getComputedStyle(element(".cg-logo-box.standalone")!).animation).toContain("news-logo-out");
    expect(getComputedStyle(element(".cg-standalone-live-badge")!).animation).toContain("news-topic-out");
    expect(getComputedStyle(element(".cg-ticker-bar")!).animation).toContain("news-ticker-out");
    expect(getComputedStyle(element(".cg-ticker-clock")!).animation).toContain("news-text-out");
    expect(element(".empty-stage-center")).toBeNull();
    await advance(200);
    await send({ type: "MASTER_UPDATE", master });
    await advance(1000);
    expect(element(".cg-logo-box.standalone")).not.toBeNull();
    expect(getComputedStyle(element(".cg-ticker-bar")!).animation).toContain("news-ticker-in");
  });

  it("ALL OUT retains all layers for their animations and emergency clear removes them immediately", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic, fields, master });
    await send({ type: "CLEAR_ALL_ANIMATED" });
    for (const selector of [".cg-main-box", ".cg-location-tag", ".cg-ticker-bar", ".cg-logo-box.standalone"])
      expect(element(selector), selector).not.toBeNull();
    await advance(broadcastMotion.retainMs);
    expect(element(".cg-lower-third")).toBeNull();
    await send({ type: "TAKE", graphic, fields, master });
    await send({ type: "CLEAR_ALL_IMMEDIATE" });
    expect(element(".cg-lower-third")).toBeNull();
  });

  it("does not leave animation suppression on a synced graphic", async () => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    const panel = element(".cg-main-box");
    await send({ type: "SYNC", onAir: true, graphic, fields, master });
    expect(element(".cg-main-box")).toBe(panel);
    expect(host.querySelector(".cg-synced")).toBeNull();
    await send({ type: "CLEAR", master });
    expect(getComputedStyle(panel!).animation).toContain("news-panel-out");
  });

  it.each([
    { type: "REPORTER", mode: "presenter", selector: ".cg-presenter-row" },
    { type: "HEADLINE", mode: "paragraph", selector: ".cg-paragraph-row" },
    { type: "BREAKING", mode: "headline", selector: ".cg-headline-row" }
  ] as const)("animates $type/$mode text IN and OUT", async ({ type, mode, selector }) => {
    await act(async () => root.render(createElement(Component)));
    await send({ type: "TAKE", graphic: { ...graphic, templateType: type },
      fields: { ...fields, name: "NAMA REPORTER", role: "REPORTER", contentMode: mode }, master });
    expect(getComputedStyle(element(selector)!).animation).toContain("news-text-in");
    if (type === "REPORTER") expect(getComputedStyle(element(".cg-social-row")!).animation).toContain("news-detail-in");
    await send({ type: "CLEAR", master });
    expect(getComputedStyle(element(selector)!).animation).toContain("news-text-out");
    await advance(broadcastMotion.retainMs);
    expect(element(selector)).toBeNull();
  });
});
