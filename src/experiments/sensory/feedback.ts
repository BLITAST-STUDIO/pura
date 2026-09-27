import { createDropletAudio, type DropletAudio } from './audio';
import { fusionCue, impactCue, ImpactGate, panFor, sizeFactor, type ContactSurface } from './cues';
import { createHaptics, type HapticMode, type Haptics } from './haptics';
import { createMusic, type Music, type MusicState } from './music';
import { MUSIC_VOLUME_DEFAULT } from './music-loop';

const unit = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback);

export const SENSORY_KEY = 'pura-flow-sensory-v1';
/**
 * `music` is the BGM (added 2026-09-27); it plays only while `sound` is on too.
 * The volumes are the menu's sliders (0..1, added 2026-09-27): sound effects
 * default to the approved level (1), music to MUSIC_VOLUME_DEFAULT.
 */
export type SensoryPreferences = { sound: boolean; haptics: boolean; music: boolean; soundVolume: number; musicVolume: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type CueName = 'grab' | 'impact' | 'fusion' | 'ready' | 'delivered' | 'rewind' | 'split';

/** Stored per browser. `?sound=off` / `?haptics=off` / `?music=off` override for one visit only. */
export function readSensoryPreferences(storage?: StorageLike, search?: string): SensoryPreferences {
  const preferences: SensoryPreferences = { sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: MUSIC_VOLUME_DEFAULT };
  try {
    const raw = (storage ?? window.localStorage).getItem(SENSORY_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data?.v === 1) {
      if (typeof data.sound === 'boolean') preferences.sound = data.sound;
      if (typeof data.haptics === 'boolean') preferences.haptics = data.haptics;
      if (typeof data.music === 'boolean') preferences.music = data.music;
      preferences.soundVolume = unit(data.soundVolume, preferences.soundVolume);
      preferences.musicVolume = unit(data.musicVolume, preferences.musicVolume);
    }
  } catch { /* unavailable or malformed storage keeps the defaults */ }
  try {
    const query = new URLSearchParams(search ?? window.location.search);
    if (query.get('sound') === 'off') preferences.sound = false;
    if (query.get('haptics') === 'off') preferences.haptics = false;
    if (query.get('music') === 'off') preferences.music = false;
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
  split(radius: number, x: number, width: number): void;
  /** Audio state and issued cue counts, for verification and the stats readout. */
  /** A soft touch sound at the current volume, while the sound-effects slider moves. */
  previewSound(): void;
  status(): { audio: string; haptics: HapticMode; counts: Record<CueName, number>; music: { state: MusicState; position: number | null; gain: number }; soundVolume: number };
  dispose(): void;
};

export function createSensoryFeedback(options: { audio?: DropletAudio; haptics?: Haptics; music?: Music } = {}): SensoryFeedback {
  const audio = options.audio ?? createDropletAudio();
  const music = options.music ?? createMusic(() => audio.context);
  const haptics = options.haptics ?? createHaptics();
  const gate = new ImpactGate();
  const counts: Record<CueName, number> = { grab: 0, impact: 0, fusion: 0, ready: 0, delivered: 0, rewind: 0, split: 0 };
  let sound = true;
  let soundVolume = 1;
  let previewed = 0;

  // iOS resumes audio only inside a gesture, and may suspend it again after an
  // interruption. Every gesture re-checks; resuming a running context is a no-op.
  // Safari counts a tap as a gesture but not a drag (RYO, 2026-09-27: sound
  // sometimes began only at a double-tap separation), so every kind of touch is
  // tried, and SoundNudge offers a tap when none of them took.
  const unlock = () => { if (sound) { audio.unlock(); music.update(); } };
  const gestures = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'] as const;
  if (typeof window !== 'undefined') for (const type of gestures) window.addEventListener(type, unlock, { capture: true, passive: true });

  return {
    hapticMode: haptics.mode,
    unlock,
    setPreferences(preferences) {
      sound = preferences.sound;
      soundVolume = preferences.soundVolume;
      audio.setVolume(preferences.soundVolume);
      audio.setEnabled(preferences.sound);
      music.setVolume(preferences.musicVolume);
      // A slider at zero is off: nothing to load or play.
      music.setEnabled(preferences.sound && preferences.music && preferences.musicVolume > 0);
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
    previewSound() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - previewed < 150) return;
      previewed = now;
      audio.touch(1, 0);
    },
    rewind() {
      counts.rewind++;
      audio.rewind();
      haptics.pulse(6);
    },
    split(radius, x, width) {
      counts.split++;
      audio.split(sizeFactor(radius), panFor(x, width));
      haptics.pulse([6, 30, 6]);
    },
    status() {
      const context = audio.context as AudioContext | null;
      return { audio: context?.state ?? 'idle', haptics: haptics.mode, counts: { ...counts }, music: music.status(), soundVolume };
    },
    dispose() {
      if (typeof window !== 'undefined') for (const type of gestures) window.removeEventListener(type, unlock, { capture: true });
      music.dispose();
      audio.dispose();
      haptics.dispose();
    },
  };
}
