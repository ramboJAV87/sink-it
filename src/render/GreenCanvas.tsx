import React, { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PixelRatio, StyleSheet, View } from "react-native";
import { Canvas, Picture, Skia, useFont, type SkPicture } from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { Level } from "../engine/physics";
import { GreenGame, type EditMarker, type GameMode, type GreenGameCallbacks } from "./GreenGame";
import { poppinsBoldSkiaSource } from "../theme/fonts";

interface Props {
  level: Level;
  mode: GameMode;
  ballsCount: number;
  reduceMotion: boolean;
  callbacks?: GreenGameCallbacks;
  editMarkers?: EditMarker[] | null;
  /** Create-screen mode: taps place/remove features instead of dragging to aim. */
  onEditTap?: (xFoot: number, yFoot: number) => void;
}

export function GreenCanvas({ level, mode, ballsCount, reduceMotion, callbacks, editMarkers, onEditTap }: Props) {
  const font = useFont(poppinsBoldSkiaSource, 12);
  const fontRef = useRef(font);
  useEffect(() => {
    fontRef.current = font;
  }, [font]);

  const callbacksRef = useRef<GreenGameCallbacks | undefined>(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const stableCallbacks = useMemo<GreenGameCallbacks>(
    () => ({
      onBallsChange: (b) => callbacksRef.current?.onBallsChange?.(b),
      onBallOutcome: (o) => callbacksRef.current?.onBallOutcome?.(o),
      onHoled: (o) => callbacksRef.current?.onHoled?.(o),
      onZoneMiss: () => callbacksRef.current?.onZoneMiss?.(),
      onRollStart: () => callbacksRef.current?.onRollStart?.(),
    }),
    [],
  );

  const gameRef = useRef<GreenGame | null>(null);
  if (!gameRef.current) gameRef.current = new GreenGame(stableCallbacks, reduceMotion);

  useEffect(() => {
    gameRef.current!.setReduceMotion(reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    gameRef.current!.editMarkers = editMarkers ?? null;
  }, [editMarkers]);

  const sizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    gameRef.current!.setup(level, mode, ballsCount);
    if (sizeRef.current.width > 0) {
      gameRef.current!.layout(sizeRef.current.width, sizeRef.current.height, PixelRatio.get());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    const height = width * (level.H / level.W);
    if (width === sizeRef.current.width) return;
    sizeRef.current = { width, height };
    setSize({ width, height });
    gameRef.current!.layout(width, height, PixelRatio.get());
  };

  const [picture, setPicture] = useState<SkPicture | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      const game = gameRef.current!;
      if (sizeRef.current.width > 0) {
        game.step(ts);
        const recorder = Skia.PictureRecorder();
        const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, sizeRef.current.width, sizeRef.current.height));
        game.draw(canvas, fontRef.current);
        setPicture(recorder.finishRecordingAsPicture());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onEditTapRef = useRef(onEditTap);
  useEffect(() => {
    onEditTapRef.current = onEditTap;
  }, [onEditTap]);

  const aimGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => gameRef.current!.onPointerDown(e.x, e.y))
        .onUpdate((e) => gameRef.current!.onPointerMove(e.x, e.y))
        .onEnd(() => gameRef.current!.onPointerUp())
        .onFinalize(() => gameRef.current!.onPointerUp()),
    [],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().runOnJS(true).onEnd((e) => {
        const [x, y] = gameRef.current!.toGreen(e.x, e.y);
        onEditTapRef.current?.(x, y);
      }),
    [],
  );

  const gesture = onEditTap ? tapGesture : aimGesture;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.stage} onLayout={onLayout}>
        {size.width > 0 && (
          <Canvas style={{ width: size.width, height: size.height }}>{picture ? <Picture picture={picture} /> : null}</Canvas>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: "100%",
    borderRadius: 28,
    overflow: "hidden",
  },
});
