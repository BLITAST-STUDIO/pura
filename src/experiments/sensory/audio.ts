import type { ContactSurface } from './cues';

/**
 * Synthesised droplet sounds. No sample files: every voice is a few short
 * oscillators and filtered noise, shaped by drop size, impact and purity.
 * Timbre targets: touch "pu", wall "to", fusion "topun", goal a glassy ring.
 */
export type DropletAudio = {
  readonly context: BaseAudioContext | null;
  unlock(): void;
  setEnabled(enabled: boolean): void;
  touch(size: number, pan: number): void;
  impact(gain: number, size: number, surface: ContactSurface, pan: number): void;
  fusion(gain: number, size: number, clarity: number, pan: number): void;
  chime(pitch: number, notes: number[], gain?: number): void;
  rewind(): void;
  dispose(): void;
};

type ContextFactory = () => BaseAudioContext | null;

const MASTER_LEVEL = 0.8;
const REVERB_LEVEL = 0.17;
// Measured by offline rendering: touch ≈ -20 dBFS peak, hard wall ≈ -17,
// fusion ≈ -13, the finishing chime ≈ -11. The compressor only catches bursts.
const VOICE_LEVEL = 3.5;
const CHIME_LEVEL = 3;

function defaultContext(): BaseAudioContext | null {
  const Ctor = typeof window !== 'undefined'
    ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

/** A short, soft room: decaying stereo noise with its highs rolled off over time. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 1.2;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 0x5eed;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const white = (seed >>> 0) / 4294967296 * 2 - 1;
      const t = i / ctx.sampleRate;
      // Later reflections are duller: a one-pole low-pass whose cutoff falls with time.
      const k = 0.55 - 0.45 * Math.min(1, t / seconds);
      smooth += (white - smooth) * k;
      data[i] = smooth * Math.exp(-t / 0.3) * (t < 0.008 ? t / 0.008 : 1);
    }
  }
  return buffer;
}

export function createDropletAudio(factory: ContextFactory = defaultContext): DropletAudio {
  let ctx: BaseAudioContext | null = null;
  let bus: GainNode | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let enabled = true;
  let disposed = false;

  function ensure(): BaseAudioContext | null {
    if (disposed) return null;
    if (ctx) return ctx;
    try { ctx = factory(); } catch { ctx = null; }
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_LEVEL : 0;
    const compressor = ctx.createDynamicsCompressor();
    // Single cues peak below the knee; only piled-up bursts are held down.
    compressor.threshold.value = -11;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.15;
    bus = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_LEVEL;
    bus.connect(compressor);
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(compressor);
    // Round the edges, at the edge of audibility: a -2.5 dB shelf above 4.5 kHz
    // and a soft roll-off near 11 kHz take the glassy bite off clicks and chimes.
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4500;
    shelf.gain.value = -2.5;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 11000;
    soften.Q.value = 0.5;
    compressor.connect(shelf);
    shelf.connect(soften);
    soften.connect(master);
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.25);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let seed = 0x1234;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 0) / 4294967296 * 2 - 1;
    }
    return ctx;
  }

  function live(): BaseAudioContext | null {
    if (!enabled || !ctx || !bus) return null;
    // A realtime context must be running; an offline one renders what was scheduled.
    const offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    if (!offline && ctx.state !== 'running') return null;
    return ctx;
  }

  /** A panned voice output that disconnects itself after `seconds`. */
  function voice(c: BaseAudioContext, pan: number, seconds: number, level = VOICE_LEVEL): AudioNode {
    const out = c.createGain();
    out.gain.value = level;
    let tail: AudioNode = out;
    if (typeof c.createStereoPanner === 'function' && pan) {
      const panner = c.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      tail = panner;
    }
    tail.connect(bus!);
    // A silent source connected to the voice ends on schedule, also offline.
    const cleanup = c.createConstantSource();
    cleanup.offset.value = 0;
    cleanup.connect(out);
    cleanup.start(c.currentTime);
    cleanup.stop(c.currentTime + seconds + 0.1);
    cleanup.onended = () => { cleanup.disconnect(); out.disconnect(); if (tail !== out) tail.disconnect(); };
    return out;
  }

  function tone(c: BaseAudioContext, out: AudioNode, options: {
    frequency: number; to?: number; glide?: number; start?: number; attack?: number;
    decay: number; gain: number; type?: OscillatorType;
  }) {
    const t0 = c.currentTime + (options.start ?? 0);
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(options.frequency, t0);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), t0 + (options.glide ?? options.decay));
    const attack = options.attack ?? 0.004;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), t0 + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + options.decay);
    osc.connect(amp);
    amp.connect(out);
    osc.start(t0);
    osc.stop(t0 + attack + options.decay + 0.02);
    osc.onended = () => { osc.disconnect(); amp.disconnect(); };
  }

  function noise(c: BaseAudioContext, out: AudioNode, options: {
    type: BiquadFilterType; frequency: number; to?: number; q?: number;
    decay: number; gain: number; start?: number;
  }) {
    if (!noiseBuffer) return;
    const t0 = c.currentTime + (options.start ?? 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = options.type;
    filter.frequency.setValueAtTime(options.frequency, t0);
    if (options.to) filter.frequency.exponentialRampToValueAtTime(options.to, t0 + options.decay);
    filter.Q.value = options.q ?? 0.7;
    const amp = c.createGain();
    amp.gain.setValueAtTime(options.gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + options.decay);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(out);
    src.start(t0);
    src.stop(t0 + options.decay + 0.02);
    src.onended = () => { src.disconnect(); filter.disconnect(); amp.disconnect(); };
  }

  const jitter = () => 1 + (Math.random() - 0.5) * 0.06;

  return {
    get context() { return ctx; },
    unlock() {
      const c = ensure();
      if (c && 'resume' in c && (c as AudioContext).state === 'suspended') {
        void (c as AudioContext).resume().catch(() => undefined);
      }
    },
    setEnabled(next) {
      enabled = next;
      if (master && ctx) master.gain.setTargetAtTime(next ? MASTER_LEVEL : 0, ctx.currentTime, 0.03);
    },
    touch(size, pan) {
      const c = live(); if (!c) return;
      const out = voice(c, pan, 0.3);
      const f = 300 * size * jitter();
      // A soft "pu": a tiny upward bubble chirp and a muffled skin contact.
      tone(c, out, { frequency: f, to: f * 1.35, glide: 0.035, decay: 0.085, gain: 0.07 });
      tone(c, out, { frequency: f * 0.5, decay: 0.05, gain: 0.035 });
      noise(c, out, { type: 'lowpass', frequency: 1400, decay: 0.018, gain: 0.018 });
    },
    impact(gain, size, surface, pan) {
      const c = live(); if (!c) return;
      const out = voice(c, pan, 0.35);
      const f = (surface === 'drop' ? 230 : 165) * size * jitter();
      // A soft "to": a low body that drops in pitch, plus a short damped contact.
      tone(c, out, { frequency: f, to: f * 0.72, decay: 0.11 + 0.05 * gain, gain: 0.16 * gain });
      noise(c, out, { type: 'lowpass', frequency: 700 + 500 * gain, decay: 0.03, gain: 0.05 * gain });
      if (surface === 'obstacle') {
        // Stone is harder than the board: a faint, higher knock.
        noise(c, out, { type: 'bandpass', frequency: 2300, q: 3, decay: 0.022, gain: 0.05 * gain });
        tone(c, out, { frequency: f * 3.1, decay: 0.05, gain: 0.02 * gain });
      }
    },
    fusion(gain, size, clarity, pan) {
      const c = live(); if (!c) return;
      const out = voice(c, pan, 0.9);
      const f = 390 * size * (0.9 + 0.1 * clarity) * jitter();
      // "topun": a water-drop plink is a sine whose pitch rises as the bubble closes.
      tone(c, out, { frequency: f, to: f * (1.55 + 0.25 * clarity), glide: 0.065, decay: 0.2, gain: 0.13 * gain });
      tone(c, out, { frequency: f * 0.5, to: f * 0.42, decay: 0.07, gain: 0.07 * gain });
      noise(c, out, { type: 'lowpass', frequency: 900, decay: 0.03, gain: 0.03 * gain });
      if (clarity >= 1) {
        // A pure fusion keeps a faint glassy afterglow.
        tone(c, out, { frequency: f * 2.01, start: 0.04, attack: 0.02, decay: 0.55, gain: 0.022 * gain });
      } else {
        // A second colour muddies the drop: a slow beating, duller partial.
        tone(c, out, { frequency: f * 0.94, to: f * 1.2, glide: 0.08, decay: 0.24, gain: 0.07 * (1 - clarity) * gain, type: 'triangle' });
      }
    },
    chime(pitch, notes, gain = 1) {
      const c = live(); if (!c) return;
      const out = voice(c, 0, 2.4 + notes.length * 0.2, CHIME_LEVEL);
      // A small glass bell: inharmonic partials with shorter upper decays.
      const partials: [number, number, number][] = [[1, 1, 1.7], [2.0, 0.28, 1.0], [2.76, 0.2, 0.7], [5.4, 0.07, 0.35]];
      notes.forEach((ratio, i) => {
        for (const [multiple, level, decay] of partials) {
          tone(c, out, { frequency: pitch * ratio * multiple, start: i * 0.14, attack: 0.006, decay, gain: 0.055 * level * gain });
        }
      });
    },
    rewind() {
      const c = live(); if (!c) return;
      const out = voice(c, 0, 0.3, 3);
      noise(c, out, { type: 'bandpass', frequency: 2200, to: 450, q: 1.4, decay: 0.14, gain: 0.05 });
      tone(c, out, { frequency: 520, to: 330, decay: 0.1, gain: 0.03 });
    },
    dispose() {
      disposed = true;
      const c = ctx; ctx = null; bus = null; master = null;
      if (c && 'close' in c) void (c as AudioContext).close().catch(() => undefined);
    },
  };
}
