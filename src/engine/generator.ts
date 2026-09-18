// Procedural green generator + fairness solver for Sink It. Seeded, deterministic.
// Ported line-for-line from prototype/gen.js — do not change these numbers without
// re-running the acceptance test (src/engine/__tests__/generator.test.ts).

import type { Feature, Level, SimResult } from "./physics";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NAMES = [
  "Front tier",
  "Shoulder",
  "The saddle",
  "Two-tier",
  "Punchbowl",
  "Ridge line",
  "Swale",
  "Crown",
  "Long fall",
  "Backstop",
  "Spine",
  "False front",
  "Camel",
  "Amphitheater",
  "Bench",
];

// difficulty 0..1 → target blind pass band
export function band(diff: number): [number, number] {
  const hi = 40 - 32 * diff,
    lo = hi * 0.45;
  return [lo, hi];
}

type InsideFn = (L: Level, x: number, y: number) => boolean;

function candidate(r: () => number, diff: number, inside: InsideFn): Level {
  const W = 30,
    H = 44,
    edge = 1.5;
  const stimp = +(10 + diff * 3 + (r() - 0.5)).toFixed(1);
  const hole = { x: +(9 + r() * 12).toFixed(1), y: +(29 + r() * 8).toFixed(1) };
  const zw = Math.round(10 + r() * 12),
    zh = Math.round(5 + r() * 3),
    zx = Math.round(3 + r() * (24 - zw));
  const zone = { x: zx, y: 5, w: zw, h: zh };
  const tierEnd = Math.round(18 + r() * 12);
  const f: Feature[] = [];
  f.push({ ramp: "y", from: -2, to: tierEnd, drop: +(1.5 + r() * 1.2 + diff * 0.4).toFixed(2) });
  if (r() < 0.75) {
    const dx = +((r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.9)).toFixed(2);
    f.push({ ramp: "x", from: 3, to: 27, drop: dx });
  }
  const w = +(0.4 + r() * 0.5).toFixed(2);
  f.push({ ramp: "x", from: 1, to: 7, drop: w }, { ramp: "x", from: 23, to: 29, drop: -w });
  const nb = diff < 0.15 ? 0 : 1 + (r() < diff ? 1 : 0);
  for (let i = 0; i < nb; i++)
    f.push({
      x: +(7 + r() * 16).toFixed(1),
      y: +(15 + r() * 12).toFixed(1),
      a: +((r() < 0.6 ? 1 : -1) * (0.5 + r() * 0.9)).toFixed(2),
      s: +(3.5 + r() * 2).toFixed(1),
    });
  if (r() < 0.5)
    f.push({ ramp: "y", from: Math.round(tierEnd + 3), to: Math.round(tierEnd + 9), drop: +(0.3 + r() * 0.5).toFixed(2) }); // second little tier
  f.push({ ramp: "y", from: +(hole.y + 1).toFixed(1), to: +(hole.y + 8).toFixed(1), drop: -0.6 });
  f.push({ x: hole.x, y: hole.y, a: +(-(0.4 + r() * 0.5)).toFixed(2), s: 8 });
  const shape = {
    cx: 15,
    cy: 22,
    rx: 13.6,
    ry: 20.6,
    h: [
      { k: 2, a: -0.04 + r() * 0.08, p: r() * 6.28 },
      { k: 3, a: 0.05 + r() * 0.06, p: r() * 6.28 },
      { k: 5, a: 0.02 + r() * 0.03, p: r() * 6.28 },
    ],
  };
  const L: Level = { W, H, edge, tilt: { dx: 0, dy: 0 }, stimp, zone, hole, features: f, reveal: "full", shape };
  // the whole drop zone and the cup must be on the green
  const ok =
    [
      [zone.x, zone.y],
      [zone.x + zone.w, zone.y],
      [zone.x, zone.y + zone.h],
      [zone.x + zone.w, zone.y + zone.h],
    ].every((q) => inside(L, q[0], q[1])) &&
    inside(L, hole.x + 2, hole.y + 2) &&
    inside(L, hole.x - 2, hole.y + 2);
  if (!ok) return candidate(r, diff, inside);
  return L;
}

export interface SolveStats {
  pass: number;
  holed: number;
  lip: number;
  near: number;
  off: number;
  moved: number;
}

export interface PhysicsAPI {
  simulate: (L: Level, x: number, y: number, dt?: number, maxT?: number) => SimResult;
  score: (r: { holed: boolean; dist: number }) => number;
  inside: InsideFn;
}

export function solve(L: Level, P: PhysicsAPI, target: number, step: number): SolveStats {
  let n = 0,
    ok = 0,
    holed = 0,
    lip = 0,
    near = 0,
    off = 0,
    moved = 0;
  for (let x = L.zone.x + 0.25; x <= L.zone.x + L.zone.w; x += step)
    for (let y = L.zone.y + 0.25; y <= L.zone.y + L.zone.h; y += step) {
      const res = P.simulate(L, x, y, 1 / 120, 16);
      n++;
      if (res.path.length > 8) moved++;
      const s = P.score(res);
      if (s >= target) ok++;
      if (res.holed) holed++;
      if (res.lipped) lip++;
      if (res.dist < 8) near++;
      if (res.y > L.H - L.edge - 0.3 || res.x < L.edge + 0.3 || res.x > L.W - L.edge - 0.3) off++;
    }
  return { pass: (100 * ok) / n, holed: (100 * holed) / n, lip: (100 * lip) / n, near: (100 * near) / n, off: (100 * off) / n, moved: (100 * moved) / n };
}

export interface GenerateOpts {
  step?: number;
  maxTries?: number;
  /**
   * Awaited between candidate attempts. Lets the host hand the thread back — and hold it
   * back — while the UI is busy. One candidate is indivisible, so this is the only point
   * where generation can be interrupted.
   */
  onYield?: () => Promise<void> | void;
}

export interface GenerateResult {
  level: Level;
  stats: SolveStats;
  tries: number;
}

interface GenRun {
  r: () => number;
  diff: number;
  lo: number;
  hi: number;
  target: number;
  step: number;
  maxTries: number;
  best: { err: number; L: Level; st: SolveStats; t: number } | null;
  t: number;
  settled: boolean;
}

// generate() and generateAsync() both drive these three, so they walk the RNG in exactly the
// same order and return identical greens for a given seed. Don't give either one its own copy
// of the loop — the daily green depends on this being deterministic across both paths.
function beginGenerate(seed: number, diff: number, opts: GenerateOpts): GenRun {
  const [lo, hi] = band(diff);
  return {
    r: rng(seed),
    diff,
    lo,
    hi,
    target: Math.round(55 + diff * 15),
    step: opts.step || 1.0,
    maxTries: opts.maxTries || 60,
    best: null,
    t: 0,
    settled: false,
  };
}

// Runs one candidate attempt. Returns false once there's nothing left to do.
function stepGenerate(run: GenRun, P: PhysicsAPI): boolean {
  if (run.settled || run.t >= run.maxTries) return false;
  run.t++;
  const L = candidate(run.r, run.diff, P.inside);
  const st = solve(L, P, run.target, run.step);
  const fair = st.holed >= 1.5 && st.lip <= (run.diff < 0.3 ? 0.5 : 3) && st.near >= 25 && st.off <= 55 && st.moved >= 99;
  const inBand = st.pass >= run.lo && st.pass <= run.hi;
  const err = (fair ? 0 : 100) + (inBand ? 0 : Math.min(Math.abs(st.pass - run.lo), Math.abs(st.pass - run.hi)));
  if (!run.best || err < run.best.err) run.best = { err, L, st, t: run.t };
  if (fair && inBand) run.settled = true;
  return !run.settled && run.t < run.maxTries;
}

function endGenerate(run: GenRun, seed: number, diff: number): GenerateResult {
  const best = run.best as { err: number; L: Level; st: SolveStats; t: number };
  const L = best.L;
  L.target = run.target;
  L.name = NAMES[seed % NAMES.length];
  L.seed = seed;
  L.diff = diff;
  return { level: L, stats: best.st, tries: best.t };
}

// Generate a fair green for a seed + difficulty.
export function generate(seed: number, diff: number, P: PhysicsAPI, opts: GenerateOpts = {}): GenerateResult {
  const run = beginGenerate(seed, diff, opts);
  // eslint-disable-next-line no-empty
  while (stepGenerate(run, P)) {}
  return endGenerate(run, seed, diff);
}

// Same green as generate(), but yields to the event loop between candidate attempts so a
// 3-4s solve doesn't freeze the UI thread solid. Still runs on the JS thread — the win comes
// from this plus prefetching ahead of time (see src/game/greenCache.ts).
export async function generateAsync(seed: number, diff: number, P: PhysicsAPI, opts: GenerateOpts = {}): Promise<GenerateResult> {
  const run = beginGenerate(seed, diff, opts);
  const onYield = opts.onYield ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  while (stepGenerate(run, P)) {
    await onYield();
  }
  return endGenerate(run, seed, diff);
}
