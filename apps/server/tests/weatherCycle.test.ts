import { describe, expect, it } from "vitest";
import { getLiputan7WeatherFrame } from "@newscg/shared";

describe("Liputan7 logo and consecutive weather sequence", () => {
  it("opens weather immediately on start, then holds each city", () => {
    expect(getLiputan7WeatherFrame(0, 7)).toMatchObject({ phase: "opening", index: 0, nextChangeInMs: 700 });
    expect(getLiputan7WeatherFrame(700, 7)).toMatchObject({ phase: "hold", index: 0, nextChangeInMs: 3000 });
  });
  it("gives every city three full seconds and separate gentle exit/entrance", () => {
    for (let index = 0; index < 7; index++) {
      const start = 700 + index * 3600;
      expect(getLiputan7WeatherFrame(start, 7)).toMatchObject({ phase: "hold", index, nextChangeInMs: 3000 });
      expect(getLiputan7WeatherFrame(start + 2999, 7)).toMatchObject({ phase: "hold", index });
      if (index < 6) {
        expect(getLiputan7WeatherFrame(start + 3000, 7)).toMatchObject({ phase: "out", index });
        expect(getLiputan7WeatherFrame(start + 3300, 7)).toMatchObject({ phase: "in", index: index + 1 });
      }
    }
  });
  it("returns to ten seconds of logo after all seven cities and varies the next run", () => {
    expect(getLiputan7WeatherFrame(25300, 7)).toMatchObject({ phase: "closing", index: 6 });
    expect(getLiputan7WeatherFrame(26000, 7)).toMatchObject({ phase: "logo", cycle: 0 });
    expect(getLiputan7WeatherFrame(35999, 7).phase).toBe("logo");
    expect(getLiputan7WeatherFrame(36000, 7)).toMatchObject({ phase: "opening", cycle: 1, motion: "slide" });
    expect(new Set([0, 1, 2].map(index => getLiputan7WeatherFrame(700 + index * 3600, 7).motion)).size).toBe(3);
  });
  it("handles a single or unavailable location without skipping rapidly", () => {
    expect(getLiputan7WeatherFrame(3700, 1).phase).toBe("closing");
    expect(getLiputan7WeatherFrame(4400, 1).phase).toBe("logo");
    expect(getLiputan7WeatherFrame(999999, 0).phase).toBe("logo");
  });
});
