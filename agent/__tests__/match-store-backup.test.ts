import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MatchStore } from "../persistence/match-store";
import { makeMatchResult } from "./fixtures/match-results";
import { __setLogLevelForTests } from "../utils/logger";

let tmpDir: string;

beforeEach(() => {
  __setLogLevelForTests("silent");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-backup-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MatchStore.backup", () => {
  it("writes a backup file that can be reopened with the same data", async () => {
    // Source DB lives on disk so the backup mechanism has something to copy.
    const srcPath = path.join(tmpDir, "src.sqlite");
    const destPath = path.join(tmpDir, "dest.sqlite");

    const src = new MatchStore(srcPath);
    src.saveMatchResult(makeMatchResult({ matchId: 555, tournamentId: 9 }));
    await src.backup(destPath);
    src.close();

    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.statSync(destPath).size).toBeGreaterThan(0);

    // Reopen the backup as its own MatchStore — schema + row should survive.
    const restored = new MatchStore(destPath);
    const got = restored.getMatch(555);
    expect(got?.matchId).toBe(555);
    expect(got?.tournamentId).toBe(9);
    restored.close();
  });

  it("vacuumInto produces a readable copy", () => {
    const srcPath = path.join(tmpDir, "src.sqlite");
    const destPath = path.join(tmpDir, "dest.sqlite");

    const src = new MatchStore(srcPath);
    src.saveMatchResult(makeMatchResult({ matchId: 9, tournamentId: 1 }));
    src.vacuumInto(destPath);
    src.close();

    expect(fs.existsSync(destPath)).toBe(true);
    const restored = new MatchStore(destPath);
    expect(restored.getMatch(9)?.matchId).toBe(9);
    restored.close();
  });
});
