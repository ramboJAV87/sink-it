import { generate, generateAsync, PhysicsAPI } from "../generator";
import { inside, score, simulate } from "../physics";

const P: PhysicsAPI = { simulate, score, inside };

describe("generator fairness acceptance", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => 1000 + i);

  it.each(seeds)("seed %i passes the fairness rule", (seed) => {
    const i = seed - 1000;
    const diff = Math.min(1, i / 20);
    const { stats } = generate(seed, diff, P);

    const runOverCap = diff < 0.3 ? 0.5 : 3;
    expect(stats.holed).toBeGreaterThanOrEqual(1.5);
    expect(stats.lip).toBeLessThanOrEqual(runOverCap);
    expect(stats.near).toBeGreaterThanOrEqual(25);
    expect(stats.moved).toBeGreaterThanOrEqual(99);
  });
});

// The app only ever calls generateAsync (it yields between candidates so the solver doesn't
// lock the UI thread). It MUST walk the RNG in exactly the same order as generate() or the
// daily green would differ from the one the acceptance test above vouches for.
describe("generateAsync matches generate", () => {
  it.each([
    [7001, 0],
    [1003, 0.15],
    [1012, 0.6],
  ])(
    "seed %i diff %f produces an identical green",
    async (seed, diff) => {
      const sync = generate(seed, diff, P);
      const async = await generateAsync(seed, diff, P);
      expect(async.tries).toBe(sync.tries);
      expect(async.stats).toEqual(sync.stats);
      expect(async.level).toEqual(sync.level);
    },
    // two full solves per case, and the async one yields between every candidate
    120_000,
  );
});
