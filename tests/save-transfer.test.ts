import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransfer, collectRecords, parseTransfer, transferable, transferFileName } from '../src/experiments/save-transfer/transfer';

const store = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};

test('only PURA records travel; the offline switch and other sites\' keys stay', () => {
  assert.equal(transferable('pura-flow-michi-v1'), true);
  assert.equal(transferable('pura-flow-offline-off'), false);
  assert.equal(transferable('something-else'), false);
  const file = collectRecords(store({ 'pura-flow-michi-v1': '{"a":1}', 'pura-flow-offline-off': '1', other: 'x' }), new Date('2026-10-17T00:00:00Z'));
  assert.deepEqual(Object.keys(file.entries), ['pura-flow-michi-v1']);
  assert.equal(transferFileName(new Date('2026-10-17T05:00:00Z')), 'pura-records-2026-10-17.json');
});

test('a saved file reads back into another device, round trip', () => {
  const from = store({ 'pura-flow-hitofude-v2': '{"best":3}', 'pura-flow-michi-v1': '[1,2]' });
  const parsed = parseTransfer(JSON.stringify(collectRecords(from)));
  assert.ok(parsed.ok);
  const to = store({ 'pura-flow-michi-v1': 'old', 'pura-flow-offline-off': '1', keep: 'me' });
  assert.equal(applyTransfer(to, parsed.file), 2);
  assert.equal(to.m.get('pura-flow-michi-v1'), '[1,2]');
  assert.equal(to.m.get('pura-flow-hitofude-v2'), '{"best":3}');
  assert.equal(to.m.get('keep'), 'me');
  assert.equal(to.m.get('pura-flow-offline-off'), '1');
});

test('files that are not ours are refused whole', () => {
  const r = (t: string) => { const p = parseTransfer(t); return p.ok ? 'ok' : p.reason; };
  assert.equal(r('not json'), 'notjson');
  assert.equal(r('null'), 'notpura');
  assert.equal(r('{"app":"other","version":1,"entries":{}}'), 'notpura');
  assert.equal(r('{"app":"pura-flow","version":9,"entries":{"pura-flow-a":"1"}}'), 'newer');
  assert.equal(r('{"app":"pura-flow","version":1,"entries":{"evil":"1","pura-flow-offline-off":"1","pura-flow-a":5}}'), 'empty');
  assert.equal(r('x'.repeat(2_000_001)), 'toolarge');
  assert.equal(r('{"app":"pura-flow","version":1,"entries":{"evil":"1","pura-flow-a":"1"}}'), 'ok');
});
