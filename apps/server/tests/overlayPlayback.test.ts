import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMasterOverlayState, broadcastMotion, masterOverlayPatchSchema } from "@newscg/shared";
import type { GraphicItem, OverlayPlaybackState } from "@newscg/shared";
import { createOverlayPlayback } from "../../web/src/overlayPlayback";
import { advanceTicker, tickerCopies, tickerFrameDue } from "../../web/src/tickerMotion";

const master = { ...defaultMasterOverlayState, showLogo: true, showTicker: true };
const graphic = (id: string) => ({ id, templateType: "HEADLINE", draftFields: { headline: id } } as GraphicItem);
function setup() {
  vi.useFakeTimers();
  let current: OverlayPlaybackState;
  const player = createOverlayPlayback((next) => { current = next; });
  current = player.initial;
  const take = (id: string, revision?: number) => player.receive({ type: "TAKE", graphic: graphic(id), fields: { headline: id }, master, revision });
  return { player, take, state: () => current };
}
afterEach(() => vi.useRealTimers());

describe("output playback", () => {
  it("finishes the outgoing panel before replacing the headline", () => {
    const { take, state } = setup();
    take("A"); take("B");
    vi.advanceTimersByTime(320);
    expect(state().graphic?.id).toBe("A");
    expect(state().exiting).toBe(true);
    vi.advanceTimersByTime(broadcastMotion.panelOutMs + broadcastMotion.panelOutDelayMs - 320);
    expect(state().graphic?.id).toBe("B");
    expect(state().exiting).toBe(false);
  });
  it("updates the pending headline without putting its text on the outgoing panel", () => {
    const { player, take, state } = setup();
    take("A"); take("B");
    player.receive({ type: "UPDATE", graphicId: "B", fields: { headline: "B revised" }, master });
    expect(state().fields?.headline).toBe("A");
    vi.advanceTimersByTime(broadcastMotion.retainMs);
    expect(state().fields?.headline).toBe("B revised");
    const key = state().animationKey;
    player.receive({ type: "UPDATE", graphicId: "B", fields: { headline: "Final" }, master });
    expect(state().animationKey).toBe(key);
    expect(state().fields?.headline).toBe("Final");
  });
  it("keeps only the latest queued TAKE and cancels stale removals", () => {
    const { player, take, state } = setup();
    take("A"); take("B"); take("C");
    vi.advanceTimersByTime(broadcastMotion.retainMs);
    expect(state().graphic?.id).toBe("C");
    player.receive({ type: "CLEAR", master });
    take("D");
    vi.advanceTimersByTime(2000);
    expect(state().graphic?.id).toBe("D");
  });
  it("OUT preserves the master while emergency clear removes everything immediately", () => {
    const { player, take, state } = setup();
    take("A");
    player.receive({ type: "CLEAR", master });
    vi.advanceTimersByTime(broadcastMotion.retainMs);
    expect(state().graphic).toBeNull();
    expect(state().master.showTicker).toBe(true);
    take("B"); take("C");
    player.receive({ type: "CLEAR_ALL_IMMEDIATE" });
    expect(state().blackout).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(state().graphic).toBeNull();
    expect(state().master.showLogo).toBe(false);
  });
  it("allows a new TAKE during ALL OUT without a delayed blackout", () => {
    const { player, take, state } = setup();
    take("A");
    player.receive({ type: "CLEAR_ALL_ANIMATED" });
    expect(state().exitAll).toBe(true);
    vi.advanceTimersByTime(100);
    take("B");
    vi.advanceTimersByTime(2000);
    expect(state().graphic?.id).toBe("B");
    expect(state().blackout).toBe(false);
    expect(state().exitAll).toBe(false);
  });
  it("ignores repeated revisions but accepts a fresh SYNC without replay", () => {
    const { player, take, state } = setup();
    take("A", 3);
    const key = state().animationKey;
    take("B", 3); take("C", 2);
    expect(state().graphic?.id).toBe("A");
    player.receive({ type: "SYNC", onAir: true, graphic: graphic("A"), fields: { headline: "restored" }, master, revision: 3 });
    expect(state().animationKey).toBe(key);
    expect(state().synced).toBe(true);
    expect(state().fields?.headline).toBe("restored");
    player.dispose();
  });
  it("cancels a pending TAKE when OUT arrives", () => {
    const { player, take, state } = setup();
    take("A"); take("B");
    player.receive({ type: "CLEAR", master });
    vi.advanceTimersByTime(2000);
    expect(state().graphic).toBeNull();
  });
  it("accepts an authoritative SYNC after the server restarts its revision counter", () => {
    const { player, take, state } = setup();
    take("A", 100);
    player.receive({ type: "SYNC", onAir: false, graphic: null, fields: null, master, revision: 1 });
    take("B", 2);
    expect(state().graphic?.id).toBe("B");
  });
});

describe("ticker canvas motion", () => {
  it("rejects invalid master speeds and supports an urgent ticker revision", () => {
    expect(masterOverlayPatchSchema.safeParse({ tickerSpeed: 0 }).success).toBe(false);
    expect(masterOverlayPatchSchema.safeParse({ tickerSpeed: 251 }).success).toBe(false);
    expect(masterOverlayPatchSchema.safeParse({ tickerSpeed: 85, tickerRevision: 42, tickerText: "Berita baru" }).success).toBe(true);
    expect(masterOverlayPatchSchema.safeParse({ outputFps: 25 }).success).toBe(true);
    expect(masterOverlayPatchSchema.safeParse({ outputFps: 30 }).success).toBe(true);
    expect(masterOverlayPatchSchema.safeParse({ outputFps: 60 }).success).toBe(true);
    expect(masterOverlayPatchSchema.safeParse({ outputFps: 45 }).success).toBe(false);
  });
  it.each([25, 30, 60] as const)("paces a 60 Hz browser to %i ticker updates per second", (fps) => {
    let nextFrameAt: number | undefined;
    let frames = 0;
    for (let i = 0; i < 60; i++) {
      const result = tickerFrameDue(i * 1000 / 60, nextFrameAt, fps);
      nextFrameAt = result.nextFrameAt;
      if (result.render) frames++;
    }
    expect(frames).toBe(fps);
  });
  it.each([25, 30, 50, 60])("moves 85 canvas pixels in one second at %i fps", (fps) => {
    let position = 0;
    for (let i = 0; i < fps; i++) position = advanceTicker(position, 1000 / fps, 85, 10000).position;
    expect(position).toBeCloseTo(85, 8);
  });
  it("changes speed without resetting the position", () => {
    const next = advanceTicker(450, 100, 105, 5000);
    expect(next.position).toBe(460.5);
  });
  it("wraps fractional widths without rounding or a gap", () => {
    const next = advanceTicker(499.5, 20, 85, 500.25);
    expect(next.position).toBeCloseTo(.95, 8);
    expect(next.wrapped).toBe(true);
  });
  it("covers the viewport for short and long messages", () => {
    for (const width of [15.5, 200, 4000]) expect(tickerCopies(1920, width) * width).toBeGreaterThan(1920);
  });
  it("does not fast-forward after browser suspension", () => {
    expect(advanceTicker(100, 60000, 85, 4000).position).toBeCloseTo(108.5);
  });
});
