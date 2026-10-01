/** Screens reachable by query. The bare URL is the new instant play (since 2026-09-26). */
export const ROUTE_KEYS = [
  'play=classic', 'play=bench', 'play=free', 'play=endless', 'play=hitofude', 'play=maker', 'play=michi', 'play=curling', 'play=welcome', 'play=stages', 'play=open', 'play=first', 'play=chapters', 'lab=fusion', 'lab=droplets',
] as const;
export type RouteKey = typeof ROUTE_KEYS[number];
export const DEFAULT_ROUTE: RouteKey = 'play=open';

/**
 * Screens still on trial: only the trial channel (/next/, VITE_CHANNEL=next)
 * opens them. On the version shared with family a direct link to one falls
 * back to the default screen, until the user approves it (2026-10-01: the
 * stage maker is merged to main but stays on trial).
 */
export const TRIAL_ONLY: readonly RouteKey[] = ['play=maker'];
export function releasedRoute(key: RouteKey, channel: string | undefined): RouteKey {
  return channel !== 'next' && TRIAL_ONLY.includes(key) ? DEFAULT_ROUTE : key;
}

/**
 * The bare URL opens instant play; a first visit (never welcomed) opens the
 * short welcome instead (2026-09-27). Any explicit ?play= or ?lab= wins.
 */
export function routeKey(search: string, welcomed = true): RouteKey {
  const query = new URLSearchParams(search);
  for (const key of ['play', 'lab']) {
    const candidate = `${key}=${query.get(key)}`;
    if ((ROUTE_KEYS as readonly string[]).includes(candidate)) return candidate as RouteKey;
  }
  return query.has('play') || query.has('lab') || welcomed ? DEFAULT_ROUTE : 'play=welcome';
}
