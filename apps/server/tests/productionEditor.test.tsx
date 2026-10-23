// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { broadcastTemplateIds, defaultMasterOverlayState, fieldReporterGraphicId, newsAnchorGraphicId } from "@newscg/shared";
import type { GraphicItem, LiveState, Rundown, TemplateType } from "@newscg/shared";
import { SimpleProductionEditor } from "../../web/src/SimpleProductionEditor";

let root: Root;
let host: HTMLDivElement;
let rundown: Rundown;
let live: LiveState;
let stored: Map<string, GraphicItem>;
const reload = vi.fn(async () => {});
const toast = vi.fn();
const updateMaster = vi.fn(async () => {});
const fetchMock = vi.fn<typeof fetch>();
let master = { ...defaultMasterOverlayState, showLogo: false, showTicker: false, showLiveBadge: false };

function cue(id: string, templateType: TemplateType = "HEADLINE", fields: Record<string, string> = {}): GraphicItem {
  return {
    id, itemId: id.startsWith("B") ? "B" : "A", templateType, sortOrder: 0, lastPushedFields: null,
    draftFields: { headline: `ORIGINAL ${id}`, location: "JAKARTA", kicker: "TOPIK", subline: "DETAIL",
      showLocation: "false", showKicker: "false", showDetail: "false", layoutStyle: "single", ...fields }
  };
}

function storeGraphic(path: string, options?: RequestInit): Response {
  const id = path.split("/").at(-1)!;
  const current = stored.get(id);
  if (!current) return new Response(JSON.stringify({ error: "Cue tidak ditemukan" }), { status: 404 });
  const patch = JSON.parse(options?.body as string) as { draftFields: Record<string, string> };
  const updated = { ...current, draftFields: { ...current.draftFields, ...patch.draftFields } };
  stored.set(id, updated);
  return new Response(JSON.stringify(updated), { status: 200 });
}

async function mount(nextRundown = rundown, nextLive = live) {
  await act(async () => root.render(createElement(SimpleProductionEditor, {
    rundown: nextRundown, live: nextLive, master, reload, toast, onUpdateMaster: updateMaster
  })));
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const click = (element: HTMLElement) => act(async () => { element.click(); });
const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
const action = (key: string) => buttons().find((button) => button.querySelector(".qa-kbd")?.textContent === key)!;
const input = (index = 0) => host.querySelectorAll<HTMLInputElement>(".mini-editor-grid input")[index]!;
const selectStory = (index: number) => click(host.querySelectorAll<HTMLButtonElement>(".story-select-button")[index]!);
const selectCue = (id: string) => click(Array.from(host.querySelectorAll<HTMLButtonElement>(".cue-pill")).find((button) => {
    const story = button.closest(".sidebar-story-card");
    const storyId = story?.querySelector(".story-number")?.textContent === "#2" ? "B" : "A";
    return `${storyId}${button.textContent?.includes("#2") ? "2" : "1"}` === id;
  })!);
const openEditor = () => click(host.querySelector<HTMLButtonElement>('button[title="Edit teks cue terpilih tanpa meninggalkan kontrol siaran"]')!);
const change = (element: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
});
const graphicRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/graphics/"));
const liveRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/live/"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", class { onmessage = null; close() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  sessionStorage.clear();
  reload.mockReset(); reload.mockImplementation(async () => {});
  toast.mockClear(); updateMaster.mockClear(); fetchMock.mockReset();
  master = { ...defaultMasterOverlayState, showLogo: false, showTicker: false, showLiveBadge: false };
  live = { connection: "STANDALONE", commandStatus: "idle", selectedGraphicId: null, onAirGraphicId: null,
    actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: null, error: null, overlayClientsCount: 0 };
  rundown = { id: "R", programName: "NEWS", title: "EDISI", updatedAt: "2026-10-08T00:00:00Z",
    items: ["A", "B"].map((id, index) => ({ id, rundownId: "R", title: `Story ${id}`, slug: id, format: "PKG",
      cgRequired: true, sortOrder: index, estimatedDurationSeconds: 60, graphics: [cue(`${id}1`), cue(`${id}2`)] })) };
  stored = new Map(rundown.items.flatMap((item) => item.graphics).map((graphic) => [graphic.id, graphic]));
  fetchMock.mockImplementation(async (url, options) => {
    const path = String(url);
    if (path.startsWith("/api/graphics/")) return storeGraphic(path, options);
    if (path === "/api/settings/news-anchor-defaults") return new Response(JSON.stringify({ name: "Nadia Putri", role: "News Anchor" }));
    if (path === "/api/settings/reporter-defaults") return new Response(JSON.stringify({ name: "Raka Pratama", role: "Reporter Lapangan", location: "Jakarta Selatan" }));
    if (path.startsWith("/api/live/")) return new Response(JSON.stringify({ commandStatus: "confirmed", state: live, error: null }));
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("production draft persistence", () => {
  it.each(broadcastTemplateIds)("P stages a default anchor outside the rundown, then Space takes it in %s", async broadcastTemplate => {
    await act(async () => root.render(createElement(SimpleProductionEditor, {
      rundown, live, master: { ...master, broadcastTemplate }, reload, toast, onUpdateMaster: updateMaster
    })));
    const sidebars = host.querySelector(".cg-story-sidebar")!.textContent;
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })); });
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("Nadia Putri");
    expect(host.querySelector(".cg-story-sidebar")!.textContent).toBe(sidebars);
    expect(graphicRequests()).toHaveLength(0);
    expect(liveRequests()).toHaveLength(0);
    expect(host.querySelector(".live-mini-screen-wrapper")?.textContent).not.toContain("Nadia Putri");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/news-anchor"]);
    expect(JSON.parse(liveRequests()[0]![1]!.body as string)).toEqual({ action: "take", defaults: { name: "Nadia Putri", role: "News Anchor" } });
    expect(new Headers(liveRequests()[0]![1]!.headers).get("Idempotency-Key")).toBeTruthy();
    await click(action("P"));
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("ORIGINAL A1");
    expect(liveRequests()).toHaveLength(1);
    expect(graphicRequests()).toHaveLength(0);
  });

  it("prepares the default anchor without any rundown and updates an anchor already on air", async () => {
    const nextLive = { ...live, onAirGraphicId: newsAnchorGraphicId, onAirSnapshot: { name: "Nama lama", role: "Anchor" } };
    await act(async () => root.render(createElement(SimpleProductionEditor, { live: nextLive, master, reload, toast, onUpdateMaster: updateMaster })));
    await click(action("P"));
    expect(host.querySelector(".primary-actions-deck button")?.textContent).toContain("UPDATE");
    await click(host.querySelector<HTMLButtonElement>(".primary-actions-deck button")!);
    expect(JSON.parse(liveRequests()[0]![1]!.body as string)).toMatchObject({ action: "update", defaults: { name: "Nadia Putri" } });
    expect(graphicRequests()).toHaveLength(0);
  });

  it("keeps the selected cue when default anchor data is empty or cannot be loaded", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: "", role: "News Anchor" })));
    await click(action("P"));
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("Isi Nama Anchor"));
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("ORIGINAL A1");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Jaringan terputus" }), { status: 503 }));
    await click(action("P"));
    expect(toast).toHaveBeenLastCalledWith("Jaringan terputus");
    expect(liveRequests()).toHaveLength(0);
  });

  it("O stages the field reporter default, takes it, and returns to the cue", async () => {
    await mount();
    await click(action("O"));
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("Raka Pratama");
    expect(host.querySelector(".preview-meta-badge")?.textContent).toContain("REPORTER LAPANGAN");
    expect(graphicRequests()).toHaveLength(0);
    expect(liveRequests()).toHaveLength(0);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/reporter"]);
    expect(JSON.parse(liveRequests()[0]![1]!.body as string)).toEqual({ action: "take",
      defaults: { name: "Raka Pratama", role: "Reporter Lapangan", location: "Jakarta Selatan" } });
    await click(action("O"));
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("ORIGINAL A1");
  });
  it("blocks O with an empty reporter name and updates a live field reporter", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: "", role: "Reporter Lapangan", location: "" })));
    await click(action("O"));
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("Isi Nama Reporter Lapangan"));
    expect(liveRequests()).toHaveLength(0);
    live = { ...live, onAirGraphicId: fieldReporterGraphicId,
      onAirSnapshot: { name: "Raka Pratama", role: "Reporter Lapangan", location: "Jakarta Selatan" } };
    await mount();
    await click(action("O"));
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
    expect(JSON.parse(liveRequests()[0]![1]!.body as string)).toMatchObject({ action: "update" });
  });
  it("ignores P while typing, held, modified, or when hotkeys are disabled", async () => {
    await mount(); await openEditor();
    await act(async () => { input().dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })); });
    await click(host.querySelector<HTMLButtonElement>(".quick-edit-close")!);
    for (const options of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }])
      await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true, ...options })); });
    await click(buttons().find(button => button.textContent?.includes("HOTKEYS: ON"))!);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "P", bubbles: true })); });
    expect(fetchMock.mock.calls).toHaveLength(0);
  });
  it("releases mouse-click focus so Space keeps driving TAKE", async () => {
    await mount();
    const control = host.querySelector<HTMLButtonElement>(".story-select-button")!;
    control.focus();
    expect(document.activeElement).toBe(control);
    // A real mouse click has detail >= 1; keyboard clicks use detail 0.
    await act(async () => { control.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })); });
    expect(document.activeElement).not.toBe(control);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/take"]);
  });
  it("keeps native Space activation for a control focused by the keyboard", async () => {
    await mount();
    const control = host.querySelector<HTMLButtonElement>(".story-select-button")!;
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    control.focus();
    await act(async () => { control.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
    expect(liveRequests()).toHaveLength(0);
  });
  it("uses ArrowRight for TAKE/UPDATE and ArrowLeft for OUT on a normal cue", async () => {
    await mount();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/take"]);
    expect(JSON.parse(liveRequests()[0]![1]!.body as string)).toMatchObject({ graphicId: "A1" });
    live = { ...live, onAirGraphicId: "A1", onAirSnapshot: { headline: "ORIGINAL A1" } };
    await mount();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/take", "/api/live/clear"]);
    // ArrowLeft tidak navigasi berita saat cue biasa.
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("ORIGINAL A1");
  });
  it("uses ArrowRight/ArrowLeft to move between HIGHLIGHT headlines without live commands", async () => {
    const bulletinCue = (id: string, headline: string, sortOrder: number) => ({
      id, itemId: "H1", templateType: "HEADLINE" as TemplateType, sortOrder, lastPushedFields: null,
      draftFields: { headline, headlinePresentation: "bulletin", kicker: "HIGHLIGHT", showKicker: "true",
        contentMode: "headline", layoutStyle: "single", showLocation: "false", showDetail: "false" }
    });
    const highlightRundown: Rundown = { id: "H", programName: "LIPUTAN7", title: "Edisi", updatedAt: "2026-10-19T00:00:00Z",
      items: [{ id: "H1", rundownId: "H", title: "OPENING + HEADLINE", slug: "OPENING", format: "LAINNYA",
        cgRequired: true, sortOrder: 0, estimatedDurationSeconds: 60,
        graphics: [bulletinCue("HG1", "JUDUL SATU", 0), bulletinCue("HG2", "JUDUL DUA", 1), bulletinCue("HG3", "JUDUL TIGA", 2)] }] };
    await mount(highlightRundown);
    await click(host.querySelectorAll<HTMLButtonElement>(".cue-pill")[0]!);
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("JUDUL SATU");
    const press = (key: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
    await press("ArrowRight");
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("JUDUL DUA");
    await press("ArrowRight");
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("JUDUL TIGA");
    await press("ArrowLeft");
    expect(host.querySelector(".preview-screen-wrapper")?.textContent).toContain("JUDUL DUA");
    expect(liveRequests()).toHaveLength(0);
  });
  it.each(["story", "cue"] as const)("saves both edits when switching %s by mouse before debounce", async (navigation) => {
    await mount(); await openEditor(); await change(input(), "EDIT A1");
    if (navigation === "story") await selectStory(1); else await selectCue("A2");
    await change(input(), "EDIT NEXT"); await advance(500);
    expect(stored.get("A1")?.draftFields.headline).toBe("EDIT A1");
    expect(stored.get(navigation === "story" ? "B1" : "A2")?.draftFields.headline).toBe("EDIT NEXT");
    expect(graphicRequests()).toHaveLength(2);
    expect(liveRequests()).toHaveLength(0);
    expect(rundown.items[0]?.graphics[0]?.draftFields.headline).toBe("ORIGINAL A1");
  });

  it("retains the confirmed draft on revisit and sends that same draft on TAKE", async () => {
    await mount(); await openEditor(); await change(input(), "  SAVED HEADLINE  "); await advance(500);
    expect(host.querySelector(".save-indicator")?.textContent).toContain("Tersimpan");
    await selectStory(1); await selectStory(0);
    expect(input().value).toBe("SAVED HEADLINE");
    await click(host.querySelector<HTMLButtonElement>(".quick-edit-close")!);
    await click(host.querySelector<HTMLButtonElement>(".primary-actions-deck button")!);
    expect(stored.get("A1")?.draftFields.headline).toBe("SAVED HEADLINE");
    expect(liveRequests().map(([path]) => path)).toEqual(["/api/live/take"]);
    expect(JSON.parse(liveRequests()[0]?.[1]?.body as string)).toMatchObject({ graphicId: "A1", syncComposition: true });
    expect(live.onAirSnapshot).toBeNull();
  });

  it("does not supersede queued writes for other cues during a slow save", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce((url, options) => new Promise<Response>((resolve) => {
      release = () => resolve(storeGraphic(String(url), options));
    }));
    await mount(); await openEditor(); await change(input(), "A SAVED FIRST"); await selectStory(1);
    await change(input(), "B SAVED SECOND"); await selectStory(0);
    await change(input(), "A SAVED LAST"); await advance(500);
    await act(async () => { release(); });
    expect(stored.get("A1")?.draftFields.headline).toBe("A SAVED LAST");
    expect(stored.get("B1")?.draftFields.headline).toBe("B SAVED SECOND");
    expect(graphicRequests().map(([path]) => path)).toEqual(["/api/graphics/A1", "/api/graphics/B1", "/api/graphics/A1"]);
  });

  it("does not replace new typing with an older save response", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce((url, options) => new Promise<Response>((resolve) => {
      release = () => resolve(storeGraphic(String(url), options));
    }));
    await mount(); await openEditor(); await change(input(), "FIRST SAVE"); await advance(500);
    await change(input(), "NEWER TYPING"); await act(async () => release());
    expect(input().value).toBe("NEWER TYPING");
    await advance(500); await selectStory(1); await selectStory(0);
    expect(input().value).toBe("NEWER TYPING");
    expect(stored.get("A1")?.draftFields.headline).toBe("NEWER TYPING");
  });

  it("accepts parent refreshes after save without restoring old text or pending composition", async () => {
    reload.mockImplementation(async () => {
      rundown = { ...rundown, items: rundown.items.map((item) => ({ ...item,
        graphics: item.graphics.map((graphic) => stored.get(graphic.id)!) })) };
      await mount();
    });
    await mount(); await openEditor(); await change(input(), "REFRESHED HEADLINE"); await click(action("L")); await advance(500);
    await selectStory(1); await selectStory(0);
    expect(input().value).toBe("REFRESHED HEADLINE");
    expect(action("L").classList.contains("active")).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([["L", "showLocation"], ["T", "showKicker"], ["D", "showDetail"]] as const)(
    "keeps the new %s composition when text debounce was pending", async (key, field) => {
      await mount(); await openEditor(); await change(input(), "UPDATED HEADLINE"); await click(action(key)); await advance(1000);
      expect(stored.get("A1")?.draftFields[field]).toBe("true");
      expect(stored.get("A1")?.draftFields.headline).toBe("UPDATED HEADLINE");
      expect(graphicRequests()).toHaveLength(1);
      expect(liveRequests()).toHaveLength(0);
    }
  );

  it("flushes an unfinished draft when leaving the production panel", async () => {
    await mount(); await openEditor(); await change(input(), "BEFORE LEAVING");
    await act(async () => root.render(null));
    expect(stored.get("A1")?.draftFields.headline).toBe("BEFORE LEAVING");
    await advance(1000); expect(graphicRequests()).toHaveLength(1);
  });

  it("flushes the original cue when the parent switches to another rundown", async () => {
    await mount(); await openEditor(); await change(input(), "BEFORE RUNDOWN CHANGE");
    await mount({ ...rundown, id: "R2", items: [rundown.items[1]!] });
    expect(stored.get("A1")?.draftFields.headline).toBe("BEFORE RUNDOWN CHANGE");
    expect(input().value).toBe("ORIGINAL B1");
  });

  it("prunes deleted cue drafts before the same ID appears with new server data", async () => {
    await mount(); await openEditor(); await change(input(), "CACHED BEFORE DELETION"); await advance(500);
    const original = rundown;
    await mount({ ...rundown, items: [{ ...rundown.items[0]!, graphics: [rundown.items[0]!.graphics[1]!] }] });
    const restored = cue("A1", "HEADLINE", { headline: "RESTORED FROM SERVER" });
    await mount({ ...original, items: [{ ...original.items[0]!, graphics: [restored, original.items[0]!.graphics[1]!] }] });
    await selectCue("A1");
    expect(input().value).toBe("RESTORED FROM SERVER");
  });

  it("settles an old-rundown save without resetting the active rundown or retaining its old cache", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce((url, options) => new Promise<Response>((resolve) => {
      release = () => resolve(storeGraphic(String(url), options));
    }));
    await mount(); await openEditor(); await change(input(), "OLD RUNDOWN EDIT");
    await mount({ ...rundown, id: "R2", items: [rundown.items[1]!] });
    await change(input(), "ACTIVE RUNDOWN EDIT");
    await act(async () => release());
    expect(input().value).toBe("ACTIVE RUNDOWN EDIT");
    await advance(500); expect(stored.get("B1")?.draftFields.headline).toBe("ACTIVE RUNDOWN EDIT");
    const refreshed = cue("A1", "HEADLINE", { headline: "NEW SERVER REVISION" });
    await mount({ ...rundown, items: [{ ...rundown.items[0]!, graphics: [refreshed] }] });
    expect(input().value).toBe("NEW SERVER REVISION");
  });

  it("keeps a failed draft available and reports the failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Penyimpanan gagal" }), { status: 500 }));
    await mount(); await openEditor(); await change(input(), "UNSAVED RETRY"); await advance(500);
    expect(toast).toHaveBeenCalledWith("Penyimpanan gagal");
    expect(host.querySelector(".save-indicator")?.textContent).toContain("Gagal menyimpan");
    await selectStory(1); await selectStory(0); expect(input().value).toBe("UNSAVED RETRY");
    await click(host.querySelector<HTMLButtonElement>(".quick-edit-close")!);
    await click(host.querySelector<HTMLButtonElement>(".primary-actions-deck button")!);
    expect(stored.get("A1")?.draftFields.headline).toBe("UNSAVED RETRY");
  });
});

describe("production without material approval", () => {
  it.each(["take", "update"] as const)("waits for a pending save before %s without an approval status", async (command) => {
    if (command === "update") live = { ...live, onAirGraphicId: "A1", onAirSnapshot: { ...stored.get("A1")!.draftFields } };
    let release!: () => void;
    fetchMock.mockImplementationOnce((url, options) => new Promise<Response>((done) => {
      release = () => done(storeGraphic(String(url), options));
    }));
    await mount(); await openEditor(); await change(input(), "SAVE BEFORE LIVE");
    expect(host.textContent).not.toMatch(/DRAFT|PERLU DICEK|Setujui/);
    const primary = host.querySelector<HTMLButtonElement>(".primary-actions-deck button")!;
    expect(primary.disabled).toBe(false);
    await click(primary);
    expect(graphicRequests()).toHaveLength(1);
    expect(liveRequests()).toHaveLength(0);
    expect(primary.disabled).toBe(true);
    await act(async () => release());
    expect(stored.get("A1")!.draftFields.headline).toBe("SAVE BEFORE LIVE");
    expect(liveRequests().map(([url]) => url)).toEqual([`/api/live/${command}`]);
    expect(JSON.parse(graphicRequests()[0]![1]!.body as string)).not.toHaveProperty("status");
  });

  it.each(["take", "update"] as const)("blocks %s when saving material fails", async (command) => {
    if (command === "update") live = { ...live, onAirGraphicId: "A1", onAirSnapshot: { ...stored.get("A1")!.draftFields } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Penyimpanan gagal" }), { status: 500 }));
    await mount(); await openEditor(); await change(input(), "STILL UNSAVED");
    await click(host.querySelector<HTMLButtonElement>(".primary-actions-deck button")!);
    expect(liveRequests()).toHaveLength(0);
    expect(stored.get("A1")!.draftFields.headline).toBe("ORIGINAL A1");
    expect(input().value).toBe("STILL UNSAVED");
    expect(toast).toHaveBeenCalledWith("Penyimpanan gagal");
    expect(host.querySelector(".save-indicator")?.textContent).toContain("Gagal menyimpan");
  });
});

describe("template-specific quick editing", () => {
  it.each([["LOCATION", 50, 50], ["REPORTER", 60, 50], ["SOT", 80, 60], ["HEADLINE", 120, 60]] as const)(
    "keeps %s quick-edit limits compatible with server validation", async (type, mainLimit, locationLimit) => {
      const graphic = cue("A1", type, { name: "NAMA", role: "JABATAN" });
      rundown = { ...rundown, items: [{ ...rundown.items[0]!, graphics: [graphic] }] }; stored.set(graphic.id, graphic);
      await mount(); await openEditor();
      expect(input().maxLength).toBe(mainLimit); expect(input(1).maxLength).toBe(locationLimit);
    }
  );

  it("loads and saves LOCATION text from the actual location field", async () => {
    const location = cue("A1", "LOCATION", { location: "JAKARTA", headline: "UNRELATED STORY TITLE" });
    rundown = { ...rundown, items: [{ ...rundown.items[0]!, graphics: [location] }] }; stored.set(location.id, location);
    await mount(); await openEditor(); expect(input().value).toBe("JAKARTA");
    await change(input(), "BANDUNG"); expect(input(1).value).toBe("BANDUNG"); await advance(500);
    expect(stored.get("A1")?.draftFields).toMatchObject({ location: "BANDUNG", headline: "BANDUNG" });
    expect(host.querySelector(".preview-screen-wrapper .cg-location-tag")?.textContent).toContain("BANDUNG");
    await change(input(1), "SURABAYA"); expect(input().value).toBe("SURABAYA"); await advance(500);
    expect(stored.get("A1")?.draftFields.location).toBe("SURABAYA");
  });

  it("shows SOT name and role changes as pending while preserving the story headline", async () => {
    const sot = cue("A2", "SOT", { headline: "HEADLINE BERITA", name: "NAMA AWAL", role: "JABATAN AWAL", subline: "JABATAN AWAL" });
    rundown = { ...rundown, items: [{ ...rundown.items[0]!, graphics: [rundown.items[0]!.graphics[0]!, sot] }] }; stored.set(sot.id, sot);
    live = { ...live, onAirGraphicId: sot.id, onAirSnapshot: { ...sot.draftFields } };
    sessionStorage.setItem("simple-cued-cue-R", sot.id);
    await mount(); await openEditor(); await change(input(), "NAMA BARU"); await change(input(3), "JABATAN BARU");
    const summary = host.querySelector(".live-change-summary")?.textContent;
    expect(summary).toContain("Nama"); expect(summary).toContain("Jabatan"); expect(summary).not.toContain("Isi Preview sama");
    await advance(500); expect(stored.get(sot.id)?.draftFields.headline).toBe("HEADLINE BERITA");
    expect(live.onAirSnapshot?.name).toBe("NAMA AWAL"); expect(liveRequests()).toHaveLength(0);
  });

  it("keeps edited SOT location staged after saving while Program retains its earlier location", async () => {
    const sot = cue("A2", "SOT", { name: "NARASUMBER", role: "", subline: "", showLocation: "true" });
    rundown = { ...rundown, items: [{ ...rundown.items[0]!, graphics: [rundown.items[0]!.graphics[0]!, sot] }] }; stored.set(sot.id, sot);
    live = { ...live, onAirGraphicId: sot.id, onAirSnapshot: { ...sot.draftFields } };
    sessionStorage.setItem("simple-cued-cue-R", sot.id);
    await mount(); await openEditor(); await change(input(1), "BANDUNG"); await advance(500);
    expect(input(1).value).toBe("BANDUNG"); expect(stored.get(sot.id)?.draftFields.location).toBe("BANDUNG");
    expect(live.onAirSnapshot?.location).toBe("JAKARTA");
    await click(action("L")); await advance(500);
    expect(action("L").classList.contains("active")).toBe(false);
    expect(stored.get(sot.id)?.draftFields.showLocation).toBe("false");
  });

  it("returns from SOT to the edited headline and its staged composition", async () => {
    const headline = cue("A1", "HEADLINE", { showLocation: "true", showKicker: "true", showDetail: "true", layoutStyle: "sub" });
    const sot = cue("A2", "SOT", { name: "NARASUMBER", role: "", subline: "" });
    rundown = { ...rundown, items: [{ ...rundown.items[0]!, graphics: [headline, sot] }] };
    stored.set(headline.id, headline); stored.set(sot.id, sot);
    await mount(); await openEditor(); await change(input(), "HEADLINE YANG SUDAH DIEDIT"); await advance(500);
    await click(action("K")); expect(input().value).toBe("NARASUMBER");
    expect(action("D").disabled).toBe(false); await click(action("D"));
    expect(input().value).toBe("HEADLINE YANG SUDAH DIEDIT");
    expect(action("L").classList.contains("active")).toBe(true);
    expect(action("T").classList.contains("active")).toBe(true);
    expect(action("D").classList.contains("active")).toBe(true);
    expect(liveRequests()).toHaveLength(0);
  });

  it("key 0 toggles master layer off when active, and restores to output when pressed again", async () => {
    master = { ...master, showLogo: true, showTicker: true, showLiveBadge: true };
    await mount();

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true })); });
    expect(updateMaster).toHaveBeenCalledWith(expect.objectContaining({
      showLogo: false,
      showTicker: false,
      showLiveBadge: false,
    }));
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("MASTER OUT"));

    master = { ...master, showLogo: false, showTicker: false, showLiveBadge: false };
    await act(async () => root.render(createElement(SimpleProductionEditor, { live, master, reload, toast, onUpdateMaster: updateMaster, rundown })));

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", bubbles: true })); });
    expect(updateMaster).toHaveBeenLastCalledWith(expect.objectContaining({
      showLogo: true,
      showTicker: true,
      showLiveBadge: true,
    }));
    expect(toast).toHaveBeenLastCalledWith(expect.stringContaining("MASTER IN"));
  });
});
