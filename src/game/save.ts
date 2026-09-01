import { clampSandboxCount, SANDBOX_COUNT } from "./levels";

const KEY = "pura-save-v1";

export type LevelRecord = {
  stars: number;
  time: number;
  purity: number;
};

export type SaveData = {
  v: 1;
  muted: boolean;
  best: Record<string, LevelRecord>;
  sandboxDrops: number;
};

const DEFAULT: SaveData = {
  v: 1,
  muted: false,
  best: {},
  sandboxDrops: SANDBOX_COUNT.fallback,
};

export function loadSave(): SaveData {
  if (typeof localStorage === "undefined") return { ...DEFAULT, best: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, best: {} };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.v !== 1) return { ...DEFAULT, best: {} };
    return {
      v: 1,
      muted: Boolean(parsed.muted),
      best: parsed.best ?? {},
      sandboxDrops: clampSandboxCount(Number(parsed.sandboxDrops) || SANDBOX_COUNT.fallback),
    };
  } catch {
    return { ...DEFAULT, best: {} };
  }
}

export function writeSave(next: SaveData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / itch iframe storage quota */
  }
}

export function recordResult(
  save: SaveData,
  levelId: number,
  stars: number,
  time: number,
  purity: number,
): SaveData {
  const key = String(levelId);
  const prev = save.best[key];
  const next: LevelRecord = {
    stars: Math.max(prev?.stars ?? 0, stars),
    time: prev ? Math.min(prev.time, time) : time,
    purity: Math.max(prev?.purity ?? 0, purity),
  };
  const best = { ...save.best, [key]: next };
  const data = { ...save, best };
  writeSave(data);
  return data;
}

export function firstUnplayed(): number {
  const save = loadSave();
  for (let i = 1; i <= 8; i++) {
    if (!save.best[String(i)]) return i;
  }
  return 1;
}
