import { useEffect } from 'react';
import { MODES, type ModeId } from './mode-nav-data';
import './mode-nav.css';

/**
 * One way between the new modes, shown on every play screen. Play starts at
 * once on each screen (requirement 7.1): this is navigation, never a gate.
 */
export type { ModeId } from './mode-nav-data';

/** `onSelect` lets a screen switch in place (e.g. stage ⇄ score keeps the stage). */
export function ModeNav({ current, onSelect }: { current: ModeId; onSelect?: Partial<Record<ModeId, () => void>> }) {
  // The browser tab names the mode (the instant-play entrance is just PURA).
  const label = MODES.find(m => m.id === current)?.label;
  useEffect(() => { document.title = current === 'open' || !label ? 'PURA' : `PURA — ${label}`; }, [current, label]);
  return <nav className="mode-nav" aria-label="遊び方を選ぶ">
    {MODES.map(mode => {
      const handler = onSelect?.[mode.id];
      return <a key={mode.id} href={mode.href} aria-current={mode.id === current ? 'page' : undefined}
        onClick={handler ? event => { event.preventDefault(); handler(); } : undefined}>{mode.label}</a>;
    })}
  </nav>;
}
