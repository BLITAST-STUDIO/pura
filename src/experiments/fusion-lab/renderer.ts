import * as THREE from 'three';
import type { Drop } from '../../game/sim';
import { FusionSimulation, type FusionPreset, type FusionEvent } from './simulation';
import { absorptionOf, fractions } from './composition';
import { FusionShape, type Lobe } from './shape';
import { createFusionMaterial } from './material';
import { floorTexture, studioEnvironment, contactMaterial, causticMaterial } from '../droplet-lab/renderer';
import { DropletMotion } from '../droplet-lab/motion';
import { DropletPull } from '../droplet-lab/pull-response';
import { DropletSurface, volumeScales } from '../droplet-lab/surface-response';
import { purityOf } from '../../game/palette';
import type { ContactKind } from '../../game/sim';
import type { SensoryFeedback } from '../sensory/feedback';

export type FusionOptions = { lighting: 'studio' | 'daylight'; inspection: boolean; paused: boolean; reducedMotion: boolean; quality: 'high' | 'balanced'; clay: boolean; dyeFlow: 'classic' | 'swirl' | 'bloom' };
export type FusionStats = { count: number; cyan: number; rose: number; merged: boolean; fps: number; p95: number };
type Callbacks = { onReady?: () => void; onError?: (error: string) => void; onStats?: (stats: FusionStats) => void; onInteraction?: () => void };
type Body = { mesh: THREE.Mesh; group: THREE.Group; pullGroup: THREE.Group; material: ReturnType<typeof createFusionMaterial>; shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; caustic: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; shape: FusionShape | null; source: Lobe[]; lobes: Lobe[]; age: number; correction: number; motion: DropletMotion; pull: DropletPull; radius: number; surface: DropletSurface; grabPoint: THREE.Vector2 };
const W = .01;
const HEIGHT = .88; // Fixed height makes the enclosed volume proportional to r².
const NO_IMPULSE: Readonly<{ x: number; y: number }> = Object.freeze({ x: 0, y: 0 });

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
type SceneAdapter = { simulation?: FusionSimulation; goals?: () => SceneGoal[]; obstacles?: ReadonlyArray<{ x: number; y: number; r: number }>; onUpdate?: () => void; feedback?: SensoryFeedback };
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
  const bodies = new Map<number, Body>();
  const options: FusionOptions = { lighting: 'studio', inspection: false, paused: false, reducedMotion: false, quality: 'high', clay: false, dyeFlow: 'classic' };
  let disposed = false, lost = false, raf = 0, last = 0, statTime = 0;
  // Monotonic across undo/reset, which replace the simulation's own clock.
  let clock = 0;
  const feedback = adapter.feedback;
  let active: number | null = null;
  let pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const offset = new THREE.Vector2();
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), point = new THREE.Vector3();
  let samples: number[] = [];

  function makeBody(d: Drop, source: Lobe[] = []) {
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
    const body: Body = { mesh, material, group, pullGroup, shadow, caustic, source, lobes: [], age: source.length ? 0 : 10, correction: 1, shape: source.length ? new FusionShape() : null, motion: new DropletMotion(), pull: new DropletPull(), radius: d.r, surface: new DropletSurface(), grabPoint: new THREE.Vector2() };
    if (source.length) mesh.geometry = body.shape!.geometry;
    bodies.set(d.id, body);
    return body;
  }
  function removeBody(id: number) {
    const b = bodies.get(id); if (!b) return;
    scene.remove(b.group, b.shadow, b.caustic); b.material.dispose(); b.shape?.dispose();
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
    feedback?.fusion(result.r, result.x, sim.width, purityOf(result.pigment));
    const view = makeBody(result, source);
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
    const bend = new THREE.Vector2(response.bendX, response.bendY).clampLength(0, .065);
    b.material.uniforms.uSurfaceBend.value.copy(bend);
    b.material.uniforms.uInternalFlow.value = options.reducedMotion ? 0 : options.dyeFlow === 'bloom' ? 2 : options.dyeFlow === 'swirl' ? 1 : 0;
    if (b.source.length) {
      const progress = 1 - Math.exp(-b.age * 7);
      b.lobes = b.source.map(l => ({ ...l, x: l.x * (1 - progress), y: l.y * (1 - progress), r: l.r + (1 - l.r) * progress }));
      const blend = .018 + .14 * Math.sin(Math.PI * progress);
      if (b.age < .85 && b.shape) {
        b.shape.update(b.lobes, blend); b.correction = b.shape.correction;
        b.material.uniforms.uLobeCount.value = b.lobes.length;
        b.lobes.forEach((l, i) => b.material.uniforms.uLobes.value[i].set(l.x, l.y, l.r, 0));
        b.material.uniforms.uBlend.value = blend;
      } else {
        b.mesh.geometry = sphere;
        b.shape?.dispose(); b.shape = null; b.correction = 1;
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
    b.material.uniforms.uDaylight.value = options.lighting === 'daylight' ? 1 : 0;
    b.group.position.set((d.x - sim.width / 2) * W, (sim.height / 2 - d.y) * W, 0);
    // Deform along travel without rotating the captured contact axis or dye regions.
    b.mesh.rotation.z = 0;
    b.mesh.scale.set(d.r * W * b.correction, d.r * W * b.correction, HEIGHT);
    const strength = pull.strength, e = strength * .5;
    const nx = strength ? pull.x / strength : 0, ny = strength ? pull.y / strength : 0;
    b.pullGroup.matrix.set(1 + e * nx * nx, e * nx * ny, 0, pull.x * d.r * W * .5,
      e * nx * ny, 1 + e * ny * ny, 0, pull.y * d.r * W * .5, 0, 0, 1 / (1 + e), 0, 0, 0, 0, 1);
    const cosine = Math.cos(m.angle), sine = Math.sin(m.angle);
    const xx = scales.x * cosine * cosine + scales.y * sine * sine;
    const yy = scales.x * sine * sine + scales.y * cosine * cosine;
    const xy = (scales.x - scales.y) * sine * cosine;
    b.pullGroup.matrix.multiply(new THREE.Matrix4().set(xx, xy, 0, 0, xy, yy, 0, 0, 0, 0, scales.z, 0, 0, 0, 0, 1));
    b.shadow.position.x = b.caustic.position.x = b.group.position.x;
    b.shadow.position.y = b.caustic.position.y = b.group.position.y;
    b.shadow.scale.set(d.r * W * scales.x, d.r * W * scales.y, 1); b.caustic.scale.copy(b.shadow.scale);
    for (const footprint of [b.shadow, b.caustic]) {
      footprint.matrixAutoUpdate = false;
      footprint.matrix.makeTranslation(b.group.position.x, b.group.position.y, footprint === b.shadow ? -.003 : -.001)
        .multiply(b.pullGroup.matrix).multiply(new THREE.Matrix4().makeScale(d.r * W * b.correction, d.r * W * b.correction, 1));
      footprint.material.uniforms.lobeCount.value = b.age < .85 ? b.lobes.length : 0;
      b.lobes.forEach((l,i) => footprint.material.uniforms.lobes.value[i].set(l.x,l.y,l.r,0));
    }
    const absorption = absorptionOf(d.pigment);
    b.caustic.material.uniforms.color.value.setRGB(...absorption.map(v => Math.exp(-v * .8)) as [number, number, number]);
    b.caustic.visible = !options.clay;
    b.group.updateMatrixWorld(true);
    b.material.uniforms.uDropToWorld.value.copy(b.mesh.matrixWorld);
    b.material.uniforms.uWorldToDrop.value.copy(b.mesh.matrixWorld).invert();
    b.material.uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }
  function refresh(dt: number) {
    canvas.dataset.dyeFlow = options.dyeFlow;
    while (sim.events.length) fusion(sim.events.shift()!);
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
  function cancel() {
    const id = active; active = null; sim.release(); canvas.style.cursor = 'grab';
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function resize() {
    if (disposed || lost) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    cancel(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, options.quality === 'high' ? 1.75 : 1)); renderer.setSize(rect.width, rect.height, false);
    background.setSize(canvas.width, canvas.height);
    const aspect = rect.width / rect.height;
    const width = Math.max(550, Math.min(1100, rect.width * 1.06));
    sim.resize(width, Math.max(420, width / aspect));
    camera.aspect = aspect;
    const tilt = .47, tangent = Math.tan(34 * Math.PI / 360);
    const distance = Math.max(sim.width * W / (2 * tangent * aspect), sim.height * W / (2 * tangent)) * 1.13 + 1.25;
    camera.position.set(0, -Math.sin(tilt) * distance, Math.cos(tilt) * distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
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
  function up(e: PointerEvent) { if (e.pointerId === active) cancel(); }
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
    if (!options.paused) { sim.tick(dt); refresh(dt); }
    render();
    if (interval > 0 && !options.paused) { samples.push(interval); if (samples.length > 240) samples.shift(); }
    if (now - statTime > 200) {
      statTime = now;
      const selected = sim.core.drops.find(d => d.id === sim.core.grabbedId) ?? (sim.core.drops.length === 1 ? sim.core.drops[0] : undefined);
      const f = selected ? fractions(selected.pigment) : { cyan: 1, rose: 0 };
      const sorted = [...samples].sort((a, b) => a - b);
      const stats = { count: sim.core.drops.length, cyan: f.cyan, rose: f.rose, merged: !!selected && f.rose > 0 && f.cyan > 0, fps: sorted.length ? 1000 / sorted[Math.floor(sorted.length * .5)] : 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0 };
      canvas.dataset.stats = JSON.stringify(stats); callbacks.onStats?.(stats);
      if (feedback) canvas.dataset.sensory = JSON.stringify(feedback.status());
      adapter.onUpdate?.();
    }
    raf = requestAnimationFrame(loop);
  }
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('touchstart', prevent, { passive: false }); canvas.addEventListener('touchmove', prevent, { passive: false });
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', visibility);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); sim.reset(); refresh(0); render(); raf = requestAnimationFrame(loop); callbacks.onReady?.();
  return {
    restoreState(restore: () => void) { cancel(); restore(); for (const id of [...bodies.keys()]) removeBody(id); refresh(0); last = 0; samples = []; adapter.onUpdate?.(); },
    reset(preset: FusionPreset = sim.preset, ratio = sim.ratio) { cancel(); for (const id of [...bodies.keys()]) removeBody(id); sim.reset(preset, ratio); refresh(0); last = 0; samples = []; },
    setOptions(next: Partial<FusionOptions>) {
      const lightingChanged = next.lighting !== undefined && next.lighting !== options.lighting;
      const qualityChanged = next.quality !== undefined && next.quality !== options.quality;
      Object.assign(options, next);
      if (options.paused) cancel();
      if (lightingChanged) {
        const old = env; env = studioEnvironment(renderer, options.lighting === 'daylight'); scene.environment = env.texture; old.dispose();
        floorMaterial.color.set(options.lighting === 'daylight' ? '#c6c9c2' : '#455157'); ambient.intensity = options.lighting === 'daylight' ? 1.35 : 1;
        renderer.toneMappingExposure = options.lighting === 'daylight' ? 1.13 : 1.05;
      }
      floorMaterial.map = textures[options.inspection ? 1 : 0]; floorMaterial.bumpMap = options.inspection ? null : textures[0]; floorMaterial.needsUpdate = true;
      for (const b of bodies.values()) b.mesh.material = options.clay ? clay : b.material;
      if (qualityChanged) resize(); refresh(0); last = 0;
    },
    dispose() {
      if (disposed) return; cancel(); disposed = true; cancelAnimationFrame(raf); observer.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('touchstart', prevent); canvas.removeEventListener('touchmove', prevent); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility);
      for (const id of [...bodies.keys()]) removeBody(id);
      sphere.dispose(); clay.dispose(); floor.geometry.dispose(); floorMaterial.dispose(); textures.forEach(t => t.dispose()); background.dispose(); env.dispose(); renderer.dispose();
      for (const g of goalViews) { for (const mesh of [g.ring, g.fill, g.label]) { mesh.geometry.dispose(); mesh.material.dispose(); } g.texture.dispose(); }
      for (const mesh of islands) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
}
