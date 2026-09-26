import * as THREE from 'three';
import type { Drop } from '../../game/sim';
import { FusionSimulation, type FusionPreset, type FusionEvent } from './simulation';
import { absorptionOf, fractions } from './composition';
import { capLobes, FusionShape, ShapePool, type Lobe } from './shape';
import { createFusionMaterial } from './material';
import { floorTexture, studioEnvironment, contactMaterial, causticMaterial, setRim } from '../droplet-lab/renderer';
import { contactAnchor, DropletRim } from '../droplet-lab/rim-response';
import { createSparkPoints, SplitSparks } from './split-sparks';
import { AdaptiveResolution } from './adaptive-resolution';
import { lookScene, type Look } from '../look';
import { CAUSTIC_BALANCED_SAMPLES, CAUSTIC_SAMPLES, projectedCausticGeometry, projectedCausticMaterial, projectedPointSize } from '../droplet-lab/projected-caustic';
import { DropletMotion } from '../droplet-lab/motion';
import { DropletPull } from '../droplet-lab/pull-response';
import { DropletSurface, volumeScales } from '../droplet-lab/surface-response';
import { purityOf } from '../../game/palette';
import type { ContactKind } from '../../game/sim';
import type { SensoryFeedback } from '../sensory/feedback';

export type FusionOptions = { lighting: 'studio' | 'daylight'; inspection: boolean; paused: boolean; reducedMotion: boolean; quality: 'high' | 'balanced'; clay: boolean; dyeFlow: 'classic' | 'swirl' | 'bloom'; ripple?: boolean; caustic?: 'artistic' | 'shape';
  /** 'high' quality lowers its pixel ratio while frames are late (default on). */
  adaptive?: boolean;
  /** Visual direction proposal; 'studio' is the approved look. */
  look?: Look };
export type FusionStats = { count: number; cyan: number; rose: number; merged: boolean; fps: number; p95: number };
type Callbacks = { onReady?: () => void; onError?: (error: string) => void; onStats?: (stats: FusionStats) => void; onInteraction?: () => void };
type Body = { mesh: THREE.Mesh; group: THREE.Group; pullGroup: THREE.Group; material: ReturnType<typeof createFusionMaterial>; shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; caustic: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; projected: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; shape: FusionShape | null; shapeReady: boolean; shapeLobes: Lobe[]; shapeBlend: number; source: Lobe[]; lobes: Lobe[]; age: number; correction: number; motion: DropletMotion; pull: DropletPull; radius: number; surface: DropletSurface; grabPoint: THREE.Vector2; rim: DropletRim; appear: number };
const W = .01;
const HEIGHT = .88; // Fixed height makes the enclosed volume proportional to r².
const NO_IMPULSE: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });
const APPEAR_SECONDS = 0.16;
/**
 * Merging drops rebuild their surface on the CPU. A sweep can merge dozens at
 * once; beyond this many per frame, the rest keep last frame's shape (mesh and
 * optics together) and catch up on the next frames.
 */
const SHAPE_UPDATES_PER_FRAME = 6;
/** Below this share of the result, the smaller drop is absorbed without a merged surface. */
const MINOR_MERGE = 0.12;

function footprint(material: THREE.ShaderMaterial) {
  material.uniforms.lobeCount = { value: 0 };
  material.uniforms.lobes = { value: Array.from({ length: 5 }, () => new THREE.Vector4()) };
  material.fragmentShader = 'uniform float lobeCount; uniform vec4 lobes[5];\n' + material.fragmentShader.replace('float r=length(p);', `
    float r=length(p);
    if(lobeCount>.5) {
      r=10000.;
      for(int i=0;i<5;i++) { if(float(i)>=lobeCount) break; r=min(r,length(p-lobes[i].xy)/lobes[i].z); }
    }
  `);
  return material;
}

type SceneGoal = { x: number; y: number; r: number; ready: boolean; completed: boolean; hue?: 'cyan' | 'rose' };
/** A shot being aimed: launch direction (unit, board axes) and power 0..1. */
type SceneAim = { x: number; y: number; r: number; dx: number; dy: number; power: number };
const AIM_DOTS = 16;
type SceneAdapter = { simulation?: FusionSimulation; goals?: () => SceneGoal[]; obstacles?: ReadonlyArray<{ x: number; y: number; r: number }>; onUpdate?: () => void; feedback?: SensoryFeedback;
  /** Shot modes: a dotted line on the floor shows where and how hard a drop will go. */
  aim?: () => SceneAim | null;
  /** Drop height in world units for a board radius; defaults to the approved fixed height. */
  height?: (radius: number) => number };
export function createFusionExperience(canvas: HTMLCanvasElement, callbacks: Callbacks = {}, adapter: SceneAdapter = {}) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!context) throw Error('WebGL 2に対応したブラウザでお試しください。');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#171e24');
  let env = studioEnvironment(renderer, false); scene.environment = env.texture;
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100); camera.up.set(0, 1, 0);
  const textures = [floorTexture(false), floorTexture(true)];
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#455157', map: textures[0], roughness: .52, metalness: .12, envMapIntensity: .08, bumpMap: textures[0], bumpScale: .004 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMaterial); floor.position.z = -.012; scene.add(floor);
  const ambient = new THREE.HemisphereLight('#c9d8e2', '#41454a', 1);
  const light = new THREE.DirectionalLight('#ebf3fa', 1.35); light.position.set(-4, 4, 8); scene.add(ambient, light);
  const background = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  background.texture.colorSpace = THREE.NoColorSpace;
  const sphere = new THREE.SphereGeometry(1, 96, 64);
  const projectionGeometry = projectedCausticGeometry();
  const pos = sphere.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.max(.007, (pos.getZ(i) + .64) * .62));
  sphere.computeVertexNormals(); sphere.computeBoundingSphere();
  const clay = new THREE.MeshStandardMaterial({ color: '#aab6b5', roughness: .7, envMapIntensity: .45 });
  const sim = adapter.simulation ?? new FusionSimulation();
  const goalViews = (adapter.goals?.() ?? []).map(goal => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.972, 1, 96), new THREE.MeshBasicMaterial({ transparent: true, opacity: .55, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(.98, 96), new THREE.MeshBasicMaterial({ color: goal.hue === 'rose' ? '#deb5c5' : '#a6e5d5', transparent: true, opacity: .055, depthWrite: false }));
    ring.position.z = -.008; fill.position.z = -.009; scene.add(ring, fill);
    // Floor lettering also passes through the same refraction as the ring.
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 256; labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d')!;
    ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = goal.hue === 'rose' ? '#795d6c' : '#466469';
    ctx.fillText(goal.hue === 'rose' ? 'R O S E' : 'C Y A N', 128, 41);
    const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.8, .2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .85 }));
    label.position.z = -.006; scene.add(label);
    return { ring, fill, label, texture };
  });
  const islands = (adapter.obstacles ?? []).map(o => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshStandardMaterial({ color: '#364649', roughness: .58, metalness: .12, envMapIntensity: .3 }));
    mesh.scale.set(o.r * W, o.r * W, .28); mesh.position.set((o.x - sim.width / 2) * W, (sim.height / 2 - o.y) * W, -.005);
    scene.add(mesh); return mesh;
  });
  // Only screens that aim shots get the guide; every other scene is unchanged.
  const aimDots = adapter.aim ? new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#2f3d41', transparent: true, opacity: .5, depthWrite: false }), AIM_DOTS) : null;
  const aimMatrix = new THREE.Matrix4();
  if (aimDots) { aimDots.count = 0; aimDots.position.z = -.007; aimDots.frustumCulled = false; scene.add(aimDots); }
  const bodies = new Map<number, Body>();
  const shapes = new ShapePool();
  let shapeBudget = SHAPE_UPDATES_PER_FRAME;
  // Separated drops grow in from small instead of popping into place.
  const appearing = new Set<number>();
  const sparks = new SplitSparks();
  const spray = createSparkPoints();
  scene.add(spray.points);
  const options: FusionOptions = { lighting: 'studio', inspection: false, paused: false, reducedMotion: false, quality: 'high', clay: false, dyeFlow: 'classic' };
  let disposed = false, lost = false, raf = 0, last = 0, statTime = 0;
  let loopFault = false;
  const adaptive = new AdaptiveResolution(1.75);
  let adaptWindow: number[] = [], adaptWork: number[] = [], adaptWindowMs = 0, adaptWarmup = 3;
  const adaptiveOn = () => options.quality === 'high' && options.adaptive !== false;
  const targetPixelRatio = () => options.quality === 'high'
    ? (adaptiveOn() ? adaptive.pixelRatio(devicePixelRatio) : Math.min(devicePixelRatio || 1, 1.75))
    : Math.min(devicePixelRatio || 1, 1);
  /** Changes only the drawing resolution: no board resize, and a held drop stays held. */
  function applyPixelRatio() {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    renderer.setPixelRatio(targetPixelRatio()); renderer.setSize(rect.width, rect.height, false);
    background.setSize(canvas.width, canvas.height);
  }
  // Monotonic across undo/reset, which replace the simulation's own clock.
  let clock = 0;
  const feedback = adapter.feedback;
  let active: number | null = null;
  let pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const offset = new THREE.Vector2();
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), point = new THREE.Vector3();
  let samples: number[] = [];

  function makeBody(d: Drop, source: Lobe[] = [], withShape = true) {
    const material = createFusionMaterial(background.texture);
    material.uniforms.uAbsorption.value.fromArray(absorptionOf(d.pigment));
    if (source.length > 1) {
      const a = source[0], b = source[source.length - 1];
      const axis = new THREE.Vector2(b.x - a.x, b.y - a.y);
      if (axis.lengthSq() < 1e-8) axis.set(1, 0); else axis.normalize();
      const radius = Math.max(a.r + b.r, .001);
      material.uniforms.uFlowFrame.value.set((a.x * b.r + b.x * a.r) / radius, (a.y * b.r + b.y * a.r) / radius, axis.x, axis.y);
      // Stable for this collision, varied by the contact location and incoming motion.
      const seed = Math.sin(d.x * .127 + d.y * .173 + d.vx * .019 + d.vy * .023) * 43758.5453;
      material.uniforms.uFlowPhase.value = (seed - Math.floor(seed)) * Math.PI * 2;
    }
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(sphere, options.clay ? clay : material);
    mesh.frustumCulled = false;
    const group = new THREE.Group(), pullGroup = new THREE.Group(); pullGroup.matrixAutoUpdate = false;
    pullGroup.add(mesh); group.add(pullGroup); scene.add(group);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), footprint(contactMaterial())); shadow.position.z = -.003; scene.add(shadow);
    const caustic = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), footprint(causticMaterial())); caustic.position.z = -.001; scene.add(caustic);
    const projected = new THREE.Points(projectionGeometry, projectedCausticMaterial());
    projected.frustumCulled = false; projected.visible = options.caustic === 'shape' && !options.clay; scene.add(projected);
    const body: Body = { mesh, material, group, pullGroup, shadow, caustic, projected, source, lobes: [], age: source.length ? 0 : 10, correction: 1, shape: source.length && withShape ? shapes.acquire(d.r) : null, shapeReady: false, shapeLobes: [], shapeBlend: .03, motion: new DropletMotion(), pull: new DropletPull(), radius: d.r, surface: new DropletSurface(), grabPoint: new THREE.Vector2(), rim: new DropletRim(), appear: appearing.delete(d.id) ? 0 : Infinity };
    // The mesh stays the round drop until its merged surface is first built.
    bodies.set(d.id, body);
    return body;
  }
  function removeBody(id: number) {
    const b = bodies.get(id); if (!b) return;
    scene.remove(b.group, b.shadow, b.caustic, b.projected); b.material.dispose(); b.projected.material.dispose(); if (b.shape) shapes.release(b.shape);
    b.shadow.geometry.dispose(); b.shadow.material.dispose(); b.caustic.geometry.dispose(); b.caustic.material.dispose(); bodies.delete(id);
  }
  function fusion(event: FusionEvent) {
    const { a, b, result } = event;
    const source: Lobe[] = [];
    for (const parent of [a, b]) {
      const view = bodies.get(parent.id);
      const previous = view?.lobes.length && view.age < 2.5 ? view.lobes : [{ x: 0, y: 0, r: 1, absorption: absorptionOf(parent.pigment), amount: parent.mass }];
      for (const l of previous) {
        const offset = view ? new THREE.Vector3(l.x, l.y, 0).applyMatrix4(view.mesh.matrixWorld).sub(view.group.position).divideScalar(W)
          : new THREE.Vector3(l.x * parent.r, l.y * parent.r, 0);
        const elements = view?.mesh.matrixWorld.elements;
        const radius = elements ? Math.sqrt(Math.abs(elements[0] * elements[5] - elements[1] * elements[4])) / W : parent.r;
        source.push({ x: (parent.x - result.x + offset.x) / result.r, y: (-(parent.y - result.y) + offset.y) / result.r,
          r: l.r * radius / result.r, absorption: [...l.absorption], amount: l.amount });
      }
    }
    removeBody(a.id); removeBody(b.id);
    source.splice(0, source.length, ...capLobes(source));
    // A big drop swallowing a small one barely changes shape: skip the merged
    // surface (its rebuild dominates sweeps of many drops) and keep the dye mix.
    const minor = Math.min(a.mass, b.mass) / Math.max(result.mass, 1e-6);
    feedback?.fusion(result.r, result.x, sim.width, purityOf(result.pigment));
    const view = makeBody(result, source, minor >= MINOR_MERGE);
    const small = a.mass <= b.mass ? a : b;
    // The smaller parent's liquid arrives from its side: that side bulges, then rings.
    view.rim.excite(Math.atan2(-(small.y - result.y), small.x - result.x), -0.12 * Math.min(1, 2 * small.mass / result.mass));
    updateBody(result, view, 0);
  }
  function updateBody(d: Drop, b: Body, dt: number, wallImpulse = NO_IMPULSE) {
    b.age += dt;
    const grabbed = sim.core.grabbedId === d.id;
    // The approved one-drop wall response, now also driven by walls and islands.
    const s = { ...d, grabbed, pointer: grabbed ? sim.core.pointer : null, wallImpulse };
    const m = b.motion.update(s, dt, options.reducedMotion);
    const pull = b.pull.update(s, dt, options.reducedMotion);
    const response = b.surface.update({ ...s, grabPoint: b.grabPoint }, dt, options.reducedMotion);
    const ring = b.source.length && !options.reducedMotion ? .055 * Math.sin(b.age * 19) * Math.exp(-b.age * 4) : 0;
    const scales = volumeScales(m.stretch + ring, m.squash, response.press);
    const rippling = !!options.ripple && !options.reducedMotion;
    const ripple = rippling ? b.rim.update({ ...s, grabPoint: b.grabPoint }, dt) : (b.rim.reset(), b.rim.snapshot);
    const coefficients = rippling ? ripple.coefficients : null;
    for (const mat of [b.material, b.shadow.material, b.caustic.material, b.projected.material]) setRim(mat, coefficients);
    const bend = new THREE.Vector2(response.bendX, response.bendY).clampLength(0, .065);
    b.material.uniforms.uSurfaceBend.value.copy(bend);
    b.material.uniforms.uInternalFlow.value = options.reducedMotion ? 0 : options.dyeFlow === 'bloom' ? 2 : options.dyeFlow === 'swirl' ? 1 : 0;
    if (b.source.length) {
      const progress = 1 - Math.exp(-b.age * 7);
      b.lobes = b.source.map(l => ({ ...l, x: l.x * (1 - progress), y: l.y * (1 - progress), r: l.r + (1 - l.r) * progress }));
      const blend = .018 + .14 * Math.sin(Math.PI * progress);
      if (b.age < .85 && b.shape) {
        if (shapeBudget > 0) {
          shapeBudget--;
          b.shape.update(b.lobes, blend); b.correction = b.shape.correction;
          b.shapeLobes = b.lobes; b.shapeBlend = blend;
          if (!b.shapeReady) { b.shapeReady = true; b.mesh.geometry = b.shape.geometry; }
        }
        // Optics always describe the surface that is actually drawn.
        const drawn = b.shapeReady ? b.shapeLobes : [];
        b.material.uniforms.uLobeCount.value = drawn.length;
        drawn.forEach((l, i) => b.material.uniforms.uLobes.value[i].set(l.x, l.y, l.r, 0));
        b.material.uniforms.uBlend.value = b.shapeBlend;
        if (!b.shapeReady) b.correction = 1;
      } else {
        b.mesh.geometry = sphere;
        if (b.shape) shapes.release(b.shape);
        b.shape = null; b.shapeReady = false; b.shapeLobes = []; b.correction = 1;
        b.material.uniforms.uLobeCount.value = 0;
      }
      b.material.uniforms.uSeedCount.value = b.source.length;
      b.source.forEach((l, i) => {
        b.material.uniforms.uSeeds.value[i].set(l.x, l.y, Math.max(.25, l.r), l.amount / d.mass);
        b.material.uniforms.uDyes.value[i].fromArray(l.absorption);
      });
      b.material.uniforms.uAge.value = b.age;
      b.material.uniforms.uMix.value = options.reducedMotion ? 1 : THREE.MathUtils.smoothstep(b.age, .2, 2.5);
    }
    b.material.uniforms.uAbsorption.value.fromArray(absorptionOf(d.pigment));
    b.material.uniforms.uDaylight.value = lookScene(options.look ?? 'studio', options.lighting === 'daylight').daylight ? 1 : 0;
    b.group.position.set((d.x - sim.width / 2) * W, (sim.height / 2 - d.y) * W, 0);
    // Deform along travel without rotating the captured contact axis or dye regions.
    b.mesh.rotation.z = 0;
    b.appear += dt;
    const t = Math.min(1, b.appear / APPEAR_SECONDS);
    const grow = options.reducedMotion ? 1 : 0.42 + 0.58 * (1 - (1 - t) ** 3);
    b.mesh.scale.set(d.r * W * b.correction * grow, d.r * W * b.correction * grow, (adapter.height?.(d.r) ?? HEIGHT) * grow);
    const strength = pull.strength, e = strength * .5;
    const nx = strength ? pull.x / strength : 0, ny = strength ? pull.y / strength : 0;
    b.pullGroup.matrix.set(1 + e * nx * nx, e * nx * ny, 0, pull.x * d.r * W * .5,
      e * nx * ny, 1 + e * ny * ny, 0, pull.y * d.r * W * .5, 0, 0, 1 / (1 + e), 0, 0, 0, 0, 1);
    const cosine = Math.cos(m.angle), sine = Math.sin(m.angle);
    const xx = scales.x * cosine * cosine + scales.y * sine * sine;
    const yy = scales.x * sine * sine + scales.y * cosine * cosine;
    const xy = (scales.x - scales.y) * sine * cosine;
    if (rippling) {
      // Keep the side that hit a wall or island on it while the body is squashed.
      const offset = contactAnchor(ripple.anchor, xx, xy, yy);
      b.group.position.x += offset.x * d.r * W; b.group.position.y += offset.y * d.r * W;
    }
    b.pullGroup.matrix.multiply(new THREE.Matrix4().set(xx, xy, 0, 0, xy, yy, 0, 0, 0, 0, scales.z, 0, 0, 0, 0, 1));
    b.shadow.position.x = b.caustic.position.x = b.group.position.x;
    b.shadow.position.y = b.caustic.position.y = b.group.position.y;
    b.shadow.scale.set(d.r * W * scales.x, d.r * W * scales.y, 1); b.caustic.scale.copy(b.shadow.scale);
    for (const footprint of [b.shadow, b.caustic]) {
      footprint.matrixAutoUpdate = false;
      footprint.matrix.makeTranslation(b.group.position.x, b.group.position.y, footprint === b.shadow ? -.003 : -.001)
        .multiply(b.pullGroup.matrix).multiply(new THREE.Matrix4().makeScale(d.r * W * b.correction * grow, d.r * W * b.correction * grow, 1));
      const drawn = b.age < .85 && b.shapeReady ? b.shapeLobes : [];
      footprint.material.uniforms.lobeCount.value = drawn.length;
      drawn.forEach((l,i) => footprint.material.uniforms.lobes.value[i].set(l.x,l.y,l.r,0));
    }
    const absorption = absorptionOf(d.pigment);
    b.caustic.material.uniforms.color.value.setRGB(...absorption.map(v => Math.exp(-v * .8)) as [number, number, number]);
    // On the dark night floor the coloured light under each drop is what lets
    // the drop glow from within (and keeps the three colours readable).
    const floorLight = options.look === 'night' ? 3 : 1;
    b.material.uniforms.uGlow.value = options.look === 'night' ? 0.22 : 0;
    b.caustic.material.uniforms.gain.value = 0.34 * floorLight;
    b.projected.visible = options.caustic === 'shape' && !options.clay;
    b.caustic.visible = !options.clay && !b.projected.visible;
    b.group.updateMatrixWorld(true);
    b.material.uniforms.uDropToWorld.value.copy(b.mesh.matrixWorld);
    b.material.uniforms.uWorldToDrop.value.copy(b.mesh.matrixWorld).invert();
    b.material.uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (b.projected.visible) {
      const pu = b.projected.material.uniforms, mu = b.material.uniforms;
      pu.uDropToWorld.value.copy(b.mesh.matrixWorld);
      pu.uWorldToDrop.value.copy(b.mesh.matrixWorld).invert();
      pu.uSurfaceBend.value.copy(mu.uSurfaceBend.value);
      pu.uLobeCount.value = mu.uLobeCount.value;
      pu.uBlend.value = mu.uBlend.value;
      for (let i = 0; i < 5; i++) pu.uLobes.value[i].copy(mu.uLobes.value[i]);
      pu.uAbsorption.value.fromArray(absorption);
      pu.uGain.value = 0.08 * floorLight;
      const center = new THREE.Vector3().setFromMatrixPosition(b.mesh.matrixWorld).project(camera);
      const edge = new THREE.Vector3(1, 0, 0).applyMatrix4(b.mesh.matrixWorld).project(camera);
      const sampleCount = options.quality === 'high' ? CAUSTIC_SAMPLES : CAUSTIC_BALANCED_SAMPLES;
      pu.uPointSize.value = projectedPointSize(Math.hypot(edge.x - center.x, edge.y - center.y) * canvas.width * .5, renderer.getPixelRatio(), sampleCount);
    }
  }
  function refresh(dt: number) {
    shapeBudget = SHAPE_UPDATES_PER_FRAME;
    canvas.dataset.dyeFlow = options.dyeFlow;
    while (sim.events.length) fusion(sim.events.shift()!);
    for (const split of sim.splits.splice(0)) {
      feedback?.split(split.r, split.x, sim.width);
      const from = { x: (split.x - sim.width / 2) * W, y: (sim.height / 2 - split.y) * W };
      for (const child of split.children) {
        appearing.add(child.id);
        if (options.reducedMotion) continue;
        const tint = absorptionOf(child.pigment).map(v => Math.exp(-v * .8)) as [number, number, number];
        sparks.burst(from, { x: (child.x - sim.width / 2) * W, y: (sim.height / 2 - child.y) * W }, split.r * W, tint);
      }
    }
    if (options.reducedMotion) sparks.clear(); else sparks.update(dt);
    spray.sync(sparks);
    // Sum this frame's contacts per drop, exactly as the one-drop study does.
    clock += dt;
    const impulses = new Map<number, { x: number; y: number; kind: ContactKind; peak: number }>();
    for (const contact of sim.contacts.splice(0)) {
      const sum = impulses.get(contact.id) ?? { x: 0, y: 0, kind: contact.kind, peak: 0 };
      sum.x += contact.x; sum.y += contact.y;
      const size = Math.hypot(contact.x, contact.y);
      if (size > sum.peak) { sum.peak = size; sum.kind = contact.kind; }
      impulses.set(contact.id, sum);
    }
    if (feedback && dt > 0) for (const [id, sum] of impulses) {
      const d = sim.core.drops.find(drop => drop.id === id);
      if (d) feedback.contact(id, Math.hypot(sum.x, sum.y), d.r, d.x, sim.width, sum.kind, clock);
    }
    for (const d of sim.core.drops) updateBody(d, bodies.get(d.id) ?? makeBody(d), dt, impulses.get(d.id));
    for (const id of bodies.keys()) if (!sim.core.drops.some(d => d.id === id)) removeBody(id);
    if (aimDots) {
      // Drawn on the floor, so it also bends through any drop it passes under.
      const aim = adapter.aim!();
      const n = aim && aim.power > 0 ? Math.max(3, Math.round(AIM_DOTS * aim.power)) : 0;
      for (let i = 0; i < n; i++) {
        const along = aim!.r + 16 + i * 17, size = (3.2 - 1.6 * i / AIM_DOTS) * W;
        aimMatrix.makeScale(size, size, 1).setPosition((aim!.x + aim!.dx * along - sim.width / 2) * W, (sim.height / 2 - aim!.y - aim!.dy * along) * W, 0);
        aimDots.setMatrixAt(i, aimMatrix);
      }
      aimDots.count = n; aimDots.instanceMatrix.needsUpdate = true;
    }
    const rect = canvas.getBoundingClientRect();
    const projectedGoals = (adapter.goals?.() ?? []).map((goal, i) => {
      const { ring, fill, label } = goalViews[i];
      for (const mesh of [ring, fill, label]) {
        mesh.position.x = (goal.x - sim.width / 2) * W; mesh.position.y = (sim.height / 2 - goal.y) * W;
      }
      ring.scale.setScalar(goal.r * W); fill.scale.copy(ring.scale);
      label.position.y += goal.r * W * .65;
      const rose = goal.hue === 'rose';
      ring.material.color.set(goal.ready || goal.completed ? (rose ? '#f2c8dc' : '#bdede3') : (rose ? '#92697c' : '#527479'));
      ring.material.opacity = goal.completed ? .9 : goal.ready ? .8 : .7;
      fill.material.opacity = goal.completed ? .12 : goal.ready ? .09 : .035;
      const screen = ring.position.clone().project(camera);
      return { ...goal, screenX: (screen.x + 1) * rect.width / 2, screenY: (1 - screen.y) * rect.height / 2 };
    });
    canvas.dataset.goals = JSON.stringify(projectedGoals);
    if (projectedGoals[0]) canvas.dataset.goal = JSON.stringify(projectedGoals[0]);
    canvas.dataset.drops = JSON.stringify(sim.core.drops.map(d => {
      const b = bodies.get(d.id)!;
      const screen = new THREE.Vector3(0, 0, .48).applyMatrix4(b.mesh.matrixWorld).project(camera);
      return { id: d.id, mass: d.mass, pigment: d.pigment, fractions: fractions(d.pigment), x: d.x, y: d.y, vx: d.vx, vy: d.vy, r: d.r, grabbed: sim.core.grabbedId === d.id, age: b.age, lobes: b.material.uniforms.uLobeCount.value, correction: b.correction, squash: b.motion.snapshot.squash, stretch: b.motion.snapshot.stretch,
        screenX: (screen.x + 1) * rect.width / 2, screenY: (1 - screen.y) * rect.height / 2 };
    }));
  }
  /** `letGo` is the finger lifting; everything else interrupts a hold. */
  function cancel(letGo = false) {
    const id = active; active = null;
    if (letGo) sim.release(); else sim.abort();
    canvas.style.cursor = 'grab';
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function resize() {
    if (disposed || lost) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    cancel(); renderer.setPixelRatio(targetPixelRatio()); renderer.setSize(rect.width, rect.height, false);
    background.setSize(canvas.width, canvas.height);
    const aspect = rect.width / rect.height;
    const width = Math.max(550, Math.min(1100, rect.width * 1.06));
    sim.resize(width, Math.max(420, width / aspect));
    camera.aspect = aspect;
    const tilt = .47, tangent = Math.tan(34 * Math.PI / 360);
    const distance = Math.max(sim.width * W / (2 * tangent * aspect), sim.height * W / (2 * tangent)) * 1.13 + 1.25;
    camera.position.set(0, -Math.sin(tilt) * distance, Math.cos(tilt) * distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    // A bead of about 0.065 world units (6.5 board units) at its drawn distance.
    (spray.points.material as THREE.ShaderMaterial).uniforms.uPixels.value = 0.065 * canvas.height / (2 * tangent);
    last = 0; samples = []; refresh(0);
  }
  function ray(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function down(e: PointerEvent) {
    if (active !== null || options.paused || lost || (e.pointerType === 'mouse' && e.button !== 0)) return;
    ray(e);
    const hits = raycaster.intersectObjects([...bodies.values()].map(b => b.mesh));
    let chosen: Drop | undefined;
    let hitPoint: THREE.Vector3 | undefined;
    if (hits[0]) {
      const pair = [...bodies.entries()].find(([, b]) => b.mesh === hits[0].object);
      chosen = sim.core.drops.find(d => d.id === pair?.[0]); hitPoint = hits[0].point;
    } else {
      if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -.42), point)) return;
      const x = point.x / W + sim.width / 2, y = sim.height / 2 - point.y / W;
      chosen = [...sim.core.drops].sort((a, b) => (Math.hypot(x - a.x, y - a.y) - a.r) - (Math.hypot(x - b.x, y - b.y) - b.r))
        .find(d => Math.hypot(x - d.x, y - d.y) < d.r + 14);
      hitPoint = point.clone();
    }
    if (!chosen || !hitPoint || !sim.grab(chosen.id)) return;
    feedback?.grab(chosen.r, chosen.x, sim.width);
    bodies.get(chosen.id)!.grabPoint.set((hitPoint.x / W + sim.width / 2 - chosen.x) / chosen.r,
      (hitPoint.y / W - sim.height / 2 + chosen.y) / chosen.r).clampLength(0, 1);
    pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -hitPoint.z);
    offset.set(hitPoint.x / W + sim.width / 2 - chosen.x, sim.height / 2 - hitPoint.y / W - chosen.y);
    active = e.pointerId; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; e.preventDefault(); callbacks.onInteraction?.();
  }
  function move(e: PointerEvent) {
    if (active !== e.pointerId || options.paused) return;
    ray(e); if (!raycaster.ray.intersectPlane(pointerPlane, point)) return;
    sim.move(point.x / W + sim.width / 2 - offset.x, sim.height / 2 - point.y / W - offset.y); e.preventDefault();
  }
  function up(e: PointerEvent) { if (e.pointerId === active) cancel(e.type === 'pointerup'); }
  function interrupt() { cancel(); }
  function prevent(e: TouchEvent) { if (e.cancelable) e.preventDefault(); }
  function visibility() { cancel(); last = 0; cancelAnimationFrame(raf); if (!document.hidden && !disposed && !lost) raf = requestAnimationFrame(loop); }
  function contextLost(e: Event) { e.preventDefault(); lost = true; cancel(); cancelAnimationFrame(raf); callbacks.onError?.('描画が中断されました。もう一度試してください。'); }
  function contextRestored() { callbacks.onError?.('描画の準備が戻りました。もう一度試してください。'); }
  function render() {
    const toneMapping = renderer.toneMapping;
    for (const b of bodies.values()) b.group.visible = false;
    renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(background); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.toneMapping = toneMapping;
    for (const b of bodies.values()) b.group.visible = true;
    renderer.render(scene, camera);
  }
  function loop(now: number) {
    if (disposed || lost || document.hidden) return;
    const interval = last ? now - last : 0; last = now;
    const dt = Math.min(interval / 1000, 1 / 12);
    const workStart = performance.now();
    try {
      if (!options.paused) { sim.tick(dt); refresh(dt); }
      render();
    } catch (error) {
      // A presentation fault must not freeze play: report once, keep the loop alive.
      if (!loopFault) { loopFault = true; console.error('PURA render step failed', error); }
    }
    if (interval > 0 && !options.paused) { samples.push(interval); if (samples.length > 240) samples.shift(); }
    if (interval > 0 && !options.paused && adaptiveOn()) {
      adaptWindow.push(interval); adaptWork.push(performance.now() - workStart); adaptWindowMs += interval;
      if (adaptWindowMs >= 1000) {
        // Skip the first windows after a start: shader compilation is not load.
        if (adaptWarmup > 0) adaptWarmup--;
        else if (adaptive.window(adaptWindow, adaptWork) !== 'hold') applyPixelRatio();
        adaptWindow = []; adaptWork = []; adaptWindowMs = 0;
      }
    }
    if (now - statTime > 200) {
      statTime = now;
      const selected = sim.core.drops.find(d => d.id === sim.core.grabbedId) ?? (sim.core.drops.length === 1 ? sim.core.drops[0] : undefined);
      const f = selected ? fractions(selected.pigment) : { cyan: 1, rose: 0 };
      const sorted = [...samples].sort((a, b) => a - b);
      const stats = { count: sim.core.drops.length, cyan: f.cyan, rose: f.rose, merged: !!selected && f.rose > 0 && f.cyan > 0, fps: sorted.length ? 1000 / sorted[Math.floor(sorted.length * .5)] : 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0 };
      canvas.dataset.stats = JSON.stringify(stats); callbacks.onStats?.(stats);
      canvas.dataset.resolution = JSON.stringify({ pixelRatio: renderer.getPixelRatio(), level: adaptive.level, adaptive: adaptiveOn(), width: canvas.width, height: canvas.height });
      if (feedback) canvas.dataset.sensory = JSON.stringify(feedback.status());
      // Resource counts for long-session checks (P-05): these must not climb.
      canvas.dataset.memory = JSON.stringify({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0, bodies: bodies.size, sceneChildren: scene.children.length, sparks: sparks.alive });
      adapter.onUpdate?.();
    }
    raf = requestAnimationFrame(loop);
  }
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('touchstart', prevent, { passive: false }); canvas.addEventListener('touchmove', prevent, { passive: false });
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  window.addEventListener('blur', interrupt); document.addEventListener('visibilitychange', visibility);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); sim.reset(); refresh(0); render(); raf = requestAnimationFrame(loop); callbacks.onReady?.();
  return {
    restoreState(restore: () => void) { cancel(); restore(); sparks.clear(); appearing.clear(); for (const id of [...bodies.keys()]) removeBody(id); refresh(0); last = 0; samples = []; adapter.onUpdate?.(); },
    reset(preset: FusionPreset = sim.preset, ratio = sim.ratio) { cancel(); sparks.clear(); appearing.clear(); for (const id of [...bodies.keys()]) removeBody(id); sim.reset(preset, ratio); refresh(0); last = 0; samples = []; },
    setOptions(next: Partial<FusionOptions>) {
      const lightingChanged = (next.lighting !== undefined && next.lighting !== options.lighting)
        || (next.look !== undefined && next.look !== options.look);
      const qualityChanged = (next.quality !== undefined && next.quality !== options.quality)
        || (next.adaptive !== undefined && next.adaptive !== options.adaptive);
      Object.assign(options, next);
      if (qualityChanged) { adaptive.reset(); adaptWindow = []; adaptWork = []; adaptWindowMs = 0; adaptWarmup = 3; }
      projectionGeometry.setDrawRange(0, options.quality === 'high' ? CAUSTIC_SAMPLES : CAUSTIC_BALANCED_SAMPLES);
      if (options.paused) cancel();
      if (lightingChanged) {
        const look = lookScene(options.look ?? 'studio', options.lighting === 'daylight');
        const old = env; env = studioEnvironment(renderer, look.daylight, look.room); scene.environment = env.texture; old.dispose();
        (scene.background as THREE.Color).set(look.background);
        floorMaterial.color.set(look.floor); floorMaterial.roughness = look.roughness; floorMaterial.metalness = look.metalness;
        floorMaterial.envMapIntensity = look.envIntensity; floorMaterial.bumpScale = look.bump;
        ambient.intensity = look.ambient; light.intensity = look.light;
        renderer.toneMappingExposure = look.exposure;
        aimDots?.material.color.set(look.daylight ? '#2f3d41' : '#d7e9e7');
      }
      floorMaterial.map = textures[options.inspection ? 1 : 0]; floorMaterial.bumpMap = options.inspection ? null : textures[0]; floorMaterial.needsUpdate = true;
      for (const b of bodies.values()) {
        b.mesh.material = options.clay ? clay : b.material;
        b.projected.visible = options.caustic === 'shape' && !options.clay;
        b.caustic.visible = !options.clay && !b.projected.visible;
      }
      if (qualityChanged) resize(); refresh(0); last = 0;
    },
    dispose() {
      if (disposed) return; cancel(); disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('touchstart', prevent); canvas.removeEventListener('touchmove', prevent); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      window.removeEventListener('blur', interrupt); document.removeEventListener('visibilitychange', visibility);
      for (const id of [...bodies.keys()]) removeBody(id);
      spray.dispose(); shapes.dispose();
      sphere.dispose(); projectionGeometry.dispose(); clay.dispose(); floor.geometry.dispose(); floorMaterial.dispose(); textures.forEach(t => t.dispose()); background.dispose(); env.dispose(); renderer.dispose();
      for (const g of goalViews) { for (const mesh of [g.ring, g.fill, g.label]) { mesh.geometry.dispose(); mesh.material.dispose(); } g.texture.dispose(); }
      for (const mesh of islands) { mesh.geometry.dispose(); mesh.material.dispose(); }
      if (aimDots) { aimDots.geometry.dispose(); aimDots.material.dispose(); aimDots.dispose(); }
    },
  };
}
