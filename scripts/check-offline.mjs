// Run with GPU=1 node scripts/check-offline.mjs [out dir]: offline play for real (the server is stopped), an update swap, and the touch rule.
// Builds into dist/ (and rebuilds with a one-line change for the update), then restores the tree.
import { spawn, execSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';
const PORT = 8090, base = `http://127.0.0.1:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => process.stderr.write('[offline] ' + a.join(' ') + '\n');
setTimeout(() => { log('TIMEOUT'); process.exit(2); }, 420000).unref();
const marker = 'src/experiments/sound-settings.css', original = readFileSync(marker, 'utf8');
let server = null;
async function up() { server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' }); for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) return; } catch {} await sleep(200); } throw new Error('server'); }
// Stop whatever listens on the port (the server's command line differs between runs, so go by the port).
function down() { try { execSync(`for p in $(lsof -ti tcp:${PORT} -sTCP:LISTEN); do kill $p; done`, { shell: '/bin/zsh', stdio: 'ignore' }); } catch {} server = null; }
const build = () => execSync('npx vite build', { stdio: 'ignore' });
const out = { offline: {}, update: {} };
const b = await launch({ width: 390, height: 844, mobile: true });
const cacheNames = () => b.eval(`caches.keys()`);
const ready = async () => { for (let i = 0; i < 80; i++) { const n = await b.eval(`(async () => { const ks = (await caches.keys()).filter(k => k.startsWith('pura-')); let c = 0; for (const k of ks) c += (await (await caches.open(k)).keys()).length; return c; })()`); if (n >= 50) return n; await sleep(250); } return 0; };
try {
  build(); await up();
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.setItem("pura-flow-welcome-v1","1"); localStorage.setItem("pura-flow-intro-v1","1"); localStorage.setItem("pura-flow-maker-welcome-v1","1"); localStorage.setItem("pura-flow-first-pull-hitofude","1") } catch (e) {}' });
  await b.goto(`${base}?play=hitofude&board=6&music=off`); await b.waitFor(`!!document.querySelector('canvas')?.dataset.drops`);
  out.offline.kept = await ready(); out.offline.cacheNames = await cacheNames();
  await b.goto(`${base}?play=hitofude&board=6&music=off`); await sleep(1500);
  out.offline.controlled = await b.eval(`!!navigator.serviceWorker.controller`);
  // No connection at all: the server is gone.
  down(); await sleep(500);
  out.offline.serverReachable = await fetch(base).then(() => true).catch(() => false);
  out.offline.screens = {};
  for (const q of ['', '?play=hitofude&board=6', '?play=michi', '?play=curling', '?play=endless', '?play=free', '?play=stages&mode=score', '?play=classic', '?play=maker', '?play=welcome']) {
    await b.goto(`${base}${q}${q ? '&' : '?'}music=off`); await sleep(2300);
    out.offline.screens[q || '(root)'] = await b.eval(`({ canvas: !!document.querySelector('canvas'), drops: (() => { try { return JSON.parse(document.querySelector('canvas').dataset.drops || '[]').length; } catch { return null; } })(), failed: document.body.innerText.includes('準備ができませんでした') })`);
  }
  out.offline.music = await b.eval(`fetch('audio/the-white-basin-v1.m4a').then(async r => ({ ok: r.ok, bytes: (await r.arrayBuffer()).byteLength })).catch(e => String(e))`);
  out.offline.build = await b.eval(`fetch('build-info.json').then(r => r.status).catch(() => 'network error (expected offline)')`);
  out.offline.logs = b.logs.filter(l => !/vite|DevTools|ERR_CONNECTION|Failed to load resource|net::/.test(l));
  log('// Updates are checked with');
  // Updates are checked with the page already open (a visit in progress), against a second build served from another folder.
  appendFileSync(marker, '\n.zz-update-marker { outline: 1px solid red; }\n'); build(); execSync('rm -rf dist-v2 && cp -R dist dist-v2'); writeFileSync(marker, original); build();
  const serve = async dir => { down(); await sleep(600); server = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' }); for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) return; } catch {} await sleep(200); } throw new Error('server'); };
  const hasMarker = () => b.eval(`fetch([...document.querySelectorAll('link[rel=stylesheet]')][0].href).then(r => r.text()).then(t => t.includes('zz-update-marker'))`);
  const caches_ = async () => (await cacheNames()).filter(k => k.startsWith('pura-'));
  const checkUpdate = () => b.eval(`navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => 'checked')`);
  async function freshPageOnVersion1() { await serve('dist'); await b.goto(`${base}?play=endless&music=off`); await ready(); await b.goto(`${base}?play=endless&music=off`); await sleep(800); }
  log('// U1:');
  // U1: no touch yet and the visit is young: the page swaps to the new version by itself and reloads once.
  await freshPageOnVersion1();
  out.update.before = { marker: await hasMarker(), caches: (await caches_()).length };
  await serve('dist-v2'); await checkUpdate();
  for (let i = 0; i < 40; i++) { await sleep(500); if (await hasMarker().catch(() => false)) break; }
  await sleep(1500);
  out.update.afterSwap = { marker: await hasMarker(), caches: (await caches_()).length, canvas: await b.eval(`!!document.querySelector('canvas')`) };
  log('// U2:');
  // U2: a touch has happened: the new version is fetched, but the visit keeps the one it started with.
  await serve('dist'); await b.goto('about:blank'); await sleep(800);
  await b.eval(`1`).catch(() => {}); await b.send('Network.clearBrowserCache').catch(() => {});
  await b.goto(`${base}?nosw=1`); await sleep(2500); await b.goto(`${base}?nosw=0`); await sleep(1500);
  await freshPageOnVersion1();
  await b.mouse('mouseMoved', 200, 300); await b.mouse('mousePressed', 200, 300); await b.mouse('mouseReleased', 200, 300);
  await serve('dist-v2'); await checkUpdate(); await sleep(8000);
  out.update.touched = { marker: await hasMarker(), caches: (await caches_()).length };
  log('// Leaving and coming back');
  // Leaving and coming back: now it is the new version.
  await b.goto('about:blank'); await sleep(1500); await b.goto(`${base}?play=endless&music=off`); await sleep(3000);
  out.update.afterLeaving = { marker: await hasMarker(), caches: (await caches_()).length };
  log('// The way out.');
  // The way out.
  await b.goto(`${base}?nosw=1`); await sleep(2500);
  out.update.nosw = { registrations: await b.eval(`navigator.serviceWorker.getRegistrations().then(r => r.length)`), caches: (await cacheNames()).filter(k => k.startsWith('pura-')).length, url: await b.eval('location.href') };
  await b.goto(`${base}?play=endless&music=off`); await sleep(7000);
  out.update.nosw.stillOffAfterReload = { registrations: await b.eval(`navigator.serviceWorker.getRegistrations().then(r => r.length)`), caches: (await cacheNames()).filter(k => k.startsWith('pura-')).length };
  await b.goto(`${base}?nosw=0`); await sleep(1500); await b.goto(`${base}?play=endless&music=off`); await sleep(7000);
  out.update.nosw.backOn = { registrations: await b.eval(`navigator.serviceWorker.getRegistrations().then(r => r.length)`), caches: (await cacheNames()).filter(k => k.startsWith('pura-')).length };
} finally {
  writeFileSync(marker, original); down(); b.close();
  try { execSync('rm -rf dist-v2 && npx vite build', { stdio: 'ignore' }); } catch {}
}
console.log(JSON.stringify(out, null, 1));
