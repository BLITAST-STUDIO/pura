/** One shared local shape for the visible surface and its optical interior. */
export const SURFACE_BOTTOM = 0.007;
export const SURFACE_CENTER_Z = 0.3968;
export const SURFACE_HEIGHT = 0.62;
export const SURFACE_TOP = SURFACE_CENTER_Z + SURFACE_HEIGHT;
export type Point3 = { x: number; y: number; z: number };
export type Bend = { x: number; y: number };

// A height-dependent shear leaves the contact plane fixed and has determinant
// one everywhere. Unlike a generic vertex ripple it has an explicit inverse.
export function warpSurface(p: Point3, bend: Bend): Point3 {
  const h = p.z - SURFACE_BOTTOM;
  return { x: p.x + bend.x * h * h, y: p.y + bend.y * h * h, z: p.z };
}

export function unwarpSurface(p: Point3, bend: Bend): Point3 {
  const h = p.z - SURFACE_BOTTOM;
  return { x: p.x - bend.x * h * h, y: p.y - bend.y * h * h, z: p.z };
}

export function surfaceField(p: Point3, bend: Bend): number {
  const q = unwarpSurface(p, bend);
  return q.x * q.x + q.y * q.y + ((q.z - SURFACE_CENTER_Z) / SURFACE_HEIGHT) ** 2 - 1;
}

export function surfaceGradient(p: Point3, bend: Bend): Point3 {
  const q = unwarpSurface(p, bend);
  const h = p.z - SURFACE_BOTTOM;
  return { x: 2 * q.x, y: 2 * q.y,
    z: 2 * (q.z - SURFACE_CENTER_Z) / SURFACE_HEIGHT ** 2 - 4 * h * (bend.x * q.x + bend.y * q.y) };
}

/** Bounded reference of the shader's exit solver, for optical geometry tests.
 * Origin is inside the clipped shape; ray length is deliberately not normalized
 * so the parameter is still a world distance after inverse model transforms.
 */
export function surfaceExit(origin: Point3, ray: Point3, bend: Bend) {
  if (ray.z < -1e-9) {
    const travel = (SURFACE_BOTTOM - origin.z) / ray.z;
    const point = { x: origin.x + ray.x * travel, y: origin.y + ray.y * travel, z: SURFACE_BOTTOM };
    // Test which boundary is hit. A proximity threshold incorrectly assigns a
    // downward floor normal to side-wall exits just above the contact plane.
    if (travel > 0 && surfaceField(point, bend) <= 0) {
      return { point, normal: { x: 0, y: 0, z: -1 }, travel, bottom: true };
    }
  }
  const h2 = (SURFACE_TOP - SURFACE_BOTTOM) ** 2;
  const extent = { x: 1 + Math.abs(bend.x) * h2, y: 1 + Math.abs(bend.y) * h2 };
  let far = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(ray[axis]) < 1e-9) continue;
    const bound = axis === 'z' ? (ray.z > 0 ? SURFACE_TOP : SURFACE_BOTTOM)
      : (ray[axis] > 0 ? extent[axis] : -extent[axis]);
    far = Math.min(far, (bound - origin[axis]) / ray[axis]);
  }
  if (!Number.isFinite(far) || far <= 0) return null;
  let lo = 0, hi = far;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) * 0.5;
    const p = { x: origin.x + ray.x * mid, y: origin.y + ray.y * mid, z: origin.z + ray.z * mid };
    if (surfaceField(p, bend) <= 0) lo = mid; else hi = mid;
  }
  const travel = (lo + hi) * 0.5;
  const point = { x: origin.x + ray.x * travel, y: origin.y + ray.y * travel, z: origin.z + ray.z * travel };
  return { point, normal: surfaceGradient(point, bend), travel, bottom: false };
}

// Same inverse field and gradient as above. A small shear keeps the solid
// convex at the enforced .065 bound; bisection therefore finds the unique exit.
// Fixed work avoids an unbounded ray marcher on mobile GPUs.
// The optional rim ripple (RIM_GLSL, applied after the shear) is budgeted to
// keep every horizontal section convex; with it inactive this is unchanged.
export const SURFACE_GLSL = /* glsl */ `
  vec3 unwarpSurface(vec3 p) {
    float h = p.z - ${SURFACE_BOTTOM};
    return vec3(p.xy - uSurfaceBend * h * h, p.z);
  }
  float surfaceField(vec3 p) {
    vec3 q = unwarpSurface(unrimPoint(p));
    vec3 e = (q - CENTER) / RADII;
    return dot(e, e) - 1.0;
  }
  vec3 surfaceGradient(vec3 p) {
    vec3 u = unrimPoint(p);
    vec3 q = unwarpSurface(u);
    vec3 n = (q - CENTER) / (RADII * RADII);
    n.z -= 2.0 * (u.z - BOTTOM) * dot(uSurfaceBend, n.xy);
    return rimGradient(p, n);
  }
  bool findSurfaceExit(vec3 origin, vec3 ray, out vec3 point, out vec3 normal, out float travel) {
    if (ray.z < -1.0e-9) {
      float toBottom = (BOTTOM - origin.z) / ray.z;
      vec3 atBottom = vec3(origin.xy + ray.xy * toBottom, BOTTOM);
      if (toBottom > 0.0 && surfaceField(atBottom) <= 0.0) {
        point = atBottom;
        normal = vec3(0.0, 0.0, -1.0);
        travel = toBottom;
        return true;
      }
    }
    float h2 = ${(SURFACE_TOP - SURFACE_BOTTOM) ** 2};
    vec2 extent = (vec2(1.0) + abs(uSurfaceBend) * h2) * rimExtent();
    float far = 1.0e8;
    if (abs(ray.x) > 1.0e-9) far = min(far, ((ray.x > 0.0 ? extent.x : -extent.x) - origin.x) / ray.x);
    if (abs(ray.y) > 1.0e-9) far = min(far, ((ray.y > 0.0 ? extent.y : -extent.y) - origin.y) / ray.y);
    if (abs(ray.z) > 1.0e-9) far = min(far, ((ray.z > 0.0 ? ${SURFACE_TOP} : BOTTOM) - origin.z) / ray.z);
    if (far <= 0.0 || far >= 1.0e8) return false;
    float lo = 0.0;
    float hi = far;
    for (int i = 0; i < 16; i++) {
      float mid = (lo + hi) * 0.5;
      if (surfaceField(origin + ray * mid) <= 0.0) lo = mid; else hi = mid;
    }
    travel = (lo + hi) * 0.5;
    point = origin + ray * travel;
    normal = surfaceGradient(point);
    return true;
  }
`;
