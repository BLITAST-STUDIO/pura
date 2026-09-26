// Minimal Chrome DevTools Protocol driver for browser checks: headless Chrome,
// trusted pointer input, evaluate, screenshots. No dependencies.
//   GPU=1       use the Mac's GPU (ANGLE Metal) instead of SwiftShader
//   UNCAPPED=1  disable vsync to measure real frame cost
// Usage: import { launch } from './cdp.mjs'; const b = await launch({ width, height, mobile, scratch });
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch({ width = 1024, height = 768, mobile = false, scratch = tmpdir() } = {}) {
  const profile = mkdtempSync(join(scratch, 'chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    ...(process.env.GPU ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']),
    ...(process.env.UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const logs = []; const listeners = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
    else if (msg.method && listeners.has(msg.method)) listeners.get(msg.method)(msg.params);
    if (msg.method === 'Runtime.consoleAPICalled') logs.push(`${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description).join(' ')}`);
    else if (msg.method === 'Runtime.exceptionThrown') logs.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const api = {
    send, logs, sleep, on(method, fn) { listeners.set(method, fn); },
    async goto(url) { await send('Page.navigate', { url }); await sleep(1500); },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expression, timeout = 20000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (await api.eval(expression)) return true; await sleep(100); }
      throw new Error('timeout: ' + expression);
    },
    async mouse(type, x, y) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' }); },
    async drag(from, to, ms = 300, holdMs = 0) {
      await api.mouse('mouseMoved', from[0], from[1]); await api.mouse('mousePressed', from[0], from[1]);
      const steps = Math.max(2, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) { await api.mouse('mouseMoved', from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await sleep(ms / steps); }
      if (holdMs) await sleep(holdMs);
      await api.mouse('mouseReleased', to[0], to[1]);
    },
    async screenshot(path) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(data, 'base64')); },
    close() { try { ws.close(); } catch {} proc.kill('SIGTERM'); },
  };
  return api;
}
