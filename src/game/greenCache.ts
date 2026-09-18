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
const ready = new Set<string>();

// A single candidate attempt is an indivisible 15-85ms (desktop) chunk of solver work, so
// generation can never be invisible next to a 60fps loop — it can only be kept away from the
// moments that matter. PlayScreen pauses it while a ball is rolling.
let paused = false;

export function setGenerationPaused(v: boolean): void {
  paused = v;
}

const yieldToUi = async (): Promise<void> => {
  do {
    await new Promise<void>((resolve) => setTimeout(resolve, paused ? 150 : 0));
  } while (paused);
};

function remember(key: string, make: () => Promise<Level>): Promise<Level> {
  const hit = cache.get(key);
  if (hit) return hit;
  const started = Date.now();
  const pending = make()
    .then((level) => {
      ready.add(key);
      if (__DEV__) console.log(`[greenCache] generated ${key} in ${Date.now() - started}ms`);
      return level;
    })
    .catch((err) => {
      cache.delete(key); // don't cache a failure — let the next caller retry
      throw err;
    });
  cache.set(key, pending);
  // Map iterates in insertion order, so the first key is the oldest.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    cache.delete(oldest);
    ready.delete(oldest);
  }
  return pending;
}

/**
 * Awaits a green, logging whether the prefetch had actually finished in time. This is the
 * measurement for "is prefetch helping?" — a MISS with a long wait means the warm-up started
 * too late or the green was one of the expensive ones.
 */
function awaitGreen(key: string, promise: Promise<Level>): Promise<Level> {
  if (!__DEV__) return promise;
  const wasReady = ready.has(key);
  const asked = Date.now();
  return promise.then((level) => {
    console.log(`[greenCache] ${key} ${wasReady ? "HIT (ready)" : "MISS (waited)"} ${Date.now() - asked}ms`);
    return level;
  });
}

export function campaignGreen(levelNo: number): Promise<Level> {
  const key = `play:${levelNo}`;
  return awaitGreen(
    key,
    remember(key, async () => {
      const { level } = await generateAsync(7000 + levelNo, Math.min(1, (levelNo - 1) / 40), P, { onYield: yieldToUi });
      return level;
    }),
  );
}

export async function dailyGreen(today: Date): Promise<{ level: Level; dailyN: number; day: string }> {
  const day = dayKey(today);
  const key = `daily:${day}`;
  const level = await awaitGreen(
    key,
    remember(key, async () => {
      const { level: L } = await generateAsync(hashStr("daily-" + day), 0.35, P, { onYield: yieldToUi });
      return L;
    }),
  );
  return { level, dailyN: dailyNumber(today), day };
}

/** Fire-and-forget warm-ups. Failures are swallowed — a miss just means the normal wait. */
export function prefetchCampaign(levelNo: number): void {
  void campaignGreen(levelNo).catch(() => {});
}

export function prefetchDaily(today: Date): void {
  void dailyGreen(today).catch(() => {});
}
