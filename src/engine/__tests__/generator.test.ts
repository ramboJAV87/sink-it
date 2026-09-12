import { generate, PhysicsAPI } from "../generator";
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
