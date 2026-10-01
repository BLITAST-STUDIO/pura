import { useEffect, useLayoutEffect, useState } from 'react';
import { TOUR } from './onboarding';
import { phrases } from './MakerFirst';

/**
 * Phase 2 of the stage maker's onboarding: the studio (the full editor) with
 * a short tour. Each step rings one part of the screen and says one thing;
 * the card sits on the other half of the screen. The end is a white fade.
 */
export function MakerTour({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [ending, setEnding] = useState(false);
  const [below, setBelow] = useState(false);
  const step = TOUR[index];

  useLayoutEffect(() => {
    document.querySelectorAll('[data-tour-focus]').forEach(e => e.removeAttribute('data-tour-focus'));
    if (ending || !step.target) { setBelow(false); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.setAttribute('data-tour-focus', '');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // The card goes where the ringed part is not.
    const r = el.getBoundingClientRect();
    setBelow(r.top + r.height / 2 < window.innerHeight / 2);
    return () => el.removeAttribute('data-tour-focus');
  }, [index, ending]);
  // The white fade: the last words, then the studio is yours.
  useEffect(() => { if (!ending) return; const t = window.setTimeout(onDone, 4600); return () => clearTimeout(t); }, [ending]);

  const next = () => (index + 1 < TOUR.length ? setIndex(index + 1) : setEnding(true));
  if (ending) return <div className="maker-tour-end" role="status"><p>これで説明は終わりです。</p><small>あなただけのPURAを、つくってみてください。</small></div>;
  return <div className={`maker-tour${below ? ' is-below' : ''}${step.target ? '' : ' is-centre'}`} role="dialog" aria-label="スタジオの説明">
    <div className="maker-tour-card" key={index}>
      <div className="maker-tour-dots" aria-hidden="true">{TOUR.map((_, i) => <i key={i} className={i === index ? 'is-now' : i < index ? 'is-done' : ''}/>)}</div>
      <p>{phrases(step.line).map((t, i) => <span key={i}>{t}</span>)}</p>{step.sub && <small>{step.sub}</small>}
      <div><button className="maker-tour-skip" onClick={() => setEnding(true)}>説明をとばす</button><button className="maker-tour-next" onClick={next}>{index + 1 < TOUR.length ? '次へ' : 'はじめる'}</button></div>
    </div>
  </div>;
}
