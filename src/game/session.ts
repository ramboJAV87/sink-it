// Shared level-selection logic, ported from the top of prototype/app.html's <script>.

import { generate, hashStr, type PhysicsAPI } from "../engine/generator";
import { inside, score, simulate, type Level } from "../engine/physics";

export const BALLS = 3;
export const EPOCH = new Date(2026, 8, 12);

export const P: PhysicsAPI = { simulate, score, inside };

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dailyNumber(today: Date): number {
  return Math.floor((today.getTime() - EPOCH.getTime()) / 864e5) + 1;
}

export function generateDaily(today: Date): { level: Level; dailyN: number; day: string } {
  const day = dayKey(today);
  const { level } = generate(hashStr("daily-" + day), 0.35, P);
  return { level, dailyN: dailyNumber(today), day };
}

export function generateCampaign(levelNo: number): Level {
  const { level } = generate(7000 + levelNo, Math.min(1, (levelNo - 1) / 40), P);
  return level;
}

export function starsFor(best: number, t1: number, t2: number): 0 | 1 | 2 | 3 {
  if (best >= 100) return 3;
  if (best >= t2) return 2;
  if (best >= t1) return 1;
  return 0;
}

export function targets(level: Level): { t1: number; t2: number } {
  const t1 = level.target ?? 55;
  const t2 = Math.min(80, t1 + 18);
  return { t1, t2 };
}
