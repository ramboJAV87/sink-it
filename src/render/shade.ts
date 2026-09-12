// Hillshade + rough texture, rendered once per green to an offscreen image.
// Ported from the pixel loop in buildShade() in prototype/app.html.

import { AlphaType, ColorType, Skia, type SkImage } from "@shopify/react-native-skia";
import { grad, height, inside, type Level } from "../engine/physics";

function hash2(i: number, j: number): number {
  let n = (i * 374761393 + j * 668265263) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number): number {
  const i = Math.floor(x),
    j = Math.floor(y),
    fx = x - i,
    fy = y - j,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}

// canvasW/canvasH are device pixels (already includes dpr); scale is px-per-foot, dpr is device pixel ratio.
export function buildShadeImage(L: Level, canvasW: number, canvasH: number, scale: number, dpr: number): SkImage | null {
  const cell = 3;
  const cw = Math.max(1, Math.ceil(canvasW / cell));
  const ch = Math.max(1, Math.ceil(canvasH / cell));
  const data = new Uint8Array(cw * ch * 4);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const x = ((i + 0.5) * cell) / dpr / scale;
      const y = ((j + 0.5) * cell) / dpr / scale;
      const [gx, gy] = grad(L, x, y);
      const hs = Math.max(-1, Math.min(1, (gx * -0.55 + gy * -0.83) * 8));
      const on = inside(L, x, y);
      const hgt = height(L, x, y);
      const el = Math.max(-1, Math.min(1, hgt / 2.5)); // higher ground reads a touch warmer/lighter
      let r = 38 + el * 10,
        g = 92 + el * 14,
        b = 46 + el * 6;
      if (!on) {
        const nz = vnoise(x * 0.9, y * 0.9) * 0.6 + vnoise(x * 3.1, y * 3.1) * 0.4;
        r = 20 + nz * 10;
        g = 48 + nz * 22;
        b = 24 + nz * 8;
      }
      const vx = (x / L.W - 0.5) * 2,
        vy = (y / L.H - 0.5) * 2,
        vig = 1 - 0.28 * (vx * vx + vy * vy);
      const k = (1 + hs * 0.22) * vig;
      const p = (j * cw + i) * 4;
      data[p] = r * k;
      data[p + 1] = g * k;
      data[p + 2] = b * k;
      data[p + 3] = 255;
    }
  }
  const skData = Skia.Data.fromBytes(data);
  return Skia.Image.MakeImage({ width: cw, height: ch, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, skData, cw * 4);
}
