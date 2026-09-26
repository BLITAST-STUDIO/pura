import { relative, scoreName } from './golf';

/**
 * A hole sent to a friend: "I did this in N — can you?". The link opens the
 * same hole with the sender's strokes (?vs=N); nothing leaves the device
 * unless the player sends it with their own share sheet or clipboard.
 */
export function challengeUrl(base: string, holeId: number, strokes: number) {
  const url = new URL(base);
  url.search = '';
  url.searchParams.set('play', 'hitofude'); url.searchParams.set('board', String(holeId)); url.searchParams.set('vs', String(strokes));
  return url.toString();
}

export function challengeText(hole: { code: string; name: string; par: number }, strokes: number) {
  return `PURA ひとふで ${hole.code}「${hole.name}」を${strokes}打（${scoreName(strokes, hole.par)} ${relative(strokes - hole.par)}）で。いける？`;
}

/** The sender's strokes from a challenge link, if any. */
export function challengeFrom(search: string): number | null {
  const n = Number(new URLSearchParams(search).get('vs'));
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
}

/** Compare a finished hole with the challenge. */
export function challengeOutcome(mine: number, theirs: number) {
  return mine < theirs ? '挑戦に勝ち' : mine === theirs ? '挑戦と同じ' : '挑戦に届かず';
}
