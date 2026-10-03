import { shouldSwap } from './offline-sw';

/**
 * Registers the offline worker (the build writes ./sw.js next to index.html).
 * Only in a real build over https (or localhost), never in the itch ZIP
 * (VITE_NO_SW) or the dev server. The way out of any bad state: open the
 * game with `?nosw=1`; the worker and every saved copy are removed and it
 * stays off on that device until `?nosw=0`.
 */
export const OFF_KEY = 'pura-flow-offline-off';
const flag = {
  get() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } },
  set(on: boolean) { try { if (on) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* the flag is best effort */ } },
};

export function registerOffline() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const search = new URLSearchParams(location.search);
  if (search.get('nosw') === '1') { flag.set(true); void removeOffline().then(() => location.replace(location.pathname)); return; }
  if (search.get('nosw') === '0') { flag.set(false); location.replace(location.pathname); return; }
  if (flag.get()) { void removeOffline(); return; }
  if (!import.meta.env.PROD || import.meta.env.VITE_NO_SW === '1') return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  const launched = performance.now();
  let touched = false, swapping = false;
  const touch = () => { touched = true; };
  addEventListener('pointerdown', touch, { once: true, capture: true }); addEventListener('keydown', touch, { once: true, capture: true });
  const swap = (registration: ServiceWorkerRegistration) => {
    if (swapping || !shouldSwap({ hasWaiting: !!registration.waiting, hasController: !!navigator.serviceWorker.controller, sinceLaunchMs: performance.now() - launched, touched })) return;
    swapping = true; registration.waiting!.postMessage('skip');
  };
  // A new worker took over because we asked: load the new version once, before anything was touched.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (swapping) location.reload(); });
  const start = () => navigator.serviceWorker.register('./sw.js').then(registration => {
    swap(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') swap(registration); });
    });
  }).catch(() => { /* no offline play, the game itself is unaffected */ });
  // After the game is up, so the first visit's loading is never slowed by the copy.
  const later = () => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback(f: () => void, o?: { timeout: number }): void }).requestIdleCallback(start, { timeout: 4000 }) : setTimeout(start, 1500));
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
}

/**
 * A small status pill for checking offline play on a phone without developer tools
 * (open the game with `?offline=check`): whether this device has kept the game, and how much.
 */
export async function offlineStatus(): Promise<{ state: 'unsupported' | 'off' | 'saving' | 'ready'; files: number; names: string[] }> {
  try {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return { state: 'unsupported', files: 0, names: [] };
    if (flag.get()) return { state: 'off', files: 0, names: [] };
    const names = (await caches.keys()).filter(k => k.startsWith('pura-'));
    let files = 0; for (const k of names) files += (await (await caches.open(k)).keys()).length;
    const reg = await navigator.serviceWorker.getRegistration();
    // The game itself is about 50 files; the music is the last one kept.
    return { state: reg?.active && files >= 50 ? 'ready' : 'saving', files, names };
  } catch { return { state: 'unsupported', files: 0, names: [] }; }
}
export const OFFLINE_LABELS = { unsupported: 'この端末では、電波なしで遊べません', off: '保存は外してあります（?nosw=0 で戻る）', saving: '保存しています…', ready: '電波がなくても遊べます（保存済み）' } as const;

export function showOfflineCheck() {
  if (typeof document === 'undefined' || new URLSearchParams(location.search).get('offline') !== 'check') return;
  const pill = document.createElement('div');
  pill.setAttribute('role', 'status');
  pill.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translateX(-50%);z-index:10000;max-width:92vw;padding:9px 16px;border-radius:999px;background:rgba(30,40,44,.88);color:#f2f1ec;font:12px/1.5 -apple-system,sans-serif;letter-spacing:.06em;text-align:center;pointer-events:none';
  document.body.appendChild(pill);
  let stopped = false;
  const tick = async () => {
    const s = await offlineStatus();
    pill.textContent = `${OFFLINE_LABELS[s.state]}${s.state === 'saving' || s.state === 'ready' ? `（${s.files}ファイル）` : ''}`;
    pill.dataset.state = s.state;
    if (s.state === 'ready') { setTimeout(() => { stopped = true; pill.style.opacity = '.0'; pill.style.transition = 'opacity 1s'; }, 6000); }
    if (!stopped && s.state !== 'ready' && s.state !== 'unsupported' && s.state !== 'off') setTimeout(tick, 800);
  };
  void tick();
}

/** Unregister every worker and delete every PURA cache. */
export async function removeOffline() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pura-')).map(k => caches.delete(k)));
  } catch { /* nothing to remove */ }
}
