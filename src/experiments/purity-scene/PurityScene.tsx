import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, Undo2, Pause, Play } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { FIRST_SCENE, PuritySimulation, type SceneState } from './simulation';
import '../droplet-lab/droplet-lab.css';
import './purity-scene.css';

export default function PurityScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<PuritySimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [state, setState] = useState<SceneState>({ gathered: 1 / 3, purity: 1, ready: false, inGoal: false, completed: false, contaminated: false, canUndo: false });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [lighting, setLighting] = useState<FusionOptions['lighting']>('studio');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    const sim = new PuritySimulation(); simulation.current = sim;
    const update = () => {
      const next = sim.state();
      if (canvas.current) canvas.current.dataset.scene = JSON.stringify(next);
      if (alive) setState(next);
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
        onInteraction: () => { if (alive) setNotice(''); },
      }, { simulation: sim, goal: () => ({ ...FIRST_SCENE.goal, ...sim.state() }), onUpdate: update });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [retry]);
  useEffect(() => { experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting, dyeFlow: 'bloom' }); }, [paused, reduced, quality, lighting, retry]);
  const undo = () => {
    if (!simulation.current?.state().canUndo) return;
    experience.current?.restoreState(() => simulation.current?.undo());
    setPaused(false); setNotice('ひとつ前の操作へ戻しました。');
  };
  const reset = () => {
    experience.current?.restoreState(() => simulation.current?.reset());
    setPaused(false); setNotice('最初の配置に戻しました。');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (e.key === 'Escape') { setPaused(p => !p); e.preventDefault(); }
      if (e.key.toLowerCase() === 'r') { reset(); e.preventDefault(); }
      if (e.key.toLowerCase() === 'u') { undo(); e.preventDefault(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const heading = state.completed ? '澄んだ一滴が、届きました。' : state.contaminated ? '混ざっても、やり直せる。' : state.ready ? '光の輪へ、そっと。' : 'シアンを、ひとつに。';
  const guidance = state.completed ? 'このまま眺めても、もう一度触れても。' : state.contaminated ? '別の色が入りました。一手戻して、違う道を試せます。' : state.ready ? '左上の輪に収め、指を離して落ち着かせます。' : '三つのシアンを集めます。ローズのそばは、少し遠回り。';
  return <div className="droplet-lab purity-scene" data-lighting={lighting} data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="?play=first" aria-label="PURA 最初の一面"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>CHAPTER <b>01</b></span></div></header>
    <main>
      <div className="dl-intro"><div><p className="dl-eyebrow"><span/>A QUIET WAY THROUGH</p><h1>澄んだまま、ひとつに。</h1><p className="dl-description">三つのシアンをひとつにして、左上の輪へ。</p></div><div className="dl-study-note"><span className="dl-study-number">01 <span>/ PURE</span></span><span>急がなくていい。道を、見つけよう。</span></div></div>
      <div className="purity-layout">
        <div className="purity-board"><section className="dl-stage purity-stage" aria-label="純度を守るプレイエリア" aria-busy={status === 'loading'}>
          <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="三つのシアンを集め、左上の光の輪へ運ぶ" aria-describedby="purity-instructions"/>
          <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{state.completed ? 'A MOMENT OF CLARITY' : paused ? 'PAUSED' : 'KEEP IT PURE'}</span><span className="dl-stage-index">01</span></div>
          <span className="dl-corner dl-corner-bl"/><span className="dl-corner dl-corner-br"/>
          {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
          {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
          {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
          <div className="dl-stage-bottom"><span>CYAN → LIGHT</span><span>NO TIME LIMIT</span></div>
        </section>
          <div className="purity-actions"><button onClick={undo} disabled={!state.canUndo || status !== 'ready'}><Undo2 size={16}/><span>一手戻す</span></button><button onClick={reset} disabled={status !== 'ready'}><RotateCcw size={15}/><span>{state.completed ? 'もう一度遊ぶ' : '最初から'}</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button></div>
          <p className="purity-notice" role="status">{notice || 'ローズに触れると混ざります。一手戻して試せます。'}</p>
        </div>
        <aside className={`purity-companion${state.completed ? ' is-complete' : ''}`}>
          <p className="purity-chapter">01 <span>澄んだ道</span></p>
          <div className="purity-guidance" aria-live="polite"><h2>{heading}</h2><p id="purity-instructions">{guidance}</p></div>
          <div className="purity-progress"><div><span>ひとつに集めたシアン</span><strong>{Math.round(state.gathered * 3)}<small> / 3</small></strong></div><div className="purity-dots" aria-hidden="true">{[1,2,3].map(i => <i key={i} className={state.gathered * 3 >= i - .01 ? 'is-filled' : ''}/>)}</div></div>
          <div className={`purity-measure${state.purity < .9 ? ' is-mixed' : ''}`}><span>仕上がりの純度<small>すべて集めたときのシアンの割合</small></span><strong>{Math.floor(state.purity * 100 + 1e-8)}<small>%</small></strong></div>
          <p className="purity-target">目標：シアンを全部集め、純度90%以上で輪の中へ。</p>
          <details className="purity-details"><summary>遊び方と表示</summary><p>この一面では、異なる色も触れると混ざります。ローズも動かせます。「一手戻す」は、掴む前の配置と色へ戻し、動きを止めます。</p><p>輪には雫全体を収めて、ゆっくり指を離します。達成後も自由に触れられます。</p><label><span>光</span><select value={lighting} onChange={e => setLighting(e.target.value as FusionOptions['lighting'])}><option value="studio">スタジオ</option><option value="daylight">自然光</option></select></label><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label><label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label><p>U：一手戻す · R：最初から · Esc：一時停止</p></details>
        </aside>
      </div>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>最初の一面。触れる心地よさを、遊びへ。</p></div><a className="purity-lab-link" href="?lab=fusion&mixing=bloom">自由に混ぜる<ArrowUpRight size={14}/></a></footer>
  </div></div>;
}
