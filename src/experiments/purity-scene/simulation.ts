import { PuraSim, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { FusionSimulation } from '../fusion-lab/simulation';

import { CHAPTERS, getChapter, type SceneHue } from './chapters';

// Compatibility fixture for the approved first scene and its regression tests.
export const FIRST_SCENE = { ...CHAPTERS[0], goal: CHAPTERS[0].goals[0] };
const copy = (drops: Drop[]) => drops.map(d => ({ ...d, pigment: { ...d.pigment } }));
type Checkpoint = { drops: Drop[]; completed: boolean };
export type TargetState = { hue: SceneHue; count: number; gathered: number; purity: number; ready: boolean; inGoal: boolean; delivered: boolean };
export type SceneState = { targets: TargetState[]; gathered: number; purity: number; contaminated: boolean; ready: boolean; inGoal: boolean; completed: boolean; canUndo: boolean };

export class PuritySimulation extends FusionSimulation {
  private history: Checkpoint[] = [];
  private settling: Record<string, number> = {};
  chapterId = 1;
  get chapter() { return getChapter(this.chapterId); }
  completed = false;
  constructor(chapterId = 1) { super(); this.chapterId = getChapter(chapterId).id; this.reset(); }

  override reset() {
    this.width = this.chapter.width; this.height = this.chapter.height;
    this.history = []; this.settling = {}; this.completed = false;
    this.restore(this.chapter.drops.map((d, i) => ({
      id: 1000 + i, x: d.x, y: d.y, r: d.r, renderR: d.r, vx: 0, vy: 0,
      mass: d.r ** 2, pigment: { cyan: d.hue === 'cyan' ? d.r ** 2 : 0, rose: d.hue === 'rose' ? d.r ** 2 : 0, amber: 0 }, freshness: 0,
    })));
  }
  private restore(drops: Drop[]) {
    this.core = new PuraSim(); this.core.level = SANDBOX;
    // This short scene deliberately uses the already-tested free-contact rule.
    this.core.fusionPolicy = 'all-colors';
    this.core.obstacles = this.chapter.obstacles;
    this.core.resize(this.width, this.height);
    // Fresh IDs cannot collide with the new core's generated IDs after an undo.
    this.core.drops = copy(drops).map((d, i) => ({ ...d, id: 1000 + i, vx: 0, vy: 0 }));
    this.observe();
    this.core.quota = { cyan: this.total('cyan'), rose: this.total('rose'), amber: 0 };
  }
  override resize(_width: number, _height: number) {
    // A fixed logical board preserves route widths and undo checkpoints on rotation.
    this.release(); this.core.resize(this.width, this.height);
  }
  override grab(id: number) {
    if (!this.core.drops.some(d => d.id === id)) return false;
    this.history.push({ drops: copy(this.core.drops), completed: this.completed });
    if (this.history.length > 50) this.history.shift();
    this.settling = {};
    return super.grab(id);
  }
  undo() {
    const previous = this.history.pop(); if (!previous) return false;
    this.restore(previous.drops); this.completed = previous.completed; this.settling = {};
    return true;
  }
  private total(hue: SceneHue) { return this.chapter.drops.filter(d => d.hue === hue).reduce((n, d) => n + d.r ** 2, 0); }
  state(): SceneState {
    const targets = this.chapter.goals.map(goal => {
      const total = this.total(goal.hue);
      const carrier = this.core.drops.reduce<Drop | undefined>((best, d) => !best || d.pigment[goal.hue] > best.pigment[goal.hue] ? d : best, undefined);
      const gathered = carrier ? carrier.pigment[goal.hue] / total : 0;
      const carriedMass = this.core.drops.filter(d => d.pigment[goal.hue] > 0).reduce((n, d) => n + d.mass, 0);
      const purity = carriedMass > 0 ? total / carriedMass : 0;
      const ready = gathered >= 1 - 1e-8 && purity >= this.chapter.purity;
      const inGoal = !!carrier && Math.hypot(carrier.x - goal.x, carrier.y - goal.y) + carrier.r <= goal.r;
      return { hue: goal.hue, count: this.chapter.drops.filter(d => d.hue === goal.hue).length, gathered, purity, ready, inGoal, delivered: (this.settling[goal.hue] ?? 0) >= .45 };
    });
    const contaminated = this.core.drops.some(d => d.pigment.cyan > 0 && d.pigment.rose > 0);
    return { targets, gathered: targets[0].gathered, purity: targets[0].purity, ready: targets.every(t => t.ready), inGoal: targets.every(t => t.inGoal), contaminated, completed: this.completed, canUndo: this.history.length > 0 };
  }
  override tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    super.tick(dt);
    for (const target of this.state().targets) {
      const carrier = this.core.drops.find(d => d.pigment[target.hue] >= this.total(target.hue) - 1e-6);
      const resting = carrier && Math.hypot(carrier.vx, carrier.vy) < 28;
      this.settling[target.hue] = target.ready && target.inGoal && resting && this.core.grabbedId !== carrier?.id
        ? (this.settling[target.hue] ?? 0) + Math.min(dt, 1 / 12) : 0;
    }
    if (this.state().targets.every(t => t.delivered)) this.completed = true;
  }
}
