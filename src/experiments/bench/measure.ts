/**
 * On-device benchmark plan and summary. Short on purpose (a phone held open):
 * 3 s warm-up and 8 s measured per scenario, shorter than the 30 s + 120 s
 * reference procedure in requirement 11.2, and recorded as such.
 */
export const BENCH_TIMING = { warmupMs: 3000, measureMs: 8000 };
export type BenchScenario = { count: number; quality: 'high' | 'balanced' };
export const BENCH_SCENARIOS: BenchScenario[] = [
  { count: 12, quality: 'high' }, { count: 24, quality: 'high' }, { count: 60, quality: 'high' },
  { count: 12, quality: 'balanced' }, { count: 24, quality: 'balanced' }, { count: 60, quality: 'balanced' },
];
export type BenchResult = BenchScenario & {
  frames: number; fps: number; medianMs: number; p95Ms: number; over33: number; over50: number;
  liveDrops: number; canvas: { width: number; height: number };
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function summarize(scenario: BenchScenario, intervals: number[], liveDrops: number, canvas: { width: number; height: number }): BenchResult {
  const valid = intervals.filter(v => Number.isFinite(v) && v > 0);
  const sorted = [...valid].sort((a, b) => a - b);
  const at = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0);
  const median = at(0.5);
  return {
    ...scenario, frames: sorted.length, fps: median > 0 ? Math.round(1000 / median) : 0,
    medianMs: round1(median), p95Ms: round1(at(0.95)),
    over33: valid.filter(v => v > 33.4).length, over50: valid.filter(v => v > 50).length,
    liveDrops, canvas,
  };
}
