import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { FREE_DEFAULTS, FREE_PRESETS, FreeSimulation, normalizeFree, type FreeMix, type FreeSettings } from './simulation';
import { stageDropHeight } from '../stages/simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { LookPicker } from '../look-picker';
import { useWalls } from '../walls';
import { initialLook, initialUi, type Look, type Ui } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import './free.css';

const KEY = 'pura-flow-free-v1';
function readSettings(): FreeSettings {
  try { const d = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (d?.v === 1) return normalizeFree(d.settings); } catch { /* defaults */ }
  return FREE_DEFAULTS;
}
function writeSettings(settings: FreeSettings) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, settings })); } catch { /* play continues */ }
}
const PRESET_LABELS: [string, string][] = [['standard', '標準'], ['watery', 'さらさら'], ['syrupy', 'とろり'], ['gather', 'ゴゴゴ']];
const MIX_LABELS: [FreeMix, string][] = [['same', '同じ色だけ'], ['press', '押し込むと混ざる'], ['all', '触れると全部混ざる']];

export default function FreePlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<FreeSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [settings, setSettings] = useState(readSettings);
  const [deal, setDeal] = useState(() => ({ count: settings.count, colors: settings.colors }));
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [count, setCount] = useState(settings.count);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const walls = useWalls();

  // The board is re-dealt only when the number or colours change.
  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    const sim = new FreeSimulation(settings); simulation.current = sim;
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, feedback, height: stageDropHeight, onUpdate: () => { if (alive) setCount(sim.core.drops.length); } });
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [deal, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, walls, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, deal, retry, look, walls]);
  const change = (next: Partial<FreeSettings>) => {
    const merged = normalizeFree({ ...settings, ...next });
    setSettings(merged); writeSettings(merged);
    if (merged.count !== deal.count || merged.colors !== deal.colors) setDeal({ count: merged.count, colors: merged.colors });
    else simulation.current?.configure(merged);
  };
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
  const slider = (label: string, left: string, right: string, key: 'viscosity' | 'inertia' | 'friction' | 'attraction', max = 1) =>
    <label className="free-slider"><span>{label}</span><small>{left}</small><input type="range" min={0} max={max} step={0.05} value={settings[key]} onChange={e => change({ [key]: Number(e.target.value) })}/><small>{right}</small></label>;

  return <div className="droplet-lab purity-scene stage-play free-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>FREE</span></div></header>
    <ModeNav current="free"/>
    <main>
      <p className="stage-title"><b>自由</b>目標も点数もなし。好きな手触りで、好きなだけ。</p>
      <div className="stage-modes free-presets" role="group" aria-label="おすすめの設定">{PRESET_LABELS.map(([id, label]) => <button key={id} onClick={() => change({ ...FREE_DEFAULTS, ...FREE_PRESETS[id], ...(id === 'gather' ? {} : { count: settings.count, colors: settings.colors }) })}>{label}</button>)}</div>
      <section className="dl-stage purity-stage stage-board" aria-label="自由に遊ぶ盤面" aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="雫をつかんで自由に動かせる盤面"/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : 'FREE PLAY'}</span><span className="dl-stage-index">{count}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        <div className="dl-stage-bottom"><span>{count} {count === 1 ? "DROP" : "DROPS"}</span><span>NO GOAL</span></div>
      </section>
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>並べ直す</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <div className="free-settings">
        <div className="stage-compare"><div><span>雫の数</span><select value={settings.count} onChange={e => change({ count: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, i) => 6 + i * 6).map(n => <option key={n} value={n}>{n}</option>)}</select><span>色</span>{([1, 2, 3] as const).map(n => <button key={n} aria-pressed={settings.colors === n} onClick={() => change({ colors: n })}>{n}色</button>)}</div>
          <div><span>混ざり方</span>{MIX_LABELS.map(([id, label]) => <button key={id} aria-pressed={settings.mix === id} onClick={() => change({ mix: id })}>{label}</button>)}</div></div>
        {slider('粘度', 'さらさら', 'とろり', 'viscosity')}
        {slider('慣性', '機敏', '重い', 'inertia')}
        {slider('摩擦', 'なし', '強い', 'friction')}
        {slider('引き寄せ', 'なし', '強い', 'attraction', 2)}
      </div>
      <details className="purity-details open-details">
        <summary>表示</summary>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        <p>雫の数と色を変えると並べ直します。ほかの設定は触ったまま変わります。R：並べ直す · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>自由モード。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=stages">8ステージへ<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="?play=open">入口プレイへ<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
