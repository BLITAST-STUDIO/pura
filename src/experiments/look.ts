/**
 * Visual direction proposals (2026-09-26), switchable for side-by-side play:
 * - studio: the current light-grey board (default, unchanged).
 * - night: the reference image's world — dark wet stone, jewel drops, the
 *   board dissolving into the dark without a card frame.
 * - gallery: a pale, matte exhibition floor with generous margins.
 * Presentation only; physics, rules and sizes are identical in every look.
 */
export type Look = 'studio' | 'night' | 'gallery';
export const LOOKS: Look[] = ['studio', 'night', 'gallery'];
export const LOOK_LABELS: Record<Look, string> = { studio: 'スタジオ（現在）', night: '夜の水面', gallery: '白い展示室' };

export type LookScene = {
  background: string; floor: string; roughness: number; metalness: number; envIntensity: number; bump: number;
  ambient: number; light: number; exposure: number; daylight: boolean;
  /** Brightness of the room the floor reflects (1 = the studio softboxes). */
  room: number;
};

/** Scene parameters for a look. Studio reproduces the approved values exactly. */
export function lookScene(look: Look, daylightOption: boolean): LookScene {
  // Wet but dark: a faint sheen, not a mirror of the key light (which washed the board white).
  // The room the floor mirrors is dimmed: a wet sheen with faint streaks, and
  // the drops (lit by their own shader) stay the brightest things on the board.
  if (look === 'night') return { background: '#040607', floor: '#1d2427', roughness: 0.3, metalness: 0.06, envIntensity: 0.5, bump: 0.01, ambient: 0.35, light: 0.9, exposure: 1.08, daylight: false, room: 0.08 };
  if (look === 'gallery') return { background: '#e6e3dc', floor: '#e4e0d8', roughness: 0.82, metalness: 0, envIntensity: 0.05, bump: 0.002, ambient: 1.45, light: 1.2, exposure: 1.1, daylight: true, room: 1 };
  return daylightOption
    ? { background: '#171e24', floor: '#c6c9c2', roughness: 0.52, metalness: 0.12, envIntensity: 0.08, bump: 0.004, ambient: 1.35, light: 1.35, exposure: 1.13, daylight: true, room: 1 }
    : { background: '#171e24', floor: '#455157', roughness: 0.52, metalness: 0.12, envIntensity: 0.08, bump: 0.004, ambient: 1, light: 1.35, exposure: 1.05, daylight: false, room: 1 };
}

const KEY = 'pura-flow-look-v1';
export function initialLook(search?: string): Look {
  try {
    const q = new URLSearchParams(search ?? location.search).get('look');
    if (q && (LOOKS as string[]).includes(q)) return q as Look;
  } catch { /* no location */ }
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (LOOKS as string[]).includes(stored)) return stored as Look;
  } catch { /* storage unavailable */ }
  return 'studio';
}
export function storeLook(look: Look) {
  try { localStorage.setItem(KEY, look); } catch { /* keeps working without storage */ }
  try {
    const url = new URL(location.href);
    if (look === 'studio') url.searchParams.delete('look'); else url.searchParams.set('look', look);
    history.replaceState(history.state, '', url);
  } catch { /* no location */ }
}
