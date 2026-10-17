/**
 * Moving the records between devices or addresses (2026-10-17, LAUNCH_PLAN:
 * the records live only in this browser). Everything the game keeps under
 * `pura-flow-` is written to one small file and read back from it.
 * Pure functions over a Storage-like object, so Node tests can use them.
 */
export const TRANSFER_APP = 'pura-flow';
export const TRANSFER_VERSION = 1;
/** Kept on one device only: the offline switch (it describes this device's worker, not the player). */
const DEVICE_ONLY = ['pura-flow-offline-off'];
const PREFIX = 'pura-flow-';
const MAX_BYTES = 2_000_000;

export type TransferFile = { app: string; version: number; savedAt: string; entries: Record<string, string> };
type Reader = Pick<Storage, 'length' | 'key' | 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

export const transferable = (key: string) => key.startsWith(PREFIX) && !DEVICE_ONLY.includes(key);

export function collectRecords(storage: Reader, now = new Date()): TransferFile {
  const entries: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && transferable(key)) { const value = storage.getItem(key); if (value !== null) entries[key] = value; }
  }
  return { app: TRANSFER_APP, version: TRANSFER_VERSION, savedAt: now.toISOString(), entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1))) };
}

export type ParseResult = { ok: true; file: TransferFile; count: number } | { ok: false; reason: 'toolarge' | 'notjson' | 'notpura' | 'newer' | 'empty' };

/** Reads a file's text; anything that is not a PURA records file is refused whole, never half-applied. */
export function parseTransfer(text: string): ParseResult {
  if (text.length > MAX_BYTES) return { ok: false, reason: 'toolarge' };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'notjson' }; }
  const f = data as Partial<TransferFile> | null;
  if (!f || typeof f !== 'object' || f.app !== TRANSFER_APP || typeof f.entries !== 'object' || !f.entries) return { ok: false, reason: 'notpura' };
  if (typeof f.version !== 'number' || f.version > TRANSFER_VERSION) return { ok: false, reason: 'newer' };
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(f.entries)) if (transferable(key) && typeof value === 'string') entries[key] = value;
  const count = Object.keys(entries).length;
  if (!count) return { ok: false, reason: 'empty' };
  return { ok: true, file: { app: TRANSFER_APP, version: f.version, savedAt: String(f.savedAt ?? ''), entries }, count };
}

/** Writes every record in the file (what the file holds replaces what is here; other keys are untouched). Returns how many were written. */
export function applyTransfer(storage: Writer, file: TransferFile): number {
  let written = 0;
  for (const [key, value] of Object.entries(file.entries)) { storage.setItem(key, value); written++; }
  return written;
}

export const REASONS = {
  toolarge: 'ファイルが大きすぎます。PURAの記録ファイルではないようです。',
  notjson: 'ファイルを読めませんでした。PURAの記録ファイルを選んでください。',
  notpura: 'PURAの記録ファイルではありません。',
  newer: 'もっと新しいPURAで作られたファイルです。この版では読めません。',
  empty: 'ファイルに記録が入っていません。',
} as const;

export const transferFileName = (now = new Date()) => `pura-records-${now.toISOString().slice(0, 10)}.json`;
