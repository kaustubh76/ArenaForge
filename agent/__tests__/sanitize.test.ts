import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeHandle, escapeHtml } from "../utils/sanitize";

describe("sanitizeText", () => {
  it("strips control characters", () => {
    expect(sanitizeText("hello\x00\x07world", 100)).toBe("helloworld");
  });

  it("normalizes whitespace runs to a single space", () => {
    expect(sanitizeText("a   b\t\nc", 100)).toBe("a b c");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("   hi   ", 100)).toBe("hi");
  });

  it("truncates to maxLen", () => {
    const long = "x".repeat(200);
    expect(sanitizeText(long, 64).length).toBe(64);
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeText(undefined, 10)).toBe("");
    expect(sanitizeText(null, 10)).toBe("");
    expect(sanitizeText(42, 10)).toBe("");
  });

  it("preserves angle brackets (frontend escapes — server stores raw)", () => {
    // We deliberately do NOT escape HTML here; React + JSON consumers handle
    // it. Storing raw lets future plain-text consumers see the real input.
    expect(sanitizeText("<script>alert(1)</script>", 100)).toBe("<script>alert(1)</script>");
  });
});

describe("sanitizeHandle", () => {
  it("strips characters outside [a-zA-Z0-9_]", () => {
    expect(sanitizeHandle("alpha-beta!")).toBe("alphabeta");
  });

  it("keeps underscores and digits", () => {
    expect(sanitizeHandle("user_42")).toBe("user_42");
  });

  it("truncates to 32 chars", () => {
    expect(sanitizeHandle("x".repeat(50)).length).toBe(32);
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeHandle(null)).toBe("");
    expect(sanitizeHandle(99)).toBe("");
  });
});

describe("escapeHtml", () => {
  it("escapes the standard set", () => {
    expect(escapeHtml(`<div class="x">'a'/'b'&</div>`)).toBe(
      "&lt;div class=&quot;x&quot;&gt;&#39;a&#39;&#x2F;&#39;b&#39;&amp;&lt;&#x2F;div&gt;"
    );
  });

  it("is a no-op for safe text", () => {
    expect(escapeHtml("just plain text")).toBe("just plain text");
  });
});
