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

/** Whether the round is over after this ball. Daily never ends early — all three always count. */
export function roundEnds(opts: { mode: GameMode; holed: boolean; ballsLeft: number }): boolean {
  const { mode, holed, ballsLeft } = opts;
  if (mode === "daily") return ballsLeft === 0;
  return holed || ballsLeft === 0;
}
