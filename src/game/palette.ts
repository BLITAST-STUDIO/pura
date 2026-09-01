export type HueId = "cyan" | "rose" | "amber";

export const HUE_ORDER: HueId[] = ["cyan", "rose", "amber"];

export const HUE_RGB: Record<HueId, [number, number, number]> = {
  cyan: [94 / 255, 228 / 255, 242 / 255],
  rose: [240 / 255, 114 / 255, 160 / 255],
  amber: [245 / 255, 193 / 255, 74 / 255],
};

export const HUE_HEX: Record<HueId, string> = {
  cyan: "#5ee4f2",
  rose: "#f072a0",
  amber: "#f5c14a",
};

export const HUE_LABEL: Record<HueId, string> = {
  cyan: "CYAN",
  rose: "ROSE",
  amber: "AMBER",
};

export type Pigment = Record<HueId, number>;

export function emptyPigment(): Pigment {
  return { cyan: 0, rose: 0, amber: 0 };
}

export function addPigment(a: Pigment, b: Pigment): Pigment {
  return {
    cyan: a.cyan + b.cyan,
    rose: a.rose + b.rose,
    amber: a.amber + b.amber,
  };
}

export function pigmentMass(p: Pigment): number {
  return p.cyan + p.rose + p.amber;
}

export function dominantHue(p: Pigment): HueId {
  let best: HueId = "cyan";
  let v = p.cyan;
  if (p.rose > v) {
    best = "rose";
    v = p.rose;
  }
  if (p.amber > v) best = "amber";
  return best;
}

export function purityOf(p: Pigment): number {
  const m = pigmentMass(p);
  if (m <= 1e-6) return 1;
  return Math.max(p.cyan, p.rose, p.amber) / m;
}

export function mixRgb(p: Pigment): [number, number, number] {
  const m = pigmentMass(p);
  if (m <= 1e-6) return HUE_RGB.cyan;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hue of HUE_ORDER) {
    const w = p[hue] / m;
    const rgb = HUE_RGB[hue];
    r += rgb[0] * w;
    g += rgb[1] * w;
    b += rgb[2] * w;
  }
  const pur = purityOf(p);
  // Mixed blobs desaturate toward a cool gray
  const gray = 0.42;
  r = r * pur + gray * (1 - pur) * 0.7;
  g = g * pur + gray * (1 - pur) * 0.75;
  b = b * pur + gray * (1 - pur) * 0.8;
  return [r, g, b];
}

export function rgbCss(rgb: [number, number, number], a = 1): string {
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${a})`;
}
