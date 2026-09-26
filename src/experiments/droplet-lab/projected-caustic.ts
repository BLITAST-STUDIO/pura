import * as THREE from 'three';
import { FIELD_GLSL } from '../fusion-lab/shape';
import { RIM_GLSL } from './rim-response';

/**
 * A small, forward-projected sample of the actual visible surface. Every point
 * represents the same area of incoming light. Where refracted rays bunch up,
 * their soft splats overlap on the floor. This is a comparison effect, not a
 * multi-bounce spectral or wave-optics caustic solver.
 */
export const CAUSTIC_SAMPLES = 1536;
export const CAUSTIC_BALANCED_SAMPLES = 512;
function radialSample(index: number) {
  let value = index + 1, inverse = 0, fraction = .5;
  while (value > 0) {
    inverse += (value & 1) * fraction;
    value >>= 1;
    fraction *= .5;
  }
  return inverse;
}
export function projectedCausticGeometry() {
  const samples = new Float32Array(CAUSTIC_SAMPLES * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CAUSTIC_SAMPLES; i++) {
    // Low-discrepancy radius keeps both the full and 512-point prefix spread
    // over the whole surface when the player selects lighter rendering.
    const radius = 1.32 * Math.sqrt(radialSample(i));
    const angle = i * golden;
    samples[i * 3] = Math.cos(angle) * radius;
    samples[i * 3 + 1] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(samples, 3));
  return geometry;
}

export function projectedCausticMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Pura surface-projected floor light',
    toneMapped: false,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uDropToWorld: { value: new THREE.Matrix4() },
      uWorldToDrop: { value: new THREE.Matrix4() },
      uSurfaceBend: { value: new THREE.Vector2() },
      uRimA: { value: new THREE.Vector4() },
      uRimB: { value: new THREE.Vector2() },
      uRimActive: { value: 0 },
      uLobeCount: { value: 0 },
      uLobes: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
      uBlend: { value: .03 },
      uTint: { value: new THREE.Color('#c9eef0') },
      // Same absorption coefficients as the liquid; the light is coloured by its path inside.
      uAbsorption: { value: new THREE.Vector3() },
      uPointSize: { value: 4 },
      uGain: { value: .08 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 uDropToWorld;
      uniform mat4 uWorldToDrop;
      uniform vec2 uSurfaceBend;
      uniform float uPointSize;
      uniform vec3 uAbsorption;
      varying float vVisible;
      varying vec3 vTransmit;
      ${RIM_GLSL}
      ${FIELD_GLSL}
      const vec3 CENTER = vec3(0., 0., .3968);
      const vec3 RADII = vec3(1., 1., .62);

      float liquidField(vec3 p) {
        if (uLobeCount > .5) return field(p);
        vec3 q = unrimPoint(p);
        float h = q.z - .007;
        q.xy -= uSurfaceBend * h * h;
        vec3 e = (q - CENTER) / RADII;
        return max(dot(e, e) - 1., .007 - p.z);
      }
      vec3 liquidNormal(vec3 p) {
        float d = .001;
        return normalize(vec3(
          liquidField(p + vec3(d, 0., 0.)) - liquidField(p - vec3(d, 0., 0.)),
          liquidField(p + vec3(0., d, 0.)) - liquidField(p - vec3(0., d, 0.)),
          liquidField(p + vec3(0., 0., d)) - liquidField(p - vec3(0., 0., d))
        ));
      }
      vec3 transformedNormal(vec3 localNormal) {
        return normalize(vec3(dot(uWorldToDrop[0].xyz, localNormal),
          dot(uWorldToDrop[1].xyz, localNormal), dot(uWorldToDrop[2].xyz, localNormal)));
      }
      void main() {
        vVisible = 0.;
        vTransmit = vec3(0.);
        gl_Position = vec4(2., 2., 2., 1.);
        gl_PointSize = 0.;
        vec2 xy = position.xy;
        if (liquidField(vec3(xy, .3968)) >= -.012) return;
        float low = .3968, high = 1.25;
        for (int i = 0; i < 14; i++) {
          float middle = (low + high) * .5;
          if (liquidField(vec3(xy, middle)) < 0.) low = middle;
          else high = middle;
        }
        vec3 entryLocal = vec3(xy, (low + high) * .5);
        vec3 entry = (uDropToWorld * vec4(entryLocal, 1.)).xyz;
        vec3 normal = transformedNormal(liquidNormal(entryLocal));
        // Same key-light direction as the studio's main directional light.
        vec3 incident = normalize(vec3(4., -4., -8.));
        if (dot(incident, normal) > -.12) return;
        vec3 inside = refract(incident, normal, 1. / 1.333);
        if (inside.z > -.08) return;
        vec3 localRay = normalize((uWorldToDrop * vec4(inside, 0.)).xyz);
        vec3 origin = entryLocal + localRay * .002;
        float toBottom = (.007 - origin.z) / localRay.z;
        vec3 atBottom = origin + localRay * toBottom;
        bool bottomHit = toBottom > 0. && liquidField(atBottom + vec3(0., 0., .002)) < 0.;
        vec3 exitLocal = atBottom;
        vec3 exitNormal = vec3(0., 0., -1.);
        if (!bottomHit) {
          float travel = 0.;
          if (uLobeCount < .5 && uRimActive < .5 && dot(uSurfaceBend, uSurfaceBend) < 1.e-10) {
            vec3 o = (origin - CENTER) / RADII, d = localRay / RADII;
            float a = dot(d, d), b = dot(o, d);
            float discriminant = b * b - a * (dot(o, o) - 1.);
            if (discriminant <= 0.) return;
            travel = (-b + sqrt(discriminant)) / a;
          } else {
            float previous = 0., next = .012;
            bool found = false;
            for (int i = 0; i < 64; i++) {
              if (liquidField(origin + localRay * next) > 0.) { found = true; break; }
              previous = next;
              next += max(.012, min(.08, abs(liquidField(origin + localRay * next)) * .1));
              if (next > 3.) break;
            }
            if (!found) return;
            for (int i = 0; i < 10; i++) {
              float middle = (previous + next) * .5;
              if (liquidField(origin + localRay * middle) < 0.) previous = middle;
              else next = middle;
            }
            travel = (previous + next) * .5;
          }
          if (travel <= 0.) return;
          exitLocal = origin + localRay * travel;
          exitNormal = liquidNormal(exitLocal);
        }
        vec3 exitPoint = (uDropToWorld * vec4(exitLocal, 1.)).xyz;
        vec3 normalOut = transformedNormal(exitNormal);
        if (dot(inside, normalOut) <= 0.) return;
        vec3 leaving = refract(inside, -normalOut, 1.333);
        if (leaving.z > -.08) return;
        vec3 floorPoint = exitPoint + leaving * ((-.001 - exitPoint.z) / leaving.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(floorPoint, 1.);
        gl_PointSize = uPointSize;
        vVisible = 1.;
        float path = length((uDropToWorld * vec4(exitLocal - entryLocal, 0.)).xyz);
        vTransmit = exp(-uAbsorption * path);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGain;
      varying float vVisible;
      varying vec3 vTransmit;
      void main() {
        vec2 p = gl_PointCoord * 2. - 1.;
        // Wide, faint splats overlap into a smooth pool instead of visible dots.
        float spot = exp(-dot(p, p) * 2.4) * (1. - smoothstep(.75, 1., length(p)));
        gl_FragColor = vec4(vTransmit, spot * uGain * .22 * vVisible);
      }
    `,
  });
}

export function projectedPointSize(projectedRadiusPx: number, pixelRatio: number, sampleCount: number) {
  return Math.max(3, Math.min(40, projectedRadiusPx * 13.5 / Math.sqrt(sampleCount) * pixelRatio));
}
