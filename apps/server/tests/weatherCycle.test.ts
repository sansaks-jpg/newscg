import { describe, expect, it } from "vitest";
import { getLiputan7WeatherFrame } from "@newscg/shared";

describe("Liputan7 logo and consecutive weather sequence", () => {
  it("holds the logo for ten seconds, then opens slowly", () => {
    expect(getLiputan7WeatherFrame(9999, 7).phase).toBe("logo");
    expect(getLiputan7WeatherFrame(10000, 7)).toMatchObject({ phase: "opening", index: 0, nextChangeInMs: 700 });
    expect(getLiputan7WeatherFrame(10700, 7)).toMatchObject({ phase: "hold", index: 0, nextChangeInMs: 3000 });
  });
  it("gives every city three full seconds and separate gentle exit/entrance", () => {
    for (let index = 0; index < 7; index++) {
      const start = 10700 + index * 3600;
      expect(getLiputan7WeatherFrame(start, 7)).toMatchObject({ phase: "hold", index, nextChangeInMs: 3000 });
      expect(getLiputan7WeatherFrame(start + 2999, 7)).toMatchObject({ phase: "hold", index });
      if (index < 6) {
        expect(getLiputan7WeatherFrame(start + 3000, 7)).toMatchObject({ phase: "out", index });
        expect(getLiputan7WeatherFrame(start + 3300, 7)).toMatchObject({ phase: "in", index: index + 1 });
      }
    }
  });
  it("returns to ten seconds of logo after all seven cities and varies the next run", () => {
    expect(getLiputan7WeatherFrame(35300, 7)).toMatchObject({ phase: "closing", index: 6 });
    expect(getLiputan7WeatherFrame(36000, 7)).toMatchObject({ phase: "logo", cycle: 1 });
    expect(getLiputan7WeatherFrame(45999, 7).phase).toBe("logo");
    expect(getLiputan7WeatherFrame(46000, 7)).toMatchObject({ phase: "opening", cycle: 1, motion: "slide" });
    expect(new Set([0, 1, 2].map(index => getLiputan7WeatherFrame(10700 + index * 3600, 7).motion)).size).toBe(3);
  });
  it("handles a single or unavailable location without skipping rapidly", () => {
    expect(getLiputan7WeatherFrame(13700, 1).phase).toBe("closing");
    expect(getLiputan7WeatherFrame(14400, 1).phase).toBe("logo");
    expect(getLiputan7WeatherFrame(999999, 0).phase).toBe("logo");
  });
});
