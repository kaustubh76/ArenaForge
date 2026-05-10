// Drift gate: every env var read by the agent runtime MUST be documented in
// .env.example. New variables that appear in code without a corresponding
// docs line make this test fail loudly, which keeps `.env.example` as a
// real source of truth instead of perpetually stale documentation.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Vars that legitimately appear in code but should NOT be documented in
// .env.example (because they're set by the platform, the test runner, etc.).
const ALLOWLIST = new Set<string>([
  "NODE_ENV", // Node sets this; documented as a comment but should never be a hard requirement
]);

// Files that drive the production runtime. Excludes tests, ops/setup
// scripts, and one-shot smoke tests — those legitimately reference
// extra/throwaway env vars that don't belong in the agent's docs.
const RUNTIME_GLOB_ROOTS = ["agent"];
const EXCLUDE_DIRS = new Set(["__tests__", "scripts", "node_modules", "dist"]);
const EXCLUDE_FILES = new Set([
  "test-local.ts",
  "test-testnet.ts",
  "setup-arena.ts",
  "verify-agent.ts",
]);

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (EXCLUDE_FILES.has(entry.name)) continue;
      out.push(full);
    }
  }
  walk(root);
  return out;
}

/**
 * Extract env-var names from a source file. Catches:
 *   - process.env.NAME
 *   - process.env["NAME"]
 *   - requireEnv("NAME") / requireAddress("NAME") / optionalAddress("NAME") / envFlag("NAME")
 * The string-arg helpers are how slice #11 boot validation reads env vars,
 * so we need both forms to avoid false negatives.
 */
function extractEnvRefs(source: string): Set<string> {
  const found = new Set<string>();

  // process.env.NAME — most common
  for (const m of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    found.add(m[1]);
  }
  // process.env["NAME"]
  for (const m of source.matchAll(/process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)) {
    found.add(m[1]);
  }
  // helper-call form: requireEnv("NAME") / requireAddress("NAME") / optionalAddress("NAME") / envFlag("NAME"[, …])
  for (const m of source.matchAll(
    /\b(?:requireEnv|requireAddress|optionalAddress|envFlag)\(\s*["']([A-Z][A-Z0-9_]*)["']/g
  )) {
    found.add(m[1]);
  }

  return found;
}

/**
 * Parse `.env.example`. Accepts both `NAME=value` and commented-out
 * `# NAME=value` lines as "documented". This lets operators see optional
 * vars without forcing a default.
 */
function parseEnvExample(content: string): Set<string> {
  const documented = new Set<string>();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    // Strip a single leading `# ` so `# NAME=...` counts as documented.
    const stripped = line.startsWith("#") ? line.replace(/^#\s*/, "") : line;
    const m = stripped.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (m) documented.add(m[1]);
  }
  return documented;
}

describe("env-doc parity", () => {
  it(".env.example documents every env var the runtime reads", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const envExamplePath = path.join(repoRoot, ".env.example");
    const content = fs.readFileSync(envExamplePath, "utf-8");
    const documented = parseEnvExample(content);

    const referencedInCode = new Set<string>();
    for (const root of RUNTIME_GLOB_ROOTS) {
      const absRoot = path.join(repoRoot, root);
      for (const file of listTsFiles(absRoot)) {
        const src = fs.readFileSync(file, "utf-8");
        for (const name of extractEnvRefs(src)) {
          referencedInCode.add(name);
        }
      }
    }

    const undocumented = [...referencedInCode]
      .filter((name) => !documented.has(name) && !ALLOWLIST.has(name))
      .sort();

    if (undocumented.length > 0) {
      const msg =
        `.env.example is missing ${undocumented.length} variable(s) that the ` +
        `agent runtime reads:\n  ${undocumented.join("\n  ")}\n\n` +
        `Add them to .env.example (commented if optional) so operators ` +
        `know they exist. Or add to the test ALLOWLIST if intentional.`;
      throw new Error(msg);
    }

    // Sanity: confirm we actually scanned something.
    expect(referencedInCode.size).toBeGreaterThan(20);
  });

  it("every documented env var in .env.example is referenced by runtime code", () => {
    // Reverse-direction drift: a documented var that no code reads is also
    // confusing — usually it's a leftover from a removed feature. We allow
    // it (lower priority than the forward direction) but smoke-test that
    // the doc isn't *wildly* out of sync.
    const repoRoot = path.resolve(__dirname, "..", "..");
    const envExamplePath = path.join(repoRoot, ".env.example");
    const content = fs.readFileSync(envExamplePath, "utf-8");
    const documented = parseEnvExample(content);

    const referencedInCode = new Set<string>();
    for (const root of RUNTIME_GLOB_ROOTS) {
      const absRoot = path.join(repoRoot, root);
      for (const file of listTsFiles(absRoot)) {
        const src = fs.readFileSync(file, "utf-8");
        for (const name of extractEnvRefs(src)) {
          referencedInCode.add(name);
        }
      }
    }

    const orphaned = [...documented].filter((name) => !referencedInCode.has(name));
    // Allow a small tail of orphans without failing — operators sometimes
    // pre-document upcoming vars. But more than 5 means real drift.
    expect(orphaned.length).toBeLessThanOrEqual(5);
  });
});
