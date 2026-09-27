import type { ModeId } from './mode-nav-data';
import { GALLERY } from './mode-gallery-data';
import './mode-gallery.css';

/**
 * The ways to play as pictures, a name and a few words: the end of the
 * welcome, and the top of the phone menu (2026-09-27, RYO liked this screen).
 */
const HUE = { cyan: '#5fbfcb', rose: '#d77f9f', amber: '#dcae5b' };

function ModeIcon({ kind }: { kind: string }) {
  const c = 'currentColor';
  return <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">{
    kind === 'dots' ? <><circle cx="12" cy="24" r="5" fill={HUE.cyan}/><circle cx="22" cy="14" r="5" fill={HUE.rose}/><circle cx="29" cy="26" r="5" fill={HUE.amber}/></>
    : kind === 'path' ? <><circle cx="9" cy="30" r="3" fill={c}/><circle cx="18" cy="22" r="3" fill={c}/><circle cx="26" cy="16" r="3" fill={c}/><circle cx="32" cy="9" r="4" fill={HUE.cyan}/></>
    : kind === 'shot' ? <><circle cx="10" cy="30" r="5" fill={HUE.cyan}/><path d="M15 25 L31 9" stroke={c} strokeWidth="2" strokeDasharray="2 3"/></>
    : kind === 'house' ? <><circle cx="20" cy="20" r="14" fill="none" stroke={c} strokeWidth="1.5"/><circle cx="20" cy="20" r="8" fill="none" stroke={c} strokeWidth="1.5"/><circle cx="20" cy="20" r="3" fill={HUE.rose}/></>
    : kind === 'loop' ? <><path d="M31 14 A12 12 0 1 0 32 22" fill="none" stroke={c} strokeWidth="1.5"/><path d="M28 10 L32 14 L27.5 16.5" fill="none" stroke={c} strokeWidth="1.5"/><circle cx="11" cy="15" r="3" fill={HUE.cyan}/><circle cx="16" cy="30" r="3" fill={HUE.rose}/><circle cx="28" cy="28" r="3" fill={HUE.amber}/></>
    : kind === 'score' ? <><path d="M8 30 L16 18 L23 24 L32 10" fill="none" stroke={c} strokeWidth="2"/><circle cx="32" cy="10" r="3" fill={HUE.amber}/></>
    : <><path d="M8 13 H32 M8 27 H32" stroke={c} strokeWidth="1.5"/><circle cx="15" cy="13" r="3.5" fill={HUE.cyan}/><circle cx="26" cy="27" r="3.5" fill={HUE.rose}/></>
  }</svg>;
}

/** `current` marks the mode being played; choosing it calls `onCurrent` (back to the board) instead of reloading. */
export function ModeGallery({ current, onCurrent }: { current?: ModeId; onCurrent?: () => void }) {
  return <nav className="mode-gallery" aria-label="遊び方を選ぶ">{GALLERY.map(m =>
    <a key={m.id} href={m.href} aria-current={m.id === current ? 'page' : undefined}
      onClick={m.id === current && onCurrent ? e => { e.preventDefault(); onCurrent(); } : undefined}>
      <ModeIcon kind={m.icon}/><b>{m.name}</b><small>{m.line}</small></a>)}</nav>;
}
