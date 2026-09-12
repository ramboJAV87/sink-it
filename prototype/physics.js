// Shared physics for the green-reading prototype (feet, seconds). y grows downward on screen.
const G = 32.2, CUP_R = 0.36, MAX_HOLE_SPEED = 5.8;   // cup is ~2x regulation for the game; a fast ball still lips out
// Terrain = optional overall tilt + features. Feature kinds:
//   bump/dip: { x, y, a, s }  gaussian, a>0 mound, a<0 hollow
//   ramp:     { ramp: 'y'|'x', from, to, drop }  smooth fall of `drop` ft between from..to along that axis (a tier)
function sstep(t) { t = Math.max(0, Math.min(1, t)); return t*t*(3 - 2*t); }
function dsstep(t) { if (t <= 0 || t >= 1) return 0; return 6*t*(1 - t); }
function height(L, x, y) {
  let h = L.tilt.dx * x + L.tilt.dy * y;
  for (const f of L.features) {
    if (f.ramp) { const v = f.ramp === 'y' ? y : x; h += -f.drop * sstep((v - f.from) / (f.to - f.from)); continue; }
    const dx = x - f.x, dy = y - f.y; h += f.a * Math.exp(-(dx*dx + dy*dy) / (2*f.s*f.s));
  }
  return h;
}
function grad(L, x, y) {
  let gx = L.tilt.dx, gy = L.tilt.dy;
  for (const f of L.features) {
    if (f.ramp) { const v = f.ramp === 'y' ? y : x, d = -f.drop * dsstep((v - f.from) / (f.to - f.from)) / (f.to - f.from);
      if (f.ramp === 'y') gy += d; else gx += d; continue; }
    const dx = x - f.x, dy = y - f.y, e = f.a * Math.exp(-(dx*dx + dy*dy) / (2*f.s*f.s));
    gx += e * (-dx / (f.s*f.s)); gy += e * (-dy / (f.s*f.s));
  }
  return [gx, gy];
}
// Organic green outline: an ellipse with a few gentle harmonics. inside() replaces the old rectangle test.
function shapeR(S, th) { let r = 1; for (const h of S.h) r += h.a * Math.cos(h.k * th + h.p); return r; }
function inside(L, x, y) { const S = L.shape; if (!S) return x > L.edge && x < L.W - L.edge && y > L.edge && y < L.H - L.edge;
  const dx = (x - S.cx) / S.rx, dy = (y - S.cy) / S.ry; return Math.hypot(dx, dy) < shapeR(S, Math.atan2(dy, dx)); }
function outline(L, n = 96) { const S = L.shape, pts = []; for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, r = shapeR(S, th); pts.push([S.cx + Math.cos(th) * r * S.rx, S.cy + Math.sin(th) * r * S.ry]); } return pts; }
// Simulate a dropped ball from rest. Returns {path:[[x,y]...], holed, dist, x, y}
function simulate(L, x0, y0, dt = 1/240, maxT = 25) {
  const fr = 18 / L.stimp;           // rolling deceleration ft/s^2 (from stimpmeter: v=6ft/s rolls `stimp` ft)
  let x = x0, y = y0, vx = 0, vy = 0, t = 0;
  const path = [[x, y]]; let holed = false, steps = 0, lipped = false, spin = [];
  while (t < maxT) {
    const [gx, gy] = grad(L, x, y);
    const onGreen = inside(L, x, y);
    const f = onGreen ? fr : fr * 4;   // fringe grabs the ball
    let ax = -G * gx, ay = -G * gy;
    const sp = Math.hypot(vx, vy);
    if (sp < 0.05 && Math.hypot(ax, ay) < f) { vx = vy = 0; break; }  // rests on the slope
    if (sp > 0 && sp < 0.35 && (ax*vx + ay*vy)/sp < f) { vx = vy = 0; break; }  // a crawling ball dies in the grass
    if (sp > 0) { ax -= f * vx / sp; ay -= f * vy / sp; }
    vx += ax * dt; vy += ay * dt;
    const nsp = Math.hypot(vx, vy);
    if (sp > 0 && nsp > 0 && (vx*(vx-ax*dt) + vy*(vy-ay*dt)) < 0 && sp < f*dt*1.5) { vx = vy = 0; }
    x += vx * dt; y += vy * dt; t += dt; steps++;
    x = Math.max(0.1, Math.min(L.W - 0.1, x)); y = Math.max(0.1, Math.min(L.H - 0.1, y));
    const dh = Math.hypot(x - L.hole.x, y - L.hole.y);
    if (dh < CUP_R) { const sp2 = Math.hypot(vx, vy), inner = dh < CUP_R * 0.7;       // well over the hole: it drops even with pace; edge of the hole: only a slow ball drops
      if (sp2 < MAX_HOLE_SPEED || (inner && sp2 < 9)) { holed = true; spin = rimSpin(L, x, y, vx, vy, sp2); path.push(...spin); x = L.hole.x; y = L.hole.y; break; }
      if (!lipped) { lipped = true;                                                      // horseshoe: the rim kicks the ball away from the cup and takes some pace off
        const nx = (x - L.hole.x) / dh, ny = (y - L.hole.y) / dh, k = 0.55 * sp2; vx = (vx + nx * k) * 0.88; vy = (vy + ny * k) * 0.88; } }
    if (steps % 4 === 0) path.push([x, y]);
  }
  path.push([x, y]);
  return { path, holed, spin: spin.length > 6, lipped: lipped && !holed, dist: holed ? 0 : Math.hypot(x - L.hole.x, y - L.hole.y), x, y };
}
// The ball catches the rim and spirals in. Faster entry = more of a lap around the cup. Points are 1/60 s apart.
function rimSpin(L, x, y, vx, vy, sp) {
  const pts = []; if (sp < 1.6) { for (let i = 1; i <= 6; i++) pts.push([x + (L.hole.x - x) * i / 6, y + (L.hole.y - y) * i / 6]); return pts; }
  const turns = 0.35 + Math.min(1.2, sp / 6), n = Math.round(14 + turns * 26);
  const ang0 = Math.atan2(y - L.hole.y, x - L.hole.x), dir = (vx * (y - L.hole.y) - vy * (x - L.hole.x)) > 0 ? -1 : 1;   // keep spinning the way it arrived
  for (let i = 1; i <= n; i++) { const t = i / n, a = ang0 + dir * turns * Math.PI * 2 * t, r = CUP_R * 0.78 * (1 - t * t); pts.push([L.hole.x + Math.cos(a) * r, L.hole.y + Math.sin(a) * r]); }
  return pts;
}
function score(r) { return r.holed ? 100 : Math.round(80 * Math.max(0, 1 - r.dist / 8)); }
const LEVELS = [
  { name: "Straight downhill", stimp: 10, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 4, y: 4, w: 22, h: 8 }, hole: { x: 15, y: 33 },
    features: [{ ramp: 'y', from: 1, to: 20, drop: 1.6 }, { ramp: 'y', from: 34, to: 42, drop: -0.6 }, { x: 15, y: 33, a: -0.5, s: 9 }], target: 60, reveal: "full",
    tip: "Drop anywhere in the marked zone. The slope runs out before the cup and the ground rises behind it, so line matters more than pace here." },
  { name: "Side hill", stimp: 10, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 3, y: 4, w: 10, h: 11 }, hole: { x: 20, y: 31 },
    features: [{ ramp: 'y', from: 1, to: 23, drop: 2 }, { ramp: 'x', from: 3, to: 18, drop: 1.3 }, { ramp: 'y', from: 32, to: 42, drop: -0.6 }, { ramp: 'x', from: 21, to: 28, drop: -0.5 }, { x: 20, y: 31, a: -0.5, s: 8 }], target: 55, reveal: "full",
    tip: "The green falls down and to the right, and the far edges rise. Play the break." },
  { name: "The bowl", stimp: 10, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 3, y: 6, w: 6, h: 32 }, hole: { x: 17.5, y: 25 },
    features: [{ x: 15, y: 24, a: -2.2, s: 8 }], target: 55, reveal: "fog",
    tip: "From here on you only see the ground inside your drop zone. Every ball you roll reveals what it crossed." },
  { name: "Around the ridge", stimp: 10.5, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 4, y: 4, w: 22, h: 6 }, hole: { x: 16, y: 33 },
    features: [{ ramp: 'y', from: 1, to: 26, drop: 2 }, { ramp: 'x', from: 1, to: 7, drop: 0.4 }, { ramp: 'x', from: 23, to: 29, drop: -0.4 }, { x: 12, y: 19, a: 0.6, s: 4.5 }, { ramp: 'y', from: 34, to: 42, drop: -0.6 }, { x: 16, y: 33, a: -0.8, s: 8 }], target: 55, reveal: "fog",
    tip: "A mound sits left of center between the zone and the cup. Use its shoulder." },
  { name: "Double breaker", stimp: 12, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 3, y: 4, w: 12, h: 7 }, hole: { x: 20, y: 36 },
    features: [{ ramp: 'y', from: 1, to: 30, drop: 1.7 }, { ramp: 'x', from: 1, to: 7, drop: 0.7 }, { ramp: 'x', from: 23, to: 29, drop: -0.7 }, { x: 9, y: 20, a: 0.9, s: 4 }, { x: 21, y: 27, a: -0.7, s: 4 }, { ramp: 'y', from: 37, to: 42, drop: -0.5 }, { x: 20, y: 36, a: -0.4, s: 8 }], target: 60, reveal: "fog",
    tip: "Faster green. A mound on the left, a dip on the right, and the cup past both." },
  { name: "Tabletop", stimp: 13, W: 30, H: 44, edge: 1.5, tilt: { dx: 0, dy: 0 }, zone: { x: 4, y: 4, w: 22, h: 5 }, hole: { x: 15, y: 36 },
    features: [{ ramp: 'y', from: 1, to: 12, drop: 1.4 }, { ramp: 'y', from: 20, to: 30, drop: 0.6 }, { ramp: 'x', from: 1, to: 7, drop: 0.7 }, { ramp: 'x', from: 23, to: 29, drop: -0.7 }, { x: 15, y: 25, a: 0.8, s: 3.5 }, { ramp: 'y', from: 37, to: 42, drop: -0.5 }, { x: 15, y: 36, a: -0.4, s: 8 }], target: 65, reveal: "fog",
    tip: "Championship speed and a flat shelf halfway down. Drop too low and the ball dies on the shelf." },
];
if (typeof module !== "undefined") module.exports = { LEVELS, simulate, score, grad, height, CUP_R, inside, outline, shapeR };
