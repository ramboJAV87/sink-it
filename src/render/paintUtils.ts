import { BlurStyle, PaintStyle, Skia, StrokeCap, StrokeJoin, type SkPaint } from "@shopify/react-native-skia";

export function fillPaint(color: string): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(PaintStyle.Fill);
  return p;
}

export function strokePaint(color: string, width: number, cap: StrokeCap = StrokeCap.Butt): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeCap(cap);
  p.setStrokeJoin(StrokeJoin.Round);
  return p;
}

export function withGlow(paint: SkPaint, color: string, blur: number): SkPaint {
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur, true));
  return paint;
}

export function withDash(paint: SkPaint, on: number, off: number, phase = 0): SkPaint {
  const effect = Skia.PathEffect.MakeDash([on, off], phase);
  paint.setPathEffect(effect);
  return paint;
}

export function shade2(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k),
    g = Math.round(((n >> 8) & 255) * k),
    b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
