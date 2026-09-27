import type { ModeId } from './mode-nav-data';

/** The six ways to play, as the gallery shows them (mode-gallery.tsx). */
export const GALLERY: { id: ModeId; href: string; name: string; line: string; icon: string }[] = [
  { id: 'open', href: './?play=open', name: 'はじめる', line: '三色で、自由に', icon: 'dots' },
  { id: 'michi', href: './?play=michi', name: '道', line: '面を、ひとつずつ', icon: 'path' },
  { id: 'hitofude', href: './?play=hitofude', name: 'ひとふで', line: '一打で、まとめる', icon: 'shot' },
  { id: 'curling', href: './?play=curling', name: 'カーリング', line: '中心を、ねらう', icon: 'house' },
  { id: 'score', href: './?play=stages&mode=score', name: 'スコア', line: '速さと、ていねいさ', icon: 'score' },
  { id: 'free', href: './?play=free', name: '自由', line: '数も、手ざわりも', icon: 'free' },
];
