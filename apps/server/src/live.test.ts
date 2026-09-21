import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { OverlayEvent } from "@newscg/shared";

const testDb = resolve(process.cwd(), "data/newscg-test.db");
let liveModule: typeof import("./live.js");
let dbModule: typeof import("./db.js");

beforeAll(async () => {
  process.env.DATABASE_PATH = testDb;
  if (existsSync(testDb)) rmSync(testDb, { force: true });
  dbModule = await import("./db.js");
  dbModule.seedIfEmpty();
  const rundowns = dbModule.getRundowns();
  if (rundowns.length > 0 && rundowns[0]) {
    const item = dbModule.createItem(rundowns[0].id, {
      slug: "HEADLINE-01",
      title: "Tenggelamnya KM Virgo Transport 8",
      format: "VO",
      estimatedDurationSeconds: 90,
      sortOrder: 1
    });
    if (item) {
      dbModule.createGraphic(item.id, {
        id: "CG-201",
        templateType: "HEADLINE",
        sortOrder: 1,
        status: "READY",
        draftFields: {
          kicker: "TENGGELAMNYA KM VIRGO TRANSPORT 8",
          headline: "KELUARGA BINGUNG DATA MANIFES TAK SAMA",
          subline: "Salah Satu Keluarga Korban Tak Menemukan Data Ayahnya di Data Penumpang",
          location: "Surabaya, Jawa Timur",
          ticker: "BERITA SIARAN TERVERIFIKASI",
          brand: "CNNINDONESIA.COM"
        }
      });
      dbModule.createGraphic(item.id, {
        id: "CG-301",
        templateType: "REPORTER",
        sortOrder: 2,
        status: "READY",
        draftFields: {
          name: "SANDI ARDIANSYAH",
          role: "REPORTER",
          location: "JAKARTA TIMUR"
        }
      });
    }
  }
  liveModule = await import("./live.js");
});

describe("Web Overlay (Singular.live style) controller", () => {
  it("prepare menjaga draft tetap terisolasi tanpa mengubah status ON AIR", () => {
    const prepared = liveModule.prepare("CG-201");
    expect(prepared.selectedGraphicId).toBe("CG-201");
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();
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

  it("mendeduplikasi klik TAKE dengan idempotency key yang sama", async () => {
    const [a, b] = await Promise.all([
      liveModule.take("CG-201", "same-click"),
      liveModule.take("CG-201", "same-click")
    ]);
    expect(a.requestId).toBe(b.requestId);
    expect(a.commandStatus).toBe("confirmed");
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

  it("mendukung varian komposisi headline secara dinamis", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "web-take-variant-test");
    const variantResult = await liveModule.takeVariantLive("CG-201", "toggle-location", "variant-loc-key");
    expect(variantResult.commandStatus).toBe("confirmed");

    const variantEvent = events.find((e) => e.type === "UPDATE" && e.fields?.showLocation === "false");
    expect(variantEvent).toBeDefined();

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

  it("mengirim event CLEAR_ALL_IMMEDIATE dan membersihkan seluruh layer", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "take-before-clear-all");
    const result = await liveModule.clearAllLive("clear-all-test");
    expect(result.commandStatus).toBe("confirmed");
    expect(liveModule.getLiveState().onAirGraphicId).toBeNull();

    const clearAllEvent = events.find((e) => e.type === "CLEAR_ALL_IMMEDIATE");
    expect(clearAllEvent).toBeDefined();

    unsubscribe();
  });

  it("mengirim event CLEAR_ALL_ANIMATED jika immediate false", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    await liveModule.take("CG-201", "take-before-clear-animated");
    const result = await liveModule.clearAllLive("clear-all-animated-test", { immediate: false });
    expect(result.commandStatus).toBe("confirmed");

    const clearAllAnimEvent = events.find((e) => e.type === "CLEAR_ALL_ANIMATED");
    expect(clearAllAnimEvent).toBeDefined();

    unsubscribe();
  });

  it("mendukung mode stage preset (empty, logo, full)", async () => {
    const fullRes = await liveModule.setStage("full", "stage-full-key");
    expect(fullRes.commandStatus).toBe("confirmed");

    const emptyRes = await liveModule.setStage("empty", "stage-empty-key");
    expect(emptyRes.commandStatus).toBe("confirmed");
  });
});
