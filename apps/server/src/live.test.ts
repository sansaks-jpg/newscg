import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { OverlayEvent } from "@newscg/shared";

const testDb = resolve(process.cwd(), "data/newscg-test.db");
let liveModule: typeof import("./live.js");
let dbModule: typeof import("./db.js");

beforeAll(async () => {
  process.env.DATABASE_PATH = testDb;
  process.env.VMIX_MODE = "mock";
  if (existsSync(testDb)) rmSync(testDb, { force: true });
  dbModule = await import("./db.js");
  dbModule.seedIfEmpty();
  liveModule = await import("./live.js");
});

beforeEach(() => {
  liveModule.mockAdapter.connected = true;
  liveModule.mockAdapter.overlay = { overlayNumber: 1, inputGuid: null };
  liveModule.mockAdapter.fields.clear();
});

describe("Web Overlay (Singular.live style) controller", () => {
  beforeEach(() => {
    dbModule.saveSettings({ outputMode: "web" });
  });

  it("mengirim event TAKE ke subscriber SSE dan mengonfirmasi ON AIR", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    const result = await liveModule.take("CG-201", "web-take-test");
    expect(result.commandStatus).toBe("confirmed");
    expect(result.actualOverlayInputGuid).toBe("web-overlay");

    const takeEvent = events.find((e) => e.type === "TAKE");
    expect(takeEvent).toBeDefined();
    if (takeEvent && takeEvent.type === "TAKE") {
      expect(takeEvent.graphic.id).toBe("CG-201");
      expect(takeEvent.fields.headline).toBe("KELUARGA BINGUNG DATA MANIFES TAK SAMA");
    }

    unsubscribe();
  });

  it("mengirim event UPDATE saat konten ON AIR diperbarui", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "web-take-update-test");
    const updateResult = await liveModule.updateLive("CG-201", "web-update-test");
    expect(updateResult.commandStatus).toBe("confirmed");

    const updateEvent = events.find((e) => e.type === "UPDATE");
    expect(updateEvent).toBeDefined();

    unsubscribe();
  });

  it("mengirim event CLEAR dan membersihkan status ON AIR", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "web-take-clear-test");
    const clearResult = await liveModule.clearLive("web-clear-test");
    expect(clearResult.commandStatus).toBe("confirmed");
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();

    const clearEvent = events.find((e) => e.type === "CLEAR");
    expect(clearEvent).toBeDefined();

    unsubscribe();
  });

  it("memperbarui master overlay state dan memancarkan MASTER_UPDATE", () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    const updated = liveModule.updateMasterState({
      timezone: "WITA",
      showLiveBadge: false,
      brandText: "KOMPASTV.COM",
      logoType: "image",
      logoImage: "data:image/png;base64,mock"
    });

    expect(updated.timezone).toBe("WITA");
    expect(updated.showLiveBadge).toBe(false);
    expect(updated.brandText).toBe("KOMPASTV.COM");
    expect(updated.logoType).toBe("image");

    const masterEvent = events.find((e) => e.type === "MASTER_UPDATE");
    expect(masterEvent).toBeDefined();
    if (masterEvent && masterEvent.type === "MASTER_UPDATE") {
      expect(masterEvent.master.timezone).toBe("WITA");
      expect(masterEvent.master.brandText).toBe("KOMPASTV.COM");
    }

    unsubscribe();
  });

  it("mengirim event CLEAR_ALL dan membersihkan seluruh layer", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "take-before-clear-all");
    const result = await liveModule.clearAllLive("clear-all-test");
    expect(result.commandStatus).toBe("confirmed");
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();

    const clearAllEvent = events.find((e) => e.type === "CLEAR_ALL");
    expect(clearAllEvent).toBeDefined();

    unsubscribe();
  });
});

describe("vMix GT Title API safety", () => {
  beforeEach(() => {
    dbModule.saveSettings({ outputMode: "vmix-gt" });
  });

  it("prepare menjaga draft tetap terisolasi dari input vMix", () => {
    liveModule.prepare("CG-201");
    expect(liveModule.mockAdapter.fields.size).toBe(0);
    expect(liveModule.mockAdapter.overlay.inputGuid).toBeNull();
  });

  it("menolak TAKE saat overlay dimiliki input asing", async () => {
    liveModule.mockAdapter.overlay = { overlayNumber: 1, inputGuid: "foreign-camera-guid" };
    const result = await liveModule.take("CG-201", "foreign-owner-test");
    expect(result.commandStatus).toBe("failed");
    expect(result.error).toContain("bukan milik NewsCG");
    expect(liveModule.mockAdapter.overlay.inputGuid).toBe("foreign-camera-guid");
  });

  it("mendeduplikasi klik TAKE dengan idempotency key yang sama", async () => {
    const [a, b] = await Promise.all([
      liveModule.take("CG-201", "same-click"),
      liveModule.take("CG-201", "same-click")
    ]);
    expect(a.requestId).toBe(b.requestId);
    expect(a.commandStatus).toBe("confirmed");
  });

  it("tidak mereplay TAKE gagal setelah reconnect", async () => {
    liveModule.setMockConnection(false);
    const failed = await liveModule.take("CG-301", "offline-click");
    expect(failed.commandStatus).toBe("failed");
    liveModule.setMockConnection(true);
    expect(liveModule.mockAdapter.overlay.inputGuid).toBeNull();
  });
});

