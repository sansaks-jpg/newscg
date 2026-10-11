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
        draftFields: {
          name: "SANDI ARDIANSYAH",
          role: "REPORTER",
          location: "JAKARTA TIMUR"
        }
      });
      dbModule.createGraphic(item.id, {
        id: "CG-SOT-1", templateType: "SOT", sortOrder: 3,
        draftFields: { headline: "KELUARGA BINGUNG DATA MANIFES TAK SAMA", name: "Riski Dwianto", role: "Basarnas", contentMode: "sot" }
      });
    }
  }
  liveModule = await import("./live.js");
});

describe("Web Overlay (Singular.live style) controller", () => {
  it("switches headline and SOT within one story without a new panel TAKE", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((event) => events.push(event));
    await liveModule.take("CG-201", "headline-before-sot");
    await liveModule.take("CG-SOT-1", "sot-in");
    expect(events.at(-1)?.type).toBe("SWITCH_DETAIL");
    await liveModule.take("CG-201", "sot-out");
    expect(events.at(-1)?.type).toBe("SWITCH_DETAIL");
    await liveModule.clearLive("sot-switch-cleanup");
    unsubscribe();
  });
  it("uses UPDATE for SOT in the same story and preserves the live location", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((event) => events.push(event));
    await liveModule.take("CG-201", "headline-before-sot-update");
    const result = await liveModule.updateLive("CG-SOT-1", "sot-update", { syncComposition: true });
    expect(result.commandStatus).toBe("confirmed");
    expect(liveModule.getLiveState().onAirGraphicId).toBe("CG-SOT-1");
    const switched = events.at(-1);
    expect(switched?.type).toBe("SWITCH_DETAIL");
    if (switched?.type === "SWITCH_DETAIL") {
      expect(switched.fields.location).toBe("Surabaya, Jawa Timur");
      expect(switched.fields.showLocation).toBe("true");
    }
    await liveModule.updateLive("CG-201", "headline-after-sot-update", { syncComposition: true });
    expect(liveModule.getLiveState().onAirGraphicId).toBe("CG-201");
    await liveModule.clearLive("sot-update-cleanup");
    unsubscribe();
  });
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

  it("menolak reuse Idempotency-Key untuk grafis atau aksi berbeda tanpa mengubah Program", async () => {
    const initial = await liveModule.take("CG-201", "guard-key-reuse");
    expect(initial.commandStatus).toBe("confirmed");
    const previousSnapshot = liveModule.getLiveState().onAirSnapshot;
    await expect(liveModule.take("CG-301", "guard-key-reuse")).rejects.toMatchObject({
      status: 409, code: "IDEMPOTENCY_KEY_CONFLICT"
    });
    await expect(liveModule.clearLive("guard-key-reuse")).rejects.toMatchObject({
      status: 409, code: "IDEMPOTENCY_KEY_CONFLICT"
    });
    expect(liveModule.getLiveState().onAirGraphicId).toBe("CG-201");
    expect(liveModule.getLiveState().onAirSnapshot).toEqual(previousSnapshot);
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

  it("memperbarui master overlay state dan memancarkan MASTER_UPDATE", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber((ev) => events.push(ev));

    const updated = await liveModule.updateMasterState({
      timezone: "WITA",
      showLiveBadge: false,
      brandText: "KOMPASTV.COM",
      outputFps: 30,
      logoType: "image",
      logoImage: "data:image/png;base64,mock"
    });

    expect(updated.timezone).toBe("WITA");
    expect(updated.showLiveBadge).toBe(false);
    expect(updated.brandText).toBe("KOMPASTV.COM");
    expect(updated.logoType).toBe("image");
    expect(updated.outputFps).toBe(30);

    const masterEvent = events.find((e) => e.type === "MASTER_UPDATE");
    expect(masterEvent).toBeDefined();
    if (masterEvent && masterEvent.type === "MASTER_UPDATE") {
      expect(masterEvent.master.timezone).toBe("WITA");
      expect(masterEvent.master.brandText).toBe("KOMPASTV.COM");
      expect(masterEvent.master.outputFps).toBe(30);
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

  it("menjaga urutan STAGE lalu perubahan MASTER tanpa menimpa PATCH yang lebih baru", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      const staged = liveModule.setStage("full", "stage-before-master-change");
      const changed = liveModule.updateMasterState({ showTicker: false, brandText: "MASTER TERBARU" });
      await staged;
      const newMaster = await changed;
      expect(newMaster.showTicker).toBe(false);
      expect(dbModule.getMasterOverlay()).toMatchObject({ showTicker: false, brandText: "MASTER TERBARU" });
      expect(events.slice(-2).map(event => event.type)).toEqual(["SYNC", "MASTER_UPDATE"]);
    } finally { unsubscribe(); }
  });

  it("melaporkan kegagalan SQLite STAGE dan blackout tanpa mengubah Program atau master", async () => {
    await liveModule.take("CG-201", "db-failure-before-clear-all-take");
    const oldMaster = dbModule.getMasterOverlay();
    const oldProgram = dbModule.getOnAir();
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    dbModule.db.exec(`CREATE TRIGGER block_live_reset BEFORE UPDATE ON on_air_state
      BEGIN SELECT RAISE(ABORT, 'Gagal menyimpan state Program'); END`);
    try {
      const clearResult = await liveModule.clearAllLive("db-failure-blackout");
      expect(clearResult.commandStatus).toBe("failed");
      expect(clearResult.error).toContain("Gagal menyimpan state Program");
      const stageResult = await liveModule.setStage("full", "db-failure-stage");
      expect(stageResult.commandStatus).toBe("failed");
      expect(stageResult.error).toContain("Gagal menyimpan state Program");
      expect(dbModule.getOnAir()).toEqual(oldProgram);
      expect(dbModule.getMasterOverlay()).toEqual(oldMaster);
      expect(events.map(event => event.type)).toEqual(["SYNC"]);
    } finally {
      dbModule.db.exec("DROP TRIGGER block_live_reset");
      unsubscribe();
      await liveModule.clearLive("db-failure-test-cleanup");
    }
  });

  it("mengeksekusi UPDATE dan CLEAR berdasarkan status terbaru dalam antrean setelah TAKE", async () => {
    const events: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => events.push(event), "monitor");
    try {
      const [takeResult, updateResult, clearResult] = await Promise.all([
        liveModule.take("CG-201", "queued-take-before-update"),
        liveModule.updateLive("CG-201", "queued-update-after-take"),
        liveModule.clearLive("queued-clear-after-update")
      ]);
      expect(takeResult.commandStatus).toBe("confirmed");
      expect(updateResult.commandStatus).toBe("confirmed");
      expect(clearResult.commandStatus).toBe("confirmed");
      expect(events.slice(-3).map(event => event.type)).toEqual(["TAKE", "UPDATE", "CLEAR"]);
      expect(liveModule.getLiveState().onAirGraphicId).toBeNull();
    } finally { unsubscribe(); }
  });

  it("mengeksekusi toggle varian yang antre setelah TAKE berdasarkan grafis terbaru", async () => {
    const [takeResult, variantResult] = await Promise.all([
      liveModule.take("CG-201", "queued-take-before-variant"),
      liveModule.takeVariantLive("CG-201", "toggle-kicker", "queued-variant-after-take")
    ]);
    expect(takeResult.commandStatus).toBe("confirmed");
    expect(variantResult.commandStatus).toBe("confirmed");
    expect(liveModule.getLiveState().onAirSnapshot?.showKicker).toBe("false");
    await liveModule.clearLive("queued-variant-cleanup");
  });

  it("menghapus pesan kegagalan lama setelah perintah live berikutnya berhasil", async () => {
    await liveModule.take("CG-301", "failed-then-success-take");
    const failed = await liveModule.takeVariantLive("CG-301", "toggle-kicker", "failed-then-success-variant");
    expect(failed.commandStatus).toBe("failed");
    expect(liveModule.getLiveState().error).toContain("Topik/kicker belum tersedia");
    const cleared = await liveModule.clearLive("failed-then-success-clear");
    expect(cleared.commandStatus).toBe("confirmed");
    expect(cleared.state.error).toBeNull();
  });

  it("memigrasikan label CG lama secara konsisten untuk TAKE, UPDATE, SYNC, dan tombol topik", async () => {
    const rundown = dbModule.getRundowns()[0]!;
    const item = dbModule.createItem(rundown.id, {
      slug: "LEGACY-HIGHLIGHT", title: "Highlight lama", format: "VO", cgRequired: true,
      estimatedDurationSeconds: 30, sortOrder: rundown.items.length
    })!;
    const legacy = dbModule.createGraphic(item.id, {
      templateType: "HEADLINE", sortOrder: 0,
      draftFields: { headline: "MATERI LAMA", headlinePresentation: "bulletin",
        headlineLabel: "HEADLINE", showKicker: "false", layoutStyle: "single" }
    });
    const takeResult = await liveModule.take(legacy.id, "legacy-highlight-take");
    expect(takeResult.commandStatus).toBe("confirmed");
    expect(takeResult.state.onAirSnapshot).toMatchObject({ kicker: "HIGHLIGHT", showKicker: "true" });

    const variant = await liveModule.takeVariantLive(legacy.id, "toggle-kicker", "legacy-highlight-toggle-off");
    expect(variant.commandStatus).toBe("confirmed");
    expect(variant.state.onAirSnapshot?.showKicker).toBe("false");
    await liveModule.takeVariantLive(legacy.id, "toggle-kicker", "legacy-highlight-toggle-on");

    // An old persisted Program snapshot must be normalized without touching the draft.
    dbModule.saveOnAir(legacy.id, "web-overlay", 1, legacy.draftFields, "confirmed");
    const sync: OverlayEvent[] = [];
    const unsubscribe = liveModule.addOverlaySubscriber(event => sync.push(event), "monitor");
    try {
      expect(sync[0]?.type).toBe("SYNC");
      if (sync[0]?.type === "SYNC") {
        expect(sync[0].fields).toMatchObject({ kicker: "HIGHLIGHT", showKicker: "true" });
      }
      expect(liveModule.getLiveState().onAirSnapshot).toMatchObject({ kicker: "HIGHLIGHT", showKicker: "true" });
      const updated = await liveModule.updateLive(legacy.id, "legacy-highlight-update");
      expect(updated.commandStatus).toBe("confirmed");
      expect(updated.state.onAirSnapshot).toMatchObject({ kicker: "HIGHLIGHT", showKicker: "true" });
    } finally { unsubscribe(); }
    await liveModule.clearLive("legacy-highlight-cleanup");
  });

  it("tombol varian mengacu pada snapshot Program saat draft diedit terpisah", async () => {
    const original = dbModule.getGraphic("CG-201")!;
    try {
      await liveModule.take(original.id, "variant-snapshot-take");
      const before = liveModule.getLiveState().onAirSnapshot!;
      dbModule.updateGraphic(original.id, { draftFields: { location: "", kicker: "", subline: "" } });
      for (const [action, key] of [
        ["toggle-location", "variant-snapshot-location"],
        ["toggle-kicker", "variant-snapshot-kicker"],
        ["toggle-detail", "variant-snapshot-detail"]
      ] as const) {
        const result = await liveModule.takeVariantLive(original.id, action, key);
        expect(result.commandStatus).toBe("confirmed");
      }
      const program = liveModule.getLiveState().onAirSnapshot!;
      expect(program.location).toBe(before.location);
      expect(program.kicker).toBe(before.kicker);
      expect(program.subline).toBe(before.subline);
    } finally {
      dbModule.updateGraphic(original.id, { draftFields: original.draftFields });
      await liveModule.clearLive("variant-snapshot-clear");
    }
  });
});
