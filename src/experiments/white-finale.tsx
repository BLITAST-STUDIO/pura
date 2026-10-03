import type { ReactNode } from 'react';
import { ModeGallery } from './mode-gallery';
import type { ModeId } from './mode-nav-data';
import './white-finale.css';

/**
 * The end of a way to play (2026-10-04, RYO: the white screen change is wonderful,
 * use it wherever it fits). White rises past full brightness, settles, and a line
 * of words floats up with the ways to play. `back` returns to the board.
 * `level` is how much happens: 1 the white alone (the path's ending RYO praised),
 * 2 a burst of light from the middle, 3 plus rings of the three colours,
 * 4 plus drops flying outward. Compared in `?lab=finale`.
 */
export type FinaleLevel = 1 | 2 | 3 | 4;
export const FINALE_LEVELS: { level: FinaleLevel; name: string; line: string }[] = [
  { level: 1, name: '白', line: '白だけ（道のおわり）' },
  { level: 2, name: '光', line: '中心から光がひろがる' },
  { level: 3, name: '波紋', line: '光 + 三色の波紋' },
  { level: 4, name: '雫', line: '光 + 波紋 + 雫がはじける' },
];
const SPRAY = Array.from({ length: 18 }, (_, i) => ({ angle: i * 20 + (i % 3) * 5, dist: 34 + (i * 37) % 30, size: 6 + (i * 5) % 9, hue: ['#5fbfcb', '#d77f9f', '#dcae5b'][i % 3], delay: (i % 4) * 0.05 }));

export function WhiteFinale({ label, line, sub, current, backLabel, onBack, level = 1 }: {
  label: string; line: string; sub?: ReactNode; current: ModeId; backLabel: string; onBack: () => void; level?: FinaleLevel;
}) {
  return <div className="white-finale" data-level={level} role="dialog" aria-label={label}>
    {level >= 2 && <div className="wf-fx" aria-hidden="true">
      <i className="wf-burst"/>
      {level >= 3 && [0, 1, 2].map(i => <i key={i} className="wf-ring" style={{ animationDelay: `${0.3 + i * 0.3}s`, borderColor: ['#5fbfcb', '#d77f9f', '#dcae5b'][i] }}/>)}
      {level >= 4 && SPRAY.map((s, i) => <i key={i} className="wf-drop" style={{ '--a': `${s.angle}deg`, '--d': `${s.dist}vmax`, width: s.size * 2, height: s.size * 2, background: s.hue, animationDelay: `${0.35 + s.delay}s` } as React.CSSProperties}/>)}
    </div>}
    <div className="white-finale-body"><p>{line}</p>{sub && <small>{sub}</small>}
      <ModeGallery current={current} onCurrent={onBack}/>
      <button className="white-finale-back" onClick={onBack}>{backLabel}</button></div>
  </div>;
}
