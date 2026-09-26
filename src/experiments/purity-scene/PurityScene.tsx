import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, Undo2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { PuritySimulation, type SceneState } from './simulation';
import { CHAPTERS, getChapter, HUE_NAMES } from './chapters';
import { readProgress, writeProgress, type Progress } from './progress';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { causticQuery, initialCaustic, initialRipple, rippleQuery, writeLookQuery } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import './purity-scene.css';

export default function PurityScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<PuritySimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [progress, setProgress] = useState(readProgress);
  const progressRef = useRef(progress);
  const [chapterId, setChapterId] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return query.has('chapter') ? getChapter(Number(query.get('chapter'))).id : query.get('play') === 'first' ? 1 : progress.last;
  });
  const chapter = getChapter(chapterId);
  const [state, setState] = useState<SceneState>(() => new PuritySimulation(chapterId).state());
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const persist = (next: Progress) => {
    progressRef.current = next; setProgress(next); setStorageUnavailable(!writeProgress(next));
  };
  const selectChapter = (id: number) => {
    const next = getChapter(id).id;
    setChapterId(next); setPaused(false); setNotice('');
    persist({ ...progressRef.current, last: next });
    const url = new URL(window.location.href); url.searchParams.set('play', 'chapters'); url.searchParams.set('chapter', String(next));
    window.history.replaceState(null, '', url); window.scrollTo(0, 0);
  };
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [lighting, setLighting] = useState<FusionOptions['lighting']>('studio');
  const [ripple, setRipple] = useState(initialRipple);
  const [caustic, setCaustic] = useState<FusionOptions['caustic']>(initialCaustic);
  const [notice, setNotice] = useState('');
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  // Last heard goal states. Null means "adopt silently" after load, undo or reset.
  const heard = useRef<{ ready: boolean[]; delivered: boolean[] } | null>(null);
  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    const sim = new PuritySimulation(chapterId); simulation.current = sim;
    let recorded = false;
    heard.current = null;
    const update = () => {
      const next = sim.state();
      if (canvas.current) canvas.current.dataset.scene = JSON.stringify(next);
      const previous = heard.current;
      heard.current = { ready: next.targets.map(t => t.ready), delivered: next.targets.map(t => t.delivered) };
      if (previous && alive) next.targets.forEach((target, i) => {
        const finished = next.targets.every(t => t.delivered);
        if (target.delivered && !previous.delivered[i]) feedback.delivered(target.hue, finished);
        else if (target.ready && !previous.ready[i] && !target.delivered) feedback.ready(target.hue);
      });
      if (alive) {
        setState(next);
        if (next.completed && !recorded) {
          recorded = true;
          persist({ v: 1, last: chapterId, completed: [...new Set([...progressRef.current.completed, chapterId])].sort() });
        }
      }
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
        onInteraction: () => { if (alive) setNotice(''); },
      }, { simulation: sim, obstacles: sim.chapter.obstacles, goals: () => sim.chapter.goals.map((g, i) => ({ ...g, ready: sim.state().targets[i].ready, completed: sim.state().targets[i].delivered })), onUpdate: update, feedback });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [retry, chapterId]);
  useEffect(() => { experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting, dyeFlow: 'bloom', ripple, caustic }); }, [paused, reduced, quality, lighting, ripple, caustic, retry, chapterId]);
  const undo = () => {
    if (!simulation.current?.state().canUndo) return;
    heard.current = null; feedback.rewind();
    experience.current?.restoreState(() => simulation.current?.undo());
    setPaused(false); setNotice('ひとつ前の操作へ戻しました。');
  };
  const reset = () => {
    heard.current = null;
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
  const multi = chapter.goals.length > 1;
  const heading = state.completed ? (multi ? 'ふたつの色が、届きました。' : '澄んだ一滴が、届きました。') : state.contaminated ? '混ざっても、やり直せる。' : state.ready ? (multi ? 'それぞれの輪へ、そっと。' : '光の輪へ、そっと。') : multi ? '色ごとに、ひとつに。' : 'シアンを、ひとつに。';
  const guidance = state.completed ? 'このまま眺めても、もう一度触れても。' : state.contaminated ? '別の色が入りました。一手戻して、違う道を試せます。' : state.ready ? '同じ色名の輪に収め、指を離して落ち着かせます。' : chapter.hint;
  return <div className="droplet-lab purity-scene" data-lighting={lighting} data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>CHAPTER <b>{String(chapterId).padStart(2, '0')}</b></span></div></header>
    <ModeNav current="chapters"/>
    <main>
      <div className="dl-intro"><div><p className="dl-eyebrow"><span/>A QUIET WAY THROUGH</p><h1>{chapter.title}</h1><p className="dl-description">{chapter.description}</p></div><div className="dl-study-note"><span className="dl-study-number">{String(chapterId).padStart(2, '0')} <span>/ PURE</span></span><span>急がなくていい。道を、見つけよう。</span></div></div>
      <nav className="purity-chapters" aria-label="面を選ぶ">{CHAPTERS.map(c => <button key={c.id} aria-current={c.id === chapterId ? 'step' : undefined} onClick={() => selectChapter(c.id)}><span>{String(c.id).padStart(2, '0')}</span>{c.name}<small>{progress.completed.includes(c.id) ? '達成' : ''}</small></button>)}</nav>
      {storageUnavailable && <p className="purity-save-note" role="status">この環境では記録を保存できません。このまま遊べます。</p>}
      <div className="purity-layout">
        <div className="purity-board"><section className="dl-stage purity-stage" aria-label="純度を守るプレイエリア" aria-busy={status === 'loading'}>
          <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={chapter.description} aria-describedby="purity-instructions"/>
          <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{state.completed ? 'A MOMENT OF CLARITY' : paused ? 'PAUSED' : 'KEEP IT PURE'}</span><span className="dl-stage-index">{String(chapterId).padStart(2, '0')}</span></div>
          <span className="dl-corner dl-corner-bl"/><span className="dl-corner dl-corner-br"/>
          {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
          {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
          {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
          <div className="dl-stage-bottom"><span>{multi ? 'CYAN + ROSE → LIGHT' : 'CYAN → LIGHT'}</span><span>NO TIME LIMIT</span></div>
        </section>
          <div className="purity-actions"><button onClick={undo} disabled={!state.canUndo || status !== 'ready'}><Undo2 size={16}/><span>一手戻す</span></button><button onClick={reset} disabled={status !== 'ready'}><RotateCcw size={15}/><span>{state.completed ? 'もう一度遊ぶ' : '最初から'}</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
          <p className="purity-notice" role="status">{notice || (chapterId === 2 ? '石は動かせません。外側にも、回り道があります。' : '違う色に触れると混ざります。一手戻して試せます。')}</p>
        </div>
        <aside className={`purity-companion${state.completed ? ' is-complete' : ''}`}>
          <p className="purity-chapter">{String(chapterId).padStart(2, '0')} <span>{chapter.name}</span></p>
          <div className="purity-guidance" aria-live="polite"><h2>{heading}</h2><p id="purity-instructions">{guidance}</p></div>
          {state.targets.map(target => <div key={target.hue} className="purity-target-card" data-color={target.hue}>
            <div className="purity-progress"><div><span>{HUE_NAMES[target.hue]} {target.delivered ? '· 届きました' : 'をひとつに'}</span><strong>{Math.round(target.gathered * target.count)}<small> / {target.count}</small></strong></div><div className="purity-dots" aria-hidden="true">{Array.from({ length: target.count }, (_, i) => <i key={i} className={target.gathered * target.count >= i + .99 ? 'is-filled' : ''}/>)}</div></div>
            <div className={`purity-measure${target.purity < chapter.purity ? ' is-mixed' : ''}`}><span>仕上がりの純度<small>すべて集めたときの{HUE_NAMES[target.hue]}の割合</small></span><strong>{Math.floor(target.purity * 100 + 1e-8)}<small>%</small></strong></div>
          </div>)}
          <p className="purity-target">目標：{multi ? '二色それぞれ' : 'シアン'}を全部集め、純度90%以上で輪の中へ。</p>
          {state.completed && <div className="purity-completion" role="status">{chapterId < 3 ? <button onClick={() => selectChapter(chapterId + 1)}>次の面へ <ArrowUpRight size={15}/></button> : <><p>{progress.completed.length === 3 ? '三つの道の、最後まで。' : 'ふたつの色が、そろいました。'}<br/>別の道を選ぶか、自由な混色へ。</p><a href="?lab=fusion&mixing=bloom">自由に混ぜる <ArrowUpRight size={15}/></a></>}</div>}
          <details className="purity-details"><summary>遊び方と表示</summary><p>異なる色も触れると混ざります。すべての雫は動かせます。2面目の丸い石だけは動かせません。「一手戻す」は、掴む前の配置と色へ戻し、動きを止めます。</p><p>輪には雫全体を収めて、ゆっくり指を離します。達成後も自由に触れられます。</p><label><span>光</span><select value={lighting} onChange={e => setLighting(e.target.value as FusionOptions['lighting'])}><option value="studio">スタジオ</option><option value="daylight">自然光</option></select></label><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label><label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label><label><span>縁が波打つ</span><input type="checkbox" checked={ripple} onChange={e => {
            setRipple(e.target.checked);
            writeLookQuery('ripple', rippleQuery(e.target.checked));
          }}/></label><label><span>形から床の光を描く</span><input type="checkbox" checked={caustic === 'shape'} onChange={e => {
            const next = e.target.checked ? 'shape' : 'artistic';
            setCaustic(next);
            writeLookQuery('caustic', causticQuery(e.target.checked));
          }}/></label><label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>{feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}<p>U：一手戻す · R：最初から · Esc：一時停止</p></details>
        </aside>
      </div>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>三つの道。触れる心地よさを、遊びへ。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=open">三色で自由に<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="?lab=fusion&mixing=bloom">自由に混ぜる<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
