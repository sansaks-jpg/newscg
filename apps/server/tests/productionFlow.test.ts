import { describe, expect, it, vi } from "vitest";
import { liveShortcut, primaryGraphicAction, takeThenAdvance } from "../../web/src/productionFlow";
import { fieldSchemas, headlineDefaultsSchema, validateGraphicPatch } from "@newscg/shared";

describe("operator live workflow", () => {
  it("keeps the selected cue when TAKE is rejected or unavailable", async () => {
    const advance = vi.fn();
    expect(await takeThenAdvance(async () => false, advance)).toBe(false);
    expect(advance).not.toHaveBeenCalled();
  });

  it("advances once, only after the output confirms TAKE", async () => {
    let confirm!: (value: boolean) => void;
    const advance = vi.fn();
    const pending = takeThenAdvance(() => new Promise<boolean>((resolve) => { confirm = resolve; }), advance);
    expect(advance).not.toHaveBeenCalled();
    confirm(true);
    await pending;
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it("does not advance after a transport failure", async () => {
    const advance = vi.fn();
    await expect(takeThenAdvance(async () => { throw new Error("offline"); }, advance)).rejects.toThrow("offline");
    expect(advance).not.toHaveBeenCalled();
  });

  it("hotkeys map correctly for master and news elements", () => {
    expect(liveShortcut("1", {})).toBe("logo");
    expect(liveShortcut("2", {})).toBe("full");
    expect(liveShortcut("m", {})).toBe("master");
    expect(liveShortcut("M", { editing: true })).toBeNull();
    expect(liveShortcut("0", {})).toBe("clear-all");
    expect(liveShortcut("h", {})).toBe("headline");
    expect(liveShortcut("H", {})).toBe("headline");
    expect(liveShortcut("l", {})).toBe("location");
    expect(liveShortcut("L", {})).toBe("location");
    expect(liveShortcut("k", {})).toBe("sot");
    expect(liveShortcut("K", {})).toBe("sot");
    expect(liveShortcut("ArrowLeft", {})).toBe("previous-sot");
    expect(liveShortcut("ArrowRight", {})).toBe("next-sot");
    expect(liveShortcut("t", {})).toBe("topic");
    expect(liveShortcut("T", {})).toBe("topic");
    expect(liveShortcut("d", {})).toBe("detail");
    expect(liveShortcut("D", {})).toBe("detail");
    expect(liveShortcut("u", {})).toBe("update");
    expect(liveShortcut("U", {})).toBe("update");
    expect(liveShortcut("Escape", {})).toBe("clear");
    expect(liveShortcut("c", {})).toBe("clear");
    expect(liveShortcut("C", {})).toBe("clear");
  });

  it("uses Space for TAKE on a new cue and UPDATE on an active or switchable cue", () => {
    expect(liveShortcut(" ", {})).toBe("take");
    expect(primaryGraphicAction(false)).toBe("take");
    expect(primaryGraphicAction(true)).toBe("update");
  });

  it("does not TAKE while typing, holding a key, using modifiers, or activating a focused control", () => {
    for (const context of [{ editing: true }, { disabled: true }, { repeat: true }, { modified: true }]) {
      expect(liveShortcut("Enter", context)).toBeNull();
      expect(liveShortcut(" ", context)).toBeNull();
      expect(liveShortcut("h", context)).toBeNull();
    }
    expect(liveShortcut("Enter", { interactive: true })).toBeNull();
    expect(liveShortcut(" ", { interactive: true })).toBeNull();
    expect(liveShortcut(" ", {})).toBe("take");
    expect(liveShortcut("Enter", {})).toBe("take");
    expect(liveShortcut("ArrowDown", {})).toBe("next");
    expect(liveShortcut("ArrowUp", {})).toBe("previous");
  });

  it("validates headline defaults schema", () => {
    const valid = headlineDefaultsSchema.parse({
      headline: "Headline Utama",
      location: "Jakarta",
      kicker: "Breaking News",
      subline: "Keterangan detail"
    });
    expect(valid.headline).toBe("Headline Utama");
    expect(valid.location).toBe("Jakarta");
    expect(valid.kicker).toBe("Breaking News");
    expect(valid.subline).toBe("Keterangan detail");
  });

  it("old and new headline materials use CNN without changing their copy", () => {
    for (const visualTemplate of [undefined, "classic", "cnn"]) {
      const result = fieldSchemas.HEADLINE.parse({ headline: "JUDUL TETAP", subline: "Detail tetap", visualTemplate });
      expect(result.visualTemplate).toBe("cnn");
      expect(result.headline).toBe("JUDUL TETAP");
      expect(result.subline).toBe("Detail tetap");
    }
  });

  it("validates standalone SOT name and speaker attribution", () => {
    const sot = fieldSchemas.SOT.parse({ headline: "PENCARIAN 5 JURNALIS HILANG", name: "Riski Dwianto", role: "Kasie Ops Basarnas Banten" });
    expect(sot.headline).toBe("PENCARIAN 5 JURNALIS HILANG");
    expect(sot.name).toBe("Riski Dwianto");
    expect(sot.role).toBe("Kasie Ops Basarnas Banten");
    expect(sot.contentMode).toBe("sot");
    expect(fieldSchemas.SOT.safeParse({ headline: "PENCARIAN", name: "" }).success).toBe(false);
  });

  it("rejects invalid PATCH with empty headline or overlong fields", () => {
    const currentGraphic: any = {
      id: "G-1",
      itemId: "I-1",
      templateType: "HEADLINE",
      sortOrder: 0,
      status: "READY",
      draftFields: {
        headline: "JUDUL LAMA",
        subline: "Keterangan",
        location: "Jakarta"
      }
    };

    const validPatch = validateGraphicPatch(currentGraphic, {
      draftFields: { headline: "JUDUL BARU" }
    });
    expect(validPatch.success).toBe(true);
    if (validPatch.success) {
      expect(validPatch.data.headline).toBe("JUDUL BARU");
      expect(validPatch.data.location).toBe("Jakarta");
    }

    const invalidEmpty = validateGraphicPatch(currentGraphic, {
      draftFields: { headline: "" }
    });
    expect(invalidEmpty.success).toBe(false);

    const invalidTooLong = validateGraphicPatch(currentGraphic, {
      draftFields: { headline: "A".repeat(121) }
    });
    expect(invalidTooLong.success).toBe(false);
  });
});
