// Backup the SQLite match store to a timestamped file.
// Usage:  npm run db:backup [dest-dir]
//
// If `dest-dir` is omitted, writes to ./backups. Filename format:
// `arena-data-YYYYMMDD-HHmmss.sqlite`. Operators schedule this via cron or
// the host's job runner.

import * as path from "path";
import * as fs from "fs";
import { MatchStore } from "../persistence/match-store";
import { getLogger } from "../utils/logger";

const log = getLogger("BackupScript");

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "-" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

async function main(): Promise<void> {
  const destDir = path.resolve(process.argv[2] ?? "./backups");
  fs.mkdirSync(destDir, { recursive: true });

  const destPath = path.join(destDir, `arena-data-${timestamp()}.sqlite`);
  const store = new MatchStore();
  try {
    await store.backup(destPath);
    log.info("Backup written", { destPath });
  } finally {
    store.close();
  }
}

main().catch((error) => {
  log.error("Backup failed", { error });
  process.exit(1);
});
