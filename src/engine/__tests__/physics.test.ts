import { generate, PhysicsAPI } from "../generator";
import { inside, score, simulate, Level } from "../physics";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const protoPhysics = require("../../../prototype/physics.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const protoGen = require("../../../prototype/gen.js");

const P: PhysicsAPI = { simulate, score, inside };
const protoP = { simulate: protoPhysics.simulate, score: protoPhysics.score, inside: protoPhysics.inside };

// 10 fixed (seed, diff, drop) inputs. The drop point is a deterministic pseudo-random
// offset inside the generated level's zone so pairs exercise different parts of each green.
const CASES = Array.from({ length: 10 }, (_, i) => {
  const seed = 1 + i * 97;
  const diff = (i % 5) / 4;
  const fx = (i * 0.37) % 1;
  const fy = (i * 0.61) % 1;
  return { seed, diff, fx, fy };
});

function dropPoint(L: Level, fx: number, fy: number): [number, number] {
  return [L.zone.x + fx * L.zone.w, L.zone.y + fy * L.zone.h];
}

describe("physics golden-path regression", () => {
  it("reproduces the exact same final position, holed, and score for 10 fixed (seed, drop) pairs", () => {
    const results = CASES.map(({ seed, diff, fx, fy }) => {
      const { level } = generate(seed, diff, P);
      const [x, y] = dropPoint(level, fx, fy);
      const r = simulate(level, x, y);
      return {
        x: Number(r.x.toFixed(6)),
        y: Number(r.y.toFixed(6)),
        holed: r.holed,
        score: score(r),
      };
    });
    expect(results).toMatchSnapshot();
  });

  it("matches the original prototype physics.js/gen.js bit-for-bit (within 1e-6) for the same 10 pairs", () => {
    for (const { seed, diff, fx, fy } of CASES) {
      const { level: tsLevel } = generate(seed, diff, P);
      const { level: jsLevel } = protoGen.generate(seed, diff, protoP);
      const [tx, ty] = dropPoint(tsLevel, fx, fy);
      const [jx, jy] = dropPoint(jsLevel, fx, fy);
      expect(tx).toBeCloseTo(jx, 6);
      expect(ty).toBeCloseTo(jy, 6);

      const tr = simulate(tsLevel, tx, ty);
      const jr = protoPhysics.simulate(jsLevel, jx, jy);
      expect(tr.x).toBeCloseTo(jr.x, 6);
      expect(tr.y).toBeCloseTo(jr.y, 6);
      expect(tr.holed).toBe(jr.holed);
      expect(score(tr)).toBe(protoPhysics.score(jr));
    }
  });
});
