import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { EndlessSimulation } from './simulation';
import { stageDropHeight } from '../stages/simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { SoundSettings } from '../sound-settings';
import { ModeNav } from '../mode-nav';
import { PhoneBar, PhoneMenuClose, usePhonePlay } from '../phone-play';
import { SoundNudge } from '../sensory/sound-nudge';
import { ClearGlow } from '../clear-glow';
import { LookPicker } from '../look-picker';
import { useWalls } from '../walls';
import { initialLook, initialUi, type Look, type Ui } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import './endless.css';

/** Rounds sorted on this device, all time: a counter that only goes up, like popped bubbles. */
const KEY = 'pura-flow-endless-v1';
function readTotal(): number {
  try { const d = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (d?.v === 1 && Number.isFinite(d.total)) return Math.max(0, Math.floor(d.total)); } catch { /* from zero */ }
  return 0;
}
function writeTotal(total: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, total })); } catch { /* play continues */ }
}

type Reading = { remaining: number; sorted: number; phase: 'gather' | 'sorted' };

export default function EndlessPlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<EndlessSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const play = usePhonePlay(paused, setPaused);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [reading, setReading] = useState<Reading>({ remaining: 0, sorted: 0, phase: 'gather' });
  const [total, setTotal] = useState(readTotal);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const walls = useWalls();

  useEffect(() => {
    let alive = true, counted = 0;
    setStatus('loading'); setError('');
    const sim = new EndlessSimulation(); simulation.current = sim;
    const update = () => {
      if (!alive) return;
      if (sim.sorted > counted) {
        counted = sim.sorted;
        // The finishing chime of the colour that closed the round, and the count goes up.
        feedback.delivered(sim.lastHue, true);
        setTotal(t => { const next = t + 1; writeTotal(next); return next; });
      }
      setReading({ remaining: sim.remaining, sorted: sim.sorted, phase: sim.phase });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, feedback, height: stageDropHeight, onUpdate: update });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, walls, fit: play.phone ? 'screen' : 'card', ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, retry, look, walls, play.phone]);
  // A new scatter at any time (keeps the counts).
  const again = () => { experience.current?.restoreState(() => simulation.current?.reset()); setPaused(false); play.played(); };
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
  const sortedNow = reading.phase === 'sorted';

  return <div className={'droplet-lab purity-scene stage-play endless-play' + play.className} data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><PhoneMenuClose play={play} current={'endless'} sound={{ sensory, change: changeSensory, feedback }}/><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>エンドレス</span><span className="dl-edition-rule"/><span>ENDLESS</span></div></header>
    <ModeNav current="endless"/>
    <main>
      <p className="stage-title"><b>エンドレス</b>三色を、それぞれひとつに。そろったら、また散らばる。</p>
      <section className="dl-stage purity-stage stage-board" aria-label="エンドレスの盤面" aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="散らばった三色の雫を、色ごとに集める盤面"/>
        <PhoneBar play={play} onRetry={again}/>
        <SoundNudge feedback={feedback} sound={sensory.sound}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : 'ENDLESS'}</span><span className="dl-stage-index">{reading.remaining}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        <ClearGlow show={sortedNow}/>
        {sortedNow && <div className="endless-count" role="status" key={total}><b>{total}</b><small>そろった</small></div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{sortedNow ? 'そろった' : `あと ${reading.remaining}`}</output><span>{total ? `通算 ${total}` : 'ENDLESS'}</span></div>
      </section>
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>散らし直す</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>同じ色は触れるとひとつに、違う色ははじき合います（混ざりません）。三色がそれぞれひとつになったら「そろった」。雫がはじけて、また散らばります。終わりはありません。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <SoundSettings sensory={sensory} change={changeSensory} feedback={feedback}/>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：散らし直す · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>集めて、また散る。</p></div></footer>
  </div></div>;
}
