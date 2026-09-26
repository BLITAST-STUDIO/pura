/**
 * Dynamic resolution for the "beauty first" quality (requirement 11.3).
 * Measured on an iPhone (2026-09-26): 12–24 drops hold 60 fps at 1.75× pixel
 * ratio, 60 drops fall to ~42 fps, and 1× holds 60 fps at 60 drops. Rather than
 * give up sharpness everywhere, step the pixel ratio down only while frames are
 * late, and probe back up after a stable stretch. Physics is never touched.
 *
 * Decisions are made on one-second windows of frame intervals:
 * - late (median above LATE_MS) → one step down, then a short cooldown;
 * - capped (tight cluster near 33.3 ms while each frame's own work is short:
 *   low-power mode or a 30 Hz display) → hold, because lower resolution cannot
 *   beat a display cap. A 60 Hz display also snaps *overloaded* frames to
 *   33.3 ms, so the work time is what tells the two apart;
 * - stable for `patience` windows below the top step → probe one step up;
 *   if that probe turns late soon after, double the patience (backoff).
 */
export const RESOLUTION_STEPS = [1.75, 1.5, 1.25, 1] as const;
const LATE_MS = 19;
const STEADY_MEDIAN_MS = 17.4;
const STEADY_P95_MS = 19;
const COOLDOWN_WINDOWS = 2;
const PROBE_GRACE_WINDOWS = 3;
const BASE_PATIENCE = 4;
const MAX_PATIENCE = 32;
/** Median per-frame work (ms) below which a 33 ms cadence is a display cap, not load. */
const CAP_WORK_MS = 8;

export type ResolutionDecision = 'down' | 'up' | 'hold';

export class AdaptiveResolution {
  /** Index into RESOLUTION_STEPS; 0 is the sharpest. */
  level = 0;
  private cooldown = 0;
  private steady = 0;
  private patience = BASE_PATIENCE;
  private sinceProbe = Infinity;

  constructor(private readonly cap = RESOLUTION_STEPS[0]) {}

  /** The pixel ratio to render at, never above the device's own. */
  pixelRatio(deviceRatio: number) {
    return Math.min(deviceRatio || 1, this.cap, RESOLUTION_STEPS[this.level]);
  }

  reset() { this.level = 0; this.cooldown = 0; this.steady = 0; this.patience = BASE_PATIENCE; this.sinceProbe = Infinity; }

  /**
   * Feed one window (about a second) of frame intervals in milliseconds, and
   * optionally the time each frame's own simulation + draw calls took.
   */
  window(intervals: number[], work: number[] = []): ResolutionDecision {
    const valid = intervals.filter(v => Number.isFinite(v) && v > 0 && v < 1000).sort((a, b) => a - b);
    if (valid.length < 10) return 'hold';
    const median = valid[Math.floor(valid.length / 2)];
    const p95 = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))];
    this.sinceProbe++;
    if (this.cooldown > 0) { this.cooldown--; return 'hold'; }
    const workSorted = work.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
    const workMedian = workSorted.length ? workSorted[Math.floor(workSorted.length / 2)] : 0;
    const capped = Math.abs(median - 33.3) < 1.5 && p95 - median < 2.5 && workMedian < CAP_WORK_MS;
    if (capped) { this.steady = 0; return 'hold'; }
    if (median > LATE_MS) {
      this.steady = 0;
      if (this.sinceProbe <= PROBE_GRACE_WINDOWS) this.patience = Math.min(MAX_PATIENCE, this.patience * 2);
      if (this.level >= RESOLUTION_STEPS.length - 1) return 'hold';
      this.level++; this.cooldown = COOLDOWN_WINDOWS;
      return 'down';
    }
    if (median <= STEADY_MEDIAN_MS && p95 <= STEADY_P95_MS) this.steady++; else this.steady = 0;
    if (this.level > 0 && this.steady >= this.patience) {
      this.level--; this.steady = 0; this.cooldown = COOLDOWN_WINDOWS; this.sinceProbe = 0;
      return 'up';
    }
    return 'hold';
  }
}
