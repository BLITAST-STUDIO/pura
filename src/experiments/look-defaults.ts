/**
 * 2026-09-25: the rim ripple and the shape-computed floor light are the
 * approved default look. The earlier look stays reachable for comparison
 * with ?ripple=off and ?caustic=artistic.
 */
const params = (search?: string) => new URLSearchParams(search ?? (typeof location !== 'undefined' ? location.search : ''));
export const initialRipple = (search?: string) => params(search).get('ripple') !== 'off';
export const initialCaustic = (search?: string): 'artistic' | 'shape' => params(search).get('caustic') === 'artistic' ? 'artistic' : 'shape';
/** Query value to record a choice; null means "the default", so the parameter is removed. */
export const rippleQuery = (on: boolean) => (on ? null : 'off');
export const causticQuery = (shape: boolean) => (shape ? null : 'artistic');
export function writeLookQuery(key: 'ripple' | 'caustic', value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key); else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, '', url);
}
