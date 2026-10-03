import type { ReactNode } from 'react';
import { ModeGallery } from './mode-gallery';
import type { ModeId } from './mode-nav-data';
import './white-finale.css';

/**
 * The end of a way to play (2026-10-04, RYO: the white screen change is wonderful,
 * use it wherever it fits). White rises past full brightness, settles, and a line
 * of words floats up with the ways to play. `back` returns to the board.
 */
export function WhiteFinale({ label, line, sub, current, backLabel, onBack }: {
  label: string; line: string; sub?: ReactNode; current: ModeId; backLabel: string; onBack: () => void;
}) {
  return <div className="white-finale" role="dialog" aria-label={label}>
    <div className="white-finale-body"><p>{line}</p>{sub && <small>{sub}</small>}
      <ModeGallery current={current} onCurrent={onBack}/>
      <button className="white-finale-back" onClick={onBack}>{backLabel}</button></div>
  </div>;
}
