import { cloneLayout, readLayout, type Layout } from './layout';
import { LEGACY_ENGINE, MAKER_ENGINE, readProof, verifiesClear, type RecordedShot } from './simulation';

export const MAX_TOKEN = 4096;
export type SharedStage = { layout: Layout; proof: RecordedShot[] };
export const DRAFT_KEY = 'pura-flow-maker-draft-v1';
/** Geometry and the actual clearing shots travel together in a versioned fragment. */
export function encodeStage(layout: Layout, proof: RecordedShot[]): string | null {
  const clean = readLayout(layout);
  if (!clean || !verifiesClear(clean, proof)) return null;
  const json = JSON.stringify({ v: MAKER_ENGINE, l: clean, p: proof });
  const bytes = new TextEncoder().encode(json);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return token.length <= MAX_TOKEN ? token : null;
}
export function decodeStage(token: string): SharedStage | null {
  if (!token || token.length > MAX_TOKEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const bytes = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // Links made before shots could overlap (version 1) still open.
    if (value.v !== MAKER_ENGINE && value.v !== LEGACY_ENGINE) return null;
    const timed = value.v === MAKER_ENGINE;
    const layout = readLayout(value.l), proof = readProof(value.p, timed);
    return layout && proof && verifiesClear(layout, proof, timed) ? { layout, proof } : null;
  } catch { return null; }
}
export function sharedToken(hash: string) { return new URLSearchParams(hash.replace(/^#/, '')).get('stage'); }
export function stageUrl(base: string, layout: Layout, proof: RecordedShot[]): string | null {
  const token = encodeStage(layout, proof);
  if (!token) return null;
  const url = new URL(base); url.search = '?play=maker'; url.hash = `stage=${token}`;
  return url.toString();
}
export function readDraft(storage: Pick<Storage, 'getItem'> | null): Layout | null {
  try { return readLayout(JSON.parse(storage?.getItem(DRAFT_KEY) ?? 'null')); } catch { return null; }
}
export function saveDraft(storage: Pick<Storage, 'setItem'> | null, layout: Layout): boolean {
  try { if (!storage) return false; storage.setItem(DRAFT_KEY, JSON.stringify(cloneLayout(layout))); return true; } catch { return false; }
}
