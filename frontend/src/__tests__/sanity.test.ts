import { describe, it, expect } from "vitest";

describe("frontend harness sanity", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });

  it("jsdom is available (window object exists)", () => {
    expect(typeof window).toBe("object");
  });
});
