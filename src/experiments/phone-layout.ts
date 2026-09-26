/** Small screens (phones, upright or sideways) get phone play; see phone-play.tsx. */
export const PHONE_QUERY = '(max-width: 540px), (max-height: 520px)';

/** ?layout=phone or ?layout=page forces either, for checking. */
export function phoneLayout(search: string, matches: boolean) {
  const forced = new URLSearchParams(search).get('layout');
  return forced === 'phone' ? true : forced === 'page' ? false : matches;
}
