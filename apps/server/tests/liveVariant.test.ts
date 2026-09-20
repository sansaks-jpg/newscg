import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const testDb = resolve(process.cwd(), "data/newscg-variant-test.db");
let dbModule: typeof import("../src/db.js");
let liveModule: typeof import("../src/live.js");

describe("Live variant & headline defaults API (branch simple)", () => {
  beforeAll(async () => {
    process.env.DATABASE_PATH = testDb;
    process.env.VMIX_MODE = "mock";
    if (existsSync(testDb)) rmSync(testDb, { force: true });
    dbModule = await import("../src/db.js");
    liveModule = await import("../src/live.js");
    dbModule.seedIfEmpty();
    dbModule.saveSettings({ outputMode: "web" });
    const rundowns = dbModule.getRundowns();
    if (rundowns.length > 0 && rundowns[0]) {
      const item = dbModule.createItem(rundowns[0].id, {
        slug: "TEST-HEADLINE",
        title: "Tenggelamnya KM Virgo Transport 8",
        format: "VO",
        estimatedDurationSeconds: 90,
        sortOrder: 1
      });
      if (item) {
        dbModule.createGraphic(item.id, {
          id: "CG-TEST-201",
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
      }
    }
  });

  it("manages headline defaults via db functions", () => {
    const payload = {
      headline: "BERITA EKSKLUSIF MALAM",
      location: "SURABAYA",
      kicker: "BREAKING NEWS",
      subline: "Laporan investigasi langsung tim redaksi"
    };

    const saved = dbModule.saveHeadlineDefaults(payload);
    expect(saved.headline).toBe(payload.headline);
    expect(saved.location).toBe(payload.location);
    expect(saved.kicker).toBe(payload.kicker);
    expect(saved.subline).toBe(payload.subline);

    const fetched = dbModule.getHeadlineDefaults();
    expect(fetched.headline).toBe(payload.headline);
    expect(fetched.location).toBe(payload.location);
  });

  it("takes a headline with clean presentation", async () => {
    const rundowns = dbModule.getRundowns();
    const graphic = rundowns
      .flatMap((r) => r.items)
      .flatMap((i) => i.graphics)
      .find((g) => g.templateType === "HEADLINE" && Boolean(g.draftFields.subline?.trim()) && Boolean(g.draftFields.location?.trim()));
    expect(graphic).toBeDefined();

    const takeRes = await liveModule.take(graphic!.id, "key-take-clean", { presentation: "clean" });
    expect(takeRes.commandStatus).toBe("confirmed");

    const onAir = dbModule.getOnAir();
    expect(onAir?.graphicId).toBe(graphic!.id);
    expect(onAir?.snapshot?.showLocation).toBe("false");
    expect(onAir?.snapshot?.showKicker).toBe("false");
    expect(onAir?.snapshot?.layoutStyle).toBe("single");
  });

  it("applies live variants on ON-AIR graphics", async () => {
    const onAir = dbModule.getOnAir();
    expect(onAir).toBeDefined();
    const graphicId = onAir!.graphicId!;

    // Toggle location on
    const resLoc = await liveModule.takeVariantLive(graphicId, "toggle-location", "key-var-loc");
    expect(resLoc.commandStatus).toBe("confirmed");
    expect(dbModule.getOnAir()?.snapshot?.showLocation).toBe("true");

    // Toggle detail on
    const resDet = await liveModule.takeVariantLive(graphicId, "toggle-detail", "key-var-det");
    expect(resDet.commandStatus).toBe("confirmed");
    expect(dbModule.getOnAir()?.snapshot?.layoutStyle).toBe("sub");

    // Reset clean headline
    const resClean = await liveModule.takeVariantLive(graphicId, "clean-headline", "key-var-clean");
    expect(resClean.commandStatus).toBe("confirmed");
    expect(dbModule.getOnAir()?.snapshot?.showLocation).toBe("false");
    expect(dbModule.getOnAir()?.snapshot?.layoutStyle).toBe("single");
  });

  it("rejects variant changes when graphic is not ON AIR", async () => {
    const fakeId = "NON-EXISTENT-CG";
    const res = await liveModule.takeVariantLive(fakeId, "toggle-location", "key-var-fake");
    expect(res.commandStatus).toBe("failed");
    expect(res.error).toContain("Perubahan varian diblokir");
  });

  it("preserves active visibility on UPDATE LIVE", async () => {
    const onAir = dbModule.getOnAir();
    expect(onAir).toBeDefined();
    const graphicId = onAir!.graphicId!;

    // Set location ON via variant
    const locRes = await liveModule.takeVariantLive(graphicId, "toggle-location", "key-var-loc-2");
    expect(locRes.commandStatus).toBe("confirmed");
    expect(dbModule.getOnAir()?.snapshot?.showLocation).toBe("true");

    // Update text
    const updateRes = await liveModule.updateLive(graphicId, "key-update-pres");
    expect(updateRes.commandStatus).toBe("confirmed");
    expect(dbModule.getOnAir()?.snapshot?.showLocation).toBe("true");
  });
});
