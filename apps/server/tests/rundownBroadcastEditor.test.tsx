// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rundown } from "@newscg/shared";
import { RundownBroadcastEditor } from "../../web/src/RundownBroadcastEditor";

let root: Root;
let host: HTMLDivElement;
const reload = vi.fn(async () => {});
const toast = vi.fn();
const fetchMock = vi.fn<typeof fetch>();
const first: Rundown = { id: "A", programName: "NEWS", title: "EDISI A", updatedAt: "", items: [],
  broadcastSchedule: { date: "2026-10-11", time: "18:00", timezone: "WIB" },
  ticker: { text: "TICKER A", forDate: "2026-10-11", sources: [] } };

const change = async (selector: string, value: string) => act(async () => {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
});
const mount = async (rundown: Rundown) => act(async () => root.render(createElement(RundownBroadcastEditor, { key: rundown.id, rundown, reload, toast })));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reload.mockClear(); toast.mockClear(); fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(first)));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("rundown ticker preparation", () => {
  it("saves the targeted rundown schedule and ticker without issuing an on-air request", async () => {
    await mount(first);
    expect(host.textContent).toContain("2026-10-09 sampai 2026-10-10");
    await change("textarea", "TICKER REVISI A");
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/rundowns/A");
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(options?.body as string)).toMatchObject({ broadcastSchedule: first.broadcastSchedule,
      ticker: { text: "TICKER REVISI A", forDate: "2026-10-11", sources: [], speedMode: "auto", speed: 85 } });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("shows the content-based speed and saves manual speed only for this rundown", async () => {
    await mount(first);
    await change("textarea", "2026 2027 2028");
    expect(host.textContent).toContain("Otomatis seimbang · 70 px/detik");
    const mode = host.querySelector<HTMLSelectElement>('select option[value="auto"]')!.parentElement as HTMLSelectElement;
    await act(async () => { mode.value = "manual"; mode.dispatchEvent(new Event("change", { bubbles: true })); });
    await change('input[type="number"]', "90");
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/rundowns/A");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).ticker).toMatchObject({ speedMode: "manual", speed: 90 });
  });

  it("does not reuse an unsaved ticker when the operator switches rundown", async () => {
    await mount(first);
    await change("textarea", "BELUM DISIMPAN A");
    await mount({ ...first, id: "B", title: "EDISI B", broadcastSchedule: null, ticker: { text: "", forDate: null, sources: [] } });
    expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a schedule before saving ticker content and surfaces API errors", async () => {
    await mount({ ...first, broadcastSchedule: null, ticker: { text: "", forDate: null, sources: [] } });
    await change("textarea", "HEADLINE");
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("tanggal jadwal tayang"));
    await change('input[type="date"]', "2026-10-11");
    await change('input[type="time"]', "18:00");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Gagal simpan ticker" }), { status: 500 }));
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(toast).toHaveBeenCalledWith("Gagal simpan ticker");
    expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("HEADLINE");
  });
});
