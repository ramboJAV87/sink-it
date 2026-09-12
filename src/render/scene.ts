// Background dressing (trees, bunkers, gallery) around the green.
// Ported from buildScene() in prototype/app.html — same seeded RNG, same placement rules,
// so a given level always looks the same.

import { rng } from "../engine/generator";
import { shapeR, type Level } from "../engine/physics";

export interface Tree {
  x: number;
  y: number;
  s: number;
  k: number;
  lobes: [number, number, number][]; // [angle, dist, scale]
}

export interface Bunker {
  x: number;
  y: number;
  rx: number;
  ry: number;
  a: number;
  w: number[]; // 8 radius multipliers around the blob
}

export interface CrowdPerson {
  x: number;
  y: number;
  c: string;
  skin: string;
  hair: string;
  ph: number;
  hat: boolean;
  face: -1 | 1;
}

export interface Scene {
  trees: Tree[];
  bunkers: Bunker[];
  crowd: CrowdPerson[];
}

const CROWD_COLORS = ["#E63946", "#F4D35E", "#3DDAD7", "#F49AC2", "#9BE564", "#F1F1F1", "#7B6CF6", "#F28C28", "#2E86DE"];
const SKIN_TONES = ["#F1C9A5", "#D9A47C", "#A8734B", "#6B4A2B"];
const HAIR_COLORS = ["#2A1B0E", "#5A3B1E", "#C9A24A", "#8A8A8A"];

export function buildScene(L: Level): Scene {
  const r = rng((L.seed || 1) + 99);
  const scene: Scene = { trees: [], bunkers: [], crowd: [] };
  const S = L.shape;
  if (!S) return scene;

  const dist = (x: number, y: number) => {
    const dx = (x - S.cx) / S.rx,
      dy = (y - S.cy) / S.ry;
    return Math.hypot(dx, dy) / shapeR(S, Math.atan2(dy, dx)); // 1 = edge of green
  };
  const on = (x: number, y: number) => x > 0.5 && x < L.W - 0.5 && y > 0.5 && y < L.H - 0.5;

  for (let t = 0; t < 600 && scene.trees.length < 7; t++) {
    const x = r() * L.W,
      y = r() * L.H,
      s = 2.2 + r() * 2.2;
    if (
      on(x, y) &&
      dist(x, y) > 1.14 + s * 0.045 &&
      !scene.trees.some((q) => Math.hypot(q.x - x, q.y - y) < (q.s + s) * 0.7)
    )
      scene.trees.push({
        x,
        y,
        s,
        k: r(),
        lobes: Array.from({ length: 7 }, () => [r() * 6.28, 0.35 + r() * 0.4, 0.45 + r() * 0.3] as [number, number, number]),
      });
  }

  for (let t = 0; t < 300 && scene.bunkers.length < 2; t++) {
    const x = r() * L.W,
      y = r() * L.H;
    if (
      x > 3.2 &&
      x < L.W - 3.2 &&
      y > 2.4 &&
      y < L.H - 2.4 &&
      dist(x, y) > 1.2 &&
      dist(x, y) < 1.5 &&
      !scene.trees.some((q) => Math.hypot(q.x - x, q.y - y) < q.s + 2.5)
    )
      scene.bunkers.push({ x, y, rx: 2.2 + r() * 1.4, ry: 1.3 + r() * 0.8, a: r() * 3, w: Array.from({ length: 8 }, () => 0.85 + r() * 0.3) });
  }

  // gallery: clusters along the fringe, mostly the lower half; nobody stands on a tree or in a bunker
  const clusters = 3 + Math.floor(r() * 2);
  const cth = Array.from({ length: clusters }, () => 0.1 + r() * 2.95);
  for (let t = 0; t < 900 && scene.crowd.length < 34; t++) {
    const th = cth[Math.floor(r() * clusters)] + (r() - 0.5) * 0.5,
      rr = shapeR(S, th) * (1.15 + r() * 0.12);
    const x = S.cx + Math.cos(th) * rr * S.rx,
      y = S.cy + Math.sin(th) * rr * S.ry;
    if (!on(x, y) || y > L.H - 1.2) continue;
    if (scene.trees.some((q) => Math.hypot(q.x - x, q.y - y) < q.s * 0.85) || scene.bunkers.some((q) => Math.hypot(q.x - x, q.y - y) < q.rx + 0.6)) continue;
    if (scene.crowd.some((q) => Math.hypot(q.x - x, q.y - y) < 1.25)) continue;
    scene.crowd.push({
      x,
      y,
      c: CROWD_COLORS[Math.floor(r() * 9)],
      skin: SKIN_TONES[Math.floor(r() * 4)],
      hair: HAIR_COLORS[Math.floor(r() * 4)],
      ph: r() * 6.3,
      hat: r() < 0.35,
      face: th < 1.57 ? -1 : 1,
    });
  }
  scene.crowd.sort((a, b) => a.y - b.y);
  return scene;
}
