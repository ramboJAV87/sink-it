// Green creator logic, ported from the editor section of prototype/app.html
// (assemble/edShape/edTap/runCheck/edCode).

import { base64Decode, base64Encode } from "./base64";
import { rng, solve, type PhysicsAPI } from "../engine/generator";
import type { BumpFeature, Feature, Level, Point, Shape, Zone } from "../engine/physics";

export interface EditorState {
  seed: number;
  drop: number;
  stimp: number;
  hole: Point;
  zone: Zone;
  f: BumpFeature[];
}

export function edSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

export function newEditorState(): EditorState {
  return { seed: edSeed(), drop: 1.8, stimp: 11, hole: { x: 15, y: 33 }, zone: { x: 8, y: 6, w: 14, h: 6 }, f: [] };
}

function edShape(seed: number): Shape {
  const r = rng(seed);
  return {
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
}

export function assemble(ed: EditorState): Level {
  const f: Feature[] = [
    { ramp: "y", from: -2, to: 24, drop: ed.drop },
    { ramp: "x", from: 1, to: 7, drop: 0.6 },
    { ramp: "x", from: 23, to: 29, drop: -0.6 },
    ...ed.f,
    { ramp: "y", from: +(ed.hole.y + 1).toFixed(1), to: +(ed.hole.y + 8).toFixed(1), drop: -0.6 },
    { x: ed.hole.x, y: ed.hole.y, a: -0.6, s: 8 },
  ];
  return {
    W: 30,
    H: 44,
    edge: 1.5,
    tilt: { dx: 0, dy: 0 },
    stimp: ed.stimp,
    zone: ed.zone,
    hole: ed.hole,
    features: f,
    reveal: "full",
    shape: edShape(ed.seed),
    name: "Your green",
    target: 55,
    seed: ed.seed,
  };
}

export type EditTool = "mound" | "dip" | "zone" | "cup";

export interface EditTapResult {
  ed: EditorState;
  message: string;
  changed: boolean;
}

// Tapping an existing mound/dip removes it, whatever tool is selected — matches edTap() in the prototype.
export function editTap(ed: EditorState, level: Level, inside: (L: Level, x: number, y: number) => boolean, tool: EditTool, x: number, y: number): EditTapResult {
  if (!inside(level, x, y)) return { ed, message: "That is off the green.", changed: false };

  let hit = -1,
    hd = 2.2;
  ed.f.forEach((f, i) => {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < hd) {
      hd = d;
      hit = i;
    }
  });
  if (hit >= 0 && tool !== "cup" && tool !== "zone") {
    const f = [...ed.f];
    f.splice(hit, 1);
    return { ed: { ...ed, f }, message: "Removed.", changed: true };
  }

  if (tool === "mound" || tool === "dip") {
    if (ed.f.length >= 6) return { ed, message: "Six is plenty — erase one first.", changed: false };
    const f = [...ed.f, { x: +x.toFixed(1), y: +y.toFixed(1), a: tool === "mound" ? 0.9 : -0.9, s: 4.5 }];
    return { ed: { ...ed, f }, message: "Changed. Check it when you are ready.", changed: true };
  }
  if (tool === "cup") {
    if (y < 20) return { ed, message: "Keep the cup on the lower half so the ball can reach it.", changed: false };
    return { ed: { ...ed, hole: { x: +x.toFixed(1), y: +y.toFixed(1) } }, message: "Changed. Check it when you are ready.", changed: true };
  }
  // zone
  const z = ed.zone;
  const nx = Math.max(2, Math.min(28 - z.w, +(x - z.w / 2).toFixed(1)));
  const ny = Math.max(3, Math.min(14, +(y - z.h / 2).toFixed(1)));
  const fits = [
    [nx, ny],
    [nx + z.w, ny],
    [nx, ny + z.h],
    [nx + z.w, ny + z.h],
  ].every((q) => inside(level, q[0], q[1]));
  if (!fits) return { ed, message: "The zone has to sit fully on the green — try nearer the middle.", changed: false };
  return { ed: { ...ed, zone: { ...z, x: nx, y: ny } }, message: "Changed. Check it when you are ready.", changed: true };
}

export interface CheckResult {
  verdict: string;
  message: string;
  playable: boolean;
}

export function runCheck(ed: EditorState, level: Level, P: PhysicsAPI): CheckResult {
  const z = ed.zone;
  const zoneOk = [
    [z.x, z.y],
    [z.x + z.w, z.y],
    [z.x, z.y + z.h],
    [z.x + z.w, z.y + z.h],
  ].every((q) => P.inside(level, q[0], q[1]));
  if (!zoneOk) {
    return { verdict: "Zone off", message: "Part of the drop zone is off the green. Move it, or pick a new shape.", playable: false };
  }
  const st = solve(level, P, 55, 1);
  const verdict =
    st.moved < 95 ? "Dead spots" : st.pass < 1 ? "Impossible" : st.pass < 3 ? "Brutal" : st.pass > 45 ? "Too easy" : st.holed < 1 ? "No hole-outs" : st.lip > 5 ? "Runs hot" : "Fair";
  let message = `From the zone: ${st.holed.toFixed(0)}% of drops hole out, ${st.pass.toFixed(0)}% score 55+, ${st.lip.toFixed(0)}% run over the cup.`;
  if (st.moved < 95) message += " Some balls will not move — raise the tier drop or move the zone.";
  else if (st.holed < 1 && st.pass >= 3) message += " Nothing holes out yet — nudge the cup or add a dip near it.";
  return { verdict, message, playable: !["Dead spots", "Impossible"].includes(verdict) };
}

export function edCode(ed: EditorState): string {
  return "GR1." + base64Encode(JSON.stringify(ed));
}

export function decodeCode(code: string): EditorState {
  const b64 = code.trim().replace(/^GR1\./, "");
  return JSON.parse(base64Decode(b64));
}
