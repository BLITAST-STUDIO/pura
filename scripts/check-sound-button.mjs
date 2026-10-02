// Run with GPU=1 node scripts/check-sound-button.mjs <preview base URL> [out dir]: the speaker icon shows the volume bars on hover (mouse), long press (touch) and Escape/outside tap closes; a tap still switches sound.
import { launch } from './cdp.mjs';
const scratch = (process.argv[3] ?? 'artifacts/sound') + '/'; (await import('node:fs')).mkdirSync(scratch, { recursive: true });
const base = process.argv[2];
const out = {};
const state = b => b.eval(`({ open: !!document.querySelector('.sound-popover'), sliders: [...document.querySelectorAll('.sound-popover input')].map(i => i.value), label: document.querySelector('.sound-button > button')?.getAttribute('aria-label'), sound: JSON.parse(localStorage.getItem('pura-flow-sensory-v1') || '{}') })`);
const centre = (b, sel) => b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
// 1. Desktop, mouse: rest on the icon, move up to the bar, drag it, leave, tap to switch off.
{
  const b = await launch({ width: 1280, height: 900, scratch });
  try {
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.setItem("pura-flow-welcome-v1","1"); localStorage.setItem("pura-flow-first-pull-hitofude","1") } catch (e) {}' });
    await b.goto(`${base}?play=hitofude&board=1&music=off`); await b.waitFor(`!!document.querySelector('canvas')?.dataset.drops`); await b.sleep(800);
    const [x, y] = await centre(b, '.sound-button > button'); await b.sleep(300);
    out.mouseBefore = (await state(b)).open;
    await b.mouse('mouseMoved', x, y); await b.sleep(400);
    out.mouseHover = await state(b);
    await b.screenshot(`${scratch}sound-hover.png`);
    // Up to the effects slider and drag it down to ~30.
    const r = await b.eval(`(() => { const i = document.querySelector('.sound-popover input'); const r = i.getBoundingClientRect(); return [r.x, r.y + r.height / 2, r.width]; })()`);
    for (let i = 1; i <= 6; i++) { await b.mouse('mouseMoved', x + (r[0] + r[2] * .5 - x) * i / 6, y + (r[1] - y) * i / 6); await b.sleep(40); }
    out.stayedOpenWhileMoving = (await state(b)).open;
    await b.mouse('mouseMoved', r[0] + r[2] * .5, r[1]); await b.mouse('mousePressed', r[0] + r[2] * .5, r[1]);
    await b.mouse('mouseMoved', r[0] + r[2] * .3, r[1]); await b.mouse('mouseReleased', r[0] + r[2] * .3, r[1]); await b.sleep(300);
    out.afterDrag = await state(b);
    await b.mouse('mouseMoved', 100, 100); await b.sleep(900);
    out.afterLeave = (await state(b)).open;
    // Tap the icon: sound off; the bar is not forced open by a tap.
    await b.mouse('mouseMoved', x, y); await b.sleep(300); await b.mouse('mousePressed', x, y); await b.mouse('mouseReleased', x, y); await b.sleep(300);
    out.afterTap = await state(b);
    await b.screenshot(`${scratch}sound-off.png`);
    await b.mouse('mousePressed', 100, 100); await b.mouse('mouseReleased', 100, 100); await b.sleep(300);
    out.afterOutside = (await state(b)).open;
    out.logsDesktop = b.logs.filter(l => !/vite|DevTools/.test(l));
  } finally { b.close(); }
}
// 2. Phone, touch: a short tap switches; a long press opens the bars and does not switch.
{
  const b = await launch({ width: 390, height: 844, mobile: true, scratch });
  try {
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.setItem("pura-flow-welcome-v1","1"); localStorage.setItem("pura-flow-maker-welcome-v1","1") } catch (e) {}' });
    await b.goto(`${base}?play=maker&music=off`); await b.waitFor(`!!document.querySelector('canvas')?.dataset.drops`); await b.sleep(900);
    const [x, y] = await centre(b, '.maker-sound');
    const touch = async (type, pts) => b.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    out.phoneBefore = await state(b);
    await touch('touchStart', [{ x, y, id: 1 }]); await b.sleep(80); await touch('touchEnd', []); await b.sleep(400);
    out.phoneTap = await state(b);
    await touch('touchStart', [{ x, y, id: 1 }]); await b.sleep(900);
    out.phoneHeldDuring = (await state(b)).open;
    await touch('touchEnd', []); await b.sleep(500);
    out.phoneLong = await state(b);
    await b.screenshot(`${scratch}sound-phone.png`);
    // Drag a slider with a finger, then tap elsewhere to close.
    const s = await b.eval(`(() => { const i = document.querySelectorAll('.sound-popover input')[1]; const r = i.getBoundingClientRect(); return [r.x, r.y + r.height / 2, r.width]; })()`);
    await touch('touchStart', [{ x: s[0] + s[2] * .6, y: s[1], id: 1 }]); await touch('touchMove', [{ x: s[0] + s[2] * .85, y: s[1], id: 1 }]); await touch('touchEnd', []); await b.sleep(300);
    out.phoneAfterSlide = await state(b);
    await touch('touchStart', [{ x: 200, y: 400, id: 1 }]); await touch('touchEnd', []); await b.sleep(400);
    out.phoneClosed = !(await state(b)).open;
    out.logsPhone = b.logs.filter(l => !/vite|DevTools/.test(l));
  } finally { b.close(); }
}
console.log(JSON.stringify(out, null, 1));
