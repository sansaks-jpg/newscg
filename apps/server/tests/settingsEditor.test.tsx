// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMasterOverlayState } from "@newscg/shared";
import type { HeadlineDefaults, LiveState, MasterOverlayState, Rundown } from "@newscg/shared";
import App from "../../web/src/App";

vi.mock("../../web/src/SimpleProductionEditor", () => ({ SimpleProductionEditor: () => null }));
vi.mock("../../web/src/BroadcastGraphic", () => ({
  BroadcastClock: () => null,
  BroadcastPreviewBox: () => null
}));
vi.mock("../../web/src/BroadcastTicker", () => ({ BroadcastTicker: () => null }));

let root: Root;
let host: HTMLDivElement;
let master: MasterOverlayState;
let defaults: HeadlineDefaults;
const defaultsFetch = vi.fn<() => Promise<Response>>();
const uploadFetch = vi.fn<() => Promise<Response>>();
const fetchMock = vi.fn<typeof fetch>();
const rundownA: Rundown = { id: "rundown-a", programName: "PROGRAM A", title: "EDISI A", updatedAt: "", items: [] };
const rundownB: Rundown = { id: "rundown-b", programName: "PROGRAM B", title: "EDISI B", updatedAt: "", items: [] };
const live: LiveState = { connection: "STANDALONE", commandStatus: "idle", selectedGraphicId: null,
  onAirGraphicId: null, actualOverlayInputGuid: null, onAirSnapshot: null, lastActionAt: null,
  error: null, overlayClientsCount: 0 };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status,
  json: async () => body } as Response);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
};
const button = (text: string) => {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((control) => control.textContent?.trim() === text);
  expect(found, `button: ${text}`).toBeDefined();
  return found!;
};
const field = (labelText: string) => {
  const label = Array.from(host.querySelectorAll<HTMLLabelElement>("label"))
    .find((element) => element.textContent?.trim().startsWith(labelText));
  expect(label, `label: ${labelText}`).toBeDefined();
  return label!.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select")!;
};
const change = async (control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => act(async () => {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
});
const click = async (text: string) => act(async () => button(text).click());
const requests = (path: string, method: string) => fetchMock.mock.calls.filter(([input, options]) =>
  String(input) === path && (options?.method || "GET") === method);
const bodyOf = (path: string, method: string) => JSON.parse(requests(path, method).at(-1)![1]!.body as string);
const openSettings = async () => {
  await act(async () => root.render(createElement(App)));
  await click("Pengaturan Default");
};
const openStory = async () => {
  await act(async () => root.render(createElement(App)));
  await click("Rundown & CG");
  await click("Tambah Berita");
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  master = { ...defaultMasterOverlayState, brandText: "NEWSROOM" };
  defaults = { headline: "DEFAULT SERVER", location: "JAKARTA", kicker: "KAMPUS", subline: "DETAIL SERVER" };
  defaultsFetch.mockReset().mockImplementation(async () => response(defaults));
  uploadFetch.mockReset().mockImplementation(async () => response({ url: "/uploads/news.png" }));
  fetchMock.mockReset().mockImplementation(async (input, options) => {
    const path = String(input);
    const method = options?.method || "GET";
    if (path === "/api/settings/headline-defaults") {
      if (method === "GET") return defaultsFetch();
      defaults = JSON.parse(options!.body as string);
      return response(defaults);
    }
    if (path === "/api/uploads/logo") return uploadFetch();
    if (path === "/api/rundowns") return response([rundownA, rundownB]);
    if (path === "/api/settings") return response({ outputMode: "web" });
    if (path === "/api/live/state") return response(live);
    if (path === "/api/live/master") {
      if (method !== "GET") master = { ...master, ...JSON.parse(options!.body as string) };
      return response(master);
    }
    if (method === "PATCH" && path.startsWith("/api/rundowns/")) return response({});
    if (method === "PUT" && path.endsWith("/story")) return response({});
    throw new Error(`Unexpected request ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("settings/default editor safety", () => {
  it("reports failed defaults, blocks saves, and retries without replacing a user's draft", async () => {
    defaultsFetch.mockResolvedValueOnce(response({ error: "Server default tidak tersedia" }, 503));
    await openSettings();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Server default tidak tersedia");
    expect(button("Simpan Semua").disabled).toBe(true);
    expect(button("Simpan Default Headline").disabled).toBe(true);
    await click("Simpan Semua");
    await click("Simpan Default Headline");
    expect(requests("/api/settings", "PATCH")).toHaveLength(0);
    expect(requests("/api/settings/headline-defaults", "PATCH")).toHaveLength(0);

    await change(field("Default Headline / Judul Utama"), "JUDUL OPERATOR");
    await click("Muat ulang default");
    expect(field("Default Headline / Judul Utama").value).toBe("JUDUL OPERATOR");
    expect(field("Default Lokasi").value).toBe("JAKARTA");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(button("Simpan Semua").disabled).toBe(false);
    await click("Simpan Default Headline");
    expect(bodyOf("/api/settings/headline-defaults", "PATCH")).toMatchObject({ headline: "JUDUL OPERATOR", location: "JAKARTA" });
  });

  it("keeps touched default fields when the initial settings load arrives late", async () => {
    const pending = deferred<Response>();
    defaultsFetch.mockReturnValueOnce(pending.promise);
    await openSettings();
    expect(button("Simpan Semua").disabled).toBe(true);
    await change(field("Default Lokasi"), "BANDUNG");
    await change(field("Default Topik / Kicker"), "TOPIK SEMENTARA");
    await change(field("Default Topik / Kicker"), "");
    await act(async () => pending.resolve(response(defaults)));
    expect(field("Default Lokasi").value).toBe("BANDUNG");
    expect(field("Default Topik / Kicker").value).toBe("");
    expect(field("Default Headline / Judul Utama").value).toBe("DEFAULT SERVER");
  });

  it("merges an uploaded logo into the latest ticker and palette edits", async () => {
    const pending = deferred<Response>();
    uploadFetch.mockReturnValueOnce(pending.promise);
    await openSettings();
    await click("Upload Gambar");
    const fileInput = host.querySelector<HTMLInputElement>('.broadcast-defaults-card input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["png"], "logo.png", { type: "image/png" })] });
    await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    expect(button("Simpan Default Master").disabled).toBe(true);
    await change(field("Nama Berita di Ticker"), "NEWS TERBARU");
    await change(field("Isi Running Ticker Berita Default"), "TICKER YANG BARU DIKETIK");
    await act(async () => host.querySelector<HTMLInputElement>('input[value="studio-graphite"]')!.click());
    await act(async () => pending.resolve(response({ url: "/uploads/station.png" })));
    expect(field("Nama Berita di Ticker").value).toBe("NEWS TERBARU");
    expect(field("Isi Running Ticker Berita Default").value).toBe("TICKER YANG BARU DIKETIK");
    expect(host.querySelector<HTMLInputElement>('input[value="studio-graphite"]')!.checked).toBe(true);
    await click("Simpan Default Master");
    expect(bodyOf("/api/live/master", "PATCH")).toMatchObject({
      logoImage: "/uploads/station.png", logoType: "image", colorTheme: "studio-graphite",
      brandText: "NEWS TERBARU", tickerText: "TICKER YANG BARU DIKETIK"
    });
  });

  it("fills only untouched story fields after a slow defaults response", async () => {
    const pending = deferred<Response>();
    defaultsFetch.mockReturnValueOnce(pending.promise);
    await openStory();
    await change(field("Judul Berita"), "JUDUL YANG SUDAH DIKETIK");
    await change(field("Lokasi Liputan (Opsional)"), "BANDUNG");
    await change(field("Detail Headline / Keterangan"), "DETAIL OPERATOR");
    await act(async () => pending.resolve(response(defaults)));
    expect(field("Judul Berita").value).toBe("JUDUL YANG SUDAH DIKETIK");
    expect(field("Headline Utama (Wajib)").value).toBe("JUDUL YANG SUDAH DIKETIK");
    expect(field("Lokasi Liputan (Opsional)").value).toBe("BANDUNG");
    expect(field("Detail Headline / Keterangan").value).toBe("DETAIL OPERATOR");
    expect(field("Sub Topik di Atas / Kicker").value).toBe("KAMPUS");
    expect((field("Detail Headline / Keterangan") as HTMLInputElement).maxLength).toBe(160);
    expect((field("Lokasi Liputan (Opsional)") as HTMLInputElement).maxLength).toBe(60);
    await click("+ Tambah Lokasi Saja");
    expect((field("Nama Lokasi Liputan") as HTMLInputElement).maxLength).toBe(50);
  });

  it("shows a story defaults failure while allowing an explicitly entered story to save", async () => {
    defaultsFetch.mockResolvedValueOnce(response({ error: "Default tidak dapat dibaca" }, 500));
    await openStory();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Default tidak dapat dibaca");
    await change(field("Judul Berita"), "BERITA MANUAL");
    await act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(bodyOf("/api/rundowns/rundown-a/story", "PUT")).toMatchObject({ title: "BERITA MANUAL",
      graphics: [{ draftFields: { headline: "BERITA MANUAL" } }] });
    expect(requests("/api/settings/headline-defaults", "PATCH")).toHaveLength(0);
  });

  it("pins the rename target, traps keyboard focus, and restores its opener", async () => {
    await act(async () => root.render(createElement(App)));
    await click("Rundown & CG");
    const opener = button("Ubah Edisi");
    opener.focus();
    await click("Ubah Edisi");
    const dialog = host.querySelector<HTMLFormElement>('.rename-modal[role="dialog"][aria-modal="true"]')!;
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(field("Nama Program Siaran"));
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button,input"));
    controls.at(-1)!.focus();
    await act(async () => controls.at(-1)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(controls[0]);
    await act(async () => controls[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(controls.at(-1));
    await change(host.querySelector<HTMLSelectElement>('[aria-label="Pilih Rundown Program"]')!, "rundown-b");
    expect(field("Nama Program Siaran").value).toBe("PROGRAM A");
    await change(field("Nama Program Siaran"), "PROGRAM A BARU");
    await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(bodyOf("/api/rundowns/rundown-a", "PATCH")).toMatchObject({ programName: "PROGRAM A BARU", title: "EDISI A" });
    expect(requests("/api/rundowns/rundown-b", "PATCH")).toHaveLength(0);
    expect(host.querySelector(".rename-modal")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("saves news and CG without an approval selector or status payload", async () => {
    await openStory();
    const dialog = host.querySelector<HTMLFormElement>(".story-editor-modal")!;
    expect(host.textContent).not.toMatch(/PERLU DICEK|SIAP TAYANG|PRATINJAU DRAFT/);
    expect(dialog.querySelector('.status-select, [aria-label^="Status grafis"]')).toBeNull();
    await change(field("Judul Berita"), "MATERI TANPA PERSETUJUAN STATUS");
    await act(async () => dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const saved = bodyOf("/api/rundowns/rundown-a/story", "PUT");
    expect(saved.title).toBe("MATERI TANPA PERSETUJUAN STATUS");
    expect(saved.graphics).toHaveLength(1);
    expect(saved.graphics[0]).not.toHaveProperty("status");
    expect(saved.graphics[0].draftFields.headline).toBe(saved.title);
    expect(requests("/api/live/take", "POST")).toHaveLength(0);
  });
});
