import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, Picture, Skia, type SkPicture } from "@shopify/react-native-skia";
import { useSharedValue } from "react-native-reanimated";
import { drawLoadingSpinner } from "./loadingSpinner";
import { colors } from "../theme/colors";

const SIZE = 132;

/**
 * Shown while a green is being generated. Generating one is genuinely slow (the fairness
 * solver runs a full physics sim per candidate layout, and unlucky seeds need dozens), so
 * this can be on screen for a few seconds and needs to look deliberate rather than stuck.
 */
export function LoadingGreen({ reduceMotion, caption = "Reading the green…" }: { reduceMotion: boolean; caption?: string }) {
  const emptyPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    return recorder.finishRecordingAsPicture();
  }, []);
  const picture = useSharedValue<SkPicture>(emptyPicture);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const recorder = Skia.PictureRecorder();
    const render = (t: number) => {
      const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, SIZE, SIZE));
      drawLoadingSpinner(canvas, SIZE / 2, SIZE / 2, SIZE * 0.34, t);
      picture.value = recorder.finishRecordingAsPicture();
    };

    if (reduceMotion) {
      render(0.6); // a static, composed pose rather than a frozen start frame
      return;
    }
    const tick = (ts: number) => {
      if (startedRef.current === null) startedRef.current = ts;
      render((ts - startedRef.current) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return (
    <View style={styles.wrap}>
      <Canvas style={{ width: SIZE, height: SIZE }}>
        <Picture picture={picture} />
      </Canvas>
      <Text style={styles.caption}>{caption}</Text>
      <Text style={styles.sub}>Shaping the slopes and checking every drop is fair</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  caption: { fontFamily: "Poppins_700Bold", fontSize: 20, color: colors.lime, marginTop: 10 },
  sub: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: colors.textSoft,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 18,
  },
});
