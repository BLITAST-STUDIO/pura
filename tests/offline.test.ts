import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { cachePrefix, cacheVersion, precacheLists, serviceWorkerSource, shouldSwap, SWAP_WINDOW_MS } from '../src/offline-sw';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

test('what is kept: everything but the worker, build notes, preview image and maps; the music is optional', () => {
  const { core, optional } = precacheLists(['index.html', 'sw.js', 'build-info.json', 'og.jpg', 'assets/a.js', 'assets/a.js.map', 'audio/the-white-basin-v1.m4a', 'manifest.webmanifest']);
  assert.deepEqual(core, ['assets/a.js', 'index.html', 'manifest.webmanifest']);
  assert.deepEqual(optional, ['audio/the-white-basin-v1.m4a']);
});

test('the version follows the files, not their order, and ignores what is not kept', () => {
  const a = [{ name: 'index.html', hash: '1' }, { name: 'assets/x.js', hash: '2' }];
  const v = cacheVersion(a, hash);
  assert.equal(cacheVersion([...a].reverse(), hash), v, 'order does not matter');
  assert.equal(v.length, 12);
  assert.notEqual(cacheVersion([a[0], { name: 'assets/x.js', hash: '3' }], hash), v, 'a changed file is a new version');
  assert.notEqual(cacheVersion([...a, { name: 'assets/y.js', hash: '4' }], hash), v, 'a new file is a new version');
  assert.equal(cacheVersion([...a, { name: 'sw.js', hash: '9' }, { name: 'build-info.json', hash: '9' }], hash), v, 'the worker and the build notes are not part of it');
  assert.equal(cachePrefix(undefined), 'pura-stable-'); assert.equal(cachePrefix('next'), 'pura-next-');
});

/** Run the generated worker against a small fake of the browser, and return what it registered. */
function run(scope: string, version: string, network: Record<string, string | number>, existing: string[] = []) {
  const listeners: Record<string, (e: any) => void> = {};
  const stores = new Map<string, Map<string, string>>(existing.map(k => [k, new Map()]));
  const fetched: string[] = [];
  const response = (body: string, ok = true) => ({ ok, status: ok ? 200 : 404, body });
  const globals = {
    self: { registration: { scope }, addEventListener: (t: string, f: any) => { listeners[t] = f; }, skipWaiting: () => { skipped = true; } },
    caches: {
      open: async (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); const s = stores.get(name)!; return { put: async (k: string, r: any) => { s.set(k, r.body); }, match: async (k: string) => (s.has(k) ? response(s.get(k)!) : undefined) }; },
      keys: async () => [...stores.keys()], delete: async (k: string) => stores.delete(k),
    },
    fetch: async (r: any) => { const u = typeof r === 'string' ? r : r.url; fetched.push(u); const hit = network[u]; return hit === undefined ? response('', false) : response(String(hit)); },
    Request: class { url: string; constructor(u: string) { this.url = u; } },
    URL, location: { origin: new URL(scope).origin },
  };
  let skipped = false;
  const source = serviceWorkerSource({ prefix: 'pura-stable-', version, core: ['index.html', 'assets/a.js'], optional: ['audio/m.m4a'] });
  new Function(...Object.keys(globals), source)(...Object.values(globals));
  const event = (extra: object) => { let result: any; return { ...extra, waitUntil: (p: any) => { result = p; }, respondWith: (p: any) => { result = p; }, get result() { return result; } }; };
  const fetchEvent = (url: string, mode = 'cors', method = 'GET') => { const e: any = event({ request: { url, mode, method } }); listeners.fetch(e); return e.result as Promise<any> | undefined; };
  return { listeners, stores, fetched, fetchEvent, event, skipped: () => skipped };
}

const S = 'https://x.test/pura/';
const net = { [S + 'index.html']: 'INDEX', [S + 'assets/a.js']: 'JS', [S + 'audio/m.m4a']: 'MUSIC' };

test('worker install keeps the game (and the music if it can), and fails when a game file cannot be fetched', async () => {
  const w = run(S, 'v1', net);
  const install = w.event({}); w.listeners.install(install); await install.result;
  assert.deepEqual([...w.stores.get('pura-stable-v1')!.keys()].sort(), [S + 'assets/a.js', S + 'audio/m.m4a', S + 'index.html']);
  const noMusic = run(S, 'v1', { [S + 'index.html']: 'I', [S + 'assets/a.js']: 'J' });
  const ok = noMusic.event({}); noMusic.listeners.install(ok); await ok.result;
  assert.equal(noMusic.stores.get('pura-stable-v1')!.size, 2, 'the music is optional');
  const broken = run(S, 'v1', { [S + 'index.html']: 'I' });
  const bad = broken.event({}); broken.listeners.install(bad);
  await assert.rejects(bad.result, /precache/, 'a missing game file fails the install, so it retries later');
});

test('worker serves every page from the kept index, files from the kept copies, and leaves the rest alone', async () => {
  const w = run(S, 'v1', net);
  const install = w.event({}); w.listeners.install(install); await install.result;
  assert.equal((await w.fetchEvent(S + '?play=hitofude&board=6', 'navigate'))!.body, 'INDEX', 'every screen is the one index');
  assert.equal((await w.fetchEvent(S, 'navigate'))!.body, 'INDEX');
  assert.equal((await w.fetchEvent(S + 'assets/a.js'))!.body, 'JS');
  assert.equal(w.fetchEvent(S + 'next/index.html', 'navigate'), undefined, 'the trial is not the stable worker\'s business');
  assert.equal(w.fetchEvent(S + 'next/assets/b.js'), undefined);
  assert.equal(w.fetchEvent(S + 'build-info.json'), undefined, 'build notes come from the network');
  assert.equal(w.fetchEvent(S + 'sw.js'), undefined, 'so does the worker itself');
  assert.equal(w.fetchEvent('https://other.test/pura/assets/a.js'), undefined, 'other sites');
  assert.equal(w.fetchEvent('https://x.test/elsewhere/a.js'), undefined, 'outside its scope');
  assert.equal(w.fetchEvent(S + 'assets/a.js', 'cors', 'POST'), undefined, 'only GET');
  assert.equal((await w.fetchEvent(S + 'assets/not-kept.js'))!.ok, false, 'a file that was never kept falls through to the network (and fails offline)');
});

test('the trial worker keeps to /next/ and its own caches; a new version replaces only older ones of its own channel', async () => {
  const N = 'https://x.test/pura/next/';
  const w = run(N, 'n2', { [N + 'index.html']: 'NI', [N + 'assets/a.js']: 'NJ' }, ['pura-stable-v1', 'pura-next-old', 'other-app']);
  const install = w.event({}); w.listeners.install(install); await install.result;
  assert.equal((await w.fetchEvent(N + '?play=maker', 'navigate'))!.body, 'NI');
  assert.equal(w.fetchEvent(S + 'index.html', 'navigate'), undefined, 'and not the stable pages above it');
  const activate = w.event({}); w.listeners.activate(activate); await activate.result;
  // The fake worker above uses the stable prefix, so only the older stable cache goes; the trial's and others' stay.
  assert.deepEqual([...w.stores.keys()].sort(), ['other-app', 'pura-next-old', 'pura-stable-n2']);
});

test('the worker takes over only when the page asks, and the page asks only right after launch before any touch', () => {
  const w = run(S, 'v1', net);
  w.listeners.message({ data: 'something else' }); assert.equal(w.skipped(), false);
  w.listeners.message({ data: 'skip' }); assert.equal(w.skipped(), true);
  const base = { hasWaiting: true, hasController: true, sinceLaunchMs: 1000, touched: false };
  assert.equal(shouldSwap(base), true);
  assert.equal(shouldSwap({ ...base, touched: true }), false, 'never after a touch');
  assert.equal(shouldSwap({ ...base, sinceLaunchMs: SWAP_WINDOW_MS + 1 }), false, 'never well into a visit');
  assert.equal(shouldSwap({ ...base, hasWaiting: false }), false);
  assert.equal(shouldSwap({ ...base, hasController: false }), false, 'the very first visit has nothing to swap');
});
