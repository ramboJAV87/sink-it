// The medal badge, drawn in Skia rather than assembled from RN views — it's the reward
// moment, so it wants a glow and a gradient, and drawing it here also means it can be
// rendered headlessly and actually looked at (see the render-check harness).

import { BlurStyle, PaintStyle, Skia, StrokeCap, TileMode, type SkCanvas, type SkFont } from "@shopify/react-native-skia";
import type { Medal } from "../game/round";
import { colors } from "../theme/colors";

interface MedalPalette {
  from: string;
  to: string;
  ring: string;
  ink: string;
  glow: string;
}

const PALETTES: Record<Medal, MedalPalette> = {
  // Ace is the brand's hero gradient at full strength; the rest step down in energy.
  ace: { from: colors.lime, to: colors.cyan, ring: "#EAFFC0", ink: colors.ink, glow: "rgba(184,245,61,0.55)" },
  birdie: { from: colors.cyan, to: "#2FA9A0", ring: "#B6FFF6", ink: colors.ink, glow: "rgba(76,224,210,0.45)" },
  par: { from: colors.gold, to: "#E0A030", ring: "#FFE9B8", ink: colors.ink, glow: "rgba(255,209,102,0.45)" },
  bogey: { from: "#5A6B60", to: "#38473E", ring: "rgba(245,241,228,0.55)", ink: colors.cream, glow: "rgba(245,241,228,0.18)" },
};

/**
 * Draws a medal centred at (cx, cy). `r` is the disc radius; the glow extends past it, so
 * give the canvas roughly r * 2.6 of room in each direction.
 */
export function drawMedal(canvas: SkCanvas, medal: Medal, cx: number, cy: number, r: number, labelFont: SkFont | null) {
  const pal = PALETTES[medal];
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  // outer glow
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(Skia.Color(pal.glow));
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, r * 0.38, true));
  canvas.drawCircle(cx, cy, r * 1.02, paint);
  paint.setMaskFilter(null);

  // gradient disc
  paint.setShader(
    Skia.Shader.MakeLinearGradient(
      Skia.Point(cx - r, cy - r),
      Skia.Point(cx + r, cy + r),
      [Skia.Color(pal.from), Skia.Color(pal.to)],
      null,
      TileMode.Clamp,
    ),
  );
  canvas.drawCircle(cx, cy, r, paint);
  paint.setShader(null);

  // bright inner rim, then a hairline outer ring
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(1.5, r * 0.055));
  paint.setColor(Skia.Color(pal.ring));
  paint.setAlphaf(0.9);
  canvas.drawCircle(cx, cy, r * 0.86, paint);
  paint.setAlphaf(0.35);
  paint.setStrokeWidth(Math.max(1, r * 0.03));
  canvas.drawCircle(cx, cy, r * 0.99, paint);

  // two little ribbon notches at the bottom, so it reads as a medal rather than a coin
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeWidth(r * 0.14);
  paint.setColor(Skia.Color(pal.from));
  paint.setAlphaf(0.85);
  canvas.drawLine(cx - r * 0.34, cy + r * 0.98, cx - r * 0.16, cy + r * 1.5, paint);
  canvas.drawLine(cx + r * 0.34, cy + r * 0.98, cx + r * 0.16, cy + r * 1.5, paint);

  if (!labelFont) return;
  const label = MEDAL_LABEL[medal].toUpperCase();
  const width = labelFont.measureText(label).width;
  const metrics = labelFont.getMetrics();
  const baseline = cy - (metrics.ascent + metrics.descent) / 2;
  const text = Skia.Paint();
  text.setAntiAlias(true);
  text.setColor(Skia.Color(pal.ink));
  canvas.drawText(label, cx - width / 2, baseline, text, labelFont);
}

const MEDAL_LABEL: Record<Medal, string> = {
  ace: "Ace",
  birdie: "Birdie",
  par: "Par",
  bogey: "Bogey",
};
