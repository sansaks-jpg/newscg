import { describe, expect, it, vi } from "vitest";
import { liveShortcut, takeThenAdvance } from "../../web/src/productionFlow";
import { fieldSchemas } from "@newscg/shared";

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
  it("numbers select preview content instead of transmitting", () => {
    expect(["3", "4", "5", "6"].map((key) => liveShortcut(key, {}))).toEqual(["name", "headline", "location", "detail"]);
  });
  it("does not TAKE while typing, holding a key, using modifiers, or activating a focused control", () => {
    for (const context of [{ editing: true }, { disabled: true }, { repeat: true }, { modified: true }, { interactive: true }]) {
      expect(liveShortcut("Enter", context)).toBeNull();
      expect(liveShortcut(" ", context)).toBeNull();
    }
    expect(liveShortcut("T", {})).toBe("take");
    expect(liveShortcut("ArrowDown", {})).toBe("next");
    expect(liveShortcut("ArrowUp", {})).toBe("previous");
  });
  it("old and new headline materials use CNN without changing their copy", () => {
    for (const visualTemplate of [undefined, "classic", "cnn"]) {
      const result = fieldSchemas.HEADLINE.parse({ headline: "JUDUL TETAP", subline: "Detail tetap", visualTemplate });
      expect(result.visualTemplate).toBe("cnn");
      expect(result.headline).toBe("JUDUL TETAP");
      expect(result.subline).toBe("Detail tetap");
    }
  });
});
