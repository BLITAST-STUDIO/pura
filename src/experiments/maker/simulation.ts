import { boardDrops } from '../boards';
import { FusionSimulation } from '../fusion-lab/simulation';
import { HitofudeSimulation, MAX_PULL, launch } from '../hitofude/simulation';
import { cloneLayout, selectedPiece, shotBoard, type Layout, type Selection } from './layout';

export const MAKER_ENGINE = 1;
export const MAX_SHOTS = 12;
export const STEP = 1 / 120;
export type RecordedShot = { id: number; dx: number; dy: number };
/** Same shot physics, fixed steps and settled starts so a link carries a reproducible clear. */
export class MakerSimulation extends HitofudeSimulation {
  proof: RecordedShot[] = [];
  private accumulated = 0;
  constructor(layout: Layout) { super(shotBoard(layout)); }
  override reset() { super.reset(); this.proof = []; this.accumulated = 0; }
  override grab(id: number) { return this.atRest && super.grab(id); }
  override release() {
    const id = this.core.grabbedId, p = this.core.pointer;
    const d = this.core.drops.find(q => q.id === id);
    if (d && p) {
      let dx = p.x - d.x, dy = p.y - d.y;
      const length = Math.hypot(dx, dy);
      if (length > MAX_PULL) { dx *= MAX_PULL / length; dy *= MAX_PULL / length; }
      dx = Math.round(dx * 10) / 10; dy = Math.round(dy * 10) / 10;
      super.move(d.x + dx, d.y + dy);
      if (launch(dx, dy)) this.proof.push({ id: d.id, dx, dy });
    }
    super.release(); this.accumulated = 0;
  }
  override tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || this.result || this.atRest) return;
    this.accumulated += Math.min(dt, 1 / 12);
    while (this.accumulated + 1e-10 >= STEP) {
      this.accumulated -= STEP; super.tick(STEP);
      if (this.result || this.atRest) {
        for (const d of this.core.drops) { d.vx = 0; d.vy = 0; }
        this.accumulated = 0; break;
      }
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

export function readProof(value: unknown): RecordedShot[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SHOTS) return null;
  const out: RecordedShot[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const p = candidate as RecordedShot;
    if (!Number.isInteger(p.id) || p.id < 0 || p.id > 1012 || !Number.isFinite(p.dx) || !Number.isFinite(p.dy)
      || Math.hypot(p.dx, p.dy) > MAX_PULL + .1 || !launch(p.dx, p.dy)) return null;
    out.push({ id: p.id, dx: p.dx, dy: p.dy });
  }
  return out;
}
/** A bounded replay, independent of the sender's claimed score. No rendering needed. */
export function verifiesClear(layout: Layout, value: unknown): boolean {
  const proof = readProof(value);
  if (!proof) return false;
  const sim = new MakerSimulation(layout);
  for (const shot of proof) {
    if (sim.result) return false;
    const d = sim.core.drops.find(q => q.id === shot.id);
    if (!d || !sim.grab(d.id)) return false;
    sim.move(d.x + shot.dx, d.y + shot.dy); sim.release();
    for (let i = 0; i < 120 * 12 && !sim.result && !sim.atRest; i++) sim.tick(STEP);
    if (!sim.result && !sim.atRest) return false;
  }
  return !!sim.result?.cleared && sim.shots === proof.length;
}
