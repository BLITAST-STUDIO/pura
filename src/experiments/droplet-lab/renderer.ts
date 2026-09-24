import * as THREE from 'three';
import type { HueId } from '../../game/palette';
import { DropletSimulation } from './simulation';
import { createLiquidMaterial } from './liquid-material';
import { DropletMotion } from './motion';
import { DropletPull, MAX_PULL } from './pull-response';
import { DropletSurface, MAX_SURFACE_BEND, MAX_PRESS, volumeScales } from './surface-response';
import { SURFACE_BOTTOM, SURFACE_TOP } from './surface-shape';
import type { SensoryFeedback } from '../sensory/feedback';

export type ExperienceOptions = {
  hue: HueId;
  lighting: 'studio' | 'daylight';
  inspection: boolean;
  reducedMotion: boolean;
  paused: boolean;
  quality: 'high' | 'balanced';
  refinement: 'baseline' | 'refined';
  clay: boolean;
};
type Callbacks = {
  onReady?: () => void;
  onError?: (message: string) => void;
  onStats?: (stats: { fps: number; frameP95: number; grabbed: boolean }) => void;
  onInteraction?: () => void;
};
const COLORS: Record<HueId, string> = { cyan: '#5dd7e7', rose: '#eb729e', amber: '#f5bc54' };
const WORLD = 0.01;
const CAMERA_TILT = 0.47;

// All shape, color and illumination parameters here affect presentation only.
const LOOK = {
  roughness: 0.035,
  ior: 1.333,
  absorptionDistance: 2.6,
  thickness: 1.05,
  exposure: 1.05,
  maxStretch: 0.26,
  maxSquash: 0.25,
  taperRatio: 0.16,
};

export function floorTexture(inspection: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  if (inspection) {
    ctx.fillStyle = '#909598';
    ctx.fillRect(0, 0, 1024, 1024);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x + y) % 2) {
        ctx.fillStyle = '#575e63';
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
      ctx.fillStyle = '#d8ddd9';
      ctx.fillRect(x * 64 + 30, y * 64 + 25, 1, 12);
      ctx.fillRect(x * 64 + 25, y * 64 + 30, 12, 1);
    }
  } else {
    const data = ctx.createImageData(1024, 1024);
    let seed = 127;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const grain = (seed >>> 0) / 4294967296;
      const vein = Math.sin(x * 0.012 + Math.sin(y * 0.009) * 3) * 3;
      const fleck = grain > 0.997 ? 12 : 0;
      const v = 127 + (grain - 0.5) * 9 + vein + fleck;
      const i = (y * 1024 + x) * 4;
      data.data[i] = v;
      data.data[i + 1] = v + 2;
      data.data[i + 2] = v + 4;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

export function studioEnvironment(renderer: THREE.WebGLRenderer, daylight: boolean) {
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshBasicMaterial({ color: daylight ? '#83949a' : '#343d49', side: THREE.BackSide })));
  function softbox(w: number, h: number, x: number, y: number, z: number, rgb: [number, number, number]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  softbox(7.5, 2.3, -3, 3.6, 5, daylight ? [22, 22, 20] : [20, 22, 24]);
  softbox(0.85, 5.2, 4.5, 0.5, 3.5, [18, 21, 24]);
  softbox(4.5, 0.65, 0, -4.5, 0.65, [13, 15, 18]);
  softbox(3.2, 1.7, -3.2, -3.8, 1.6, daylight ? [3, 2.8, 2.3] : [1.4, 1.5, 1.6]);
  softbox(1.3, 3.0, 0.8, 5.5, 0.7, [0.9, 1.1, 1.25]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.035, 0.1, 60);
  pmrem.dispose();
  studio.traverse(obj => {
    if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }
  });
  return target;
}

export function contactMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(COLORS.cyan) }, gain: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 vUv; uniform vec3 color; uniform float gain;
      void main(){
        vec2 p=(vUv-.5)*4.;
        float r=length(p);
        float contact=exp(-pow((r-.73)*8.,2.))*.20;
        float shade=exp(-dot(p,p)*2.)*.13;
        gl_FragColor=vec4(vec3(.008,.014,.017),(contact+shade)*gain);
      }`,
  });
}

export function causticMaterial() {
  // Artistic, local light footprint. This is not a traced caustic solver.
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(COLORS.cyan) }, gain: { value: 0.34 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 vUv; uniform vec3 color; uniform float gain;
      void main(){
        vec2 p=(vUv-.5)*4.; p.y*=1.1;
        float r=length(p); float a=atan(p.y,p.x);
        float arc=pow(max(0.,cos(a+1.7)),3.);
        float ring=exp(-pow((r-1.03)*19.,2.));
        float outer=exp(-pow((r-1.22)*12.,2.))*.17;
        gl_FragColor=vec4(mix(color,vec3(1.),.55),(ring+outer)*arc*gain);
      }`,
  });
}

export function createDropletExperience(canvas: HTMLCanvasElement, callbacks: Callbacks = {}, feedback?: SensoryFeedback) {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!context) throw new Error('このブラウザでは水滴の描画を開始できません。WebGL 2対応のブラウザでお試しください。');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  const gpuInfo = context.getExtension('WEBGL_debug_renderer_info');
  canvas.dataset.environment = JSON.stringify({
    userAgent: navigator.userAgent, webgl: context.getParameter(context.VERSION),
    renderer: gpuInfo ? context.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),
    color: 'linear render targets / ACES / sRGB output',
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#171e24');
  let environment = studioEnvironment(renderer, false);
  scene.environment = environment.texture;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.up.set(0, 1, 0);
  const sim = new DropletSimulation({ radius: 88 });
  const motion = new DropletMotion();
  const pull = new DropletPull();
  const surface = new DropletSurface();
  const options: ExperienceOptions = {
    hue: 'cyan', lighting: 'studio', inspection: false,
    reducedMotion: false, paused: false, quality: 'high',
    refinement: 'refined', clay: false,
  };
  const textures = [floorTexture(false), floorTexture(true)];
  for (const t of textures) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#455157', map: textures[0], roughness: 0.52, metalness: 0.12,
    envMapIntensity: 0.08, bumpMap: textures[0], bumpScale: 0.004,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMaterial);
  floor.position.z = -0.012;
  scene.add(floor);
  const ambient = new THREE.HemisphereLight('#c9d8e2', '#41454a', 1.0);
  const light = new THREE.DirectionalLight('#ebf3fa', 1.35);
  light.position.set(-4, 4, 8);
  scene.add(ambient, light);
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < attr.count; i++) {
    const z = attr.getZ(i);
    attr.setZ(i, Math.max(0.007, (z + 0.64) * 0.62));
  }
  geometry.computeVertexNormals();
  // Ray picking must include every deformed vertex even after the first pick
  // caches a bound. This local sphere covers both the saved taper and new shear.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 1.16);
  const originalVertices = new Float32Array(attr.array);
  const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const originalNormals = new Float32Array(normalAttr.array);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: LOOK.roughness,
    transmission: 1, thickness: LOOK.thickness, ior: LOOK.ior,
    attenuationColor: COLORS.cyan, attenuationDistance: LOOK.absorptionDistance,
    envMapIntensity: 1.55, dispersion: 0.012,
  });
  const backgroundTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  backgroundTarget.texture.colorSpace = THREE.NoColorSpace;
  const liquidMaterial = createLiquidMaterial(backgroundTarget.texture);
  const clayMaterial = new THREE.MeshStandardMaterial({ color: '#aab6b5', roughness: 0.7, metalness: 0,
    envMapIntensity: 0.45 });
  const referenceMaterial = new URLSearchParams(location.search).get('material') === 'physical';
  const drop = new THREE.Mesh<THREE.SphereGeometry, THREE.Material>(geometry, referenceMaterial ? material : liquidMaterial);
  drop.frustumCulled = false;
  const dropGroup = new THREE.Group();
  const pullGroup = new THREE.Group();
  pullGroup.matrixAutoUpdate = false;
  pullGroup.add(drop);
  dropGroup.add(pullGroup);
  scene.add(dropGroup);
  const contactGroup = new THREE.Group();
  contactGroup.matrixAutoUpdate = false;
  scene.add(contactGroup);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), contactMaterial());
  contact.position.z = -0.003;
  contactGroup.add(contact);
  const caustic = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), causticMaterial());
  caustic.position.z = -0.001;
  contactGroup.add(caustic);
  const guide = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
    color: '#9baeb7', transparent: true, opacity: 0.085,
  }));
  guide.position.z = 0.001;
  scene.add(guide);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const point = new THREE.Vector3();
  let activePointer: number | null = null;
  let grabOffset = new THREE.Vector2();
  const grabPoint = new THREE.Vector2();
  let disposed = false;
  let contextLost = false;
  let raf = 0;
  let last = 0;
  let statTime = 0;
  let samples: number[] = [];
  let warmupStart = 0;
  let benchmarkSamples: number[] = [];
  let completedBenchmark = false;
  let previousTaper = Number.NaN;
  let previousBendX = Number.NaN;
  let previousBendY = Number.NaN;
  let previousRefinement = '';
  let clock = 0;

  function resize() {
    if (disposed || contextLost) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    cancelPointer();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, options.quality === 'high' ? 2 : 1.25));
    renderer.setSize(rect.width, rect.height, false);
    renderer.transmissionResolutionScale = options.quality === 'high' ? 1 : 0.6;
    const captureScale = options.quality === 'high' ? 1 : 0.7;
    backgroundTarget.setSize(Math.max(1, Math.round(canvas.width * captureScale)), Math.max(1, Math.round(canvas.height * captureScale)));
    const aspect = rect.width / rect.height;
    const width = THREE.MathUtils.clamp(rect.width * 1.06, 550, 1200);
    const height = width / aspect;
    sim.resize(width, height);
    camera.aspect = aspect;
    // Fit every legal corner including the deformed drop, not only the flat board.
    // Rotation can put the larger XY scale on either axis. Each frustum plane
    // fits a circular ellipsoid envelope plus the bounded taper displacement.
    // This avoids fitting impossible box corners and needlessly shrinking the drop.
    const radius = sim.snapshot.r * WORLD;
    const pad = Math.max(22, Math.min(sim.width, sim.height) * 0.04) * WORLD;
    const maxLocalZ = (1 + 0.64) * 0.62;
    const maxTaper = LOOK.maxStretch * LOOK.taperRatio;
    // The same camera envelope serves both comparison modes. Include reciprocal
    // height compensation, the touch press and the contact-anchored upper shear.
    const maxXYScale = Math.max(1 + LOOK.maxStretch,
      1 + LOOK.maxStretch * 0.46 + LOOK.maxSquash) * Math.sqrt(1 + MAX_PRESS);
    const maxTaperOffset = Math.max(maxTaper * Math.hypot(maxLocalZ * maxLocalZ, 0.4),
      MAX_SURFACE_BEND * (SURFACE_TOP - SURFACE_BOTTOM) ** 2);
    const maxPullScale = 1 + MAX_PULL * 0.5;
    const maxPullShift = radius * MAX_PULL * 0.5;
    const maxXYRadius = radius * maxXYScale * maxPullScale;
    const maxZScale = Math.max(1 + LOOK.maxStretch * 0.34,
      volumeScales(-LOOK.maxStretch, 0, 0).z);
    const minZScale = Math.min(1 - LOOK.maxStretch * 0.34 - LOOK.maxSquash * 0.5,
      volumeScales(LOOK.maxStretch, LOOK.maxSquash, MAX_PRESS).z) / maxPullScale;
    const taperXY = maxXYRadius * maxTaperOffset;
    const taperZ = radius * maxZScale * maxLocalZ * maxLocalZ * maxTaper * 0.3;
    const cornerX = sim.width * WORLD * 0.5 - pad - radius;
    const cornerY = sim.height * WORLD * 0.5 - pad - radius;
    const sinTilt = Math.sin(CAMERA_TILT), cosTilt = Math.cos(CAMERA_TILT);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const safeNdc = 0.97; // Keep the whole envelope 1.5% of the canvas from its edges.
    let distance = 0;
    const horizontal = 1 / (tangent * aspect * safeNdc);
    const vertical = 1 / (tangent * safeNdc);
    for (const [nx, ny, nz] of [
      [horizontal, -sinTilt, cosTilt], [-horizontal, -sinTilt, cosTilt],
      [0, cosTilt * vertical - sinTilt, sinTilt * vertical + cosTilt],
      [0, -cosTilt * vertical - sinTilt, -sinTilt * vertical + cosTilt],
    ]) {
      const radial = Math.hypot(nx, ny);
      const zScale = nz >= 0 ? maxZScale : minZScale;
      const shapeSupport = Math.hypot(radial * maxXYRadius, nz * radius * 0.62 * zScale)
        + nz * radius * 0.3968 * zScale + radial * (taperXY + maxPullShift) + Math.abs(nz) * taperZ;
      // Absolute XY coefficients select the worst of the four legal center corners.
      distance = Math.max(distance, Math.abs(nx) * cornerX + Math.abs(ny) * cornerY + shapeSupport);
    }
    camera.position.set(0, -Math.sin(CAMERA_TILT) * distance, Math.cos(CAMERA_TILT) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const w = sim.width * WORLD * 0.5 - pad, h = sim.height * WORLD * 0.5 - pad;
    guide.geometry.dispose();
    guide.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w, -h, 0), new THREE.Vector3(w, -h, 0),
      new THREE.Vector3(w, h, 0), new THREE.Vector3(-w, h, 0),
    ]);
    resetMeasurement();
  }

  function resetMeasurement() {
    samples = []; benchmarkSamples = []; warmupStart = 0; completedBenchmark = false;
    delete canvas.dataset.benchmark;
  }

  function screenToBoard(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(ground, point)) return null;
    return { x: point.x / WORLD + sim.width * 0.5, y: sim.height * 0.5 - point.y / WORLD };
  }
  function cancelPointer() {
    if (activePointer !== null && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
    activePointer = null;
    sim.pointerUp();
    canvas.style.cursor = 'grab';
  }
  function down(e: PointerEvent) {
    if (options.paused || contextLost || activePointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = screenToBoard(e);
    if (!p) return;
    // Ray picking includes the visible top of the droplet in a slightly inclined camera.
    dropGroup.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(drop, false)[0];
    const s = sim.snapshot;
    if (!hit && Math.hypot(p.x - s.x, p.y - s.y) > s.r + 14) return;
    grabOffset.set(p.x - s.x, p.y - s.y);
    if (hit) {
      grabPoint.set((hit.point.x - dropGroup.position.x) / (s.r * WORLD),
        (hit.point.y - dropGroup.position.y) / (s.r * WORLD));
    } else {
      grabPoint.set((p.x - s.x) / s.r, -(p.y - s.y) / s.r);
    }
    grabPoint.clampLength(0, 1);
    if (!sim.pointerDown(s.x, s.y)) return;
    feedback?.grab(s.r, s.x, sim.width);
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    callbacks.onInteraction?.();
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (activePointer !== e.pointerId || options.paused) return;
    const p = screenToBoard(e);
    if (p) sim.pointerMove(p.x - grabOffset.x, p.y - grabOffset.y);
  }
  function up(e: PointerEvent) {
    if (activePointer === e.pointerId) cancelPointer();
  }
  function preventCanvasScroll(e: TouchEvent) {
    // Reserve gestures that begin on the board, including a near-miss on a
    // moving drop. Native non-passive listeners also cover touch browsers that
    // otherwise start scrolling before the Pointer Events drag is established.
    // Touch events keep their initial target when a finger leaves the canvas.
    // Outside controls and page margins retain their normal scrolling behavior.
    if (e.cancelable) e.preventDefault();
  }
  function visibility() {
    cancelPointer(); last = 0; resetMeasurement();
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!disposed && !contextLost) raf = requestAnimationFrame(loop);
  }
  function lost(e: Event) {
    e.preventDefault(); contextLost = true; cancelPointer(); cancelAnimationFrame(raf);
    callbacks.onError?.('描画が中断されました。「もう一度試す」で水滴を戻せます。');
  }
  function restored() {
    callbacks.onError?.('描画の準備が戻りました。「もう一度試す」で再開してください。');
  }

  function deform(dt: number) {
    const s = sim.snapshot;
    const { stretch, squash, angle } = motion.update(s, dt, options.reducedMotion);
    const tension = pull.update(s, dt, options.reducedMotion);
    const refined = options.refinement === 'refined';
    const response = surface.update({ ...s, grabPoint }, dt, options.reducedMotion || !refined);
    const scales = refined ? volumeScales(stretch, squash, response.press)
      : { x: 1 + stretch, y: 1 - stretch * .46 + squash, z: 1 - stretch * .34 - squash * .5 };
    const r = s.r * WORLD;
    dropGroup.position.set((s.x - sim.width / 2) * WORLD, (sim.height / 2 - s.y) * WORLD, 0);
    drop.rotation.z = angle;
    drop.scale.set(r * scales.x, r * scales.y, r * scales.z);
    // The front responds to the finger/body gap before the physical body catches
    // up. Half extension + half forward shift approximately anchors the rear.
    // This affine deformation also reaches the optical inverse matrices, so the
    // stretched outline, refraction and reflected lights still describe one drop.
    const extension = tension.strength * 0.5;
    const nx = tension.strength > 0 ? tension.x / tension.strength : 0;
    const ny = tension.strength > 0 ? tension.y / tension.strength : 0;
    pullGroup.matrix.set(
      1 + extension * nx * nx, extension * nx * ny, 0, tension.x * r * 0.5,
      extension * nx * ny, 1 + extension * ny * ny, 0, tension.y * r * 0.5,
      0, 0, 1 / (1 + extension), 0,
      0, 0, 0, 1,
    );
    // Keep the small upper-surface response aligned with the actual finger even
    // when the existing wobble's principal axis is still turning. The affine
    // pull can then carry both as before. The new shear leaves the bottom fixed.
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const bendX = refined ? (cos * response.bendX + sin * response.bendY) / scales.x : 0;
    const bendY = refined ? (-sin * response.bendX + cos * response.bendY) / scales.y : 0;
    // Normalizing through the scale can enlarge local shear. Keep the enforced
    // optical convexity bound in local coordinates; only direction is critical.
    const bendLength = Math.hypot(bendX, bendY);
    const bendClamp = bendLength < 0.000001 ? 0 : bendLength > MAX_SURFACE_BEND ? MAX_SURFACE_BEND / bendLength : 1;
    const bx = bendX * bendClamp, by = bendY * bendClamp;
    const taper = refined || options.reducedMotion ? 0 : stretch * LOOK.taperRatio;
    if (previousRefinement !== options.refinement || !Number.isFinite(previousTaper)
      || Math.abs(taper - previousTaper) > 0.00001
      || Math.abs(bx - previousBendX) + Math.abs(by - previousBendY) > 0.000001
      || (bx === 0 && by === 0 && (previousBendX !== 0 || previousBendY !== 0))) {
      previousTaper = taper;
      previousBendX = bx; previousBendY = by; previousRefinement = options.refinement;
      for (let i = 0; i < attr.count; i++) {
        const j = i * 3;
        const x = originalVertices[j], y = originalVertices[j + 1], z = originalVertices[j + 2];
        if (refined) {
          const h = z - SURFACE_BOTTOM;
          attr.setXYZ(i, x + bx * h * h, y + by * h * h, z);
          const nx = originalNormals[j], ny = originalNormals[j + 1];
          const nz = originalNormals[j + 2] - 2 * h * (bx * nx + by * ny);
          const length = Math.hypot(nx, ny, nz) || 1;
          normalAttr.setXYZ(i, nx / length, ny / length, nz / length);
        } else {
          const shoulder = Math.max(0, z) * x;
          attr.setXYZ(i, x + taper * z * z, y * (1 - taper * x * .4), z * (1 + taper * shoulder * .3));
        }
      }
      attr.needsUpdate = true;
      if (refined) normalAttr.needsUpdate = true; else geometry.computeVertexNormals();
      liquidMaterial.uniforms.uSurfaceBend.value.set(bx, by);
    }
    contactGroup.matrix.makeTranslation(dropGroup.position.x, dropGroup.position.y, 0).multiply(pullGroup.matrix);
    contact.rotation.z = caustic.rotation.z = angle;
    contact.scale.set(r * scales.x, r * scales.y, 1);
    caustic.scale.copy(contact.scale);
    material.thickness = LOOK.thickness * (s.r / 68) * (refined ? scales.z : 1 - squash * .5);
    const screen = new THREE.Vector3(0, 0, r * .48).applyMatrix4(pullGroup.matrix).add(dropGroup.position).project(camera);
    const rect = canvas.getBoundingClientRect();
    canvas.dataset.drop = JSON.stringify({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, mass: s.mass, grabbed: s.grabbed,
      screenX: (screen.x + 1) * rect.width / 2, screenY: (1 - screen.y) * rect.height / 2, radius: s.r,
      stretch, squash, hue: s.hue, pullX: tension.x, pullY: tension.y, pullStrength: tension.strength,
      pointerGap: s.pointer ? Math.hypot(s.pointer.x - s.x, s.pointer.y - s.y) : 0,
      refinement: options.refinement, clay: options.clay, bendX: bx, bendY: by, press: response.press,
      scaleX: scales.x, scaleY: scales.y, scaleZ: scales.z, affineVolume: scales.x * scales.y * scales.z });
  }

  function renderScene() {
    renderer.info.autoReset = false;
    renderer.info.reset();
    if (!referenceMaterial && !options.clay) {
      dropGroup.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      liquidMaterial.uniforms.uDropToWorld.value.copy(drop.matrixWorld);
      liquidMaterial.uniforms.uWorldToDrop.value.copy(drop.matrixWorld).invert();
      liquidMaterial.uniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const toneMapping = renderer.toneMapping;
      dropGroup.visible = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(backgroundTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.toneMapping = toneMapping;
      dropGroup.visible = true;
    }
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    if (disposed || contextLost || document.hidden) return;
    const interval = last ? now - last : 0;
    const dt = Math.min(interval / 1000, 1 / 12);
    last = now;
    if (!options.paused) {
      sim.tick(dt); deform(dt);
      clock += dt;
      const s = sim.snapshot;
      if (feedback && dt > 0) feedback.contact(1, Math.hypot(s.wallImpulse.x, s.wallImpulse.y), s.r, s.x, sim.width, 'wall', clock);
    }
    renderScene();
    if (interval > 0 && !options.paused) {
      samples.push(interval);
      if (samples.length > 240) samples.shift();
      if (!warmupStart) warmupStart = now;
      const elapsed = now - warmupStart;
      if (elapsed >= 30000 && elapsed < 150000) benchmarkSamples.push(interval);
      if (elapsed >= 150000 && !completedBenchmark) {
        const sorted = [...benchmarkSamples].sort((a, b) => a - b);
        canvas.dataset.benchmark = JSON.stringify({
          warmupSeconds: 30, measurementSeconds: 120, samples: sorted.length,
          medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)],
          over50ms: sorted.filter(v => v > 50).length, quality: options.quality,
          lighting: options.lighting, inspection: options.inspection, dpr: renderer.getPixelRatio(),
          drawingBuffer: {width: canvas.width, height: canvas.height}, userAgent: navigator.userAgent,
          source: 'requestAnimationFrame intervals; not GPU time or input latency',
        });
        completedBenchmark = true;
      }
    }
    if (now - statTime > 500 && samples.length) {
      statTime = now;
      const sorted = [...samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * .95)];
      callbacks.onStats?.({ fps: Math.round(1000 / median), frameP95: Math.round(p95 * 10) / 10, grabbed: sim.snapshot.grabbed });
      canvas.dataset.renderStats = JSON.stringify({ medianMs: median, p95Ms: p95, calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
        width: canvas.width, height: canvas.height, quality: options.quality });
      if (feedback) canvas.dataset.sensory = JSON.stringify(feedback.status());
    }
    raf = requestAnimationFrame(loop);
  }

  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  canvas.addEventListener('touchstart', preventCanvasScroll, { passive: false });
  canvas.addEventListener('touchmove', preventCanvasScroll, { passive: false });
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('blur', cancelPointer);
  document.addEventListener('visibilitychange', visibility);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize(); deform(0); renderScene();
  raf = requestAnimationFrame(loop);
  callbacks.onReady?.();

  return {
    setOptions(next: Partial<ExperienceOptions>) {
      if (disposed) return;
      const lightingChanged = next.lighting !== undefined && next.lighting !== options.lighting;
      const qualityChanged = next.quality !== undefined && next.quality !== options.quality;
      const refinementChanged = next.refinement !== undefined && next.refinement !== options.refinement;
      const clayChanged = next.clay !== undefined && next.clay !== options.clay;
      Object.assign(options, next);
      sim.setHue(options.hue);
      material.attenuationColor.set(COLORS[options.hue]);
      liquidMaterial.uniforms.uTint.value.set(COLORS[options.hue]);
      liquidMaterial.uniforms.uDaylight.value = options.lighting === 'daylight' ? 1 : 0;
      caustic.material.uniforms.color.value.set(COLORS[options.hue]);
      drop.material = options.clay ? clayMaterial : referenceMaterial ? material : liquidMaterial;
      caustic.visible = !options.clay;
      floorMaterial.map = textures[options.inspection ? 1 : 0];
      floorMaterial.bumpMap = options.inspection ? null : textures[0];
      floorMaterial.needsUpdate = true;
      if (lightingChanged) {
        const previous = environment;
        environment = studioEnvironment(renderer, options.lighting === 'daylight');
        scene.environment = environment.texture;
        previous.dispose();
        floorMaterial.color.set(options.lighting === 'daylight' ? '#c6c9c2' : '#455157');
        ambient.intensity = options.lighting === 'daylight' ? 1.35 : 1;
        renderer.toneMappingExposure = options.lighting === 'daylight' ? 1.13 : LOOK.exposure;
      }
      if (qualityChanged) resize();
      if (options.paused) cancelPointer();
      if (refinementChanged) { surface.reset(); deform(0); }
      else if (clayChanged) deform(0);
      if (options.reducedMotion) { motion.reset(); pull.reset(); surface.reset(); deform(0); }
      last = 0; resetMeasurement();
    },
    reset() {
      cancelPointer(); sim.reset(); motion.reset(); pull.reset(); surface.reset();
      deform(0); resetMeasurement(); last = 0;
    },
    dispose() {
      if (disposed) return;
      cancelPointer(); disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('touchstart', preventCanvasScroll);
      canvas.removeEventListener('touchmove', preventCanvasScroll);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('blur', cancelPointer);
      document.removeEventListener('visibilitychange', visibility);
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(m => m.dispose());
        }
      });
      textures.forEach(t => t.dispose()); environment.dispose(); backgroundTarget.dispose();
      if (referenceMaterial) liquidMaterial.dispose(); else material.dispose();
      clayMaterial.dispose();
      // A comparison switch may leave either liquid material outside the scene.
      if (options.clay) { liquidMaterial.dispose(); material.dispose(); }
      renderer.dispose();
    },
  };
}
