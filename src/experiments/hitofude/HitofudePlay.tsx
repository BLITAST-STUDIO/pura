import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue } from '../../game/palette';
import { HitofudeSimulation, type ShotResult } from './simulation';
import { SHOT_BOARDS } from './boards';
import { stageDropHeight } from '../stages/simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { LookPicker } from '../look-picker';
import { initialLook, initialUi, type Look, type Ui } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import './hitofude.css';

const BEST_KEY = 'pura-flow-hitofude-v1';
type Reading = { shots: number; left: number; remaining: number; result: ShotResult | null };

function readBest(): Record<number, number> {
  try { const d = JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null'); return d?.v === 1 && d.best ? d.best : {}; } catch { return {}; }
}
function writeBest(best: Record<number, number>) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify({ v: 1, best })); } catch { /* play continues without records */ }
}

export default function HitofudePlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<HitofudeSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [boardId, setBoardId] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('board') ?? 1);
    return SHOT_BOARDS.some(b => b.id === id) ? id : 1;
  });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [reading, setReading] = useState<Reading>({ shots: 0, left: 0, remaining: 0, result: null });
  const [best, setBest] = useState(readBest);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const board = SHOT_BOARDS.find(b => b.id === boardId) ?? SHOT_BOARDS[0];

  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('play', 'hitofude'); url.searchParams.set('board', String(board.id));
    window.history.replaceState(window.history.state, '', url);
    const sim = new HitofudeSimulation(board); simulation.current = sim;
    let announced = false;
    const update = () => {
      if (!alive) return;
      const result = sim.result;
      if (result && !announced) {
        announced = true;
        if (result.cleared) {
          const biggest = [...sim.core.drops].sort((a, b) => b.mass - a.mass)[0];
          feedback.delivered(biggest ? dominantHue(biggest.pigment) : 'cyan', true);
          setBest(previous => { const next = { ...previous, [board.id]: Math.max(previous[board.id] ?? 0, result.stars) }; writeBest(next); return next; });
        }
      }
      if (!result) announced = false;
      setReading({ shots: sim.shots, left: sim.shotsLeft, remaining: sim.remaining, result });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight, aim: () => sim.aim });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [boardId, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, boardId, retry, look]);
  const again = () => { experience.current?.restoreState(() => simulation.current?.reset()); setPaused(false); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      if (e.key === 'Escape') { setPaused(p => !p); e.preventDefault(); }
      if (e.key.toLowerCase() === 'r') { again(); e.preventDefault(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const choose = (id: number) => { setBoardId(id); setPaused(false); window.scrollTo(0, 0); };
  const next = SHOT_BOARDS.find(b => b.id === board.id + 1);
  const result = reading.result;

  return <div className="droplet-lab purity-scene stage-play hitofude-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>ひとふで <b>{board.code}</b></span></div></header>
    <ModeNav current="hitofude"/>
    <main>
      <nav className="stage-picker" aria-label="盤面を選ぶ">{SHOT_BOARDS.map(b => <button key={b.id} aria-current={b.id === board.id ? 'step' : undefined} onClick={() => choose(b.id)}><span>{b.code}</span><small>{'★'.repeat(best[b.id] ?? 0) || b.name}</small></button>)}</nav>
      <p className="stage-title"><b>{board.name}</b>{board.hint}</p>
      <section className="dl-stage purity-stage stage-board" aria-label={`ひとふで ${board.code} ${board.name}`} aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={board.hint}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : result?.cleared ? 'CLEAR' : `ONE STROKE ${board.code}`}</span><span className="dl-stage-index">{reading.remaining}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {result?.cleared && <div className="stage-clear" role="status"><span>{'★'.repeat(result.stars)}<i>{'★'.repeat(3 - result.stars)}</i></span><small>{result.shots}手</small>{next && <button onClick={() => choose(next.id)}>次へ <ArrowUpRight size={13}/></button>}</div>}
        {result && !result.cleared && <div className="stage-clear" role="status"><small>あと{reading.remaining}つ</small><button onClick={again}>もう一度 <RotateCcw size={12}/></button></div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{result?.cleared ? 'ひとつに' : `あと ${reading.remaining} つ`}</output><span>目安 {board.par}手</span></div>
      </section>
      <div className="shot-meter" aria-label={`のこり ${reading.left}手`}><span>のこり</span>{Array.from({ length: board.shots }, (_, i) => <i key={i} className={i < reading.left ? 'is-left' : ''}/>)}<small>使った手数 {reading.shots}</small></div>
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>やり直す</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>雫に触れて、引いて、離す。雫は反対の向きへ滑り出します。遠くまで引くほど強く、点線が向きと強さの目安です。短く引いただけなら、手数は減りません。</p>
        <p>同じ色は触れるとひとつに、違う色ははじき合います。色ごとにひとつにまとめたらクリア。目安の手数以内なら★3、1手多いと★2、それ以上は★1。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：やり直す · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>ひとふで、試作の3面。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=stages">ステージ<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="./">三色で自由に<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
