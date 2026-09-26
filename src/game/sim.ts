import {
  addPigment,
  dominantHue,
  emptyPigment,
  mixRgb,
  pigmentMass,
  purityOf,
  type HueId,
  type Pigment,
} from "./palette";
import { getLevel, SANDBOX_COUNT, type LevelDef } from "./levels";

export type Drop = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  renderR: number;
  mass: number;
  pigment: Pigment;
  freshness: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  rgb: [number, number, number];
};

export type ContactKind = "wall" | "obstacle" | "drop";

/**
 * Player-adjustable physics for the free mode. The defaults are the legacy
 * constants, so every other mode behaves exactly as before.
 */
export type Tuning = {
  /** Velocity kept per 1/60 s step (legacy 0.992): lower is more viscous. */
  damp: number;
  /** Spring from finger to held drop (legacy 36) and its damping (legacy 10). */
  grabK: number;
  grabDamp: number;
  /** Constant sliding friction, board units per second² (legacy 0). */
  friction: number;
  /** Multiplier on the legacy weak same-colour pull and other-colour push (legacy 1). */
  attraction: number;
};
export const LEGACY_TUNING: Readonly<Tuning> = Object.freeze({ damp: 0.992, grabK: 36, grabDamp: 10, friction: 0, attraction: 1 });

export type CoreStat = {
  hue: HueId;
  mass: number;
  target: number;
  purity: number;
  done: boolean;
};

export type HudSnap = {
  cores: CoreStat[];
  selectedPurity: number | null;
  selectedHue: HueId | null;
  elapsed: number;
  won: boolean;
  sandbox: boolean;
  hint: string;
  name: string;
  code: string;
  purityGoal: number;
  drops: number;
};

export type RenderFrame = {
  drops: Drop[];
  particles: Particle[];
  grabbedId: number | null;
  pointer: { x: number; y: number } | null;
  shake: { x: number; y: number };
  w: number;
  h: number;
  pad: number;
};

const STEP = 1 / 60;
const MASS_K = 1;
const MIN_R = 7;
const REST = 0.38;
const MIX_MERGE = 0.58;
const MIX_SPEED = 200;
const MAX_SPEED = 760;
const MAX_PARTICLES = 180;
const PRESS_MIX_SECONDS = 0.35;

function massOfR(r: number): number {
  return r * r * MASS_K;
}

function rOfMass(m: number): number {
  return Math.sqrt(Math.max(m, MIN_R * MIN_R) / MASS_K);
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class PuraSim {
  w = 0;
  h = 0;
  pad = 28;
  drops: Drop[] = [];
  particles: Particle[] = [];
  level: LevelDef = getLevel(1)!;
  quota: Record<HueId, number> = { cyan: 0, rose: 0, amber: 0 };
  grabbedId: number | null = null;
  pointer: { x: number; y: number } | null = null;
  elapsed = 0;
  won = false;
  winPosted = false;
  trauma = 0;
  time = 0;
  reducedMotion = false;
  sandboxTotal: number = SANDBOX_COUNT.fallback;
  /** Opt-in material study; normal gameplay keeps its original collision rules. */
  /**
   * 'held-press' (opt-in, open play): the legacy rules, plus a reachable G-06.
   * The legacy overlap threshold cannot be reached by large drops because each
   * substep resolves the overlap; here a held drop that keeps pressing into a
   * different colour slowly for PRESS_MIX_SECONDS mixes with it.
   */
  fusionPolicy: 'legacy' | 'all-colors' | 'held-press' = 'legacy';
  tuning: Tuning = { ...LEGACY_TUNING };
  private pressPartner: number | null = null;
  private pressTime = 0;
  private pressedThisStep = false;
  /** Optional solid circular islands, used only by the new chapter scenes. */
  obstacles: ReadonlyArray<{ x: number; y: number; r: number }> = [];
  private nextId = 1;
  private acc = 0;
  private last: Drop[] = [];
  private prevTap: { t: number; x: number; y: number } | null = null;
  private spawnW = 0;
  private spawnH = 0;
  private seeded = false;
  onWin: ((stars: number, time: number, purity: number) => void) | null = null;
  onMerge: ((mass: number, mixed: boolean) => void) | null = null;
  /** Detached snapshots for presentation; observers cannot alter the simulation. */
  onFusion: ((a: Drop, b: Drop, result: Drop) => void) | null = null;
  /**
   * Presentation-only contact observation. The vector is the velocity change
   * the contact applied, in board units per second; it points away from the
   * surface that was hit. Observers receive numbers, not the live drop.
   */
  onContact: ((id: number, impulseX: number, impulseY: number, kind: ContactKind) => void) | null = null;
  onGrab: (() => void) | null = null;
  onSplit: (() => void) | null = null;
  onBounce: (() => void) | null = null;

  resize(w: number, h: number) {
    const nw = Math.max(0, w);
    const nh = Math.max(0, h);
    this.w = nw;
    this.h = nh;
    this.pad = Math.max(22, Math.min(Math.max(nw, 1), Math.max(nh, 1)) * 0.04);
    if (this.maybeReseed()) return;
    for (const d of this.drops) this.clamp(d);
  }

  private maybeReseed(): boolean {
    if (!this.seeded) return false;
    if (this.w < 120 || this.h < 120) return false;
    const drifted =
      Math.abs(this.w - this.spawnW) > 40 || Math.abs(this.h - this.spawnH) > 40;
    if (!this.drops.length || (drifted && this.elapsed < 1.8)) {
      this.load(this.level.id);
      return true;
    }
    return false;
  }

  load(id: number) {
    const def = getLevel(id);
    if (!def) return;
    this.level = def;
    this.drops = [];
    this.particles = [];
    this.grabbedId = null;
    this.pointer = null;
    this.elapsed = 0;
    this.won = false;
    this.winPosted = false;
    this.trauma = 0;
    this.acc = 0;
    this.nextId = 1;
    this.quota = { cyan: 0, rose: 0, amber: 0 };
    this.seeded = true;
    if (this.w >= 120 && this.h >= 120) {
      this.spawn(def);
      this.spawnW = this.w;
      this.spawnH = this.h;
    } else {
      this.spawnW = 0;
      this.spawnH = 0;
    }
    this.last = this.drops.map((d) => ({ ...d, pigment: { ...d.pigment } }));
  }

  private spawn(def: LevelDef) {
    const innerW = Math.max(40, this.w - this.pad * 2);
    const innerH = Math.max(40, this.h - this.pad * 2);
    const attempts = def.sandbox ? 180 : 80;
    const hues = def.colors;
    const perColor = def.sandbox
      ? Math.max(1, Math.round(this.sandboxTotal / Math.max(1, hues.length)))
      : def.perColor;
    const crowd = def.sandbox ? perColor / 20 : 1;
    const rMin = def.sandbox ? 8 + (1 - crowd) * 5 : def.rMin;
    const rMax = def.sandbox ? 13 + (1 - crowd) * 6 : def.rMax;
    for (const hue of hues) {
      for (let i = 0; i < perColor; i++) {
        const r = rand(rMin, rMax);
        let x = 0;
        let y = 0;
        let ok = false;
        for (let a = 0; a < attempts; a++) {
          x = this.pad + r + Math.random() * (innerW - r * 2);
          y = this.pad + r + Math.random() * (innerH - r * 2);
          const gap = a < 50 ? 6 : a < 110 ? 2 : 0;
          ok = this.drops.every((d) => {
            const dx = d.x - x;
            const dy = d.y - y;
            return dx * dx + dy * dy > (d.r + r + gap) ** 2;
          });
          if (ok) break;
        }
        const pigment = emptyPigment();
        pigment[hue] = massOfR(r);
        this.quota[hue] += pigment[hue];
        this.drops.push({
          id: this.nextId++,
          x,
          y,
          vx: rand(-12, 12),
          vy: rand(-12, 12),
          r,
          renderR: r,
          mass: pigment[hue],
          pigment,
          freshness: 0,
        });
      }
    }
  }

  pointerDown(x: number, y: number): boolean {
    const now = this.time;
    const prev = this.prevTap;
    if (prev && now - prev.t < 0.32) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      if (dx * dx + dy * dy < 36 * 36) {
        const split = this.trySplit(x, y);
        this.prevTap = null;
        if (split) return true;
      }
    }
    this.prevTap = { t: now, x, y };

    let best: Drop | null = null;
    let bestD = Infinity;
    for (const d of this.drops) {
      const dx = d.x - x;
      const dy = d.y - y;
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(36, d.r + 22);
      if (dist < reach && dist - d.r < bestD) {
        bestD = dist - d.r;
        best = d;
      }
    }
    this.pointer = { x, y };
    if (best) {
      this.grabbedId = best.id;
      this.onGrab?.();
      return true;
    }
    this.grabbedId = null;
    return false;
  }

  pointerMove(x: number, y: number) {
    if (this.pointer) this.pointer = { x, y };
  }

  pointerUp() {
    this.grabbedId = null;
    this.pointer = null;
  }

  /** The legacy double-tap separation, for callers that detect the double tap themselves. */
  splitAt(x: number, y: number): boolean {
    return this.trySplit(x, y);
  }

  private trySplit(x: number, y: number): boolean {
    let target: Drop | null = null;
    let best = Infinity;
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < d.r + 10 && dist < best) {
        best = dist;
        target = d;
      }
    }
    if (!target) return false;
    const pur = purityOf(target.pigment);
    if (pur > 0.995) return false;
    const dom = dominantHue(target.pigment);
    const ejected: HueId[] = [];
    for (const hue of ["cyan", "rose", "amber"] as HueId[]) {
      if (hue === dom) continue;
      if (target.pigment[hue] > massOfR(MIN_R + 1)) ejected.push(hue);
    }
    if (ejected.length === 0) return false;

    for (const hue of ejected) {
      const m = target.pigment[hue];
      target.pigment[hue] = 0;
      const r = rOfMass(m);
      const ang = Math.random() * Math.PI * 2;
      const drop: Drop = {
        id: this.nextId++,
        x: target.x + Math.cos(ang) * (target.r + r + 4),
        y: target.y + Math.sin(ang) * (target.r + r + 4),
        vx: target.vx + Math.cos(ang) * 180,
        vy: target.vy + Math.sin(ang) * 180,
        r,
        renderR: r * 0.4,
        mass: m,
        pigment: emptyPigment(),
        freshness: 0.5,
      };
      drop.pigment[hue] = m;
      this.drops.push(drop);
      this.burst(drop.x, drop.y, mixRgb(drop.pigment), 8);
    }
    target.mass = pigmentMass(target.pigment);
    target.r = rOfMass(target.mass);
    this.clamp(target);
    this.trauma = Math.min(1, this.trauma + 0.25);
    this.onSplit?.();
    return true;
  }

  tick(dt: number) {
    const capped = Math.min(dt, 0.1);
    this.time += capped;
    if (!this.won) this.elapsed += capped;
    this.acc += capped;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.last = this.drops.map((d) => ({
        ...d,
        pigment: { ...d.pigment },
      }));
      this.physics(STEP);
      this.acc -= STEP;
      steps++;
    }
    const alpha = this.acc / STEP;
    this.present(alpha);
    this.ageParticles(capped);
    if (!this.reducedMotion) {
      this.trauma = Math.max(0, this.trauma - capped * 2.4);
    } else {
      this.trauma = 0;
    }
    if (!this.level.sandbox && !this.won) this.checkWin();
  }

  private capSpeed(d: Drop) {
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > MAX_SPEED) {
      const s = MAX_SPEED / sp;
      d.vx *= s;
      d.vy *= s;
    }
  }

  private stabilize(d: Drop) {
    if (
      !Number.isFinite(d.x) ||
      !Number.isFinite(d.y) ||
      !Number.isFinite(d.vx) ||
      !Number.isFinite(d.vy) ||
      !Number.isFinite(d.mass) ||
      d.mass < 1e-3
    ) {
      d.x = this.w * 0.5;
      d.y = this.h * 0.5;
      d.vx = 0;
      d.vy = 0;
      d.mass = Math.max(d.mass, massOfR(MIN_R));
      if (!Number.isFinite(d.mass) || d.mass < 1e-3) d.mass = massOfR(MIN_R);
      d.r = rOfMass(d.mass);
      d.renderR = d.r;
    }
    this.capSpeed(d);
  }

  private physics(dt: number) {
    this.pressedThisStep = false;
    const grabbed = this.drops.find((d) => d.id === this.grabbedId) ?? null;
    const p = this.pointer;

    if (grabbed && p) {
      const k = this.tuning.grabK;
      const damp = this.tuning.grabDamp;
      const ax = (p.x - grabbed.x) * k - grabbed.vx * damp;
      const ay = (p.y - grabbed.y) * k - grabbed.vy * damp;
      grabbed.vx += ax * dt;
      grabbed.vy += ay * dt;
    }

    const gHue = grabbed ? dominantHue(grabbed.pigment) : null;

    for (const d of this.drops) {
      if (this.level.currents) {
        const t = this.time;
        d.vx += Math.sin(d.y * 0.012 + t * 0.55) * 28 * dt;
        d.vy += Math.cos(d.x * 0.01 + t * 0.4) * 24 * dt;
      }

      if (grabbed && d !== grabbed && gHue) {
        const dx = grabbed.x - d.x;
        const dy = grabbed.y - d.y;
        const dist2 = dx * dx + dy * dy;
        const dist = Math.sqrt(dist2) + 1e-4;
        if (dist < 240) {
          const same = dominantHue(d.pigment) === gHue;
          const fall = 1 / (dist2 + 1400);
          const mag = (same ? 4800 : -2200) * fall * this.tuning.attraction;
          d.vx += (dx / dist) * mag * dt;
          d.vy += (dy / dist) * mag * dt;
        }
      }

      d.vx *= this.tuning.damp;
      d.vy *= this.tuning.damp;
      if (this.tuning.friction > 0 && d.id !== this.grabbedId) {
        const speed = Math.hypot(d.vx, d.vy);
        const slow = Math.min(speed, this.tuning.friction * dt);
        if (speed > 0) { d.vx -= (d.vx / speed) * slow; d.vy -= (d.vy / speed) * slow; }
      }
      this.stabilize(d);
      d.freshness = Math.max(0, d.freshness - dt * 1.6);
    }

    let maxV = 0;
    let minR = 40;
    for (const d of this.drops) {
      maxV = Math.max(maxV, Math.hypot(d.vx, d.vy));
      minR = Math.min(minR, d.r);
    }
    const subs = Math.max(1, Math.min(8, Math.ceil((maxV * dt) / Math.max(4, minR * 0.4))));
    const sdt = dt / subs;
    for (let s = 0; s < subs; s++) {
      for (const d of this.drops) {
        d.x += d.vx * sdt;
        d.y += d.vy * sdt;
        this.clamp(d, true);
      }
      this.collide(sdt);
      // Iterate shared contacts so a large drop cannot remain embedded between two islands.
      if (this.obstacles.length) for (let pass = 0; pass < 12; pass++) {
        let corrected = false;
        for (const d of this.drops) for (const obstacle of this.obstacles) {
        const dx = d.x - obstacle.x, dy = d.y - obstacle.y;
        const distance = Math.hypot(dx, dy), reach = d.r + obstacle.r;
        if (distance >= reach - 1e-8) continue;
        corrected = true;
        const nx = distance > 1e-8 ? dx / distance : 0;
        const ny = distance > 1e-8 ? dy / distance : 1;
        d.x = obstacle.x + nx * reach; d.y = obstacle.y + ny * reach;
        const approach = d.vx * nx + d.vy * ny;
        if (approach < 0) {
          d.vx -= (1 + REST) * approach * nx; d.vy -= (1 + REST) * approach * ny;
          this.onContact?.(d.id, -(1 + REST) * approach * nx, -(1 + REST) * approach * ny, "obstacle");
        }
        }
        if (!corrected) break;
      }
    }
    // A press only counts while it continues without a break.
    if (!this.pressedThisStep) { this.pressTime = 0; this.pressPartner = null; }
  }

  private clamp(d: Drop, report = false) {
    const minX = this.pad + d.r;
    const maxX = this.w - this.pad - d.r;
    const minY = this.pad + d.r;
    const maxY = this.h - this.pad - d.r;
    const vx = d.vx;
    const vy = d.vy;
    let ix = 0;
    let iy = 0;
    if (d.x < minX) {
      d.x = minX;
      d.vx = Math.abs(d.vx) * REST;
      ix = Math.abs(d.vx - vx);
    } else if (d.x > maxX) {
      d.x = maxX;
      d.vx = -Math.abs(d.vx) * REST;
      ix = -Math.abs(d.vx - vx);
    }
    if (d.y < minY) {
      d.y = minY;
      d.vy = Math.abs(d.vy) * REST;
      iy = Math.abs(d.vy - vy);
    } else if (d.y > maxY) {
      d.y = maxY;
      d.vy = -Math.abs(d.vy) * REST;
      iy = -Math.abs(d.vy - vy);
    }
    // Resize and split also clamp; only physics substeps are real contacts.
    if (report && (ix || iy)) this.onContact?.(d.id, ix, iy, "wall");
  }

  private closestApproach(a: Drop, b: Drop, dt: number): number {
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const v2 = rvx * rvx + rvy * rvy;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (v2 < 1e-8) return Math.hypot(dx, dy);
    const sx = dx - rvx * dt;
    const sy = dy - rvy * dt;
    const t = Math.max(0, Math.min(dt, -((sx * rvx + sy * rvy) / v2)));
    return Math.hypot(sx + rvx * t, sy + rvy * t);
  }

  private collide(dt: number) {
    const list = this.drops;
    const n = list.length;
    const merged = new Set<number>();

    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (!a || merged.has(a.id)) continue;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (!b || merged.has(b.id) || merged.has(a.id)) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy;
        const min = a.r + b.r;
        const dist = Math.sqrt(Math.max(dist2, 0));
        const sameDom = dominantHue(a.pigment) === dominantHue(b.pigment);
        const grabbedPair = this.grabbedId === a.id || this.grabbedId === b.id;
        const rel = Math.hypot(b.vx - a.vx, b.vy - a.vy);

        const canContactMerge = sameDom || this.fusionPolicy === 'all-colors';
        const swept = canContactMerge && this.closestApproach(a, b, dt) < min + 1.5;
        const touching = dist < min + 2.2;

        if (canContactMerge && (touching || swept || dist2 < 1e-6)) {
          this.merge(a, b, merged);
          continue;
        }

        if (dist2 >= min * min) {
          if (sameDom && dist < min + 12) {
            const pull = ((min + 12 - dist) / min) * 90 * this.tuning.attraction;
            const nx = dx / (dist + 1e-6);
            const ny = dy / (dist + 1e-6);
            a.vx += nx * pull * dt;
            a.vy += ny * pull * dt;
            b.vx -= nx * pull * dt;
            b.vy -= ny * pull * dt;
          }
          continue;
        }

        if (dist2 < 1e-8) {
          if (sameDom) this.merge(a, b, merged);
          continue;
        }

        const overlap = min - dist;
        const slowMix =
          grabbedPair && overlap > MIX_MERGE * Math.min(a.r, b.r) && rel < MIX_SPEED;

        if (!slowMix && this.fusionPolicy === 'held-press' && grabbedPair && rel < MIX_SPEED && this.pointer) {
          const held = this.grabbedId === a.id ? a : b;
          const other = held === a ? b : a;
          const toward = Math.hypot(other.x - held.x, other.y - held.y) || 1;
          const push = ((this.pointer.x - held.x) * (other.x - held.x) + (this.pointer.y - held.y) * (other.y - held.y)) / toward;
          if (push > held.r * 0.25) {
            this.pressTime = this.pressPartner === other.id ? this.pressTime + dt : dt;
            this.pressPartner = other.id;
            this.pressedThisStep = true;
            if (this.pressTime >= PRESS_MIX_SECONDS) {
              this.pressTime = 0; this.pressPartner = null;
              this.merge(a, b, merged);
              continue;
            }
          }
        }

        if (slowMix) {
          this.merge(a, b, merged);
          continue;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const total = Math.max(1e-6, a.mass + b.mass);
        a.x -= nx * overlap * (b.mass / total);
        a.y -= ny * overlap * (b.mass / total);
        b.x += nx * overlap * (a.mass / total);
        b.y += ny * overlap * (a.mass / total);
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const inv = 1 / Math.max(1e-6, a.mass) + 1 / Math.max(1e-6, b.mass);
          const jimp = (-(1 + REST) * rv) / inv;
          a.vx -= (jimp / Math.max(1e-6, a.mass)) * nx;
          a.vy -= (jimp / Math.max(1e-6, a.mass)) * ny;
          b.vx += (jimp / Math.max(1e-6, b.mass)) * nx;
          b.vy += (jimp / Math.max(1e-6, b.mass)) * ny;
          if (this.onContact) {
            const ja = jimp / Math.max(1e-6, a.mass);
            const jb = jimp / Math.max(1e-6, b.mass);
            this.onContact(a.id, -ja * nx, -ja * ny, "drop");
            this.onContact(b.id, jb * nx, jb * ny, "drop");
          }
          this.capSpeed(a);
          this.capSpeed(b);
          if (overlap > 3) this.onBounce?.();
        }
      }
    }

    if (merged.size) {
      this.drops = this.drops.filter((d) => !merged.has(d.id));
    }
  }

  private merge(a: Drop, b: Drop, merged: Set<number>) {
    if (merged.has(a.id) || merged.has(b.id)) return;
    const pigment = addPigment(a.pigment, b.pigment);
    const mass = pigmentMass(pigment);
    if (mass < 1e-4) return;
    merged.add(a.id);
    merged.add(b.id);
    const r = rOfMass(mass);
    const mixed = purityOf(pigment) < 0.995;
    const drop: Drop = {
      id: this.nextId++,
      x: (a.x * a.mass + b.x * b.mass) / mass,
      y: (a.y * a.mass + b.y * b.mass) / mass,
      vx: (a.vx * a.mass + b.vx * b.mass) / mass,
      vy: (a.vy * a.mass + b.vy * b.mass) / mass,
      r,
      renderR: Math.max(a.r, b.r),
      mass,
      pigment,
      freshness: mixed ? 0.35 : 0.55,
    };
    this.stabilize(drop);
    this.drops.push(drop);
    if (this.grabbedId === a.id || this.grabbedId === b.id) {
      this.grabbedId = drop.id;
    }
    this.burst(drop.x, drop.y, mixRgb(pigment), mixed ? 10 : 14);
    this.trauma = Math.min(1, this.trauma + (mixed ? 0.18 : 0.28) * Math.min(1, r / 50));
    this.onMerge?.(mass, mixed);
    if (this.onFusion) {
      const copy = (d: Drop): Drop => ({ ...d, pigment: { ...d.pigment } });
      this.onFusion(copy(a), copy(b), copy(drop));
    }
  }

  private burst(x: number, y: number, rgb: [number, number, number], n: number) {
    const room = MAX_PARTICLES - this.particles.length;
    const count = Math.min(n, room);
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const sp = 40 + Math.random() * 90;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 1,
        max: 0.45 + Math.random() * 0.3,
        r: 1.4 + Math.random() * 2.2,
        rgb,
      });
    }
  }

  private ageParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt / p.max;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    if (this.particles.length) {
      this.particles = this.particles.filter((p) => p.life > 0);
    }
  }

  private present(alpha: number) {
    const byId = new Map(this.last.map((d) => [d.id, d]));
    for (const d of this.drops) {
      const prev = byId.get(d.id);
      if (prev) {
        d.renderR = prev.renderR + (d.r - prev.renderR) * Math.min(1, 0.18 + alpha * 0.1);
      } else {
        d.renderR += (d.r - d.renderR) * 0.18;
      }
    }
  }

  private checkWin() {
    const cores = this.coreStats();
    if (cores.length === 0) return;
    if (cores.every((c) => c.done)) {
      this.won = true;
      if (!this.winPosted) {
        this.winPosted = true;
        const avg = cores.reduce((s, c) => s + c.purity, 0) / cores.length;
        const stars = avg >= 0.995 ? 3 : avg >= this.level.purity + 0.04 ? 2 : 1;
        this.trauma = Math.min(1, this.trauma + 0.5);
        this.onWin?.(stars, this.elapsed, avg);
      }
    }
  }

  coreStats(): CoreStat[] {
    return this.level.colors.map((hue) => {
      const target = this.quota[hue] * this.level.targetFrac;
      let bestMass = 0;
      let bestPur = 0;
      for (const d of this.drops) {
        if (dominantHue(d.pigment) !== hue) continue;
        const pur = purityOf(d.pigment);
        if (pur < this.level.purity) continue;
        if (d.mass > bestMass) {
          bestMass = d.mass;
          bestPur = pur;
        }
      }
      return {
        hue,
        mass: bestMass,
        target,
        purity: bestPur,
        done: bestMass >= target && bestPur >= this.level.purity,
      };
    });
  }

  hud(): HudSnap {
    const grabbed = this.drops.find((d) => d.id === this.grabbedId);
    let hint = this.level.hint;
    if (grabbed && !this.level.sandbox) {
      const pur = purityOf(grabbed.pigment);
      if (pur < this.level.purity) {
        hint = "純度が落ちた。同色を足すか、ダブルタップで分離。";
      }
    }
    return {
      cores: this.coreStats(),
      selectedPurity: grabbed ? purityOf(grabbed.pigment) : null,
      selectedHue: grabbed ? dominantHue(grabbed.pigment) : null,
      elapsed: this.elapsed,
      won: this.won,
      sandbox: Boolean(this.level.sandbox),
      hint,
      name: this.level.name,
      code: this.level.code,
      purityGoal: this.level.purity,
      drops: this.drops.length,
    };
  }

  frame(): RenderFrame {
    const t = this.time;
    const s = this.trauma * this.trauma;
    return {
      drops: this.drops,
      particles: this.particles,
      grabbedId: this.grabbedId,
      pointer: this.pointer,
      shake: {
        x: s * 7 * Math.sin(t * 41.3),
        y: s * 7 * Math.cos(t * 33.7),
      },
      w: this.w,
      h: this.h,
      pad: this.pad,
    };
  }
}
