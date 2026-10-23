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
    if (path === "/api/settings/news-anchor-defaults") return response(method === "GET"
      ? { name: "Nadia Putri", role: "News Anchor" } : JSON.parse(options!.body as string));
    if (path === "/api/settings/reporter-defaults") return response(method === "GET"
      ? { name: "Raka Pratama", role: "Reporter Lapangan", location: "Jakarta Selatan" } : JSON.parse(options!.body as string));
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
  it("saves the default anchor independently without changing Program or adding rundown cues", async () => {
    await openSettings();
    expect(field("Nama Anchor").value).toBe("Nadia Putri");
    await change(field("Nama Anchor"), "Nama Anchor Baru");
    await change(field("Jabatan Anchor"), "Pembawa Berita");
    await click("Simpan Default News Anchor");
    expect(bodyOf("/api/settings/news-anchor-defaults", "PATCH")).toEqual({ name: "Nama Anchor Baru", role: "Pembawa Berita" });
    expect(requests("/api/live/master", "PATCH")).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url, options]) => String(url).startsWith("/api/rundowns") && options?.method !== undefined)).toHaveLength(0);
  });

  it("saves the default field reporter independently without changing Program", async () => {
    await openSettings();
    expect(field("Nama Reporter").value).toBe("Raka Pratama");
    expect(field("Lokasi Liputan").value).toBe("Jakarta Selatan");
    await change(field("Nama Reporter"), "Reporter Baru");
    await change(field("Lokasi Liputan"), "Depok");
    await click("Simpan Default Reporter Lapangan");
    expect(bodyOf("/api/settings/reporter-defaults", "PATCH")).toEqual({ name: "Reporter Baru", role: "Reporter Lapangan", location: "Depok" });
    expect(requests("/api/live/master", "PATCH")).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url, options]) => String(url).startsWith("/api/rundowns") && options?.method !== undefined)).toHaveLength(0);
  });

  it("reports a failed anchor load and keeps edited names when retry data arrives", async () => {
    const implementation = fetchMock.getMockImplementation()!;
    let failed = true;
    fetchMock.mockImplementation((input, options) => String(input) === "/api/settings/news-anchor-defaults" && failed
      ? Promise.resolve(response({ error: "Anchor belum tersedia" }, 503)) : implementation(input, options));
    await openSettings();
    expect(button("Simpan Semua").disabled).toBe(true);
    expect(button("Simpan Default News Anchor").disabled).toBe(true);
    await change(field("Nama Anchor"), "Nama Edit Operator");
    failed = false;
    await click("Muat ulang news anchor");
    expect(field("Nama Anchor").value).toBe("Nama Edit Operator");
    expect(field("Jabatan Anchor").value).toBe("News Anchor");
    expect(button("Simpan Semua").disabled).toBe(false);
  });

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

  it("merges an uploaded logo into the latest branding and palette edits without a global ticker editor", async () => {
    const pending = deferred<Response>();
    uploadFetch.mockReturnValueOnce(pending.promise);
    await openSettings();
    await click("Upload Gambar");
    const fileInput = host.querySelector<HTMLInputElement>('.broadcast-defaults-card input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["png"], "logo.png", { type: "image/png" })] });
    await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    expect(button("Simpan Default Master").disabled).toBe(true);
    await change(field("Nama Berita di Ticker"), "NEWS TERBARU");
    await act(async () => host.querySelector<HTMLInputElement>('input[value="studio-graphite"]')!.click());
    await act(async () => pending.resolve(response({ url: "/uploads/station.png" })));
    expect(field("Nama Berita di Ticker").value).toBe("NEWS TERBARU");
    expect(host.textContent).not.toContain("Isi Running Ticker Berita Default");
    expect(host.querySelector<HTMLInputElement>('input[value="studio-graphite"]')!.checked).toBe(true);
    await click("Simpan Default Master");
    expect(bodyOf("/api/live/master", "PATCH")).toMatchObject({
      logoImage: "/uploads/station.png", logoType: "image", colorTheme: "studio-graphite",
      brandText: "NEWS TERBARU"
    });
    expect(bodyOf("/api/live/master", "PATCH")).not.toHaveProperty("tickerText");
  });

  it("preserves edits made during a delayed master save after the server responds", async () => {
    await openSettings();
    const pending = deferred<Response>();
    const delegate = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/live/master" && options?.method === "PATCH") return pending.promise;
      return delegate(path, options);
    });
    await change(field("Nama Berita di Ticker"), "VERSI PERTAMA");
    await act(async () => button("Simpan Default Master").click());
    await change(field("Nama Berita di Ticker"), "VERSI KEDUA BELUM DISIMPAN");
    await act(async () => pending.resolve(response({ ...master, brandText: "VERSI PERTAMA" })));
    expect(field("Nama Berita di Ticker").value).toBe("VERSI KEDUA BELUM DISIMPAN");
  });

  it("prevents duplicate Simpan Semua requests while the first save is pending", async () => {
    await openSettings();
    const pending = deferred<Response>();
    const delegate = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/settings" && options?.method === "PATCH") return pending.promise;
      return delegate(path, options);
    });
    await act(async () => {
      button("Simpan Semua").click();
      button("Simpan Semua").click();
    });
    expect(requests("/api/settings", "PATCH")).toHaveLength(1);
    expect(button("Menyimpan…").disabled).toBe(true);
    await act(async () => pending.resolve(response({ outputMode: "web" })));
    expect(requests("/api/live/master", "PATCH")).toHaveLength(1);
    expect(requests("/api/settings/headline-defaults", "PATCH")).toHaveLength(1);
  });

  it("ignores an older live-status poll after a newer poll succeeds", async () => {
    const pending = deferred<Response>();
    const delegate = fetchMock.getMockImplementation()!;
    let reads = 0;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/live/state" && (!options?.method || options.method === "GET")) {
        reads += 1;
        if (reads === 2) return pending.promise;
        if (reads === 3) return response({ ...live, overlayClientsCount: 2 });
      }
      return delegate(path, options);
    });
    vi.useFakeTimers();
    try {
      await act(async () => root.render(createElement(App)));
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(host.querySelector(".status-chip")?.textContent).toContain("2 KLIEN OUTPUT");
      await act(async () => pending.resolve(response({ ...live, overlayClientsCount: 0 })));
      expect(host.querySelector(".status-chip")?.textContent).toContain("2 KLIEN OUTPUT");
    } finally {
      vi.useRealTimers();
    }
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

  it("does not create duplicate stories when the save form is submitted twice", async () => {
    await openStory();
    await change(field("Judul Berita"), "BERITA SEKALI SIMPAN");
    const pending = deferred<Response>();
    const delegate = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, options) => {
      if (String(path).endsWith("/story") && options?.method === "PUT") return pending.promise;
      return delegate(path, options);
    });
    const dialog = host.querySelector<HTMLFormElement>(".story-editor-modal")!;
    await act(async () => {
      dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      dialog.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(requests("/api/rundowns/rundown-a/story", "PUT")).toHaveLength(1);
    await act(async () => pending.resolve(response({})));
  });

  it("retries a story refresh with its persisted id after the first reload fails", async () => {
    await openStory();
    await change(field("Judul Berita"), "CERITA TERSIMPAN");
    let failRefresh = true;
    let saved = false;
    const delegate = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rundowns" && saved && failRefresh) {
        failRefresh = false;
        return response({ error: "Server tidak dapat memuat rundown" }, 503);
      }
      if (path === "/api/rundowns/rundown-a/story" && options?.method === "PUT") {
        saved = true;
        return response({ id: "berita-yang-sudah-dibuat" });
      }
      return delegate(path, options);
    });
    const submit = async () => act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await submit();
    expect(host.querySelector(".modal-error-banner")?.textContent).toContain("Server tidak dapat memuat rundown");
    await change(field("Judul Berita"), "CERITA REVISI");
    await submit();
    expect(requests("/api/rundowns/rundown-a/story", "PUT")).toHaveLength(2);
    expect(JSON.parse(requests("/api/rundowns/rundown-a/story", "PUT")[1]![1]!.body as string))
      .toMatchObject({ itemId: "berita-yang-sudah-dibuat", title: "CERITA REVISI" });
  });

  it("closes the old story editor when the topbar switches rundown", async () => {
    await openStory();
    await change(field("Judul Berita"), "DRAFT RUNDOWN A");
    await change(host.querySelector<HTMLSelectElement>('[aria-label="Pilih Rundown Program"]')!, "rundown-b");
    expect(host.querySelector(".story-editor-modal")).toBeNull();
    expect(host.querySelector(".prep-title-group")?.textContent).toContain("EDISI B");
    expect(requests("/api/rundowns/rundown-b/story", "PUT")).toHaveLength(0);
  });

  it("prevents duplicate rundown creation while its first request is pending", async () => {
    await act(async () => root.render(createElement(App)));
    await click("Rundown & CG");
    const pending = deferred<Response>();
    const delegate = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (path, options) => {
      if (path === "/api/rundowns" && options?.method === "POST") return pending.promise;
      return delegate(path, options);
    });
    await act(async () => {
      button("Rundown Baru").click();
      button("Rundown Baru").click();
    });
    expect(requests("/api/rundowns", "POST")).toHaveLength(1);
    expect(button("Rundown Baru").disabled).toBe(true);
    await act(async () => pending.resolve(response({ ...rundownA, id: "rundown-c" })));
  });

  it("keeps the selected cue preview when an earlier cue is removed", async () => {
    await openStory();
    await click("+ Tambah Headline");
    await click("+ Tambah Headline");
    const previewPills = host.querySelectorAll<HTMLButtonElement>(".preview-pill-btn");
    await act(async () => previewPills[2]!.click());
    expect(host.querySelector(".preview-pill-btn.active")?.textContent).toContain("#3");
    await act(async () => host.querySelectorAll<HTMLButtonElement>('.cue-editor-card button[title="Hapus materi CG ini"]')[0]!.click());
    expect(host.querySelector(".preview-pill-btn.active")?.textContent).toContain("#2");
  });

  it("adds an editable opening headline and saves its shared preset without any live command", async () => {
    await openStory();
    await click("+ Highlight Berita");
    const card = host.querySelectorAll<HTMLElement>(".cue-editor-card")[1]!;
    expect(card.textContent).toContain("HIGHLIGHT BERITA");
    expect(card.querySelector("select")?.value).toBe("bulletin");
    const label = card.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
    expect(label.value).toBe("HIGHLIGHT");
    await change(label, "BERITA UTAMA");
    await act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const saved = bodyOf("/api/rundowns/rundown-a/story", "PUT");
    expect(saved.graphics[1]).toMatchObject({ templateType: "HEADLINE", sortOrder: 1, draftFields: {
      headline: "DEFAULT SERVER", headlinePresentation: "bulletin", kicker: "BERITA UTAMA",
      layoutStyle: "single", showLocation: "false", showKicker: "true", showDetail: "false"
    } });
    expect(fetchMock.mock.calls.filter(([path, options]) => String(path).startsWith("/api/live/") && options?.method)).toHaveLength(0);
  });

  it("removes only the generated HIGHLIGHT topic when returning to ordinary headline", async () => {
    defaults.kicker = "";
    await openStory();
    const mode = field("Jenis Headline") as HTMLSelectElement;
    expect(mode.value).toBe("story");
    await change(mode, "bulletin");
    expect(field("Sub Topik di Atas / Kicker").value).toBe("HIGHLIGHT");
    await change(mode, "story");
    expect(field("Sub Topik di Atas / Kicker").value).toBe("");
    await act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(bodyOf("/api/rundowns/rundown-a/story", "PUT").graphics[0].draftFields)
      .toMatchObject({ headlinePresentation: "story", kicker: "", showKicker: "false",
        layoutStyle: "sub", showLocation: "true", visualTemplate: "cnn" });
  });

  it("does not overwrite an authored topic when switching headline presentations", async () => {
    await openStory();
    await change(field("Sub Topik di Atas / Kicker"), "EKONOMI");
    const mode = field("Jenis Headline") as HTMLSelectElement;
    await change(mode, "bulletin");
    expect(field("Sub Topik di Atas / Kicker").value).toBe("EKONOMI");
    await change(mode, "story");
    expect(field("Sub Topik di Atas / Kicker").value).toBe("EKONOMI");
    await act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(bodyOf("/api/rundowns/rundown-a/story", "PUT").graphics[0].draftFields)
      .toMatchObject({ headlinePresentation: "story", kicker: "EKONOMI", showKicker: "true",
        layoutStyle: "sub", showLocation: "true", visualTemplate: "cnn" });
  });

  it("adds a Breaking News cue with its visible urgency flag", async () => {
    await openStory();
    await click("+ Breaking News");
    await act(async () => host.querySelector<HTMLFormElement>(".story-editor-modal")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(bodyOf("/api/rundowns/rundown-a/story", "PUT").graphics[1]).toMatchObject({
      templateType: "BREAKING", draftFields: { kicker: "BREAKING NEWS", showKicker: "true" }
    });
  });
});
