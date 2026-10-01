// Run with GPU=1 node scripts/check-maker-onboarding.mjs <preview base URL> [out dir]: a first visit through both onboarding phases.
import * as THREE from 'three';
import { launch } from './cdp.mjs';
const scratch = (process.argv[3] ?? 'artifacts/maker/onboarding') + '/'; (await import('node:fs')).mkdirSync(scratch, { recursive: true });
const base = process.argv[2];
const b = await launch({ width: 390, height: 844, mobile: true, scratch });
function project(rect, x, y, z = 0) {
  const camera = new THREE.PerspectiveCamera(34, rect.width / rect.height, .1, 100);
  let distance = Math.max(4.2 / (2 * Math.tan(34 * Math.PI / 360) * camera.aspect), 5.6 / (2 * Math.tan(34 * Math.PI / 360))) * 1.13 + 1.25;
  function place() { camera.position.set(0, -Math.sin(.47) * distance, Math.cos(.47) * distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }
  place();
  for (let i = 0; i < 6; i++) { let mx = 0, my = 0; for (const [x, y] of [[0, 0], [420, 0], [0, 560], [420, 560]]) { const p = new THREE.Vector3((x - 210) * .01, (280 - y) * .01, 0).project(camera); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); } distance *= Math.max(mx / .98, my / .8); place(); }
  const p = new THREE.Vector3((x - 210) * .01, (280 - y) * .01, z).project(camera);
  return [rect.x + (p.x + 1) * rect.width / 2, rect.y + (1 - p.y) * rect.height / 2];
}
const rect = () => b.eval(`document.querySelector('canvas').getBoundingClientRect().toJSON()`);
const line = () => b.eval(`document.querySelector('.maker-first-line')?.innerText.replace(/\\n/g, ' / ') ?? null`);
const dots = () => b.eval(`[...document.querySelectorAll('.maker-first-count i')].map(i => i.className === 'is-done' ? '●' : '○').join('')`);
const btn = label => b.eval(`(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!e) return false; e.click(); return true; })()`);
const tapBoard = async (x, y) => { const p = project(await rect(), x, y); await b.mouse('mouseMoved', ...p); await b.mouse('mousePressed', ...p); await b.sleep(80); await b.mouse('mouseReleased', ...p); await b.sleep(400); };
const drops = () => b.eval(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return JSON.parse(c.dataset.drops || '[]').map(d => ({ id: d.id, x: d.x, y: d.y, sx: r.left + d.screenX, sy: r.top + d.screenY })); })()`);
async function shoot(from, to, px) {
  const len = Math.hypot(to.sx - from.sx, to.sy - from.sy), ux = (to.sx - from.sx) / len, uy = (to.sy - from.sy) / len;
  await b.mouse('mouseMoved', from.sx, from.sy); await b.mouse('mousePressed', from.sx, from.sy);
  for (let i = 1; i <= 6; i++) { await b.mouse('mouseMoved', from.sx - ux * px * i / 6, from.sy - uy * px * i / 6); await b.sleep(16); }
  await b.mouse('mouseReleased', from.sx - ux * px, from.sy - uy * px);
}
const out = { steps: [] };
const note = async label => out.steps.push([label, await line(), await dots()]);
try {
  await b.goto(`${base}?play=maker&sound=off`);
  await b.waitFor(`!!document.querySelector('.maker-first canvas')`); await b.sleep(1200);
  out.chrome = await b.eval(`({ panel: !!document.querySelector('.maker-panel'), header: !!document.querySelector('.maker-header'), buttons: [...document.querySelectorAll('button')].map(e => e.textContent.trim()) })`);
  await note('intro'); await b.screenshot(`${scratch}ob-1-intro.png`);
  await b.sleep(2400); await note('drops?');
  await tapBoard(130, 470); await note('drop1');
  await tapBoard(175, 470); out.nudge = await b.eval(`document.querySelector('.maker-first-nudge')?.textContent ?? null`);
  await tapBoard(195, 365); await tapBoard(260, 260); await note('drops done');
  await b.screenshot(`${scratch}ob-2-stones.png`);
  await tapBoard(340, 470); await tapBoard(90, 160); await b.sleep(500); await note('stones done');
  await b.screenshot(`${scratch}ob-3-ready.png`);
  out.readyButtons = await b.eval(`[...document.querySelectorAll('.maker-first-actions button')].map(e => e.textContent)`);
  // Try, then go back and rearrange (move the first stone), then try again.
  await btn('ためす'); await b.sleep(1500); await note('test');
  await btn('配置しなおす'); await b.sleep(1200); await note('rearrange');
  const r0 = await rect(), s0 = project(r0, 340, 470), s1 = project(r0, 360, 420);
  await b.mouse('mouseMoved', ...s0); await b.mouse('mousePressed', ...s0); for (let i = 1; i <= 6; i++) { await b.mouse('mouseMoved', s0[0] + (s1[0] - s0[0]) * i / 6, s0[1] + (s1[1] - s0[1]) * i / 6); await b.sleep(20); } await b.mouse('mouseReleased', ...s1); await b.sleep(300);
  await btn('ためす'); await b.sleep(1800);
  await b.screenshot(`${scratch}ob-4-test.png`);
  for (let k = 0; k < 10; k++) {
    const d = await drops(); if (d.length <= 1) break;
    const [a, ...rest] = d.sort((p, q) => p.y - q.y).reverse();
    const target = rest.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
    await shoot(a, target, 75);
    for (let i = 0; i < 40; i++) { await b.sleep(250); if (await b.eval(`!!document.querySelector('.maker-first.is-cleared')`)) break; const m = await b.eval(`JSON.parse(document.querySelector('canvas')?.dataset.drops || '[]').length`); if (m <= 1) break; }
    if (await b.eval(`/もう一度/.test(document.querySelector('.maker-first-actions')?.innerText || '')`)) { await btn('もう一度'); await b.sleep(1500); }
  }
  await b.waitFor(`!!document.querySelector('.maker-first.is-cleared')`, 15000); await b.sleep(1500); await note('cleared');
  await b.screenshot(`${scratch}ob-5-cleared.png`);
  await b.waitFor(`!!document.querySelector('.maker-first.is-studio')`, 8000); await b.sleep(1500); await note('studio');
  await b.screenshot(`${scratch}ob-6-studio.png`);
  await btn('スタジオへ'); await b.sleep(1800);
  out.afterStudio = await b.eval(`(() => { const c = document.querySelector('.maker-stage canvas'); const r = c.getBoundingClientRect(); return { drops: JSON.parse(c.dataset.drops || '[]').length, stats: c.dataset.stats ? JSON.parse(c.dataset.stats).count : null, rect: [r.x, r.y, r.width, r.height].map(Math.round), w: c.width, h: c.height, scrollY: window.scrollY, docH: document.documentElement.scrollHeight }; })()`);
  await b.eval('window.scrollTo(0,0)'); await b.sleep(400); await b.screenshot(`${scratch}ob-6b-editor-top.png`);
  out.tour = [];
  for (let i = 0; i < 7; i++) {
    out.tour.push(await b.eval(`({ card: document.querySelector('.maker-tour-card p')?.textContent, focus: document.querySelector('[data-tour-focus]')?.getAttribute('data-tour') ?? null, below: document.querySelector('.maker-tour')?.classList.contains('is-below') })`));
    if (i === 4) { await b.sleep(700); await b.screenshot(`${scratch}ob-7-status.png`); }
    if (i === 1) { await b.sleep(700); await b.screenshot(`${scratch}ob-7b-tools.png`); }
    await b.eval(`document.querySelector('.maker-tour-next').click()`); await b.sleep(700);
  }
  out.status = await b.eval(`document.querySelector('.maker-status')?.dataset.state`);
  await b.sleep(900); await b.screenshot(`${scratch}ob-8-end.png`);
  out.end = await b.eval(`document.querySelector('.maker-tour-end')?.innerText.replace(/\\n/g, ' / ') ?? null`);
  await b.sleep(4800);
  out.after = await b.eval(`({ end: !!document.querySelector('.maker-tour-end'), welcomed: localStorage.getItem('pura-flow-maker-welcome-v1'), draft: JSON.parse(localStorage.getItem('pura-flow-maker-draft-v1')), share: !document.querySelector('[data-tour="share"]').disabled, status: document.querySelector('.maker-status')?.textContent })`);
  await b.screenshot(`${scratch}ob-9-editor.png`);
  // Reload: no onboarding.
  await b.goto(`${base}?play=maker&sound=off`); await b.sleep(2500);
  await b.screenshot(`${scratch}ob-10-reload.png`);
  out.reload = await b.eval(`({ first: !!document.querySelector('.maker-first'), editor: !!document.querySelector('.maker-panel'), status: document.querySelector('.maker-status')?.dataset.state })`);
  out.logs = b.logs.filter(l => !/vite|DevTools/.test(l));
} finally { b.close(); }
console.log(JSON.stringify(out, null, 1));
