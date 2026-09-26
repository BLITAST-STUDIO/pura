import { useEffect, useState } from 'react';

/**
 * The first visit only: one quiet line rises over the board and leaves on
 * its own (the finished-image caption, DESIGN_DIRECTION.md). It never blocks
 * play (requirement 7.1): no tap is needed and touches pass through.
 * ?intro=1 shows it again for review.
 */
const KEY = 'pura-flow-intro-v1';
export const INTRO_TEXT = 'ひとつに、澄んでいく。';

export function shouldShowIntro(storage: Pick<Storage, 'getItem'> | null, search: string) {
  if (new URLSearchParams(search).get('intro') === '1') return true;
  try { return !storage || storage.getItem(KEY) === null; } catch { return false; }
}

export function IntroLine({ ready }: { ready: boolean }) {
  const [show] = useState(() => { try { return shouldShowIntro(localStorage, location.search); } catch { return false; } });
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!show || !ready) return;
    try { localStorage.setItem(KEY, '1'); } catch { /* shown again next time */ }
    const timer = window.setTimeout(() => setGone(true), 6500);
    return () => clearTimeout(timer);
  }, [show, ready]);
  return show && ready && !gone ? <p className="intro-line" aria-live="polite">{INTRO_TEXT}</p> : null;
}
