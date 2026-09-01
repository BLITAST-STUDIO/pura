import type { HueId } from "./palette";

export type LevelDef = {
  id: number;
  code: string;
  name: string;
  hint: string;
  colors: HueId[];
  perColor: number;
  rMin: number;
  rMax: number;
  /** Fraction of each color's starting mass that must sit in one qualifying core. */
  targetFrac: number;
  /** 0–1 purity required on each qualifying core. */
  purity: number;
  currents?: boolean;
  sandbox?: boolean;
};

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    code: "01",
    name: "覚醒",
    hint: "ドラッグして、同じ雫をひとつに。",
    colors: ["cyan"],
    perColor: 14,
    rMin: 11,
    rMax: 16,
    targetFrac: 0.82,
    purity: 0.99,
  },
  {
    id: 2,
    code: "02",
    name: "対",
    hint: "違う色は弾く。無理に混ぜると純度が落ちる。",
    colors: ["cyan", "rose"],
    perColor: 10,
    rMin: 11,
    rMax: 16,
    targetFrac: 0.78,
    purity: 0.92,
  },
  {
    id: 3,
    code: "03",
    name: "三色",
    hint: "色ごとに核を作れ。純度を見ながら。",
    colors: ["cyan", "rose", "amber"],
    perColor: 8,
    rMin: 11,
    rMax: 15,
    targetFrac: 0.74,
    purity: 0.9,
  },
  {
    id: 4,
    code: "04",
    name: "密集",
    hint: "狭いほど、混ぜない指先が要る。",
    colors: ["cyan", "rose", "amber"],
    perColor: 12,
    rMin: 9,
    rMax: 14,
    targetFrac: 0.72,
    purity: 0.9,
  },
  {
    id: 5,
    code: "05",
    name: "臨界",
    hint: "わずかな混入でも純度は落ちる。",
    colors: ["cyan", "rose", "amber"],
    perColor: 8,
    rMin: 11,
    rMax: 16,
    targetFrac: 0.78,
    purity: 0.97,
  },
  {
    id: 6,
    code: "06",
    name: "潮流",
    hint: "場が流れる。核を手放すな。",
    colors: ["cyan", "rose", "amber"],
    perColor: 10,
    rMin: 10,
    rMax: 15,
    targetFrac: 0.72,
    purity: 0.9,
    currents: true,
  },
  {
    id: 7,
    code: "07",
    name: "霧雨",
    hint: "小さな雫を、大きな核へ。勢いよくぶつけると弾く。",
    colors: ["cyan", "rose", "amber"],
    perColor: 16,
    rMin: 8,
    rMax: 12,
    targetFrac: 0.7,
    purity: 0.88,
  },
  {
    id: 8,
    code: "08",
    name: "核",
    hint: "すべてを、純度高く。",
    colors: ["cyan", "rose", "amber"],
    perColor: 14,
    rMin: 9,
    rMax: 14,
    targetFrac: 0.76,
    purity: 0.94,
  },
];

export const SANDBOX: LevelDef = {
  id: 0,
  code: "∞",
  name: "サンドボックス",
  hint: "エンドレス。左上で初期の雫の数を変えられる。",
  colors: ["cyan", "rose", "amber"],
  perColor: 20,
  rMin: 8,
  rMax: 13,
  targetFrac: 1,
  purity: 1,
  sandbox: true,
};

export const SANDBOX_COUNT = {
  min: 12,
  max: 60,
  step: 6,
  fallback: 60,
} as const;

export function clampSandboxCount(n: number): number {
  const stepped = Math.round(n / SANDBOX_COUNT.step) * SANDBOX_COUNT.step;
  return Math.min(SANDBOX_COUNT.max, Math.max(SANDBOX_COUNT.min, stepped));
}

export function getLevel(id: number): LevelDef | undefined {
  if (id === 0) return SANDBOX;
  return LEVELS.find((l) => l.id === id);
}
