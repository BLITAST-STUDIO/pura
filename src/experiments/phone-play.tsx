import { useEffect, useRef, useState } from 'react';
import { Menu, RotateCcw, X } from 'lucide-react';
import { PHONE_QUERY, phoneLayout } from './phone-layout';
import './phone-play.css';

/**
 * Phone play (2026-09-27, RYO: on a small phone, show only the play area and
 * call up the menu when needed). On small screens the board fills the
 * screen; everything else on the page becomes the menu, opened from a
 * button on the board. Opening it pauses play; choosing a board in it
 * closes it and plays on. Larger screens keep the page as it was.
 * ?layout=phone or ?layout=page forces either, for checking.
 */
export type PhonePlay = { phone: boolean; menu: boolean; open(): void; close(): void; played(): void; className: string };

export function usePhonePlay(paused: boolean, setPaused: (paused: boolean) => void): PhonePlay {
  const query = typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null;
  const [phone, setPhone] = useState(() => phoneLayout(location.search, !!query?.matches));
  const [menu, setMenu] = useState(false);
  const pausedBefore = useRef(false);
  useEffect(() => {
    if (!query) return;
    const change = () => setPhone(phoneLayout(location.search, query.matches));
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const open = () => { pausedBefore.current = paused; setPaused(true); setMenu(true); };
  const close = () => { setMenu(false); setPaused(pausedBefore.current); };
  // A board chosen in the menu: back to the board, playing.
  const played = () => { if (menu) { setMenu(false); setPaused(false); } };
  useEffect(() => { if (!phone && menu) setMenu(false); }, [phone]);
  return { phone, menu, open, close, played, className: phone ? (menu ? ' is-phone menu-open' : ' is-phone') : '' };
}

/** The two buttons on the board in phone play: the menu, and (where it makes sense) a retry. */
export function PhoneBar({ play, onRetry }: { play: PhonePlay; onRetry?: () => void }) {
  if (!play.phone) return null;
  return <div className="phone-bar">
    <button aria-label="メニュー" onClick={play.open}><Menu size={18}/></button>
    {onRetry && <button aria-label="やり直す" onClick={onRetry}><RotateCcw size={17}/></button>}
  </div>;
}

/** The way back from the menu to the board. */
export function PhoneMenuClose({ play }: { play: PhonePlay }) {
  if (!play.phone || !play.menu) return null;
  return <button className="phone-menu-close" onClick={play.close}><X size={16}/><span>盤面に戻る</span></button>;
}
