// Greens are expensive to generate (the fairness solver runs a full physics sim over the
// whole drop zone, up to 60 candidate layouts — 3-4s on a mid-range phone). Two things make
// that wait disappear rather than just move it:
//   1. generateAsync yields between candidates, so the UI thread is never locked solid.
//   2. We generate ahead of time — the Home screen warms the green you're most likely to
//      tap into, and a finished green warms the next one while you're reading your score.
// A cache hit makes the transition instant; a miss just falls back to awaiting the same
// promise, so this is only ever a head start, never a correctness dependency.

import { generateAsync, hashStr } from "../engine/generator";
import type { Level } from "../engine/physics";
import { dailyNumber, dayKey, P } from "./session";

const MAX_ENTRIES = 6;
const cache = new Map<string, Promise<Level>>();

function remember(key: string, make: () => Promise<Level>): Promise<Level> {
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = make().catch((err) => {
    cache.delete(key); // don't cache a failure — let the next caller retry
    throw err;
  });
  cache.set(key, pending);
  // Map iterates in insertion order, so the first key is the oldest.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    cache.delete(oldest);
  }
  return pending;
}

export function campaignGreen(levelNo: number): Promise<Level> {
  return remember(`play:${levelNo}`, async () => {
    const { level } = await generateAsync(7000 + levelNo, Math.min(1, (levelNo - 1) / 40), P);
    return level;
  });
}

export async function dailyGreen(today: Date): Promise<{ level: Level; dailyN: number; day: string }> {
  const day = dayKey(today);
  const level = await remember(`daily:${day}`, async () => {
    const { level: L } = await generateAsync(hashStr("daily-" + day), 0.35, P);
    return L;
  });
  return { level, dailyN: dailyNumber(today), day };
}

/** Fire-and-forget warm-ups. Failures are swallowed — a miss just means the normal wait. */
export function prefetchCampaign(levelNo: number): void {
  void campaignGreen(levelNo).catch(() => {});
}

export function prefetchDaily(today: Date): void {
  void dailyGreen(today).catch(() => {});
}
