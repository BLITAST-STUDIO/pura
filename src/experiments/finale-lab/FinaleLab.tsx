import { useState } from 'react';
import { FINALE_LEVELS, WhiteFinale, type FinaleLevel } from '../white-finale';
import './finale-lab.css';

/**
 * ?lab=finale (2026-10-04, RYO: the curling ending felt weak; a place to feel
 * only the effect). Pick a strength, press おわる, and watch it again as often as you like.
 */
export default function FinaleLab() {
  const initial = Number(new URLSearchParams(window.location.search).get('level'));
  const [level, setLevel] = useState<FinaleLevel>([1, 2, 3, 4].includes(initial) ? initial as FinaleLevel : 3);
  const [shown, setShown] = useState(0);
  return <main className="finale-lab">
    <h1>終わりの演出</h1>
    <p>強さを選んで、「おわる」を押す。何度でも見られます。</p>
    <div className="finale-lab-levels" role="radiogroup">{FINALE_LEVELS.map(l =>
      <button key={l.level} role="radio" aria-checked={l.level === level} onClick={() => setLevel(l.level)}><b>{l.level} {l.name}</b><small>{l.line}</small></button>)}</div>
    <button className="finale-lab-go" onClick={() => setShown(n => n + 1)}>おわる</button>
    {shown > 0 && <WhiteFinale key={`${shown}-${level}`} label="終わりの演出" line="試合、終了。" sub="3 – 2 · あなたの勝ち" current="curling" backLabel="もう一度見る" onBack={() => setShown(0)} level={level}/>}
  </main>;
}
