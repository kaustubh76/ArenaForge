import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildCorsOrigin } from "../utils/cors";

const originalEnv = process.env.CORS_ORIGIN;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalEnv;
});

function originsAllow(origin: string, list: (string | RegExp)[]): boolean {
  return list.some((entry) => (typeof entry === "string" ? entry === origin : entry.test(origin)));
}

describe("buildCorsOrigin — defaults", () => {
  it("always allows the localhost dev origins", () => {
    delete process.env.CORS_ORIGIN;
    const list = buildCorsOrigin();
    expect(originsAllow("http://localhost:5173", list)).toBe(true);
    expect(originsAllow("http://localhost:5174", list)).toBe(true);
    expect(originsAllow("http://localhost:3000", list)).toBe(true);
  });

  it("does not allow arbitrary origins", () => {
    delete process.env.CORS_ORIGIN;
    const list = buildCorsOrigin();
    expect(originsAllow("https://evil.example.com", list)).toBe(false);
  });
});

describe("buildCorsOrigin — wildcard tightening", () => {
  beforeEach(() => {
    process.env.CORS_ORIGIN = "https://*.vercel.app";
  });

  it("allows a single subdomain segment", () => {
    const list = buildCorsOrigin();
    expect(originsAllow("https://app.vercel.app", list)).toBe(true);
    expect(originsAllow("https://my-cool-app.vercel.app", list)).toBe(true);
  });

  it("rejects a subdomain that contains a dot (multi-segment)", () => {
    const list = buildCorsOrigin();
    // Regression: under the old `.*` substitution this would have matched.
    expect(originsAllow("https://evil.app.vercel.app", list)).toBe(false);
  });

  it("rejects a subdomain takeover attempt", () => {
    const list = buildCorsOrigin();
    expect(originsAllow("https://x.vercel.app.attacker.com", list)).toBe(false);
  });

  it("rejects a different domain entirely", () => {
    const list = buildCorsOrigin();
    expect(originsAllow("https://example.com", list)).toBe(false);
  });
});

describe("buildCorsOrigin — multiple entries", () => {
  it("accepts comma-separated origins", () => {
    process.env.CORS_ORIGIN = "https://app.example.com, https://*.preview.example.com";
    const list = buildCorsOrigin();
    expect(originsAllow("https://app.example.com", list)).toBe(true);
    expect(originsAllow("https://feat-x.preview.example.com", list)).toBe(true);
    expect(originsAllow("https://other.com", list)).toBe(false);
  });
});
