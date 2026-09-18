// Loading spinner drawing, kept separate from the component so it can be rendered headlessly
// and reviewed. It's the brand's comet trail (brand/README.md: "reuse it in loading spinners,
// transitions") — a ball orbiting a cup, dragging a tapering lime->cyan tail.

import { BlurStyle, PaintStyle, Skia, StrokeCap, type SkCanvas } from "@shopify/react-native-skia";
import { colors } from "../theme/colors";

const TAIL = 26; // segments in the trail
const SWEEP = 2.15; // radians of arc the tail covers

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round((((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** `t` is elapsed seconds; the spinner is a pure function of it so it can be frozen at any frame. */
export function drawLoadingSpinner(canvas: SkCanvas, cx: number, cy: number, radius: number, t: number) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  // the cup it's orbiting
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(Math.max(1, radius * 0.045));
  paint.setColor(Skia.Color("rgba(245,241,228,0.16)"));
  canvas.drawCircle(cx, cy, radius, paint);

  const head = t * 1.9; // radians/sec — unhurried, this sits under a "reading the green" line
  paint.setStyle(PaintStyle.Fill);

  // tail: tapering dots, lime at the head running to cyan at the tip
  for (let i = TAIL; i >= 1; i--) {
    const f = i / TAIL; // 1 = far end of the tail
    const a = head - f * SWEEP;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    const size = radius * 0.11 * (1 - f * 0.82);
    // reach cyan by mid-tail, since the far end fades out before it would otherwise get there
    paint.setColor(Skia.Color(mix(colors.lime, colors.cyan, Math.min(1, f * 1.9))));
    paint.setAlphaf(0.85 * (1 - f) ** 0.9);
    canvas.drawCircle(px, py, Math.max(0.4, size), paint);
  }

  // the ball itself, with a soft glow
  const bx = cx + Math.cos(head) * radius;
  const by = cy + Math.sin(head) * radius;
  paint.setColor(Skia.Color(colors.lime));
  paint.setAlphaf(0.5);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, radius * 0.16, true));
  canvas.drawCircle(bx, by, radius * 0.17, paint);
  paint.setMaskFilter(null);
  paint.setAlphaf(1);
  paint.setColor(Skia.Color("#FBFAF5"));
  canvas.drawCircle(bx, by, radius * 0.13, paint);

  // flag in the middle, so it reads as golf rather than a generic spinner
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeWidth(Math.max(1.2, radius * 0.05));
  paint.setColor(Skia.Color("rgba(245,241,228,0.55)"));
  canvas.drawLine(cx, cy + radius * 0.3, cx, cy - radius * 0.42, paint);
  paint.setStyle(PaintStyle.Fill);
  paint.setColor(Skia.Color(colors.coral));
  const flag = Skia.Path.Make();
  flag.moveTo(cx, cy - radius * 0.42);
  flag.lineTo(cx + radius * 0.3, cy - radius * 0.29);
  flag.lineTo(cx, cy - radius * 0.17);
  flag.close();
  canvas.drawPath(flag, paint);
}
