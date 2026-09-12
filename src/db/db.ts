// expo-sqlite persistence: campaign progress, stars per green, the daily result +
// one-and-done lock, streak, custom greens, and settings.

import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync("sinkit.db").then(migrate);
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<SQLite.SQLiteDatabase> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS campaign (id INTEGER PRIMARY KEY CHECK (id = 1), level INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS green_stars (green_no INTEGER PRIMARY KEY, stars INTEGER NOT NULL, best INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS daily_results (day TEXT PRIMARY KEY, total INTEGER NOT NULL, drops TEXT NOT NULL, scores TEXT NOT NULL, completed_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS streak (id INTEGER PRIMARY KEY CHECK (id = 1), current INTEGER NOT NULL DEFAULT 0, longest INTEGER NOT NULL DEFAULT 0, last_day TEXT);
    CREATE TABLE IF NOT EXISTS custom_greens (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO campaign (id, level) VALUES (1, 1);
    INSERT OR IGNORE INTO streak (id, current, longest, last_day) VALUES (1, 0, 0, NULL);
  `);
  return db;
}

// ---- campaign ----
export async function getCampaignLevel(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ level: number }>("SELECT level FROM campaign WHERE id = 1");
  return row?.level ?? 1;
}

export async function setCampaignLevel(level: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE campaign SET level = ? WHERE id = 1", level);
}

// ---- stars per campaign green ----
export async function getGreenStars(greenNo: number): Promise<{ stars: number; best: number } | null> {
  const db = await getDb();
  return db.getFirstAsync<{ stars: number; best: number }>("SELECT stars, best FROM green_stars WHERE green_no = ?", greenNo);
}

export async function recordGreenResult(greenNo: number, stars: number, best: number): Promise<void> {
  const db = await getDb();
  const existing = await getGreenStars(greenNo);
  if (!existing) {
    await db.runAsync("INSERT INTO green_stars (green_no, stars, best) VALUES (?, ?, ?)", greenNo, stars, best);
  } else if (best > existing.best || stars > existing.stars) {
    await db.runAsync(
      "UPDATE green_stars SET stars = ?, best = ? WHERE green_no = ?",
      Math.max(stars, existing.stars),
      Math.max(best, existing.best),
      greenNo,
    );
  }
}

// ---- daily ----
export interface DailyResult {
  day: string;
  total: number;
  drops: [number, number][];
  scores: number[];
  completedAt: string;
}

export async function getDailyResult(day: string): Promise<DailyResult | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ day: string; total: number; drops: string; scores: string; completed_at: string }>(
    "SELECT * FROM daily_results WHERE day = ?",
    day,
  );
  if (!row) return null;
  return { day: row.day, total: row.total, drops: JSON.parse(row.drops), scores: JSON.parse(row.scores), completedAt: row.completed_at };
}

function yesterday(day: string): string {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastDay: string | null;
}

export async function getStreak(): Promise<StreakInfo> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ current: number; longest: number; last_day: string | null }>("SELECT * FROM streak WHERE id = 1");
  return { current: row?.current ?? 0, longest: row?.longest ?? 0, lastDay: row?.last_day ?? null };
}

// Saves the daily result (one row per day — a second call for the same day is a no-op)
// and advances the streak. Returns the streak after this completion.
export async function saveDailyResult(day: string, total: number, drops: [number, number][], scores: number[]): Promise<StreakInfo> {
  const db = await getDb();
  const already = await getDailyResult(day);
  if (already) return getStreak();

  await db.runAsync(
    "INSERT INTO daily_results (day, total, drops, scores, completed_at) VALUES (?, ?, ?, ?, ?)",
    day,
    total,
    JSON.stringify(drops),
    JSON.stringify(scores),
    new Date().toISOString(),
  );

  const streak = await getStreak();
  const current = streak.lastDay === yesterday(day) ? streak.current + 1 : 1;
  const longest = Math.max(streak.longest, current);
  await db.runAsync("UPDATE streak SET current = ?, longest = ?, last_day = ? WHERE id = 1", current, longest, day);
  return { current, longest, lastDay: day };
}

// ---- custom greens ----
export interface CustomGreen {
  id: number;
  code: string;
  name: string;
  data: string;
  createdAt: string;
}

export async function listCustomGreens(): Promise<CustomGreen[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; code: string; name: string; data: string; created_at: string }>(
    "SELECT * FROM custom_greens ORDER BY created_at DESC",
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, data: r.data, createdAt: r.created_at }));
}

export async function saveCustomGreen(code: string, name: string, data: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO custom_greens (code, name, data, created_at) VALUES (?, ?, ?, ?)", code, name, data, new Date().toISOString());
}

export async function deleteCustomGreen(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM custom_greens WHERE id = ?", id);
}

// ---- settings ----
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}
