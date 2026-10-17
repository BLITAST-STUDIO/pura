// Run with node scripts/check-save-transfer.mjs <preview base URL> [out dir]: ?play=save reads a records file into the device, and refuses a wrong one.
import { mkdirSync } from 'node:fs';
import { launch } from './cdp.mjs';
const base = process.argv[2], out = (process.argv[3] ?? 'artifacts/save') + '/'; mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await launch({ width: 390, height: 844, mobile: true, scratch: out });
const res = {};
try {
  await b.goto(`${base}?play=save`); await b.waitFor(`!!document.querySelector('.save-transfer')`);
  const give = text => b.eval(`(() => { const i = document.querySelector('input[type=file]'); const d = new DataTransfer(); d.items.add(new File([${JSON.stringify(text)}], 'x.json', { type: 'application/json' })); i.files = d.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await give('not a records file'); await sleep(400);
  res.refused = await b.eval(`document.querySelector('.save-transfer-message')?.textContent`);
  await give(JSON.stringify({ app: 'pura-flow', version: 1, savedAt: 'x', entries: { 'pura-flow-michi-v1': '{"best":{"1-1":{"stars":3}}}', evil: '1' } })); await sleep(400);
  res.confirm = await b.eval(`document.querySelector('.save-transfer-confirm p')?.textContent`);
  await b.screenshot(out + 'confirm.png');
  await b.eval(`[...document.querySelectorAll('button')].find(e => e.textContent === '書き込む').click()`); await sleep(300);
  res.stored = await b.eval(`({ michi: localStorage.getItem('pura-flow-michi-v1'), evil: localStorage.getItem('evil') })`);
  res.done = await b.eval(`document.querySelector('.save-transfer-done')?.textContent`);
  await b.screenshot(out + 'done.png');
  res.ok = res.refused?.includes('読めません') && res.confirm?.startsWith('1件') && res.stored.michi?.includes('stars') && res.stored.evil === null && !!res.done;
} finally { console.log(JSON.stringify(res, null, 1)); await b.close?.(); process.exit(res.ok ? 0 : 1); }
