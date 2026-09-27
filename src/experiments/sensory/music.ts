import { MUSIC_LOOP, musicPosition, type MusicLoop } from './music-loop';

/**
 * The BGM player (MUSIC.md). It rides the droplet sounds' AudioContext, so it
 * starts with the same first touch and, on iPhone, stays silent with the
 * silent switch like the rest. Decoded once per screen into a buffer that
 * loops sample-accurately. Screens are separate pages, so the place in the
 * track is kept for the visit (sessionStorage) and the next screen fades back
 * in from there instead of restarting the intro.
 */
export type MusicState = 'off' | 'waiting' | 'loading' | 'playing' | 'failed';
export type Music = {
  /** Sound and music both on. It plays once the context runs and the file is ready. */
  setEnabled(on: boolean): void;
  /** Re-check after a touch may have started the context. */
  update(): void;
  status(): { state: MusicState; position: number | null };
  dispose(): void;
};

export const MUSIC_POSITION_KEY = 'pura-flow-music-v1';
const FADE_IN = 4;       // from silence, over the quiet intro
const FADE_RESUME = 2.5; // picking up where the last screen left off
const FADE_OUT = 0.8;
const KEEP_PLACE = 30 * 60_000;

function readPlace(): number {
  try {
    const data = JSON.parse(sessionStorage.getItem(MUSIC_POSITION_KEY) ?? 'null') as { position?: unknown; at?: unknown } | null;
    if (data && typeof data.position === 'number' && typeof data.at === 'number' && Date.now() - data.at < KEEP_PLACE) return data.position;
  } catch { /* from the top */ }
  return 0;
}

export function createMusic(getContext: () => BaseAudioContext | null, loop: MusicLoop = MUSIC_LOOP): Music {
  let enabled = false, visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
  let disposed = false, loading = false, failed = false;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null, gain: GainNode | null = null;
  let startedAt = 0, startOffset = 0, saver = 0;
  let watched: BaseAudioContext | null = null;

  const place = (c: BaseAudioContext) => musicPosition(startOffset + c.currentTime - startedAt, loop);
  function save() {
    const c = getContext();
    if (!c || !source) return;
    try { sessionStorage.setItem(MUSIC_POSITION_KEY, JSON.stringify({ position: place(c), at: Date.now() })); } catch { /* starts over next time */ }
  }

  async function load(c: BaseAudioContext) {
    loading = true;
    try {
      const response = await fetch(loop.file);
      if (!response.ok) throw new Error(String(response.status));
      buffer = await c.decodeAudioData(await response.arrayBuffer());
    } catch { failed = true; }
    loading = false;
    update();
  }

  function start(c: BaseAudioContext) {
    const offset = Math.min(readPlace(), loop.loopEnd - 0.1);
    const t = c.currentTime;
    gain = c.createGain();
    // An even fade in loudness: exponential from -60 dB.
    gain.gain.setValueAtTime(loop.level * 0.001, t);
    gain.gain.exponentialRampToValueAtTime(loop.level, t + (offset > 0 ? FADE_RESUME : FADE_IN));
    source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(t, offset);
    startedAt = t; startOffset = offset;
    saver = window.setInterval(save, 2000);
  }

  function stop(c: BaseAudioContext, fade = FADE_OUT) {
    save();
    clearInterval(saver);
    const s = source!, g = gain!;
    source = null; gain = null;
    const t = c.currentTime, now = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(now, t);
    g.gain.linearRampToValueAtTime(0, t + fade);
    s.onended = () => { s.disconnect(); g.disconnect(); };
    try { s.stop(t + fade + 0.05); } catch { s.disconnect(); g.disconnect(); }
  }

  function update() {
    if (disposed) return;
    const c = getContext();
    // Starting the context is asynchronous (and iOS may interrupt it): follow its state.
    if (c && c !== watched) { watched = c; c.addEventListener('statechange', update); }
    if (!(enabled && visible && !failed)) { if (source && c) stop(c); return; }
    if (!c || c.state !== 'running' || source || loading) return;
    if (!buffer) { void load(c); return; }
    start(c);
  }

  const visibility = () => { visible = document.visibilityState !== 'hidden'; update(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', save);

  return {
    setEnabled(on) { enabled = on; update(); },
    update,
    status() {
      const c = getContext();
      const state: MusicState = failed ? 'failed' : !enabled ? 'off' : source ? 'playing' : loading ? 'loading' : 'waiting';
      return { state, position: c && source ? place(c) : null };
    },
    dispose() {
      const c = getContext();
      if (source && c) stop(c, 0.05);
      disposed = true;
      watched?.removeEventListener('statechange', update);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', save);
    },
  };
}
