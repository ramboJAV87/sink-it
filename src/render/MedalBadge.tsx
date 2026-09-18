import React, { useMemo } from "react";
import { Canvas, Picture, Skia, useFont } from "@shopify/react-native-skia";
import type { Medal } from "../game/round";
import { drawMedal } from "./medal";
import { poppinsBoldSkiaSource } from "../theme/fonts";

/** Static badge — drawn once per medal, not animated, so no frame loop here. */
export function MedalBadge({ medal, size = 132 }: { medal: Medal; size?: number }) {
  const r = size * 0.34;
  const font = useFont(poppinsBoldSkiaSource, Math.round(r * 0.36));

  const picture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, size, size));
    drawMedal(canvas, medal, size / 2, size / 2 - size * 0.05, r, font);
    return recorder.finishRecordingAsPicture();
  }, [medal, size, r, font]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
