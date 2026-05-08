import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  fold,
  unwrapOr,
  tryAsync,
  trySync,
  type Result,
} from "../utils/result";

describe("Result constructors and guards", () => {
  it("ok() builds a success branch; isOk narrows the type", () => {
    const r: Result<number, string> = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it("err() builds an error branch; isErr narrows the type", () => {
    const r: Result<number, string> = err("nope");
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe("nope");
  });
});

describe("map", () => {
  it("transforms the success value", () => {
    const r = map(ok(2), (n) => n * 5);
    expect(r).toEqual({ ok: true, value: 10 });
  });

  it("passes the error branch through unchanged", () => {
    const e = err("bad");
    const r = map(e as Result<number, string>, (n) => n + 1);
    expect(r).toEqual({ ok: false, error: "bad" });
  });
});

describe("fold", () => {
  it("calls onOk for success", () => {
    expect(fold(ok(3), (n) => `v=${n}`, (e) => `e=${e}`)).toBe("v=3");
  });

  it("calls onErr for failure", () => {
    expect(fold(err("x") as Result<number, string>, (n) => `v=${n}`, (e) => `e=${e}`)).toBe("e=x");
  });
});

describe("unwrapOr", () => {
  it("returns value on ok, fallback on err", () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(err("nope") as Result<number, string>, 0)).toBe(0);
  });
});

describe("tryAsync", () => {
  it("captures a resolved value as ok", async () => {
    const r = await tryAsync(async () => 99);
    expect(r).toEqual({ ok: true, value: 99 });
  });

  it("captures a thrown Error as err", async () => {
    const r = await tryAsync(async () => {
      throw new Error("boom");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe("boom");
    }
  });

  it("coerces non-Error throws into Error", async () => {
    const r = await tryAsync(async () => {
      throw "just a string";
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(Error);
      expect(r.error.message).toBe("just a string");
    }
  });
});

describe("trySync", () => {
  it("captures a returned value as ok", () => {
    expect(trySync(() => 1 + 1)).toEqual({ ok: true, value: 2 });
  });

  it("captures a thrown error as err", () => {
    const r = trySync(() => {
      throw new Error("sync boom");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe("sync boom");
  });
});
