import { describe, expect, it } from "vitest";
import { calculateTickerSpeed, rundownTickerSchema } from "@newscg/shared";

describe("balanced per-rundown ticker speed", () => {
  it("keeps simple copy at normal speed and gives numeric copy additional reading time", () => {
    expect(calculateTickerSpeed("WARGA MENANAM POHON DI TAMAN")).toBe(85);
    expect(calculateTickerSpeed("HARGA BERAS NAIK 5 PERSEN")).toBe(82);
    expect(calculateTickerSpeed("2026 2027 2028")).toBe(70);
    expect(calculateTickerSpeed("")).toBe(85);
  });
  it("slows complex words and punctuation without treating uppercase headlines or decimal marks as extra complexity", () => {
    const long = "RESTRUKTURISASI PEREKONOMIAN BERLANJUT";
    expect(calculateTickerSpeed(long)).toBeLessThan(85);
    expect(calculateTickerSpeed(long)).toBe(calculateTickerSpeed(long.toLowerCase()));
    expect(calculateTickerSpeed("DATA: UTARA, SELATAN; TIMUR/BARAT")).toBeLessThan(calculateTickerSpeed("DATA UTARA SELATAN TIMUR BARAT"));
    expect(calculateTickerSpeed("HARGA NAIK 5,2 PERSEN")).toBe(calculateTickerSpeed("HARGA NAIK 52 PERSEN"));
  });
  it("does not accelerate a long list or dilute a demanding headline among simple ones", () => {
    const demanding = "2026 2027 2028";
    const simple = "WARGA MENANAM POHON DI TAMAN";
    expect(calculateTickerSpeed(`${Array(200).fill(simple).join(" • ")} • ${demanding}`)).toBe(70);
    expect(calculateTickerSpeed(`${simple}\n${demanding} ■ ${simple}`)).toBe(70);
  });
  it("recalculates auto speed from copy and preserves an explicit validated manual override", () => {
    expect(rundownTickerSchema.parse({ text: "2026 2027 2028", speed: 200 })).toMatchObject({ speedMode: "auto", speed: 70 });
    expect(rundownTickerSchema.parse({ text: "2026 2027 2028", speedMode: "manual", speed: 95 })).toMatchObject({ speedMode: "manual", speed: 95 });
    expect(rundownTickerSchema.safeParse({ text: "TEST", speedMode: "manual" }).success).toBe(false);
    for (const speed of [0, 251, NaN, "85"]) expect(rundownTickerSchema.safeParse({ text: "TEST", speedMode: "manual", speed }).success).toBe(false);
  });
});
