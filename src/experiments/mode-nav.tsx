import './mode-nav.css';

/**
 * One way between the new modes, shown on every play screen. Play starts at
 * once on each screen (requirement 7.1): this is navigation, never a gate.
 */
export type ModeId = 'open' | 'michi' | 'hitofude' | 'curling' | 'score' | 'free' | 'stages' | 'chapters';
/**
 * Since 2026-09-27 the original eight stages and 三つの道 live on inside 道;
 * their own screens stay reachable by URL (and from 道) but leave this bar.
 */
export const MODES: { id: ModeId; label: string; href: string }[] = [
  { id: 'open', label: 'はじめる', href: './' },
  { id: 'michi', label: '道', href: '?play=michi' },
  { id: 'hitofude', label: 'ひとふで', href: '?play=hitofude' },
  { id: 'curling', label: 'カーリング', href: '?play=curling' },
  { id: 'score', label: 'スコア', href: '?play=stages&mode=score' },
  { id: 'free', label: '自由', href: '?play=free' },
];

/** `onSelect` lets a screen switch in place (e.g. stage ⇄ score keeps the stage). */
export function ModeNav({ current, onSelect }: { current: ModeId; onSelect?: Partial<Record<ModeId, () => void>> }) {
  return <nav className="mode-nav" aria-label="遊び方を選ぶ">
    {MODES.map(mode => {
      const handler = onSelect?.[mode.id];
      return <a key={mode.id} href={mode.href} aria-current={mode.id === current ? 'page' : undefined}
        onClick={handler ? event => { event.preventDefault(); handler(); } : undefined}>{mode.label}</a>;
    })}
  </nav>;
}
