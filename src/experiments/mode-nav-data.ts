export type ModeId = 'open' | 'michi' | 'hitofude' | 'curling' | 'score' | 'endless' | 'free' | 'stages' | 'chapters';
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
  { id: 'endless', label: 'エンドレス', href: '?play=endless' },
  { id: 'free', label: '自由', href: '?play=free' },
];
