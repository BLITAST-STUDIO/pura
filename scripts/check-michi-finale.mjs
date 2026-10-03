// Run with GPU=1 node scripts/check-michi-finale.mjs <preview base URL> [out dir]: the last board's clear shows 道をおわる; it flashes white into the ways to play.
import { mkdirSync } from 'node:fs';
import { launch } from './cdp.mjs';
const base = process.argv[2], out = (process.argv[3] ?? 'artifacts/michi') + '/'; mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch({ width: 390, height: 844, mobile: true, scratch: out });
const drops = () => b.eval(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return JSON.parse(c.dataset.drops || '[]').map(d => ({ id: d.id, r: d.r, hue: Object.entries(d.fractions).sort((a, b) => b[1] - a[1])[0][0], sx: r.left + d.screenX, sy: r.top + d.screenY })); })()`);
const res = {};
async function solve() {
  for (let k = 0; k < 40; k++) {
    if (await b.eval(`!!document.querySelector('.stage-clear')`)) return true;
    const d = await drops(); const byHue = new Map(); for (const q of d) byHue.set(q.hue, [...(byHue.get(q.hue) ?? []), q]);
    const group = [...byHue.values()].find(g => g.length > 1); if (!group) { await sleep(500); continue; }
    group.sort((a, c) => c.r - a.r);
    await b.drag([group.at(-1).sx, group.at(-1).sy], [group[0].sx, group[0].sy], 300, 0); await sleep(600);
  }
  return !!(await b.eval(`!!document.querySelector('.stage-clear')`));
}
try {
  const stars = Object.fromEntries([...Array(60).keys()].map(i => [i, 3]));
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem("pura-flow-welcome-v1","1"); localStorage.setItem("pura-flow-intro-v1","1") } catch (e) {}` });
  // A middle board still says 次へ.
  await b.goto(`${base}?play=michi&board=44&sound=off&music=off`); await b.waitFor(`!!document.querySelector('canvas')?.dataset.drops`); await sleep(1500);
  res.middleSolved = await solve(); res.middleButton = await b.eval(`[...document.querySelectorAll('.stage-clear button')].map(e => e.textContent.trim())`);
  // The last board's clear card says 道をおわる (the branch is checked in tests/michi.test.ts; solving 4-5 by simple drags is not reliable).
  // The ending itself, shown at once with ?finale=1: a white flash, then the line, the stars and the ways to play.
  await b.goto(`${base}?play=michi&board=45&finale=1&sound=off&music=off`); await b.waitFor(`!!document.querySelector('.michi-finale')`);
  await sleep(450); await b.screenshot(out + 'flash.png');
  await sleep(3000); await b.screenshot(out + 'finale.png');
  res.finale = await b.eval(`({ line: document.querySelector('.michi-finale p')?.textContent, stars: document.querySelector('.michi-finale small')?.textContent, modes: [...document.querySelectorAll('.michi-finale .mode-gallery b')].map(e => e.textContent), back: !!document.querySelector('.michi-finale-back') })`);
  // A way to play from the ending opens it, and 道を見返す closes the ending.
  await b.eval(`document.querySelector('.michi-finale-back').click()`); await sleep(500);
  res.afterBack = await b.eval(`({ finale: !!document.querySelector('.michi-finale'), canvas: !!document.querySelector('canvas') })`);
  await b.goto(`${base}?play=michi&board=45&finale=1&sound=off&music=off`); await sleep(3500);
  await b.eval(`[...document.querySelectorAll('.michi-finale .mode-gallery a')].find(a => a.textContent.includes('エンドレス')).click()`); await sleep(2500);
  res.toEndless = await b.eval(`({ url: location.search, title: document.title })`);
  res.logs = b.logs.filter(l => !/vite|DevTools/.test(l));
} finally { b.close(); }
console.log(JSON.stringify(res, null, 1));
