import { Color } from 'three';
import { pigmentMass, type Pigment } from '../../game/palette';

const SWATCHES = { cyan: '#5dd7e7', rose: '#eb729e', amber: '#f5bc54' };
export type Absorption = [number, number, number];
export const ABSORPTION = Object.fromEntries(Object.entries(SWATCHES).map(([hue, hex]) => {
  const c = new Color(hex); const peak = Math.max(c.r, c.g, c.b, .001);
  return [hue, [c.r, c.g, c.b].map(v => -Math.log(Math.max(.035, 1 + (v / peak - 1) * .68)) * 1.65)];
})) as Record<keyof Pigment, Absorption>;
export function absorptionOf(p: Pigment): Absorption {
  const mass = pigmentMass(p);
  if (!(mass > 0)) return [0, 0, 0];
  return [0, 1, 2].map(channel => (['cyan', 'rose', 'amber'] as const)
    .reduce((sum, hue) => sum + ABSORPTION[hue][channel] * p[hue] / mass, 0)) as Absorption;
}
export function fractions(p: Pigment): Pigment {
  const m = pigmentMass(p);
  return { cyan: m ? p.cyan / m : 0, rose: m ? p.rose / m : 0, amber: m ? p.amber / m : 0 };
}
