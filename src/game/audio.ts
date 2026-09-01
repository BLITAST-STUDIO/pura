type AudioApi = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  grab: () => void;
  merge: (mass: number, mixed: boolean) => void;
  split: () => void;
  win: () => void;
  bounce: () => void;
};

function ramp(
  param: AudioParam,
  ctx: AudioContext,
  value: number,
  t = 0.03,
): void {
  param.setTargetAtTime(value, ctx.currentTime, t);
}

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let muted = false;
  let lastGrab = 0;
  let lastBounce = 0;

  function ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: "interactive" });
      master = ctx.createGain();
      sfx = ctx.createGain();
      sfx.gain.value = 0.7;
      master.gain.value = muted ? 0 : 0.85;
      sfx.connect(master);
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.12,
    slide = 0,
  ) {
    const c = ctx;
    if (!c || !sfx || muted) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(sfx);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  function noise(dur: number, gain = 0.04, hp = 400) {
    const c = ctx;
    if (!c || !sfx || muted) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = c.createGain();
    const now = c.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start(now);
    src.stop(now + dur);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock,
    setMuted(next) {
      muted = next;
      if (master && ctx) ramp(master.gain, ctx, next ? 0 : 0.85);
    },
    grab() {
      const t = performance.now();
      if (t - lastGrab < 80) return;
      lastGrab = t;
      tone(620 + Math.random() * 80, 0.07, "sine", 0.05, 80);
    },
    merge(mass, mixed) {
      const base = 220 - Math.min(120, Math.sqrt(mass) * 4);
      if (mixed) {
        tone(base * 0.7, 0.22, "triangle", 0.09, -80);
        noise(0.12, 0.035, 200);
      } else {
        tone(base, 0.16, "sine", 0.1, -50);
        tone(base * 1.5, 0.1, "sine", 0.04, 40);
        noise(0.08, 0.025, 600);
      }
    },
    split() {
      tone(880, 0.1, "sine", 0.06, 220);
      tone(420, 0.14, "triangle", 0.04, -30);
    },
    win() {
      tone(392, 0.28, "sine", 0.08, 20);
      setTimeout(() => tone(523, 0.32, "sine", 0.08, 30), 120);
      setTimeout(() => tone(659, 0.4, "sine", 0.07, 10), 240);
    },
    bounce() {
      const t = performance.now();
      if (t - lastBounce < 70) return;
      lastBounce = t;
      tone(180 + Math.random() * 40, 0.05, "sine", 0.03);
    },
  };
}
