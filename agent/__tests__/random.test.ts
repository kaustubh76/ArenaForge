import { describe, it, expect } from "vitest";
import {
  defaultRng,
  seededRng,
  shuffle,
  pickOne,
  randomInt,
  randomId,
} from "../utils/random";

describe("seededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed yields same sequence", () => {
    const a = seededRng(123);
    const b = seededRng(123);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds yield different sequences", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    let differences = 0;
    for (let i = 0; i < 50; i++) {
      if (a() !== b()) differences++;
    }
    // Vanishingly unlikely for two seeds to produce identical sequences.
    expect(differences).toBeGreaterThan(40);
  });
});

describe("defaultRng", () => {
  it("produces values in [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const v = defaultRng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffle (Fisher-Yates)", () => {
  it("returns a new array, leaving the input unchanged", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out).not.toBe(input);
    expect(out).toHaveLength(5);
  });

  it("preserves all elements (no loss, no duplication)", () => {
    const input = ["a", "b", "c", "d", "e", "f"];
    const out = shuffle(input, seededRng(7));
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("is deterministic with a seeded rng", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = shuffle(input, seededRng(99));
    const b = shuffle(input, seededRng(99));
    expect(a).toEqual(b);
  });

  it("does not produce a uniformly fixed order across seeds", () => {
    const input = [1, 2, 3, 4];
    const seen = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      seen.add(shuffle(input, seededRng(s)).join(","));
    }
    // 4! = 24 permutations; with 30 seeds we should see plenty of variety.
    expect(seen.size).toBeGreaterThan(5);
  });

  it("Fisher-Yates uniformity smoke: every element visits every position", () => {
    // Run many shuffles and tally how often each element lands in each
    // index. With a uniform shuffle every (element, index) cell should be
    // hit roughly equally. We don't do a chi-square here (overkill for a
    // smoke test) — we just assert the min cell count is well above zero.
    const items = [0, 1, 2, 3, 4];
    const N = 5000;
    const tally = items.map(() => items.map(() => 0));
    const rng = seededRng(2024);
    for (let i = 0; i < N; i++) {
      const out = shuffle(items, rng);
      for (let pos = 0; pos < items.length; pos++) {
        tally[out[pos]][pos]++;
      }
    }
    // Expected count per cell: N / 5 = 1000. Tolerate ±20% drift.
    const expected = N / items.length;
    const min = Math.min(...tally.flat());
    const max = Math.max(...tally.flat());
    expect(min).toBeGreaterThan(expected * 0.8);
    expect(max).toBeLessThan(expected * 1.2);
  });

  it("handles empty input", () => {
    expect(shuffle([])).toEqual([]);
  });

  it("handles single-element input", () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

describe("pickOne", () => {
  it("returns one of the input elements", () => {
    const arr = ["x", "y", "z"];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickOne(arr));
    }
  });

  it("returns undefined for empty input", () => {
    expect(pickOne([])).toBeUndefined();
  });

  it("is deterministic with a seeded rng", () => {
    const arr = [10, 20, 30, 40, 50];
    expect(pickOne(arr, seededRng(8))).toBe(pickOne(arr, seededRng(8)));
  });
});

describe("randomInt", () => {
  it("respects [min, max] bounds inclusively", () => {
    for (let i = 0; i < 100; i++) {
      const v = randomInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("handles min === max", () => {
    expect(randomInt(7, 7)).toBe(7);
  });

  it("handles reversed bounds gracefully", () => {
    for (let i = 0; i < 20; i++) {
      const v = randomInt(10, 5);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic with a seeded rng", () => {
    const seq1 = Array.from({ length: 20 }, () => 0);
    const seq2 = Array.from({ length: 20 }, () => 0);
    const a = seededRng(11);
    const b = seededRng(11);
    for (let i = 0; i < 20; i++) {
      seq1[i] = randomInt(0, 100, a);
      seq2[i] = randomInt(0, 100, b);
    }
    expect(seq1).toEqual(seq2);
  });
});

describe("randomId", () => {
  it("produces non-empty strings", () => {
    expect(randomId().length).toBeGreaterThan(0);
  });

  it("applies the prefix when provided", () => {
    const id = randomId("box");
    expect(id.startsWith("box-")).toBe(true);
  });

  it("varies across calls (vanishingly small collision risk)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(randomId());
    expect(ids.size).toBe(100);
  });

  it("is deterministic with a seeded rng", () => {
    expect(randomId("x", seededRng(5))).toBe(randomId("x", seededRng(5)));
  });
});
