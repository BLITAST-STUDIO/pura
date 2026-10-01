// Run with GPU=1 node --import tsx scripts/check-maker.mjs [preview base URL].
// Uses trusted mouse/touch input; does not send a message or invoke a share sheet.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { launch } from './cdp.mjs';
import { decodeStage, sharedToken, DRAFT_KEY } from '../src/experiments/maker/share.ts';
const base = process.argv[2] ?? 'http://127.0.0.1:4177/';
const out = process.argv[3] ?? 'artifacts/maker';
mkdirSync(out, { recursive: true });
const b = await launch({ width: 390, height: 844, mobile: true });
const checks = [];
const state = () => b.eval(`({drops:JSON.parse(document.querySelector('canvas').dataset.drops),rect:document.querySelector('canvas').getBoundingClientRect().toJSON(),draft:JSON.parse(localStorage.getItem('${DRAFT_KEY}')),mode:document.querySelector('.maker-play').dataset.mode})`);
async function click(label, tag = 'button') {
  const point = await b.eval(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.trim()===${JSON.stringify(label)});if(!e)throw Error('missing '+${JSON.stringify(label)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  await b.mouse('mousePressed', ...point); await b.mouse('mouseReleased', ...point); await b.sleep(100);
}
async function fill(label, text) {
  await b.eval(`(()=>{const e=document.querySelector('input[aria-label="${label}"]');e.focus();e.select()})()`);
  await b.send('Input.insertText', { text }); await b.sleep(100);
}
function project(rect, x, y, z = 0) {
  const camera = new THREE.PerspectiveCamera(34, rect.width / rect.height, .1, 100);
  let distance = Math.max(4.2 / (2 * Math.tan(34 * Math.PI / 360) * camera.aspect), 5.6 / (2 * Math.tan(34 * Math.PI / 360))) * 1.13 + 1.25;
  function place() { camera.position.set(0, -Math.sin(.47) * distance, Math.cos(.47) * distance); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); }
  place();
  const corners = [[0, 0], [420, 0], [0, 560], [420, 560]];
  for (let i = 0; i < 6; i++) {
    let mx = 0, my = 0;
    for (const [x, y] of corners) { const p = new THREE.Vector3((x - 210) * .01, (280 - y) * .01, 0).project(camera); mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); }
    distance *= Math.max(mx / .98, my / .8); place();
  }
  const p = new THREE.Vector3((x - 210) * .01, (280 - y) * .01, z).project(camera);
  return [rect.x + (p.x + 1) * rect.width / 2, rect.y + (1 - p.y) * rect.height / 2];
}
async function touchDrag(from, to) {
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 1 }] });
  for (let i = 1; i <= 10; i++) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + (to[0] - from[0]) * i / 10, y: from[1] + (to[1] - from[1]) * i / 10, id: 1 }] }); await b.sleep(20); }
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await b.sleep(150);
}
async function aimAndClear() {
  const s = await state(), d = s.drops[0], from = [s.rect.x + d.screenX, s.rect.y + d.screenY];
  await b.mouse('mousePressed', ...from);
  let x = from[0] - 30, y = from[1] + 55;
  async function measure(px, py) {
    await b.mouse('mouseMoved', px, py); await b.sleep(40);
    return b.eval(`(()=>{const a=JSON.parse(document.querySelector('canvas').dataset.aim);return [a.dx*a.power,a.dy*a.power]})()`);
  }
  const target = [.4, -.8 * Math.sqrt(3) / 2];
  for (let i = 0; i < 8; i++) {
    const a = await measure(x, y);
    if (Math.hypot(a[0] - target[0], a[1] - target[1]) < .002) break;
    const ax = await measure(x + 2, y), ay = await measure(x, y + 2);
    const j00 = (ax[0] - a[0]) / 2, j10 = (ax[1] - a[1]) / 2, j01 = (ay[0] - a[0]) / 2, j11 = (ay[1] - a[1]) / 2;
    const det = j00 * j11 - j01 * j10;
    assert.ok(Math.abs(det) > 1e-6, 'aim guide responds to pointer');
    const u = target[0] - a[0], v = target[1] - a[1];
    x += (u * j11 - v * j01) / det; y += (v * j00 - u * j10) / det;
  }
  await measure(x, y); await b.mouse('mouseReleased', x, y);
  await b.waitFor(`document.querySelector('.maker-result')?.textContent.includes('ひとふで')`, 16000);
  assert.equal((await state()).drops.length, 1);
}
try {
  await b.goto(base + '?play=maker&sound=off');
  await b.waitFor(`document.querySelector('canvas')?.dataset.drops`);
  assert.ok(await b.eval(`document.querySelector('.maker-actions button:last-child').disabled`));
  await b.screenshot(out + '/editor-phone.png');
  let s = await state(), d = s.drops[0];
  await touchDrag([s.rect.x + d.screenX, s.rect.y + d.screenY], [s.rect.x + d.screenX + 12, s.rect.y + d.screenY]);
  assert.notEqual((await state()).draft.drops[0].x, 130);
  assert.equal(await b.eval(`document.querySelector('.maker-play').scrollTop`), 0);
  await click('一手戻す'); assert.equal((await state()).draft.drops[0].x, 130);
  checks.push('touch drag, no scroll, undo restores the original');
  await click('石'); s = await state(); const stonePoint = project(s.rect, 100, 100);
  await b.mouse('mousePressed', ...stonePoint); await b.mouse('mouseReleased', ...stonePoint); await b.sleep(120);
  assert.equal((await state()).draft.stones.length, 1);
  await click('石を小に'); assert.equal((await state()).draft.stones[0].r, 24);
  await b.screenshot(out + '/stone-phone.png');
  await click('選んだものを消す'); assert.equal((await state()).draft.stones.length, 0);
  await click('雫'); s = await state(); const dropPoint = project(s.rect, 100, 180);
  await b.mouse('mousePressed', ...dropPoint); await b.mouse('mouseReleased', ...dropPoint); await b.sleep(120);
  assert.equal((await state()).draft.drops.length, 6);
  await fill('台の名前', '水の道 🌊');
  await b.goto(base + '?play=maker&sound=off'); await b.waitFor(`document.querySelector('canvas')?.dataset.drops`);
  s = await state(); assert.equal(s.drops.length, 6); assert.equal(s.draft.name, '水の道 🌊');
  d = s.drops[5]; await b.mouse('mousePressed', s.rect.x + d.screenX, s.rect.y + d.screenY); await b.mouse('mouseReleased', s.rect.x + d.screenX, s.rect.y + d.screenY);
  await click('選んだものを消す');
  checks.push('add drops/stones, resize/delete, draft and Unicode name survive reload');
  s = await state(); d = s.drops[4]; await b.mouse('mousePressed', s.rect.x + d.screenX, s.rect.y + d.screenY); await b.mouse('mouseReleased', s.rect.x + d.screenX, s.rect.y + d.screenY);
  await click('位置を数値で指定', 'summary'); await fill('Xの位置', '282'); await click('位置を数値で指定', 'summary');
  assert.equal((await state()).draft.drops[4].x, 282);
  await click('遊んで確かめる'); await b.sleep(500); await aimAndClear();
  await b.screenshot(out + '/cleared-phone.png');
  await click('共有リンク'); const url = await b.eval(`document.querySelector('textarea[aria-label="共有リンク"]').value`);
  const shared = decodeStage(sharedToken(new URL(url).hash)); assert.ok(shared); assert.equal(shared.proof.length, 1); assert.equal(shared.layout.drops[4].x, 282);
  await b.screenshot(out + '/share-phone.png'); await click('閉じる'); await click('編集に戻る');
  await b.waitFor(`JSON.parse(document.querySelector('canvas').dataset.drops).length===5`);
  assert.equal((await state()).drops[4].x, 282, 'testing never overwrites the layout');
  await click('雫を大に'); assert.ok(await b.eval(`document.querySelector('.maker-actions button:last-child').disabled`));
  checks.push('clear custom layout by real pointer, verified share, edit invalidates its certificate');
  const savedDraft = (await state()).draft;
  await b.goto(url); await b.waitFor(`document.querySelector('canvas')?.dataset.drops`);
  assert.equal((await state()).mode, 'challenge'); assert.deepEqual((await state()).draft, savedDraft);
  await aimAndClear(); await b.screenshot(out + '/friend-phone.png');
  checks.push('friend opens the exact layout, clears it and does not overwrite a draft');
  await b.goto(base + '?play=maker#stage=broken'); await b.waitFor(`!!document.querySelector('.maker-invalid')`);
  await click('自分の台をつくる'); await b.waitFor(`document.querySelector('canvas')?.dataset.drops`);
  checks.push('invalid links show a recovery screen');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false }); await b.sleep(600);
  await b.screenshot(out + '/editor-desktop.png');
  assert.ok(await b.eval(`document.querySelector('.maker-play').scrollWidth <= innerWidth`));
  await b.goto(base + '?play=hitofude&board=1&sound=off'); await b.waitFor(`document.querySelector('canvas')?.dataset.drops`);
  assert.equal((await b.eval(`JSON.parse(document.querySelector('canvas').dataset.drops)`)).length, 5);
  checks.push('desktop layout and original course render');
  const faults = b.logs.filter(l => /^(error|warning|warn|exception):/.test(l)); assert.deepEqual(faults, []);
  writeFileSync(out + '/browser-check.json', JSON.stringify({ base, checks, warningsAndErrors: faults, limits: 'Chrome GPU with touch emulation and mouse; physical phones and social-app link handling not tested' }, null, 2));
  console.log(JSON.stringify({ checks, warningsAndErrors: faults, sharedLinkLength: url.length }));
} finally { b.close(); }
