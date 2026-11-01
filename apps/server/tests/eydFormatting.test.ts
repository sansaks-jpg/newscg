import { describe, expect, it } from "vitest";
import { formatEydDetail } from "@newscg/shared";

describe("formatEydDetail", () => {
  it("converts uppercase detail and roles into EYD title case", () => {
    expect(formatEydDetail("MENTERI KEUANGAN REPUBLIK INDONESIA")).toBe(
      "Menteri Keuangan Republik Indonesia"
    );
    expect(formatEydDetail("KASIE OPS BASARNAS BANTEN")).toBe(
      "Kasie Ops Basarnas Banten"
    );
    expect(formatEydDetail("PENGUNJUNG")).toBe("Pengunjung");
  });

  it("keeps lowercase prepositions and conjunctions in lowercase when not at the start", () => {
    expect(formatEydDetail("RATUSAN DELEGASI MEMBAHAS KERJA SAMA INVESTASI DI JAKARTA")).toBe(
      "Ratusan Delegasi Membahas Kerja Sama Investasi di Jakarta"
    );
    expect(formatEydDetail("KASUS KORUPSI PADA PROYEK PENGADAAN BARANG DAN JASA")).toBe(
      "Kasus Korupsi pada Proyek Pengadaan Barang dan Jasa"
    );
    expect(formatEydDetail("laporan investigasi tentang korupsi oleh pejabat")).toBe(
      "Laporan Investigasi tentang Korupsi oleh Pejabat"
    );
  });

  it("capitalizes prepositions when they appear at the start of a phrase", () => {
    expect(formatEydDetail("DI BALIK KASUS KORUPSI")).toBe("Di Balik Kasus Korupsi");
    expect(formatEydDetail("untuk masa depan indonesia")).toBe("Untuk Masa Depan Indonesia");
  });

  it("preserves known official uppercase acronyms", () => {
    expect(formatEydDetail("GUBERNUR DKI JAKARTA")).toBe("Gubernur DKI Jakarta");
    expect(formatEydDetail("PANGLIMA TNI DAN KAPOLRI")).toBe("Panglima TNI dan Kapolri");
    expect(formatEydDetail("DIVISI HUMAS POLRI")).toBe("Divisi Humas POLRI");
    expect(formatEydDetail("KETUA KPK REPUBLIK INDONESIA")).toBe("Ketua KPK Republik Indonesia");
    expect(formatEydDetail("KEPALA BMKG WILAYAH II")).toBe("Kepala BMKG Wilayah II");
    expect(formatEydDetail("MENTERI BUMN RI")).toBe("Menteri BUMN RI");
    expect(formatEydDetail("ANGGOTA DPR RI")).toBe("Anggota DPR RI");
    expect(formatEydDetail("PEMBANGUNAN IKN NUSANTARA")).toBe("Pembangunan IKN Nusantara");
  });

  it("handles segmented phrases with vertical bar or slash properly", () => {
    expect(formatEydDetail("Tanti | Pengunjung")).toBe("Tanti | Pengunjung");
    expect(formatEydDetail("BUDI SANTOSO | KEPALA BIRO DI JAKARTA")).toBe(
      "Budi Santoso | Kepala Biro di Jakarta"
    );
    expect(formatEydDetail("REPORTER / PRESENTER LAPANGAN")).toBe(
      "Reporter / Presenter Lapangan"
    );
  });

  it("handles hyphenated compound words", () => {
    expect(formatEydDetail("UNDANG-UNDANG KETENAGAKERJAAN")).toBe(
      "Undang-Undang Ketenagakerjaan"
    );
    expect(formatEydDetail("SESI TANYA-JAWAB BERSAMA WARGA")).toBe(
      "Sesi Tanya-Jawab bersama Warga"
    );
  });

  it("handles empty or falsy values gracefully", () => {
    expect(formatEydDetail("")).toBe("");
    expect(formatEydDetail(null)).toBe("");
    expect(formatEydDetail(undefined)).toBe("");
    expect(formatEydDetail("   ")).toBe("");
  });
});
