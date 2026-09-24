import { createDropletAudio, type DropletAudio } from './audio';
import { fusionCue, impactCue, ImpactGate, panFor, sizeFactor, type ContactSurface } from './cues';
import { createHaptics, type HapticMode, type Haptics } from './haptics';

export const SENSORY_KEY = 'pura-flow-sensory-v1';
export type SensoryPreferences = { sound: boolean; haptics: boolean };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type CueName = 'grab' | 'impact' | 'fusion' | 'ready' | 'delivered' | 'rewind';

/** Stored per browser. `?sound=off` / `?haptics=off` override for one visit only. */
export function readSensoryPreferences(storage?: StorageLike, search?: string): SensoryPreferences {
  const preferences: SensoryPreferences = { sound: true, haptics: true };
  try {
    const raw = (storage ?? window.localStorage).getItem(SENSORY_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data?.v === 1) {
      if (typeof data.sound === 'boolean') preferences.sound = data.sound;
      if (typeof data.haptics === 'boolean') preferences.haptics = data.haptics;
    }
  } catch { /* unavailable or malformed storage keeps the defaults */ }
  try {
    const query = new URLSearchParams(search ?? window.location.search);
    if (query.get('sound') === 'off') preferences.sound = false;
    if (query.get('haptics') === 'off') preferences.haptics = false;
  } catch { /* no location outside the browser */ }
  return preferences;
}

export function writeSensoryPreferences(preferences: SensoryPreferences, storage?: StorageLike): boolean {
  try {
    (storage ?? window.localStorage).setItem(SENSORY_KEY, JSON.stringify({ v: 1, ...preferences }));
    return true;
  } catch { return false; }
}

/** Glass-bell pitch per colour, so each goal has its own voice. */
const CHIME_PITCH: Record<string, number> = { cyan: 784, rose: 659.3, amber: 587.3 };

export type SensoryFeedback = {
  readonly hapticMode: HapticMode;
  unlock(): void;
  setPreferences(preferences: SensoryPreferences): void;
  grab(radius: number, x: number, width: number): void;
  /** One call per drop per frame with that frame's summed contact impulse. */
  contact(id: number, impulse: number, radius: number, x: number, width: number, surface: ContactSurface, clockSeconds: number): void;
  fusion(radius: number, x: number, width: number, purity: number): void;
  ready(hue: string): void;
  delivered(hue: string, finished: boolean): void;
  rewind(): void;
  /** Audio state and issued cue counts, for verification and the stats readout. */
  status(): { audio: string; haptics: HapticMode; counts: Record<CueName, number> };
  dispose(): void;
};

export function createSensoryFeedback(options: { audio?: DropletAudio; haptics?: Haptics } = {}): SensoryFeedback {
  const audio = options.audio ?? createDropletAudio();
  const haptics = options.haptics ?? createHaptics();
  const gate = new ImpactGate();
  const counts: Record<CueName, number> = { grab: 0, impact: 0, fusion: 0, ready: 0, delivered: 0, rewind: 0 };
  let sound = true;

  // iOS resumes audio only inside a gesture, and may suspend it again after an
  // interruption. Every gesture re-checks; resuming a running context is a no-op.
  const unlock = () => { if (sound) audio.unlock(); };
  const gestures = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
  if (typeof window !== 'undefined') for (const type of gestures) window.addEventListener(type, unlock, { capture: true, passive: true });

  return {
    hapticMode: haptics.mode,
    unlock,
    setPreferences(preferences) {
      sound = preferences.sound;
      audio.setEnabled(preferences.sound);
      haptics.setEnabled(preferences.haptics);
    },
    grab(radius, x, width) {
      counts.grab++;
      audio.touch(sizeFactor(radius), panFor(x, width));
      haptics.pulse(8);
    },
    contact(id, impulse, radius, x, width, surface, clockSeconds) {
      if (!(impulse > 0)) return;
      if (!gate.onset(id, clockSeconds)) return;
      const cue = impactCue(impulse, radius, surface);
      if (!cue) return;
      counts.impact++;
      audio.impact(cue.gain, cue.size, cue.surface, panFor(x, width));
      haptics.pulse(cue.haptic);
    },
    fusion(radius, x, width, purity) {
      const cue = fusionCue(radius, purity);
      counts.fusion++;
      audio.fusion(cue.gain, cue.size, cue.clarity, panFor(x, width));
      haptics.pulse(cue.haptic);
    },
    ready(hue) {
      counts.ready++;
      audio.chime(CHIME_PITCH[hue] ?? 700, [1], 0.5);
      haptics.pulse(10);
    },
    delivered(hue, finished) {
      counts.delivered++;
      const pitch = CHIME_PITCH[hue] ?? 700;
      audio.chime(pitch, finished ? [1, 1.25, 1.5, 2] : [1, 1.5], 0.5);
      haptics.pulse(finished ? [18, 70, 18, 70, 26] : [18, 70, 24]);
    },
    rewind() {
      counts.rewind++;
      audio.rewind();
      haptics.pulse(6);
    },
    status() {
      const context = audio.context as AudioContext | null;
      return { audio: context?.state ?? 'idle', haptics: haptics.mode, counts: { ...counts } };
    },
    dispose() {
      if (typeof window !== 'undefined') for (const type of gestures) window.removeEventListener(type, unlock, { capture: true });
      audio.dispose();
      haptics.dispose();
    },
  };
}
