// The live game surface: state machine + Skia drawing, ported from the <script> in
// prototype/app.html (start/setup/drop/loop/draw/celebrate/flashZone/updateFlow/netPull/spawn).
//
// Coordinate note: unlike the HTML prototype (which manually scales a raw <canvas> element
// for devicePixelRatio), react-native-skia's <Canvas> already renders crisply at native
// resolution for whatever size you draw at. So here everything is drawn in dp ("feet * scale")
// with no separate dpr multiplier — dpr is only used once, to size the offscreen hillshade
// texture so it doesn't look soft on high-density screens.

import {
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  type SkCanvas,
  type SkFont,
  type SkImage,
  type SkPaint,
} from "@shopify/react-native-skia";
import { CUP_R, G, grad, inside, outline, score, simulate, type Level, type SimResult } from "../engine/physics";
import { buildScene, type Scene } from "./scene";
import { buildShadeImage } from "./shade";
import { fillPaint, shade2, strokePaint, withDash, withGlow } from "./paintUtils";

export type GameMode = "daily" | "play" | "custom";

interface BallVisual {
  x: number;
  y: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  s: number;
  c: string;
  life: number;
}

interface FlowParticle {
  x: number;
  y: number;
  life: number;
  age: number;
  tx: [number, number][];
}

interface RollState {
  r: SimResult;
  path: [number, number][];
  k: number;
  acc: number;
  t0: number | null;
  rattled: boolean;
}

interface Cam {
  z: number;
  cx: number;
  cy: number;
}

export interface EditMarker {
  x: number;
  y: number;
  a: number;
  s: number;
}

export interface BallOutcome {
  result: SimResult;
  points: number;
  best: number;
  ballsLeft: number;
}

export interface GreenGameCallbacks {
  onBallsChange?: (balls: number) => void;
  onBallOutcome?: (o: BallOutcome) => void;
  onHoled?: (o: BallOutcome) => void;
  onZoneMiss?: () => void;
  onRollStart?: () => void;
}

const CONFETTI_COLORS = ["#FFD166", "#FF5A5F", "#B8F53D", "#4CE0D2", "#FF7EB6"];

export class GreenGame {
  L!: Level;
  scale = 1; // dp per foot
  private dpr = 1;
  widthDp = 0;
  heightDp = 0;
  private shadeImage: SkImage | null = null;
  private scene: Scene = { trees: [], bunkers: [], crowd: [] };

  mode: GameMode = "play";
  balls = 0;
  best = 0;
  private trails: [number, number][][] = [];
  private ball: BallVisual | null = null;
  private particles: Particle[] = [];
  private flagShake = 0;
  private zoneFlash = 0;
  private celebrateT = 0;
  private cheer = 0;
  private roll: RollState | null = null;
  aim: [number, number] | null = null;
  private flow: FlowParticle[] = [];
  private cam: Cam = { z: 1, cx: 0, cy: 0 };
  private lastTs: number | null = null;
  editMarkers: EditMarker[] | null = null;

  private reduceMotion: boolean;
  private readonly callbacks: GreenGameCallbacks;

  // reusable paints — mutate + draw, mirrors setting ctx.fillStyle/strokeStyle in the prototype
  private pFill: SkPaint = Skia.Paint();
  private pStroke: SkPaint = Skia.Paint();

  constructor(callbacks: GreenGameCallbacks = {}, reduceMotion = false) {
    this.callbacks = callbacks;
    this.reduceMotion = reduceMotion;
  }

  private fill(color: string): SkPaint {
    const p = this.pFill;
    p.setMaskFilter(null);
    p.setPathEffect(null);
    p.setShader(null);
    p.setStyle(PaintStyle.Fill);
    p.setAntiAlias(true);
    p.setAlphaf(1);
    p.setColor(Skia.Color(color));
    return p;
  }

  private stroke(color: string, width: number, cap: StrokeCap = StrokeCap.Butt): SkPaint {
    const p = this.pStroke;
    p.setMaskFilter(null);
    p.setPathEffect(null);
    p.setShader(null);
    p.setStyle(PaintStyle.Stroke);
    p.setAntiAlias(true);
    p.setAlphaf(1);
    p.setStrokeWidth(width);
    p.setStrokeCap(cap);
    p.setColor(Skia.Color(color));
    return p;
  }

  px(v: number): number {
    return v * this.scale;
  }

  setReduceMotion(v: boolean) {
    this.reduceMotion = v;
  }

  private thr(): number {
    return 18 / this.L.stimp / G;
  }

  setup(level: Level, mode: GameMode, ballsCount: number) {
    this.L = level;
    this.mode = mode;
    this.balls = ballsCount;
    this.best = 0;
    this.trails = [];
    this.ball = null;
    this.particles = [];
    this.flagShake = 0;
    this.zoneFlash = 0;
    this.celebrateT = 0;
    this.cheer = 0;
    this.roll = null;
    this.aim = null;
    this.editMarkers = null;
    this.scene = buildScene(level);
    this.cam = { z: 1, cx: level.W / 2, cy: level.H / 2 };
    this.flow = Array.from({ length: 170 }, () => this.spawn());
    this.lastTs = null;
    this.shadeImage = null;
  }

  layout(widthDp: number, heightDp: number, dpr: number) {
    this.widthDp = widthDp;
    this.heightDp = heightDp;
    this.scale = widthDp / this.L.W;
    this.dpr = dpr;
    this.shadeImage = buildShadeImage(this.L, Math.round(widthDp * dpr), Math.round(heightDp * dpr), this.scale, dpr);
  }

  private inZone(x: number, y: number): boolean {
    const z = this.L.zone;
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  private clampZone(x: number, y: number): [number, number] {
    const z = this.L.zone;
    return [Math.max(z.x + 0.2, Math.min(z.x + z.w - 0.2, x)), Math.max(z.y + 0.2, Math.min(z.y + z.h - 0.2, y))];
  }

  toGreen(xDp: number, yDp: number): [number, number] {
    return [xDp / this.scale, yDp / this.scale];
  }

  onPointerDown(xDp: number, yDp: number) {
    if (this.balls <= 0 || this.roll || this.celebrateT > 0 || !this.L) return;
    const [x, y] = this.toGreen(xDp, yDp);
    if (!this.inZone(x, y)) {
      this.zoneFlash = 1;
      this.callbacks.onZoneMiss?.();
      return;
    }
    this.aim = this.clampZone(x, y);
  }

  onPointerMove(xDp: number, yDp: number) {
    if (!this.aim) return;
    this.aim = this.clampZone(...this.toGreen(xDp, yDp));
  }

  onPointerUp() {
    if (!this.aim) return;
    const [x, y] = this.aim;
    this.aim = null;
    this.drop(x, y);
  }

  private drop(x: number, y: number) {
    if (this.roll || this.celebrateT > 0 || this.balls <= 0) return;
    const r = simulate(this.L, x, y);
    this.balls--;
    this.callbacks.onBallsChange?.(this.balls);
    this.ball = { x, y, size: 2.2 };
    this.roll = { r, path: r.path, k: 0, acc: 0, t0: null, rattled: false };
    this.callbacks.onRollStart?.();
  }

  private celebrate(r: SimResult) {
    if (!this.reduceMotion) {
      for (let i = 0; i < 110; i++) {
        const a = Math.random() * Math.PI * 2,
          sp = 6 + Math.random() * 16;
        this.particles.push({
          x: this.L.hole.x,
          y: this.L.hole.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 9,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 12,
          s: 2 + Math.random() * 3.5,
          c: CONFETTI_COLORS[i % 5],
          life: 1.2 + Math.random() * 0.6,
        });
      }
    }
    this.flagShake = 1;
    this.celebrateT = 0.001;
    const pts = score(r);
    this.best = Math.max(this.best, pts);
    const outcome: BallOutcome = { result: r, points: pts, best: this.best, ballsLeft: this.balls };
    this.callbacks.onHoled?.(outcome);
  }

  private spawn(): FlowParticle {
    let x = 0,
      y = 0,
      t = 0;
    do {
      x = this.L.edge + Math.random() * (this.L.W - 2 * this.L.edge);
      y = this.L.edge + Math.random() * (this.L.H - 2 * this.L.edge);
    } while (!inside(this.L, x, y) && ++t < 20);
    return { x, y, life: 2 + Math.random() * 4, age: Math.random() * 3, tx: [] };
  }

  private netPull(x: number, y: number): [number, number, number] {
    const [gx, gy] = grad(this.L, x, y),
      m = Math.hypot(gx, gy),
      n = Math.max(0, m - this.thr());
    return n > 0 ? [(-gx / m) * n, (-gy / m) * n, n] : [0, 0, 0];
  }

  private updateFlow(dt: number) {
    for (let i = 0; i < this.flow.length; i++) {
      const p = this.flow[i];
      const [ux, uy, n] = this.netPull(p.x, p.y);
      p.age += dt;
      if (n <= 0 || p.age > p.life || !inside(this.L, p.x, p.y)) {
        this.flow[i] = this.spawn();
        continue;
      }
      const sp = 1.2 + n * 22;
      p.tx.push([p.x, p.y]);
      if (p.tx.length > 10) p.tx.shift();
      p.x += (ux / n) * sp * dt;
      p.y += (uy / n) * sp * dt;
    }
  }

  // advance simulation state by dt (seconds). Call once per animation frame, then draw().
  step(ts: number) {
    if (!this.L) return;
    if (this.lastTs === null) this.lastTs = ts;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.updateFlow(dt);

    let wantZ = 1,
      tx = this.L.W / 2,
      ty = this.L.H / 2,
      slowing = false;

    if (this.roll) {
      const { r, path } = this.roll;
      if (this.roll.t0 === null) this.roll.t0 = ts;
      const dropT = Math.min(1, (ts - this.roll.t0) / 320);
      this.ball!.size = 2.2 - 1.2 * (1 - Math.pow(1 - dropT, 2));
      if (dropT >= 1) {
        const dc = Math.hypot(this.ball!.x - this.L.hole.x, this.ball!.y - this.L.hole.y);
        slowing = dc < 3.2 && (r.holed || this.roll.k < path.length - 40);
        if (r.spin && !this.roll.rattled && dc < CUP_R * 0.9) {
          this.roll.rattled = true;
        }
        this.roll.acc += slowing && !this.reduceMotion ? 0.4 : this.roll.k > 540 ? 2 : 1;
        while (this.roll.acc >= 1 && this.roll.k < path.length - 1) {
          this.roll.acc -= 1;
          this.roll.k++;
        }
        this.ball!.x = path[this.roll.k][0];
        this.ball!.y = path[this.roll.k][1];
        const d2 = Math.hypot(this.ball!.x - this.L.hole.x, this.ball!.y - this.L.hole.y);
        this.ball!.size = r.lipped && d2 < CUP_R * 1.6 ? 1.35 : 1;
        if (this.roll.k >= path.length - 1) {
          this.trails.push(path);
          const pts = score(r);
          this.best = Math.max(this.best, pts);
          if (r.holed) {
            this.roll = null;
            this.celebrate(r);
          } else {
            const outcome: BallOutcome = { result: r, points: pts, best: this.best, ballsLeft: this.balls };
            this.roll = null;
            this.callbacks.onBallOutcome?.(outcome);
          }
        }
      }
    }

    if ((slowing || this.celebrateT > 0) && !this.reduceMotion) {
      wantZ = 2.1;
      tx = this.L.hole.x;
      ty = this.L.hole.y;
    }
    const halfW = this.L.W / 2 / wantZ,
      halfH = this.L.H / 2 / wantZ;
    tx = Math.max(halfW, Math.min(this.L.W - halfW, tx));
    ty = Math.max(halfH, Math.min(this.L.H - halfH, ty));
    const e = 1 - Math.pow(0.02, dt);
    this.cam.z += (wantZ - this.cam.z) * e;
    this.cam.cx += (tx - this.cam.cx) * e;
    this.cam.cy += (ty - this.cam.cy) * e;

    if (this.celebrateT > 0) {
      if (this.ball) {
        this.ball.size = Math.max(0, this.ball.size - dt * 5);
        if (this.ball.size <= 0) this.ball = null;
      }
      for (const p of this.particles) {
        p.vy += 22 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.vx *= 0.985;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      this.flagShake = Math.max(0, this.flagShake - dt * 1.4);
      this.celebrateT += dt;
      if (this.celebrateT > 1.6 && !this.particles.length) this.celebrateT = 0;
    }
    this.cheer = this.celebrateT > 0 ? Math.min(1, this.cheer + dt * 4) : Math.max(0, this.cheer - dt * 1.5);
    if (this.zoneFlash > 0) this.zoneFlash = Math.max(0, this.zoneFlash - dt * 4);
  }

  draw(canvas: SkCanvas, font: SkFont | null) {
    const L = this.L;
    if (!L) return;
    const w = this.widthDp,
      h = this.heightDp;
    canvas.drawColor(Skia.Color("#0E1510"));
    canvas.save();
    canvas.translate(w / 2, h / 2);
    canvas.scale(this.cam.z, this.cam.z);
    canvas.translate(-this.px(this.cam.cx), -this.px(this.cam.cy));

    if (this.shadeImage) {
      canvas.drawImageRect(
        this.shadeImage,
        Skia.XYWHRect(0, 0, this.shadeImage.width(), this.shadeImage.height()),
        Skia.XYWHRect(0, 0, w, h),
        this.fill("white"),
      );
    }

    this.drawScene(canvas, performance.now() / 1000);

    const outlinePts = outline(L).map(([x, y]) => Skia.Point(this.px(x), this.px(y)));
    const outlinePath = Skia.Path.Make();
    outlinePath.addPoly(outlinePts, true);

    canvas.save();
    canvas.clipPath(outlinePath, ClipOp.Intersect, true);
    const stripe = this.fill("rgba(255,255,255,0.035)");
    for (let y = 0; y < L.H; y += 4) canvas.drawRect(Skia.XYWHRect(0, this.px(y), w, this.px(2)), stripe);
    canvas.restore();

    const glowStroke = withGlow(this.stroke("rgba(255,255,255,0.22)", 2), "rgba(0,0,0,0.5)", 7);
    canvas.drawPath(outlinePath, glowStroke);
    canvas.drawPath(outlinePath, this.stroke("rgba(120,180,110,0.25)", this.px(1.4)));

    // flowing current
    for (const p of this.flow) {
      if (p.tx.length < 3) continue;
      const [ux, uy, n] = this.netPull(p.x, p.y);
      if (n <= 0) continue;
      const fade = Math.min(1, p.age * 1.2, (p.life - p.age) * 1.2),
        a = (0.22 + Math.min(0.5, n * 8)) * fade,
        lw = 1 + Math.min(1.4, n * 16);
      const path = Skia.Path.Make();
      path.moveTo(this.px(p.tx[0][0]), this.px(p.tx[0][1]));
      for (let k = 1; k < p.tx.length; k++) path.lineTo(this.px(p.tx[k][0]), this.px(p.tx[k][1]));
      path.lineTo(this.px(p.x), this.px(p.y));
      canvas.drawPath(path, this.stroke(`rgba(242,235,221,${a})`, lw, StrokeCap.Round));
      const dx = ux / n,
        dy = uy / n,
        hx2 = this.px(p.x),
        hy2 = this.px(p.y),
        hw = 2.2 + lw * 0.6;
      const head = Skia.Path.Make();
      head.addPoly(
        [
          Skia.Point(hx2 + dx * hw * 1.6, hy2 + dy * hw * 1.6),
          Skia.Point(hx2 - dy * hw, hy2 + dx * hw),
          Skia.Point(hx2 + dy * hw, hy2 - dx * hw),
        ],
        true,
      );
      canvas.drawPath(head, this.fill(`rgba(242,235,221,${a})`));
    }

    // resting spots
    const rest = this.fill("rgba(242,235,221,0.3)");
    for (let y = L.edge + 1.5; y < L.H - L.edge; y += 3)
      for (let x = L.edge + 1.5; x < L.W - L.edge; x += 3) {
        if (!inside(L, x, y) || this.netPull(x, y)[2] > 0) continue;
        canvas.drawCircle(this.px(x), this.px(y), 1.4, rest);
      }

    // drop zone
    const z = L.zone;
    const zoneRRect = Skia.RRectXY(Skia.XYWHRect(this.px(z.x), this.px(z.y), this.px(z.w), this.px(z.h)), this.px(2.5), this.px(2.5));
    canvas.drawRRect(zoneRRect, this.fill("rgba(184,245,61,0.07)"));
    canvas.drawRRect(zoneRRect, withDash(this.stroke("rgba(184,245,61,0.9)", 2.2), this.px(0.6), this.px(0.45)));
    if (this.balls > 0 && !this.ball && font) {
      this.centerText(canvas, "DROP ZONE", this.px(z.x + z.w / 2), this.px(z.y) - 6, this.fill("#B8F53D"), font);
    }

    // trails
    for (const t of this.trails) {
      const path = Skia.Path.Make();
      t.forEach(([x, y], k) => (k ? path.lineTo(this.px(x), this.px(y)) : path.moveTo(this.px(x), this.px(y))));
      canvas.drawPath(path, withGlow(this.stroke("rgba(255,209,102,0.95)", 2, StrokeCap.Round), "rgba(255,209,102,0.9)", 5));
    }

    // cup + flag
    const hx = this.px(L.hole.x),
      hy = this.px(L.hole.y),
      cr = this.px(CUP_R);
    canvas.drawCircle(hx, hy, cr + 1.5, withGlow(this.fill("rgba(242,235,221,0.95)"), "rgba(242,235,221,0.6)", 5));
    canvas.drawCircle(hx, hy, cr, this.fill("#07100A"));
    const wob = this.flagShake > 0 ? Math.sin(this.flagShake * 40) * this.flagShake * 0.35 : 0;
    canvas.save();
    canvas.rotate((wob * 180) / Math.PI, hx, hy);
    canvas.drawLine(hx, hy, hx, hy - this.px(3.2), this.stroke("#F2EBDD", 1.6));
    const flagPath = Skia.Path.Make();
    flagPath.addPoly(
      [Skia.Point(hx, hy - this.px(3.2)), Skia.Point(hx + this.px(1.9), hy - this.px(2.7)), Skia.Point(hx, hy - this.px(2.15))],
      true,
    );
    canvas.drawPath(flagPath, this.fill("#FF5A5F"));
    canvas.restore();

    if (this.zoneFlash > 0) {
      canvas.drawRRect(zoneRRect, this.stroke(`rgba(255,90,95,${this.zoneFlash})`, 3));
    }

    if (this.editMarkers) {
      for (const marker of this.editMarkers) {
        const color = marker.a > 0 ? "#FFD166" : "#4CE0D2";
        canvas.drawCircle(this.px(marker.x), this.px(marker.y), this.px(marker.s * 0.8), withDash(this.stroke(color, 2), this.px(0.3), this.px(0.3)));
        if (font) this.centerTextMiddle(canvas, marker.a > 0 ? "▲" : "▼", this.px(marker.x), this.px(marker.y), this.fill(color), font);
      }
    }

    if (this.aim) {
      const [ax0, ay0] = this.aim;
      const ax = this.px(ax0),
        ay = this.px(ay0);
      const dist = Math.hypot(ax0 - L.hole.x, ay0 - L.hole.y);
      const dashLine = withDash(this.stroke("rgba(255,255,255,0.45)", 1.5), this.px(0.4), this.px(0.5));
      canvas.drawLine(ax, ay, hx, hy, dashLine);
      canvas.drawCircle(ax, ay, this.px(0.9), this.stroke("#B8F53D", 2.5));
      canvas.drawCircle(ax, ay, this.px(0.22), this.fill("#FFFFFF"));
      if (font) {
        const label = `${dist.toFixed(0)} ft`;
        const tw = font.measureText(label).width + 16;
        const rr = Skia.RRectXY(Skia.XYWHRect(ax - tw / 2, ay - this.px(2.6) - 10, tw, 20), 10, 10);
        canvas.drawRRect(rr, this.fill("#B8F53D"));
        this.centerTextMiddle(canvas, label, ax, ay - this.px(2.6), this.fill("#0B1410"), font);
      }
    }

    if (this.ball) {
      const bx = this.px(this.ball.x),
        by = this.px(this.ball.y),
        r = this.px(0.22) * this.ball.size;
      canvas.drawOval(Skia.XYWHRect(bx + r * 0.35 - r * 0.95, by + r * 0.45 - r * 0.6, r * 1.9, r * 1.2), this.fill("rgba(0,0,0,0.35)"));
      canvas.drawCircle(bx, by, r, withGlow(this.fill("#FBFAF5"), "rgba(251,250,245,0.8)", 4));
    }

    for (const p of this.particles) {
      canvas.save();
      canvas.translate(this.px(p.x), this.px(p.y));
      canvas.rotate((p.rot * 180) / Math.PI, 0, 0);
      const paint = this.fill(p.c);
      paint.setAlphaf(Math.max(0, Math.min(1, p.life)));
      canvas.drawRect(Skia.XYWHRect(-p.s, -p.s * 0.6, p.s * 2, p.s * 1.2), paint);
      canvas.restore();
    }

    if (this.celebrateT > 0 && this.celebrateT < 1.4 && font) {
      const k = Math.min(1, this.celebrateT * 3),
        pop = 1 + 0.25 * Math.sin(Math.min(1, this.celebrateT * 2) * Math.PI);
      const alpha = this.celebrateT > 1 ? (1.4 - this.celebrateT) / 0.4 : 1;
      const layerPaint = Skia.Paint();
      layerPaint.setAlphaf(Math.max(0, Math.min(1, alpha)));
      canvas.saveLayer(layerPaint);
      canvas.translate(hx, hy - this.px(6));
      canvas.scale((pop * k) / this.cam.z, (pop * k) / this.cam.z);
      const big = Skia.Font(font.getTypeface() ?? undefined, 36);
      const text = "IN THE CUP!";
      const tw = big.measureText(text).width;
      canvas.drawText(text, -tw / 2, 0, this.stroke("rgba(11,20,16,0.9)", 7), big);
      canvas.drawText(text, -tw / 2, 0, this.fill("#B8F53D"), big);
      canvas.restore();
    }

    canvas.restore(); // camera
  }

  private centerText(canvas: SkCanvas, text: string, cx: number, y: number, paint: SkPaint, font: SkFont) {
    const w = font.measureText(text).width;
    canvas.drawText(text, cx - w / 2, y, paint, font);
  }

  private centerTextMiddle(canvas: SkCanvas, text: string, cx: number, cy: number, paint: SkPaint, font: SkFont) {
    const w = font.measureText(text).width;
    const m = font.getMetrics();
    const baseline = cy - (m.ascent + m.descent) / 2;
    canvas.drawText(text, cx - w / 2, baseline, paint, font);
  }

  private drawScene(canvas: SkCanvas, t: number) {
    const scene = this.scene;
    for (const b of scene.bunkers) {
      const bx = this.px(b.x),
        by = this.px(b.y);
      const blob = (m: number) => {
        const pts = Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * 6.283,
            wgt = b.w[i] * m;
          return Skia.Point(bx + Math.cos(a + b.a) * this.px(b.rx) * wgt, by + Math.sin(a + b.a) * this.px(b.ry) * wgt);
        });
        const path = Skia.Path.Make();
        path.addPoly(pts, true);
        return path;
      };
      canvas.save();
      canvas.translate(this.px(0.25), this.px(0.3));
      canvas.drawPath(blob(1.04), this.fill("rgba(0,0,0,0.35)"));
      canvas.restore();
      canvas.drawPath(blob(1), this.fill("#C9B98A"));
      canvas.drawPath(blob(0.86), this.fill("#E3D6AE"));
    }
    for (const tr of scene.trees) {
      const x = this.px(tr.x),
        y = this.px(tr.y),
        s = this.px(tr.s);
      const sway = Math.sin(t * 0.7 + tr.k * 6) * s * 0.02;
      canvas.drawOval(Skia.XYWHRect(x + s * 0.35 - s, y + s * 0.45 - s * 0.7, s * 2, s * 1.4), this.fill("rgba(0,0,0,0.42)"));
      for (const [a, d, k] of tr.lobes) {
        const lx = x + Math.cos(a) * d * s + sway,
          ly = y + Math.sin(a) * d * s;
        canvas.drawCircle(lx, ly, k * s, this.fill("#3F8A44"));
      }
      canvas.drawCircle(x + sway, y, s * 0.55, this.fill("#5B9E58"));
    }
    for (const p of scene.crowd) {
      const x = this.px(p.x),
        hgt = this.px(2.3);
      const hop = this.cheer > 0 ? Math.abs(Math.sin(t * 9 + p.ph)) * hgt * 0.22 * this.cheer : 0;
      const yBase = this.px(p.y);
      const y = yBase - hop,
        f = p.face;
      canvas.drawOval(Skia.XYWHRect(x + hgt * 0.05 - hgt * 0.3, yBase + hgt * 0.02 - hgt * 0.11, hgt * 0.6, hgt * 0.22), this.fill("rgba(0,0,0,0.38)"));
      const legs = Skia.RRectXY(Skia.XYWHRect(x - hgt * 0.2, y - hgt * 0.5, hgt * 0.17, hgt * 0.5), hgt * 0.06, hgt * 0.06);
      canvas.drawRRect(legs, this.fill("#2B2F3A"));
      const legs2 = Skia.RRectXY(Skia.XYWHRect(x + hgt * 0.03, y - hgt * 0.5, hgt * 0.17, hgt * 0.5), hgt * 0.06, hgt * 0.06);
      canvas.drawRRect(legs2, this.fill("#2B2F3A"));
      const shirt = Skia.RRectXY(Skia.XYWHRect(x - hgt * 0.3, y - hgt * 0.98, hgt * 0.6, hgt * 0.55), hgt * 0.14, hgt * 0.14);
      canvas.drawRRect(shirt, this.fill(shade2(p.c, 0.85)));
      const armPaint = this.stroke(p.skin, hgt * 0.13, StrokeCap.Round);
      if (this.cheer > 0.3) {
        canvas.drawLine(x - hgt * 0.28, y - hgt * 0.85, x - hgt * 0.5, y - hgt * 1.3, armPaint);
        canvas.drawLine(x + hgt * 0.28, y - hgt * 0.85, x + hgt * 0.5, y - hgt * 1.3, this.stroke(p.skin, hgt * 0.13, StrokeCap.Round));
      } else {
        canvas.drawLine(x - hgt * 0.28, y - hgt * 0.85, x - hgt * 0.36, y - hgt * 0.5, armPaint);
        canvas.drawLine(x + hgt * 0.28, y - hgt * 0.85, x + hgt * 0.36, y - hgt * 0.5, this.stroke(p.skin, hgt * 0.13, StrokeCap.Round));
      }
      canvas.drawCircle(x, y - hgt * 1.18, hgt * 0.2, this.fill(p.skin));
      if (p.hat) {
        canvas.drawArc(Skia.XYWHRect(x - hgt * 0.21, y - hgt * 1.22 - hgt * 0.21, hgt * 0.42, hgt * 0.42), 180, 180, false, this.fill("#F7F7F7"));
        const brim = Skia.RRectXY(Skia.XYWHRect(x - hgt * 0.05 + f * hgt * 0.06, y - hgt * 1.24, hgt * 0.28, hgt * 0.07), hgt * 0.03, hgt * 0.03);
        canvas.drawRRect(brim, this.fill("#F7F7F7"));
      } else {
        canvas.drawArc(Skia.XYWHRect(x - hgt * 0.2, y - hgt * 1.22 - hgt * 0.2, hgt * 0.4, hgt * 0.4), 189, 162, false, this.fill(p.hair));
      }
    }
  }
}
