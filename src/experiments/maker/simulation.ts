import { boardDrops } from '../boards';
import { FusionSimulation } from '../fusion-lab/simulation';
import { HitofudeSimulation, MAX_PULL, launch } from '../hitofude/simulation';
import { cloneLayout, selectedPiece, shotBoard, type Layout, type Selection } from './layout';

/**
 * Proof formats. Version 1 (a trial that lived a few days) assumed every shot
 * started with the whole board at rest. Version 2 lets a drop be shot while
 * others still move, so each shot records the fixed step it was grabbed (`g`)
 * and let go (`r`) on, counted from the start; replay is exact because the
 * maker steps physics at a fixed rate.
 */
export const MAKER_ENGINE = 2;
export const LEGACY_ENGINE = 1;
export const MAX_SHOTS = 12;
export const STEP = 1 / 120;
/** About three minutes of motion in all; idle time (all at rest, or aiming at rest) is not counted. */
export const MAX_STEPS = 120 * 150;
export type RecordedShot = { id: number; dx: number; dy: number; g?: number; r?: number };
/** Same shot physics, fixed steps and settled starts so a link carries a reproducible clear. */
export class MakerSimulation extends HitofudeSimulation {
  proof: RecordedShot[] = [];
  /** Fixed physics steps executed so far; the clock a proof is written against. */
  steps = 0;
  private accumulated = 0;
  private grabId = -1;
  private grabStep = 0;
  constructor(layout: Layout) { super(shotBoard(layout)); }
  override reset() { super.reset(); this.proof = []; this.accumulated = 0; this.steps = 0; this.grabId = -1; this.grabStep = 0; }
  /** Any drop that is nearly still can be aimed, however much the rest of the board is moving. */
  override grab(id: number) {
    if (!super.grab(id)) return false;
    this.grabId = id; this.grabStep = this.steps;
    return true;
  }
  override release() {
    const id = this.core.grabbedId, p = this.core.pointer;
    const d = this.core.drops.find(q => q.id === id);
    if (d && p) {
      let dx = p.x - d.x, dy = p.y - d.y;
      const length = Math.hypot(dx, dy);
      if (length > MAX_PULL) { dx *= MAX_PULL / length; dy *= MAX_PULL / length; }
      dx = Math.round(dx * 10) / 10; dy = Math.round(dy * 10) / 10;
      super.move(d.x + dx, d.y + dy);
      if (launch(dx, dy)) this.proof.push({ id: this.grabId, dx, dy, g: this.grabStep, r: this.steps });
    }
    super.release(); this.accumulated = 0;
  }
  /** One fixed step, unless the hole is over or everything is at rest. Returns whether time moved. */
  stepOnce(): boolean {
    if (this.result || this.atRest) return false;
    super.tick(STEP); this.steps++;
    if (this.result || this.atRest) for (const d of this.core.drops) { d.vx = 0; d.vy = 0; }
    return true;
  }
  override tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulated += Math.min(dt, 1 / 12);
    while (this.accumulated + 1e-10 >= STEP) {
      this.accumulated -= STEP;
      if (!this.stepOnce()) { this.accumulated = 0; break; }
    }
  }
}
/** Editing moves the initial positions only; it never runs or fuses the physics. */
export class LayoutSimulation extends FusionSimulation {
  layout: Layout | undefined;
  selection: Selection | null = { kind: 'drop', index: 0 };
  constructor(layout: Layout) { super(); this.layout = cloneLayout(layout); this.reset(); }
  override reset() {
    if (!this.layout) { super.reset(); return; }
    this.width = 420; this.height = 560;
    this.core.resize(this.width, this.height);
    this.core.drops = boardDrops(shotBoard(this.layout).drops);
    this.core.obstacles = this.layout.stones.map(p => ({ ...p }));
    this.observe();
  }
  setLayout(layout: Layout) { this.layout = cloneLayout(layout); this.reset(); }
  override tick(_dt: number) {}
  override resize(_w: number, _h: number) { this.abort(); }
  override grab(_id: number) { return false; }
  override selected() { return this.selection?.kind === 'drop' ? 1000 + this.selection.index : null; }
  selectedPoint() { return this.layout ? selectedPiece(this.layout, this.selection) : null; }
}

/** `timed` proofs (version 2) carry the grab and release steps; legacy ones (version 1) do not. */
export function readProof(value: unknown, timed = true): RecordedShot[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SHOTS) return null;
  const out: RecordedShot[] = [];
  let clock = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const p = candidate as RecordedShot;
    if (!Number.isInteger(p.id) || p.id < 0 || p.id > 1012 || !Number.isFinite(p.dx) || !Number.isFinite(p.dy)
      || Math.hypot(p.dx, p.dy) > MAX_PULL + .1 || !launch(p.dx, p.dy)) return null;
    if (!timed) { out.push({ id: p.id, dx: p.dx, dy: p.dy }); continue; }
    // Steps only move forward: grab no earlier than the last release, release no earlier than the grab.
    if (!Number.isInteger(p.g) || !Number.isInteger(p.r) || p.g! < clock || p.r! < p.g! || p.r! > MAX_STEPS) return null;
    clock = p.r!;
    out.push({ id: p.id, dx: p.dx, dy: p.dy, g: p.g, r: p.r });
  }
  return out;
}
/** A bounded replay, independent of the sender's claimed score. No rendering needed. */
export function verifiesClear(layout: Layout, value: unknown, timed = true): boolean {
  const proof = readProof(value, timed);
  if (!proof) return false;
  const sim = new MakerSimulation(layout);
  const advanceTo = (step: number) => { while (sim.steps < step) if (!sim.stepOnce()) return false; return true; };
  for (const shot of proof) {
    if (sim.result) return false;
    if (timed) {
      if (!advanceTo(shot.g!) || !sim.grab(shot.id)) return false;
      if (!advanceTo(shot.r!)) return false;
      // The aimed drop is whichever one now holds the aim (a drop fused while aimed hands it on).
      const held = sim.core.drops.find(q => q.id === sim.core.grabbedId);
      if (!held) return false;
      sim.move(held.x + shot.dx, held.y + shot.dy); sim.release();
    } else {
      // Version 1: every shot starts with the board at rest.
      const d = sim.core.drops.find(q => q.id === shot.id);
      if (!d || !sim.grab(d.id)) return false;
      sim.move(d.x + shot.dx, d.y + shot.dy); sim.release();
      for (let i = 0; i < 120 * 12 && !sim.result && !sim.atRest; i++) sim.stepOnce();
      if (!sim.result && !sim.atRest) return false;
    }
  }
  // After the last shot, let the board play out (bounded).
  for (let i = 0; i < 120 * 12 && sim.steps < MAX_STEPS + 120 * 12 && !sim.result && !sim.atRest; i++) sim.stepOnce();
  return !!sim.result?.cleared && sim.shots === proof.length;
}
