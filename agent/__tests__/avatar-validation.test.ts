import { describe, it, expect } from "vitest";
import { validateAvatarUrl } from "../validation";

describe("validateAvatarUrl", () => {
  it("accepts an https:// URL", () => {
    const r = validateAvatarUrl("https://example.com/avatar.png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://example.com/avatar.png");
  });

  it("accepts an http:// URL", () => {
    const r = validateAvatarUrl("http://example.com/a.png");
    expect(r.ok).toBe(true);
  });

  it("accepts an ipfs:// URL", () => {
    const r = validateAvatarUrl("ipfs://bafyabc123/avatar.png");
    expect(r.ok).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    const r = validateAvatarUrl("  https://x.com/a.png  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://x.com/a.png");
  });

  // The whole point of this test file: regression-protect against the
  // old AvatarUpload mock that wrote a `data:` URL into the contract.
  it("rejects a data:image/...;base64 URL (was the old mock smuggle path)", () => {
    const r = validateAvatarUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/scheme not allowed/);
  });

  it("rejects a blob: URL", () => {
    const r = validateAvatarUrl("blob:https://example.com/abc-123");
    expect(r.ok).toBe(false);
  });

  it("rejects a file: URL", () => {
    const r = validateAvatarUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("rejects a javascript: URL", () => {
    const r = validateAvatarUrl("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed URL", () => {
    const r = validateAvatarUrl("not a url at all");
    expect(r.ok).toBe(false);
  });

  it("rejects an empty string", () => {
    const r = validateAvatarUrl("");
    expect(r.ok).toBe(false);
  });

  it("rejects a URL exceeding 2048 chars", () => {
    const long = "https://example.com/" + "x".repeat(2050);
    const r = validateAvatarUrl(long);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too long/);
  });

  it("rejects non-string input gracefully", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = validateAvatarUrl(undefined as any);
    expect(r.ok).toBe(false);
  });
});
