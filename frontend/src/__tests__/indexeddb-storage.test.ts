import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CACHE_TTL_MS,
  isCacheFresh,
  isOnline,
  createNetworkListener,
} from "@/lib/indexeddb-storage";

describe("CACHE_TTL_MS", () => {
  it("is exported as 5 minutes in milliseconds", () => {
    expect(CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("isCacheFresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for undefined timestamp", () => {
    expect(isCacheFresh(undefined)).toBe(false);
  });

  it("returns false for timestamp 0 (treated as never-cached)", () => {
    expect(isCacheFresh(0)).toBe(false);
  });

  it("returns true when the timestamp is now", () => {
    expect(isCacheFresh(Date.now())).toBe(true);
  });

  it("returns true for a timestamp 1 minute ago", () => {
    expect(isCacheFresh(Date.now() - 60_000)).toBe(true);
  });

  it("returns true at the upper bound minus 1ms", () => {
    expect(isCacheFresh(Date.now() - (CACHE_TTL_MS - 1))).toBe(true);
  });

  it("returns false at exactly the TTL boundary", () => {
    expect(isCacheFresh(Date.now() - CACHE_TTL_MS)).toBe(false);
  });

  it("returns false for any timestamp older than TTL", () => {
    expect(isCacheFresh(Date.now() - CACHE_TTL_MS - 1)).toBe(false);
    expect(isCacheFresh(Date.now() - 24 * 60 * 60 * 1000)).toBe(false); // 1 day ago
  });
});

describe("isOnline", () => {
  // Save the original navigator.onLine descriptor so we can restore it.
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator),
    "onLine",
  );

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Object.getPrototypeOf(navigator), "onLine", originalDescriptor);
    }
  });

  it("returns true when navigator.onLine is true", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "onLine", {
      configurable: true,
      get: () => true,
    });
    expect(isOnline()).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "onLine", {
      configurable: true,
      get: () => false,
    });
    expect(isOnline()).toBe(false);
  });
});

describe("createNetworkListener", () => {
  it("registers online + offline event listeners", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const onOnline = vi.fn();
    const onOffline = vi.fn();

    createNetworkListener(onOnline, onOffline);

    expect(addSpy).toHaveBeenCalledWith("online", onOnline);
    expect(addSpy).toHaveBeenCalledWith("offline", onOffline);

    addSpy.mockRestore();
  });

  it("invokes the callbacks when window dispatches online/offline events", () => {
    const onOnline = vi.fn();
    const onOffline = vi.fn();
    const cleanup = createNetworkListener(onOnline, onOffline);

    window.dispatchEvent(new Event("online"));
    expect(onOnline).toHaveBeenCalledTimes(1);
    expect(onOffline).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("offline"));
    expect(onOffline).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("returned cleanup function removes the listeners", () => {
    const onOnline = vi.fn();
    const onOffline = vi.fn();
    const cleanup = createNetworkListener(onOnline, onOffline);

    cleanup();

    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("offline"));

    expect(onOnline).not.toHaveBeenCalled();
    expect(onOffline).not.toHaveBeenCalled();
  });
});
