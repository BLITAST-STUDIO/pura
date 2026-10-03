// Run with GPU=1 node scripts/check-offline-pill.mjs: the ?offline=check pill goes from saving to ready, and still says ready with the server stopped.
import { spawn, execSync } from 'node:child_process';
import { launch } from './cdp.mjs';
const PORT = 8093, base = `http://127.0.0.1:${PORT}/`, sleep = ms => new Promise(r => setTimeout(r, ms));
execSync('npx vite build', { stdio: 'ignore' });
spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(200); }
const b = await launch({ width: 390, height: 844, mobile: true });
const out = { seen: [] };
const pill = () => b.eval(`(() => { const p = document.querySelector('[role=status][data-state]'); return p ? p.dataset.state + ': ' + p.textContent : null; })()`);
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.setItem("pura-flow-welcome-v1","1"); localStorage.setItem("pura-flow-intro-v1","1") } catch (e) {}' });
  await b.goto(`${base}?play=endless&offline=check&music=off`);
  for (let i = 0; i < 60; i++) { const p = await pill(); if (p && out.seen[out.seen.length - 1] !== p) out.seen.push(p); if (p?.startsWith('ready')) break; await sleep(250); }
  out.final = await pill();
  await b.screenshot(new URL('..', import.meta.url).pathname + 'artifacts/offline-pill.png').catch(() => {});
  try { execSync(`for p in $(lsof -ti tcp:${PORT} -sTCP:LISTEN); do kill $p; done`, { shell: '/bin/zsh', stdio: 'ignore' }); } catch {}
  await sleep(600);
  await b.goto(`${base}?play=endless&offline=check&music=off`); await sleep(3000);
  out.offline = await pill();
  out.offlinePlays = await b.eval(`!!document.querySelector('canvas')`);
  await b.goto(`${base}?play=endless&music=off`); await sleep(2000);
  out.noPillWithoutParam = (await pill()) === null;
} finally {
  b.close(); try { execSync(`for p in $(lsof -ti tcp:${PORT} -sTCP:LISTEN); do kill $p; done`, { shell: '/bin/zsh', stdio: 'ignore' }); } catch {}
}
console.log(JSON.stringify(out, null, 1));
