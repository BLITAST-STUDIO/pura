import * as THREE from 'three';
import { SURFACE_GLSL } from './surface-shape';
import { RIM_GLSL } from './rim-response';

// The refined surface and its optical interior use the same height shear.
// The saved comparison retains its analytic ellipsoid / tiny taper approximation.
// The opaque background target must contain linear light, without tone mapping.
export function createLiquidMaterial(background: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Pura two-interface liquid',
    uniforms: {
      uBackground: { value: background },
      uViewProjection: { value: new THREE.Matrix4() },
      uWorldToDrop: { value: new THREE.Matrix4() },
      uDropToWorld: { value: new THREE.Matrix4() },
      uTint: { value: new THREE.Color('#5dd7e7') },
      uDaylight: { value: 0 },
      uIor: { value: 1.333 },
      uSurfaceBend: { value: new THREE.Vector2() },
      uRimA: { value: new THREE.Vector4() },
      uRimB: { value: new THREE.Vector2() },
      uRimActive: { value: 0 },
      // 1: light seen through the drop is softened; ?glint=classic keeps the earlier look.
      // Night look only: a faint in-body glow tinted by the liquid (0 = off, exact).
      uGlow: { value: 0 },
      uThroughSoft: { value: typeof location !== 'undefined' && new URLSearchParams(location.search).get('glint') === 'classic' ? 0 : 1 },
    },
    depthWrite: true,
    toneMapped: true,
    vertexShader: /* glsl */ `
      uniform mat4 uWorldToDrop;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      ${RIM_GLSL}
      void main() {
        vec3 shaped = position;
        vec3 shapedNormal = normal;
        // Optional rim ripple after any shear; the identity when inactive.
        vec3 rimmed = rimPoint(shaped);
        vec3 rimmedNormal = rimGradient(rimmed, shapedNormal);
        vec4 world = modelMatrix * vec4(rimmed, 1.0);
        vWorldPosition = world.xyz;
        // Inverse transpose preserves the normal under nonuniform squash.
        vWorldNormal = normalize(vec3(
          dot(uWorldToDrop[0].xyz, rimmedNormal),
          dot(uWorldToDrop[1].xyz, rimmedNormal),
          dot(uWorldToDrop[2].xyz, rimmedNormal)
        ));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uBackground;
      uniform mat4 uViewProjection;
      uniform mat4 uWorldToDrop;
      uniform mat4 uDropToWorld;
      uniform vec3 uTint;
      uniform float uDaylight;
      uniform float uIor;
      uniform vec2 uSurfaceBend;
      uniform float uThroughSoft;
      uniform float uGlow;
      ${RIM_GLSL}
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      const vec3 CENTER = vec3(0.0, 0.0, 0.3968);
      const vec3 RADII = vec3(1.0, 1.0, 0.62);
      const float BOTTOM = 0.007;
      const float FLOOR = -0.012;
      const float EPSILON = 0.00015;

      ${SURFACE_GLSL}

      vec3 worldNormal(vec3 n) {
        return normalize(vec3(dot(uWorldToDrop[0].xyz, n),
          dot(uWorldToDrop[1].xyz, n), dot(uWorldToDrop[2].xyz, n)));
      }

      // Rectangular area lights at infinity, with a small angular edge softness.
      // All highlights are reflections of these panels through current normals.
      // Seen through the lens the edge is magnified, so refracted views use a wider falloff.
      float panelInner = 0.90;
      float panel(vec3 ray, vec3 center, vec2 size) {
        vec3 forward = normalize(center);
        vec3 right = normalize(cross(vec3(0.0, 0.0, 1.0), forward));
        vec3 up = cross(forward, right);
        float facing = dot(ray, forward);
        vec2 p = abs(vec2(dot(ray, right), dot(ray, up))) / max(facing, 0.001);
        vec2 mask = 1.0 - smoothstep(size * panelInner, size, p);
        return mask.x * mask.y * smoothstep(0.0, 0.05, facing);
      }

      vec3 environment(vec3 ray) {
        float sky = smoothstep(-0.15, 0.9, ray.z);
        vec3 room = mix(vec3(0.025, 0.035, 0.045), vec3(0.14, 0.18, 0.23), sky);
        room = mix(room, mix(vec3(0.10, 0.13, 0.15), vec3(0.50, 0.62, 0.70), sky), uDaylight);
        room += panel(ray, vec3(-3.0, 3.6, 5.0), vec2(0.54, 0.18))
          * mix(vec3(20.0, 22.0, 24.0), vec3(22.0, 22.0, 20.0), uDaylight);
        room += panel(ray, vec3(4.5, 0.5, 3.5), vec2(0.085, 0.46))
          * vec3(18.0, 21.0, 24.0);
        room += panel(ray, vec3(0.0, -4.5, 0.65), vec2(0.48, 0.075))
          * vec3(13.0, 15.0, 18.0);
        room += panel(ray, vec3(-3.2, -3.8, 1.6), vec2(0.30, 0.16))
          * mix(vec3(1.2, 1.4, 1.6), vec3(3.1, 2.9, 2.4), uDaylight);
        return room;
      }

      vec3 throughEnvironment(vec3 ray) {
        panelInner = mix(0.90, 0.45, uThroughSoft);
        vec3 room = environment(ray);
        panelInner = 0.90;
        return room;
      }

      vec3 outsideLight(vec3 origin, vec3 ray, bool through) {
        vec3 env = through ? throughEnvironment(ray) : environment(ray);
        if (ray.z >= -0.0001) return env;
        float distanceToFloor = (FLOOR - origin.z) / ray.z;
        if (distanceToFloor <= 0.0) return env;
        vec4 clip = uViewProjection * vec4(origin + ray * distanceToFloor, 1.0);
        if (clip.w <= 0.0) return env;
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        // Screen-space capture has no off-camera information. Fade at its edge.
        vec2 border = smoothstep(vec2(0.0), vec2(0.025), uv)
          * (1.0 - smoothstep(vec2(0.975), vec2(1.0), uv));
        vec3 floorLight = texture2D(uBackground, clamp(uv, 0.001, 0.999)).rgb;
        return mix(env, floorLight, border.x * border.y);
      }

      // World ray is unit length; do not normalize after transforming to local.
      // Thus the quadratic parameter remains a world distance even under squash.
      bool findExit(vec3 origin, vec3 ray, out vec3 point, out vec3 normal, out float travel) {
        point = origin;
        normal = vec3(0.0, 0.0, 1.0);
        travel = 0.0;
        vec3 localOrigin = (uWorldToDrop * vec4(origin, 1.0)).xyz;
        vec3 localRay = (uWorldToDrop * vec4(ray, 0.0)).xyz;
        if (dot(uSurfaceBend, uSurfaceBend) > 1.0e-12 || uRimActive > 0.5) {
          vec3 localPoint;
          vec3 localNormal;
          bool hit = findSurfaceExit(localOrigin, localRay, localPoint, localNormal, travel);
          if (!hit) return false;
          point = (uDropToWorld * vec4(localPoint, 1.0)).xyz;
          normal = worldNormal(localNormal);
          return true;
        }
        vec3 o = (localOrigin - CENTER) / RADII;
        vec3 d = localRay / RADII;
        float a = dot(d, d);
        float b = dot(o, d);
        float discriminant = b * b - a * (dot(o, o) - 1.0);
        if (discriminant < 0.0 || a < 0.000001) return false;
        travel = (-b + sqrt(max(0.0, discriminant))) / a;
        if (travel < EPSILON) return false;
        bool bottom = false;
        if (localRay.z < -0.000001) {
          float toBottom = (BOTTOM - localOrigin.z) / localRay.z;
          if (toBottom > EPSILON && toBottom < travel) {
            travel = toBottom;
            bottom = true;
          }
        }
        vec3 localPoint = localOrigin + localRay * travel;
        vec3 localNormal = bottom ? vec3(0.0, 0.0, -1.0)
          : (localPoint - CENTER) / (RADII * RADII);
        point = (uDropToWorld * vec4(localPoint, 1.0)).xyz;
        normal = worldNormal(localNormal);
        return true;
      }

      float fresnel(float cosine, float eta) {
        float cosI = clamp(cosine, 0.0, 1.0);
        float sinT2 = eta * eta * (1.0 - cosI * cosI);
        if (sinT2 >= 1.0) return 1.0;
        float cosT = sqrt(max(0.0, 1.0 - sinT2));
        float rs = (eta * cosI - cosT) / max(eta * cosI + cosT, 0.00001);
        float rp = (cosI - eta * cosT) / max(cosI + eta * cosT, 0.00001);
        return 0.5 * (rs * rs + rp * rp);
      }

      void main() {
        float ior = max(uIor, 1.001);
        vec3 incident = normalize(vWorldPosition - cameraPosition);
        vec3 normal = normalize(vWorldNormal);
        if (dot(incident, normal) > 0.0) normal = -normal;
        float entryFresnel = fresnel(dot(-incident, normal), 1.0 / ior);
        vec3 reflected = outsideLight(vWorldPosition, reflect(incident, normal), false);
        vec3 internalRay = normalize(refract(incident, normal, 1.0 / ior));
        vec3 exitPoint = vWorldPosition;
        vec3 exitNormal = normal;
        float distanceInside = 0.0;
        vec3 transmitted = throughEnvironment(internalRay);
        bool hit = findExit(vWorldPosition + internalRay * EPSILON, internalRay,
          exitPoint, exitNormal, distanceInside);
        if (hit) {
          vec3 outgoing = refract(internalRay, -exitNormal, ior);
          // One bounded internal reflection resolves the usual grazing TIR ray.
          // Further bounces use the room radiance instead of an unbounded march.
          if (dot(outgoing, outgoing) < 0.00001) {
            internalRay = normalize(reflect(internalRay, exitNormal));
            vec3 bouncePoint;
            vec3 bounceNormal;
            float bounceTravel;
            bool secondHit = findExit(exitPoint + internalRay * EPSILON, internalRay,
              bouncePoint, bounceNormal, bounceTravel);
            if (secondHit) {
              distanceInside += bounceTravel;
              exitPoint = bouncePoint;
              exitNormal = bounceNormal;
              outgoing = refract(internalRay, -exitNormal, ior);
            }
          }
          if (dot(outgoing, outgoing) > 0.00001) {
            float exitFresnel = fresnel(dot(internalRay, exitNormal), ior);
            // Small non-TIR secondary reflection is a bounded environment approximation.
            transmitted = mix(outsideLight(exitPoint, normalize(outgoing), true),
              throughEnvironment(reflect(internalRay, exitNormal)), exitFresnel);
          } else {
            transmitted = min(throughEnvironment(reflect(internalRay, exitNormal)), vec3(1.5));
          }
        }
        // The key softbox refracted through a tall drop is ~20x the floor's
        // brightness and clips to a hard white crescent. Compress only that HDR
        // peak so it reads as a tinted glow; ordinary floor light is untouched.
        if (uThroughSoft > 0.5) {
          float throughPeak = max(transmitted.r, max(transmitted.g, transmitted.b));
          if (throughPeak > 1.2) {
            float excess = throughPeak - 1.2;
            transmitted *= (1.2 + excess / (1.0 + excess / 2.0)) / throughPeak;
          }
        }
        // Tint is a linear transmittance color, not an opaque body-color overlay.
        // Normalized hue leaves its clearest wavelength essentially transparent.
        float peak = max(max(uTint.r, uTint.g), max(uTint.b, 0.001));
        vec3 transmissionColor = mix(vec3(1.0), uTint / peak, 0.68);
        vec3 absorption = -log(max(transmissionColor, vec3(0.035))) * 1.65;
        vec3 glowTint = transmissionColor;
        transmitted *= exp(-absorption * max(distanceInside, 0.0));
        vec3 color = reflected * entryFresnel + transmitted * (1.0 - entryFresnel);
        color += uGlow * glowTint * (1.0 - exp(-max(distanceInside, 0.0) * 2.0)) * (1.0 - entryFresnel);
        gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
