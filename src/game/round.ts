// Campaign round flow + reward labelling.
//
// Scoring math itself is untouched (see engine/physics.ts score()). What lives here is when a
// round ENDS and what the result is CALLED. Two rules differ by mode and must not be conflated:
//   - campaign/custom: holing out is the maximum possible score, so the round ends the moment
//     it happens — there's nothing left to improve by throwing the remaining balls.
//   - daily: always plays all three balls, because the daily total sums every ball out of 300.

import type { GameMode } from "../render/GreenGame";

export type Medal = "ace" | "birdie" | "par" | "bogey";

export interface MedalStyle {
  label: string;
  blurb: string;
}

export const MEDALS: Record<Medal, MedalStyle> = {
  ace: { label: "Ace", blurb: "Holed it first ball" },
  birdie: { label: "Birdie", blurb: "Holed it on your second" },
  par: { label: "Par", blurb: "Holed it on your last ball" },
  bogey: { label: "Bogey", blurb: "Close enough to pass" },
};

/**
 * Which medal a finished campaign round earned.
 * `attempt` is 1-based — the ball that produced this result.
 * Returns null when the round failed (below the pass threshold and not holed).
 */
export function medalFor(opts: { holed: boolean; attempt: number; best: number; passScore: number }): Medal | null {
  const { holed, attempt, best, passScore } = opts;
  if (holed) {
    if (attempt <= 1) return "ace";
    if (attempt === 2) return "birdie";
    return "par";
  }
  return best >= passScore ? "bogey" : null;
}

/**
 * Inverse of the proximity score in engine/physics.ts: `80 * max(0, 1 - dist/8)`.
 * Nothing here changes that formula — this just reads it backwards so a point threshold can
 * be shown as a distance, which is the only form a player has any intuition for.
 * (A holed ball scores 100 and isn't on this curve; thresholds are always <= 70, so they are.)
 */
export function distanceForScore(points: number): number {
  return 8 * (1 - points / 80);
}

/** "2.2 ft" / "9 in" — the same phrasing used for a ball's finishing distance. */
export function formatDistance(feet: number): string {
  return feet < 1 ? `${Math.round(feet * 12)} in` : `${feet.toFixed(1)} ft`;
}

/** Whether the round is over after this ball. Daily never ends early — all three always count. */
export function roundEnds(opts: { mode: GameMode; holed: boolean; ballsLeft: number }): boolean {
  const { mode, holed, ballsLeft } = opts;
  if (mode === "daily") return ballsLeft === 0;
  return holed || ballsLeft === 0;
}
