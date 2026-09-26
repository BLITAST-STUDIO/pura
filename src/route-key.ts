/** Screens reachable by query. The bare URL is the new instant play (since 2026-09-26). */
export const ROUTE_KEYS = [
  'play=classic', 'play=bench', 'play=free', 'play=stages', 'play=open', 'play=first', 'play=chapters', 'lab=fusion', 'lab=droplets',
] as const;
export type RouteKey = typeof ROUTE_KEYS[number];
export const DEFAULT_ROUTE: RouteKey = 'play=open';

export function routeKey(search: string): RouteKey {
  const query = new URLSearchParams(search);
  for (const key of ['play', 'lab']) {
    const candidate = `${key}=${query.get(key)}`;
    if ((ROUTE_KEYS as readonly string[]).includes(candidate)) return candidate as RouteKey;
  }
  return DEFAULT_ROUTE;
}
