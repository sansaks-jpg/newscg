import { beforeAll, describe, expect, it } from "vitest";
import { getHeadlineDefaults, getOnAir, getRundowns, saveHeadlineDefaults, saveSettings, seedIfEmpty } from "../src/db.js";
import { take, takeVariantLive, updateLive } from "../src/live.js";

describe("Live variant & headline defaults API (branch simple)", () => {
  beforeAll(() => {
    seedIfEmpty();
    saveSettings({ outputMode: "web" });
  });

  it("manages headline defaults via db functions", () => {
    const payload = {
      headline: "BERITA EKSKLUSIF MALAM",
      location: "SURABAYA",
      kicker: "BREAKING NEWS",
      subline: "Laporan investigasi langsung tim redaksi"
    };

    const saved = saveHeadlineDefaults(payload);
    expect(saved.headline).toBe(payload.headline);
    expect(saved.location).toBe(payload.location);
    expect(saved.kicker).toBe(payload.kicker);
    expect(saved.subline).toBe(payload.subline);

    const fetched = getHeadlineDefaults();
    expect(fetched.headline).toBe(payload.headline);
    expect(fetched.location).toBe(payload.location);
  });

  it("takes a headline with clean presentation", async () => {
    const rundowns = getRundowns();
    const graphic = rundowns
      .flatMap((r) => r.items)
      .flatMap((i) => i.graphics)
      .find((g) => g.templateType === "HEADLINE" && Boolean(g.draftFields.subline?.trim()) && Boolean(g.draftFields.location?.trim()));
    expect(graphic).toBeDefined();

    const takeRes = await take(graphic!.id, "key-take-clean", { presentation: "clean" });
    expect(takeRes.commandStatus).toBe("confirmed");

    const onAir = getOnAir();
    expect(onAir?.graphicId).toBe(graphic!.id);
    expect(onAir?.snapshot?.showLocation).toBe("false");
    expect(onAir?.snapshot?.showKicker).toBe("false");
    expect(onAir?.snapshot?.layoutStyle).toBe("single");
  });

  it("applies live variants on ON-AIR graphics", async () => {
    const onAir = getOnAir();
    expect(onAir).toBeDefined();
    const graphicId = onAir!.graphicId!;

    // Toggle location on
    const resLoc = await takeVariantLive(graphicId, "toggle-location", "key-var-loc");
    expect(resLoc.commandStatus).toBe("confirmed");
    expect(getOnAir()?.snapshot?.showLocation).toBe("true");

    // Toggle detail on
    const resDet = await takeVariantLive(graphicId, "toggle-detail", "key-var-det");
    expect(resDet.commandStatus).toBe("confirmed");
    expect(getOnAir()?.snapshot?.layoutStyle).toBe("sub");

    // Reset clean headline
    const resClean = await takeVariantLive(graphicId, "clean-headline", "key-var-clean");
    expect(resClean.commandStatus).toBe("confirmed");
    expect(getOnAir()?.snapshot?.showLocation).toBe("false");
    expect(getOnAir()?.snapshot?.layoutStyle).toBe("single");
  });

  it("rejects variant changes when graphic is not ON AIR", async () => {
    const fakeId = "NON-EXISTENT-CG";
    const res = await takeVariantLive(fakeId, "toggle-location", "key-var-fake");
    expect(res.commandStatus).toBe("failed");
    expect(res.error).toContain("Perubahan varian diblokir");
  });

  it("preserves active visibility on UPDATE LIVE", async () => {
    const onAir = getOnAir();
    expect(onAir).toBeDefined();
    const graphicId = onAir!.graphicId!;

    // Set location ON via variant
    const locRes = await takeVariantLive(graphicId, "toggle-location", "key-var-loc-2");
    expect(locRes.commandStatus).toBe("confirmed");
    expect(getOnAir()?.snapshot?.showLocation).toBe("true");

    // Update text
    const updateRes = await updateLive(graphicId, "key-update-pres");
    expect(updateRes.commandStatus).toBe("confirmed");
    expect(getOnAir()?.snapshot?.showLocation).toBe("true");
  });
});
