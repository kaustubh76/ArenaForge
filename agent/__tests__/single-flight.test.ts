import { describe, it, expect, beforeEach } from "vitest";
import { makeSingleFlight } from "../utils/single-flight";
import { __setLogLevelForTests } from "../utils/logger";

beforeEach(() => {
  __setLogLevelForTests("silent");
});

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("makeSingleFlight", () => {
  it("runs the function when nothing is in flight", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    let ran = 0;
    const r = await sf.run(async () => {
      ran++;
    });
    expect(r.ran).toBe(true);
    expect(ran).toBe(1);
    expect(sf.stats().totalSkipped).toBe(0);
  });

  it("skips the second call while the first is still in flight", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    const gate = defer<void>();
    let firstFinished = false;

    const p1 = sf.run(async () => {
      await gate.promise;
      firstFinished = true;
    });
    // Second call lands while the first is still awaiting `gate`.
    const p2Result = await sf.run(async () => {
      throw new Error("must not run");
    });
    expect(p2Result.ran).toBe(false);
    expect(firstFinished).toBe(false);

    gate.resolve();
    const p1Result = await p1;
    expect(p1Result.ran).toBe(true);
    expect(firstFinished).toBe(true);
    expect(sf.stats().totalSkipped).toBe(1);
  });

  it("a third call lands fine after the first finishes", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    let ran = 0;
    await sf.run(async () => {
      ran++;
    });
    await sf.run(async () => {
      ran++;
    });
    expect(ran).toBe(2);
    expect(sf.stats().totalSkipped).toBe(0);
  });

  it("releases the in-flight flag even when fn throws", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    await expect(
      sf.run(async () => {
        throw new Error("bad");
      })
    ).rejects.toThrow("bad");
    expect(sf.stats().inFlight).toBe(false);
    // Next call should proceed normally.
    const r = await sf.run(async () => {});
    expect(r.ran).toBe(true);
  });

  it("reports duration on a successful run", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    const r = await sf.run(async () => {
      await new Promise((res) => setTimeout(res, 5));
    });
    expect(r.ran).toBe(true);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("counts both calls and skips", async () => {
    const sf = makeSingleFlight({ tag: "Test" });
    const gate = defer<void>();
    const p1 = sf.run(async () => {
      await gate.promise;
    });
    await sf.run(async () => {});
    await sf.run(async () => {});
    gate.resolve();
    await p1;
    const stats = sf.stats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalSkipped).toBe(2);
  });
});
