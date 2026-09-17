import { PuraSim, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { FusionSimulation } from '../fusion-lab/simulation';

export const FIRST_SCENE = {
  width: 550, height: 650, purity: .9,
  goal: { x: 155, y: 132, r: 103 },
  drops: [
    { x: 130, y: 510, r: 44, hue: 'cyan' },
    { x: 125, y: 312, r: 44, hue: 'cyan' },
    { x: 410, y: 515, r: 44, hue: 'cyan' },
    { x: 298, y: 377, r: 55, hue: 'rose' },
    { x: 392, y: 221, r: 50, hue: 'rose' },
  ],
} as const;
const CYAN_TOTAL = FIRST_SCENE.drops.filter(d => d.hue === 'cyan').reduce((n, d) => n + d.r ** 2, 0);
const copy = (drops: Drop[]) => drops.map(d => ({ ...d, pigment: { ...d.pigment } }));
type Checkpoint = { drops: Drop[]; completed: boolean };
export type SceneState = { gathered: number; purity: number; contaminated: boolean; ready: boolean; inGoal: boolean; completed: boolean; canUndo: boolean };

export class PuritySimulation extends FusionSimulation {
  private history: Checkpoint[] = [];
  private settling = 0;
  completed = false;
  constructor() { super(); this.reset(); }

  override reset() {
    this.width = FIRST_SCENE.width; this.height = FIRST_SCENE.height;
    this.history = []; this.settling = 0; this.completed = false;
    this.restore(FIRST_SCENE.drops.map((d, i) => ({
      id: 1000 + i, x: d.x, y: d.y, r: d.r, renderR: d.r, vx: 0, vy: 0,
      mass: d.r ** 2, pigment: { cyan: d.hue === 'cyan' ? d.r ** 2 : 0, rose: d.hue === 'rose' ? d.r ** 2 : 0, amber: 0 }, freshness: 0,
    })));
  }
  private restore(drops: Drop[]) {
    this.core = new PuraSim(); this.core.level = SANDBOX;
    // This short scene deliberately uses the already-tested free-contact rule.
    this.core.fusionPolicy = 'all-colors';
    this.core.resize(this.width, this.height);
    // Fresh IDs cannot collide with the new core's generated IDs after an undo.
    this.core.drops = copy(drops).map((d, i) => ({ ...d, id: 1000 + i, vx: 0, vy: 0 }));
    this.events = [];
    this.core.onFusion = (a, b, result) => this.events.push({ a, b, result });
    this.core.quota = { cyan: CYAN_TOTAL, rose: 55 ** 2 + 50 ** 2, amber: 0 };
  }
  override resize(_width: number, _height: number) {
    // A fixed logical board preserves route widths and undo checkpoints on rotation.
    this.release(); this.core.resize(this.width, this.height);
  }
  override grab(id: number) {
    if (!this.core.drops.some(d => d.id === id)) return false;
    this.history.push({ drops: copy(this.core.drops), completed: this.completed });
    if (this.history.length > 50) this.history.shift();
    this.settling = 0;
    return super.grab(id);
  }
  undo() {
    const previous = this.history.pop(); if (!previous) return false;
    this.restore(previous.drops); this.completed = previous.completed; this.settling = 0;
    return true;
  }
  state(): SceneState {
    const carrier = this.core.drops.reduce<Drop | undefined>((best, d) => !best || d.pigment.cyan > best.pigment.cyan ? d : best, undefined);
    const gathered = carrier ? carrier.pigment.cyan / CYAN_TOTAL : 0;
    const carriedMass = this.core.drops.filter(d => d.pigment.cyan > 0).reduce((n, d) => n + d.mass, 0);
    const purity = carriedMass > 0 ? CYAN_TOTAL / carriedMass : 0;
    const ready = gathered >= 1 - 1e-8 && purity >= FIRST_SCENE.purity;
    const goal = FIRST_SCENE.goal;
    const inGoal = !!carrier && Math.hypot(carrier.x - goal.x, carrier.y - goal.y) + carrier.r <= goal.r;
    const contaminated = this.core.drops.some(d => d.pigment.cyan > 0 && d.pigment.rose > 0);
    return { gathered, purity, ready, inGoal, contaminated, completed: this.completed, canUndo: this.history.length > 0 };
  }
  override tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    super.tick(dt);
    if (this.completed) return;
    const state = this.state();
    const carrier = this.core.drops.find(d => d.pigment.cyan >= CYAN_TOTAL - 1e-6);
    const resting = carrier && Math.hypot(carrier.vx, carrier.vy) < 28;
    this.settling = state.ready && state.inGoal && resting && this.core.grabbedId === null ? this.settling + Math.min(dt, 1 / 12) : 0;
    if (this.settling >= .45) this.completed = true;
  }
}
