import { describe, it, expect } from "vitest";
import { KeyedMutex } from "../utils/mutex";

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drain all currently-queued microtasks plus one macrotask so async bodies
 * scheduled at the start of a chain have a chance to make progress. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("KeyedMutex", () => {
  it("serializes concurrent calls with the same key", async () => {
    const mu = new KeyedMutex();
    const order: string[] = [];

    const first = defer<void>();
    const p1 = mu.run("a", async () => {
      order.push("p1-start");
      await first.promise;
      order.push("p1-end");
    });
    const p2 = mu.run("a", async () => {
      order.push("p2-start");
      order.push("p2-end");
    });

    // Drain microtasks: p1 should be in flight, p2 must NOT have started.
    await flushMicrotasks();
    expect(order).toEqual(["p1-start"]);

    first.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(["p1-start", "p1-end", "p2-start", "p2-end"]);
  });

  it("runs different keys concurrently", async () => {
    const mu = new KeyedMutex();
    const order: string[] = [];

    const a = defer<void>();
    const b = defer<void>();

    const pa = mu.run("a", async () => {
      order.push("a-start");
      await a.promise;
      order.push("a-end");
    });
    const pb = mu.run("b", async () => {
      order.push("b-start");
      await b.promise;
      order.push("b-end");
    });

    // Both started before either finished — proves keys don't block each other.
    await flushMicrotasks();
    expect(order).toEqual(expect.arrayContaining(["a-start", "b-start"]));

    b.resolve();
    a.resolve();
    await Promise.all([pa, pb]);
  });

  it("returns the inner function's resolved value", async () => {
    const mu = new KeyedMutex();
    const result = await mu.run("k", async () => 42);
    expect(result).toBe(42);
  });

  it("propagates errors but unblocks the next caller", async () => {
    const mu = new KeyedMutex();

    await expect(
      mu.run("k", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    // Next call on the same key must still execute.
    const value = await mu.run("k", async () => "ok");
    expect(value).toBe("ok");
  });

  it("preserves FIFO order for queued waiters", async () => {
    const mu = new KeyedMutex();
    const order: number[] = [];
    const gate = defer<void>();

    const p0 = mu.run("k", async () => {
      await gate.promise;
      order.push(0);
    });
    const p1 = mu.run("k", async () => {
      order.push(1);
    });
    const p2 = mu.run("k", async () => {
      order.push(2);
    });
    const p3 = mu.run("k", async () => {
      order.push(3);
    });

    gate.resolve();
    await Promise.all([p0, p1, p2, p3]);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("cleans up the chain map once all holders for a key settle", async () => {
    const mu = new KeyedMutex();
    await mu.run("k", async () => {});
    await mu.run("k", async () => {});
    expect(mu.size()).toBe(0);
  });
});
