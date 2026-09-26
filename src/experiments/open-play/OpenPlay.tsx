import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue, purityOf, type HueId } from '../../game/palette';
import { OpenPlaySimulation } from './simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { causticQuery, initialCaustic, initialRipple, rippleQuery, writeLookQuery } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import './open-play.css';

const HUE_NAMES: Record<HueId, string> = { cyan: 'シアン', rose: 'ローズ', amber: 'アンバー' };
type Reading = { count: number; held: { hue: HueId; purity: number } | null };

export default function OpenPlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<OpenPlaySimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const query = new URLSearchParams(window.location.search);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [lighting, setLighting] = useState<FusionOptions['lighting']>('studio');
  const [ripple, setRipple] = useState(initialRipple);
  const [caustic, setCaustic] = useState(initialCaustic);
  const [reading, setReading] = useState<Reading>({ count: 12, held: null });
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();

  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    // ?drops=24 (12–60) is for load and play checks; the curated 12 is the default.
    const sim = new OpenPlaySimulation(Number(query.get('drops') ?? 12)); simulation.current = sim;
    const update = () => {
      if (!alive) return;
      const held = sim.core.drops.find(d => d.id === sim.core.grabbedId);
      setReading({ count: sim.core.drops.length, held: held ? { hue: dominantHue(held.pigment), purity: purityOf(held.pigment) } : null });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
        onInteraction: () => { if (alive) setTouched(true); },
      }, { simulation: sim, onUpdate: update, feedback });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting, dyeFlow: 'bloom', ripple,
      caustic });
  }, [paused, reduced, quality, lighting, ripple, caustic, retry]);
  const again = () => {
    experience.current?.restoreState(() => simulation.current?.reset());
    setPaused(false); setTouched(false);
  };
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
  const held = reading.held;

  return <div className="droplet-lab purity-scene open-play" data-lighting={lighting} data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>OPEN PLAY</span></div></header>
    <ModeNav current="open"/>
    <main>
      <section className="dl-stage purity-stage open-stage" aria-label="水滴で遊ぶ盤面" aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="三色の雫をつかんで動かせる盤面" aria-describedby="open-help"/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : 'THREE COLOURS'}</span><span className="dl-stage-index">{reading.count}</span></div>
        <span className="dl-corner dl-corner-bl"/><span className="dl-corner dl-corner-br"/>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {status === 'ready' && !paused && <div className={`dl-touch-hint${touched ? ' is-dismissed' : ''}`} aria-hidden="true"><span className="dl-hint-dot"/>なぞって、動かす</div>}
        <div className="dl-stage-bottom"><output className="open-reading" aria-live="polite">{held ? `${HUE_NAMES[held.hue]} · 純度 ${Math.floor(held.purity * 100 + 1e-8)}%` : `${reading.count} DROPS`}</output><span>NO GOAL</span></div>
      </section>
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>もう一度</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <div id="open-help">
          <p>つかんで動かし、離すと滑ります。同じ色は触れるとひとつに。</p>
          <p>違う色はぶつかると跳ね返ります。つかんだまま、ゆっくり押し込むと混ざります。</p>
          <p>混ざった雫は、すばやく2回タップすると、入った色を取り出せます。</p>
        </div>
        <label><span>光</span><select value={lighting} onChange={e => setLighting(e.target.value as FusionOptions['lighting'])}><option value="studio">スタジオ</option><option value="daylight">自然光</option></select></label>
        <label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>縁が波打つ</span><input type="checkbox" checked={ripple} onChange={e => { setRipple(e.target.checked); writeLookQuery('ripple', rippleQuery(e.target.checked)); }}/></label>
        <label><span>形から床の光を描く</span><input type="checkbox" checked={caustic === 'shape'} onChange={e => { setCaustic(e.target.checked ? 'shape' : 'artistic'); writeLookQuery('caustic', causticQuery(e.target.checked)); }}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：もう一度 · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>三色の雫で、自由に。</p></div><span className="open-links"><a className="purity-lab-link" href="?lab=droplets">実験室<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="?play=classic">元祖PURA<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
