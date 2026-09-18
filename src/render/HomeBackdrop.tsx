// Ambient comet-trail field for the Home screen — brand/README.md calls the tapering
// lime->cyan trail "the recurring brand device ... reuse it in loading spinners, transitions".
// Same rendering pattern as GreenCanvas: one Picture per frame handed over a Reanimated
// shared value (no React re-render), with reused Paths/Paints so the loop doesn't allocate.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import {
  Canvas,
  PaintStyle,
  Picture,
  Skia,
  StrokeCap,
  type SkColor,
  type SkPicture,
} from "@shopify/react-native-skia";
import { useSharedValue } from "react-native-reanimated";
import { colors } from "../theme/colors";

const MOTES = 26;
const TRAIL = 7;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  age: number;
  color: SkColor;
  trail: number[]; // flattened x,y pairs — avoids a tuple allocation per point
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round((((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function HomeBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sizeRef = useRef(size);
  const motesRef = useRef<Mote[] | null>(null);

  const emptyPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    return recorder.finishRecordingAsPicture();
  }, []);
  const picture = useSharedValue<SkPicture>(emptyPicture);

  // one color per mote, parsed once at spawn rather than per frame
  const palette = useMemo(
    () => Array.from({ length: 8 }, (_, i) => Skia.Color(mixHex(colors.lime, colors.cyan, i / 7))),
    [],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === sizeRef.current.width && height === sizeRef.current.height) return;
    sizeRef.current = { width, height };
    setSize({ width, height });
    motesRef.current = null; // re-seed for the new bounds
  };

  useEffect(() => {
    let raf = 0;
    const recorder = Skia.PictureRecorder();
    const path = Skia.Path.Make();
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeCap(StrokeCap.Round);
    const dot = Skia.Paint();
    dot.setAntiAlias(true);
    dot.setStyle(PaintStyle.Fill);

    let last: number | null = null;

    const spawn = (w: number, h: number, seeded: boolean): Mote => ({
      x: Math.random() * w,
      y: seeded ? Math.random() * h : h + 20,
      vx: (Math.random() - 0.5) * 14,
      vy: -(16 + Math.random() * 26),
      size: 1.4 + Math.random() * 2.2,
      life: 5 + Math.random() * 6,
      age: seeded ? Math.random() * 4 : 0,
      color: palette[Math.floor(Math.random() * palette.length)],
      trail: [],
    });

    const tick = (ts: number) => {
      const { width: w, height: h } = sizeRef.current;
      if (w > 0 && h > 0) {
        if (!motesRef.current) motesRef.current = Array.from({ length: MOTES }, () => spawn(w, h, true));
        const motes = motesRef.current;
        if (last === null) last = ts;
        const dt = reduceMotion ? 0 : Math.min(0.05, (ts - last) / 1000);
        last = ts;

        const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));
        for (const m of motes) {
          if (dt > 0) {
            m.age += dt;
            if (m.age > m.life || m.y < -30) {
              Object.assign(m, spawn(w, h, false));
              continue;
            }
            m.trail.push(m.x, m.y);
            if (m.trail.length > TRAIL * 2) m.trail.splice(0, 2);
            m.x += m.vx * dt;
            m.y += m.vy * dt;
          }
          if (m.trail.length < 4) continue;
          // fade in at birth, out at death — keeps it from popping
          const fade = Math.min(1, m.age * 0.8, (m.life - m.age) * 0.8);
          if (fade <= 0) continue;

          path.rewind();
          path.moveTo(m.trail[0], m.trail[1]);
          for (let i = 2; i < m.trail.length; i += 2) path.lineTo(m.trail[i], m.trail[i + 1]);
          path.lineTo(m.x, m.y);
          stroke.setColor(m.color);
          stroke.setAlphaf(0.16 * fade);
          stroke.setStrokeWidth(m.size * 0.7);
          canvas.drawPath(path, stroke);

          dot.setColor(m.color);
          dot.setAlphaf(0.5 * fade);
          canvas.drawCircle(m.x, m.y, m.size, dot);
        }
        picture.value = recorder.finishRecordingAsPicture();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, palette]);

  return (
    <View style={styles.fill} pointerEvents="none" onLayout={onLayout}>
      {size.width > 0 && (
        <Canvas style={{ width: size.width, height: size.height }}>
          <Picture picture={picture} />
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
