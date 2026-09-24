import { PuraSim, type ContactKind, type Drop } from '../../game/sim';
import { SANDBOX } from '../../game/levels';
import { emptyPigment } from '../../game/palette';

export type FusionPreset = 'pair' | 'mix' | 'chain';
export type FusionEvent = { a: Drop; b: Drop; result: Drop };
/** Velocity change applied by a wall, island or bounce, in board units per second. */
export type ContactEvent = { id: number; x: number; y: number; kind: ContactKind };
const MAX_PENDING_CONTACTS = 512;
export class FusionSimulation {
  core = new PuraSim();
  events: FusionEvent[] = [];
  /** Drained by the renderer every frame; bounded when nothing is observing. */
  contacts: ContactEvent[] = [];
  preset: FusionPreset = 'pair';
  ratio = 1;
  width = 550;
  height = 650;
  constructor() { this.reset(); }
  reset(preset = this.preset, ratio = this.ratio) {
    this.preset = preset; this.ratio = ratio;
    this.core = new PuraSim();
    this.core.level = SANDBOX;
    this.core.fusionPolicy = preset === 'mix' ? 'all-colors' : 'legacy';
    this.core.resize(this.width, this.height);
    this.observe();
    const total = 68 ** 2 * 2;
    const mixtureRatio = preset === 'mix' ? ratio : 1;
    const amounts = preset === 'chain' ? Array(5).fill(total / 5) : [total * mixtureRatio / (1 + mixtureRatio), total / (1 + mixtureRatio)];
    this.core.drops = amounts.map((mass, i) => {
      const pigment = emptyPigment();
      pigment[preset === 'mix' && i === 1 ? 'rose' : 'cyan'] = mass;
      const r = Math.sqrt(mass);
      const x = preset === 'chain' ? this.width * (.22 + (i % 3) * .28) : this.width * (i ? .7 : .3);
      const y = preset === 'chain' ? this.height * (.35 + Math.floor(i / 3) * .3) : this.height * .49;
      return { id: 1000 + i, x, y, vx: 0, vy: 0, mass, r, renderR: r, pigment, freshness: 0 };
    });
    this.core.quota = { cyan: 0, rose: 0, amber: 0 };
    for (const d of this.core.drops) for (const h of ['cyan', 'rose', 'amber'] as const) this.core.quota[h] += d.pigment[h];
  }
  /** Attach presentation observers to the current core. Physics is unchanged. */
  protected observe() {
    this.events = [];
    this.contacts = [];
    this.core.onFusion = (a, b, result) => this.events.push({ a, b, result });
    this.core.onContact = (id, x, y, kind) => {
      if (this.contacts.length >= MAX_PENDING_CONTACTS) this.contacts.shift();
      this.contacts.push({ id, x, y, kind });
    };
  }
  tick(dt: number) { if (Number.isFinite(dt) && dt > 0) this.core.tick(Math.min(dt, 1 / 12)); }
  resize(width: number, height: number) {
    this.release();
    const oldW = this.width, oldH = this.height;
    this.width = Math.max(550, width); this.height = Math.max(420, height);
    for (const d of this.core.drops) { d.x *= this.width / oldW; d.y *= this.height / oldH; }
    this.core.resize(this.width, this.height);
  }
  grab(id: number) {
    const d = this.core.drops.find(d => d.id === id);
    if (!d) return false;
    // This fixture tests fusion; a double tap must not invoke legacy purification.
    this.core.grabbedId = id; this.core.pointer = { x: d.x, y: d.y }; return true;
  }
  move(x: number, y: number) { this.core.pointerMove(x, y); }
  release() { this.core.pointerUp(); }
}
