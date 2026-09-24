/**
 * Pure mapping from droplet events to sound and haptic parameters.
 * Nothing here touches Web Audio or the simulation; it is unit tested.
 */

/** The chapter drop (r=44) is the reference size. Larger drops sound lower. */
const REFERENCE_RADIUS = 44;
/** Contact speed change, in board units per second, below which nothing plays. */
export const IMPACT_THRESHOLD = 70;
/** A contact counts as a new impact only after this much quiet on that drop. */
export const IMPACT_QUIET_SECONDS = 0.12;
const IMPACT_FULL_SCALE = 950;

export type ContactSurface = 'wall' | 'obstacle' | 'drop';
export type ImpactCue = { gain: number; size: number; surface: ContactSurface; haptic: number };
export type FusionCue = { gain: number; size: number; clarity: number; haptic: number[] };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Frequency multiplier for a drop radius; a volume-like cube root keeps the range gentle. */
export function sizeFactor(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 1;
  return clamp(Math.cbrt(REFERENCE_RADIUS / radius), 0.62, 1.45);
}

/** Stereo position from the board x coordinate; kept narrow so nothing jumps between ears. */
export function panFor(x: number, width: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;
  return clamp((x / width - 0.5) * 0.7, -0.35, 0.35);
}

export function impactCue(impulse: number, radius: number, surface: ContactSurface): ImpactCue | null {
  if (!Number.isFinite(impulse) || impulse < IMPACT_THRESHOLD) return null;
  const strength = clamp((impulse - IMPACT_THRESHOLD) / (IMPACT_FULL_SCALE - IMPACT_THRESHOLD), 0, 1);
  // A perceptual curve: soft taps stay audible, hard throws do not become loud.
  const gain = 0.18 + 0.82 * Math.pow(strength, 0.6);
  return { gain, size: sizeFactor(radius), surface, haptic: Math.round(5 + 13 * strength) };
}

/**
 * Purity is the largest single-colour share (1 = one colour). Clarity is 1 for
 * a pure fusion and falls toward 0 as a second colour takes half the drop.
 */
export function fusionCue(radius: number, purity: number): FusionCue {
  const p = Number.isFinite(purity) ? clamp(purity, 0.5, 1) : 1;
  const clarity = p >= 0.995 ? 1 : clamp((p - 0.5) / 0.5, 0, 1) * 0.6;
  return {
    gain: 0.85 + 0.15 * clarity,
    size: sizeFactor(radius),
    clarity,
    haptic: clarity === 1 ? [12] : [8, 45, 8],
  };
}

/**
 * Per-drop onset detection. Holding a drop against a wall reports a contact on
 * nearly every physics step; only the first one after a quiet gap is an impact.
 */
export class ImpactGate {
  private lastContact = new Map<number, number>();

  /** Returns true when this contact starts a new impact for the drop. */
  onset(id: number, nowSeconds: number): boolean {
    const previous = this.lastContact.get(id);
    this.lastContact.set(id, nowSeconds);
    if (this.lastContact.size > 64) {
      // Merged drops leave stale ids behind; forget the oldest entries.
      for (const key of [...this.lastContact.keys()].slice(0, this.lastContact.size - 64)) this.lastContact.delete(key);
    }
    return previous === undefined || nowSeconds - previous >= IMPACT_QUIET_SECONDS;
  }

  reset(): void {
    this.lastContact.clear();
  }
}
