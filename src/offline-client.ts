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

/** Unregister every worker and delete every PURA cache. */
export async function removeOffline() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pura-')).map(k => caches.delete(k)));
  } catch { /* nothing to remove */ }
}
