import { SANDBOX } from "../../game/levels";
import { dominantHue, emptyPigment, type HueId } from "../../game/palette";
import { PuraSim } from "../../game/sim";

const STEP_SECONDS = 1 / 60;
// Preserve real-time motion at ordinary lower rendering rates (15/24 FPS),
// while limiting recovery after suspension to five fixed physics steps.
const MAX_FRAME_SECONDS = 1 / 12;
const CONTACT_EPSILON = 1e-6;

export type DropletSnapshot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
  grabbed: boolean;
  pointer: { x: number; y: number } | null;
  /** Approximate wall response, in logical velocity units. Used only by rendering. */
  wallImpulse: { x: number; y: number };
  hue: HueId;
};

/**
 * An isolated, deterministic fixture around the original game's movement rules.
 * Rendering consumes snapshots and never writes visual deformation into physics.
 */
export class DropletSimulation {
  private boardWidth = 1000;
  private boardHeight = 650;
  private readonly radius: number;
  private core: PuraSim;
  private hue: HueId = "cyan";
  private accumulator = 0;
  private wallImpulse = { x: 0, y: 0 };

  constructor(options: { radius?: number } = {}) {
    this.radius = options.radius ?? 68;
    if (!Number.isFinite(this.radius) || this.radius < 7 || this.radius > 280) {
      throw new RangeError("Droplet radius must be between 7 and 280 logical units.");
    }
    this.core = this.createCore();
  }

  private createCore(): PuraSim {
    const core = new PuraSim();
    core.level = SANDBOX;
    // Deliberately never call load(): its random population and reseeding do not
    // belong in the one-drop comparison fixture. An unseeded resize is safe.
    core.resize(this.width, this.height);
    const pigment = emptyPigment();
    const mass = this.radius * this.radius;
    pigment[this.hue] = mass;
    core.quota = { ...pigment };
    core.drops = [{
      id: 1,
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      r: this.radius,
      renderR: this.radius,
      mass,
      pigment,
      freshness: 0,
    }];
    return core;
  }

  get dropCount(): number {
    return this.core.drops.length;
  }

  get width(): number {
    return this.boardWidth;
  }

  get height(): number {
    return this.boardHeight;
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    // Legacy padding is max(22, min(width, height) * .04). Keep at least one
    // unit of usable travel even for a briefly collapsed layout container.
    const minimum = Math.max(this.radius * 2 + 44, this.radius * 2 / 0.92) + 1;
    const nextWidth = Math.max(minimum, width);
    const nextHeight = Math.max(minimum, height);
    if (nextWidth === this.width && nextHeight === this.height) return;

    const drop = this.core.drops[0];
    const oldInset = this.core.pad + drop.r;
    const oldUsableWidth = this.width - oldInset * 2;
    const oldUsableHeight = this.height - oldInset * 2;
    const relativeX = (drop.x - oldInset) / oldUsableWidth;
    const relativeY = (drop.y - oldInset) / oldUsableHeight;
    const pointer = this.core.pointer;
    const vx = drop.vx;
    const vy = drop.vy;

    this.boardWidth = nextWidth;
    this.boardHeight = nextHeight;
    // This core has never been seeded through load(), so resize cannot invoke
    // the legacy early-game random reseed path.
    this.core.resize(nextWidth, nextHeight);
    const inset = this.core.pad + drop.r;
    const usableWidth = this.width - inset * 2;
    const usableHeight = this.height - inset * 2;
    drop.x = inset + relativeX * usableWidth;
    drop.y = inset + relativeY * usableHeight;
    drop.vx = vx;
    drop.vy = vy;
    if (pointer) {
      this.core.pointer = {
        x: inset + (pointer.x - oldInset) / oldUsableWidth * usableWidth,
        y: inset + (pointer.y - oldInset) / oldUsableHeight * usableHeight,
      };
    }
    this.wallImpulse = { x: 0, y: 0 };
  }

  reset(): void {
    // A fresh core also clears its private timestep accumulator and tap history.
    this.core = this.createCore();
    this.accumulator = 0;
    this.wallImpulse = { x: 0, y: 0 };
  }

  setHue(hue: HueId): void {
    this.hue = hue;
    const drop = this.core.drops[0];
    const pigment = emptyPigment();
    pigment[hue] = drop.mass;
    drop.pigment = pigment;
    this.core.quota = { ...pigment };
  }

  pointerDown(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const grabbed = this.core.pointerDown(x, y);
    if (!grabbed) this.core.pointerUp();
    return grabbed;
  }

  pointerMove(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.core.pointerMove(x, y);
  }

  pointerUp(): void {
    // Keep the spring's existing velocity; there is no second throw impulse.
    this.core.pointerUp();
  }

  tick(dtSeconds: number): void {
    this.wallImpulse = { x: 0, y: 0 };
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    this.accumulator += Math.min(dtSeconds, MAX_FRAME_SECONDS);
    while (this.accumulator + Number.EPSILON >= STEP_SECONDS) {
      const drop = this.core.drops[0];
      const beforeVx = drop.vx;
      const beforeVy = drop.vy;
      this.core.tick(STEP_SECONDS);
      this.accumulator = Math.max(0, this.accumulator - STEP_SECONDS);

      const minX = this.core.pad + drop.r;
      const maxX = this.width - minX;
      const minY = this.core.pad + drop.r;
      const maxY = this.height - minY;
      // PuraSim's onBounce currently reports drop/drop collisions only. This
      // boundary observation supplies a visual cue without changing its rules.
      if (drop.x <= minX + CONTACT_EPSILON && drop.vx >= 0) {
        this.wallImpulse.x += Math.abs(drop.vx - beforeVx);
      } else if (drop.x >= maxX - CONTACT_EPSILON && drop.vx <= 0) {
        this.wallImpulse.x -= Math.abs(drop.vx - beforeVx);
      }
      if (drop.y <= minY + CONTACT_EPSILON && drop.vy >= 0) {
        this.wallImpulse.y += Math.abs(drop.vy - beforeVy);
      } else if (drop.y >= maxY - CONTACT_EPSILON && drop.vy <= 0) {
        this.wallImpulse.y -= Math.abs(drop.vy - beforeVy);
      }
    }
  }

  get snapshot(): DropletSnapshot {
    const drop = this.core.drops[0];
    return {
      x: drop.x,
      y: drop.y,
      vx: drop.vx,
      vy: drop.vy,
      r: drop.r,
      mass: drop.mass,
      grabbed: this.core.grabbedId === drop.id,
      pointer: this.core.pointer ? { ...this.core.pointer } : null,
      wallImpulse: { ...this.wallImpulse },
      hue: dominantHue(drop.pigment),
    };
  }
}
