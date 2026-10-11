import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

let directory: string;
let dbModule: typeof import("../src/db.js");

describe("atomic master and Program persistence", () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "newscg-db-transaction-test-"));
    vi.stubEnv("DATABASE_PATH", join(directory, "db.sqlite"));
    vi.resetModules();
    dbModule = await import("../src/db.js");
    dbModule.saveOnAir("CG-TEST", "web-overlay", 1, { headline: "SEDANG TAYANG" }, "confirmed");
  });

  afterAll(() => {
    if (dbModule?.db.open) dbModule.db.close();
    vi.unstubAllEnvs();
    if (directory) {
      const subpath = relative(tmpdir(), directory);
      if (!subpath || subpath.startsWith("..") || isAbsolute(subpath) || !basename(directory).startsWith("newscg-db-transaction-test-")) {
        throw new Error("Path tes tidak valid");
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rolls back master changes when resetting on-air state fails", () => {
    const beforeMaster = dbModule.getMasterOverlay();
    const beforeProgram = dbModule.getOnAir();
    dbModule.db.exec(`CREATE TRIGGER reject_program_reset BEFORE UPDATE ON on_air_state
      BEGIN SELECT RAISE(ABORT, 'Suntikan gagal simpan Program'); END`);
    try {
      expect(() => {
        dbModule.saveMasterAndClearOnAir({ brandText: "MASTER BERUBAH SEBELUM ERROR" });
      }).toThrow("Suntikan gagal simpan Program");
      expect(dbModule.getMasterOverlay()).toEqual(beforeMaster);
      expect(dbModule.getOnAir()).toEqual(beforeProgram);
    } finally {
      dbModule.db.exec("DROP TRIGGER reject_program_reset");
      dbModule.saveMasterOverlay(beforeMaster);
    }
  });

  it("commits the master change and clear together when both writes succeed", () => {
    const master = dbModule.saveMasterAndClearOnAir({ showTicker: true });
    expect(master.showTicker).toBe(true);
    expect(dbModule.getMasterOverlay()).toEqual(master);
    expect(dbModule.getOnAir()).toMatchObject({ graphicId: null, snapshot: null, status: "confirmed" });
  });
});
