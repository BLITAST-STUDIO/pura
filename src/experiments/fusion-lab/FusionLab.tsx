import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Grid2X2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { createFusionExperience, type FusionOptions, type FusionStats } from './renderer';
import type { FusionPreset } from './simulation';
import '../droplet-lab/droplet-lab.css';
import './fusion-lab.css';

function initialDyeFlow(): FusionOptions['dyeFlow'] {
  const value = new URLSearchParams(window.location.search).get('mixing');
  return value === 'bloom' || value === 'swirl' ? value : 'classic';
}

export default function FusionLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [preset, setPreset] = useState<FusionPreset>(() => initialDyeFlow() !== 'classic' ? 'mix' : 'pair');
  const [ratio, setRatio] = useState(1);
  const [options, setOptions] = useState<FusionOptions>({ lighting: 'studio', inspection: false, paused: false, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, quality: 'high', clay: false, dyeFlow: initialDyeFlow() });
  const [stats, setStats] = useState<FusionStats>({ count: 2, cyan: 1, rose: 0, merged: false, fps: 0, p95: 0 });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [touched, setTouched] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [restart, setRestart] = useState(0);
  const change = (next: Partial<FusionOptions>) => setOptions(prev => ({ ...prev, ...next }));
  useEffect(() => {
    let mounted = true;
    setStatus('loading'); setError('');
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (mounted) setStatus('ready'); },
        onError: e => { if (mounted) { setError(e); setStatus('error'); } },
        onStats: s => { if (mounted) setStats(s); },
        onInteraction: () => { if (mounted) setTouched(true); },
      });
    } catch (cause) { setStatus('error'); setError(cause instanceof Error ? cause.message : String(cause)); }
    return () => { mounted = false; experience.current?.dispose(); experience.current = null; };
  }, [restart]);
  useEffect(() => { experience.current?.setOptions(options); }, [options, restart]);
  useEffect(() => { experience.current?.reset(preset, ratio); setTouched(false); }, [preset, ratio, restart]);
  const reset = () => { experience.current?.reset(preset, ratio); change({ paused: false }); setTouched(false); };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (e.key === 'Escape') {
        if (settings) { setSettings(false); settingsButton.current?.focus(); }
        else change({ paused: !options.paused });
        e.preventDefault(); return;
      }
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key.toLowerCase() === 'r') { reset(); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [preset, ratio, options.paused, settings]);
  useEffect(() => { if (settings) closeButton.current?.focus(); }, [settings]);
  return <div className="droplet-lab fusion-lab" data-lighting={options.lighting} data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="?lab=droplets" aria-label="一粒の実験へ"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>MATERIAL STUDY <b>002</b></span></div></header>
    <main>
      <div className="dl-intro"><div><p className="dl-eyebrow"><span/>THE MOMENT OF MERGING</p><h1>ふれて、ひとつに。</h1><p className="dl-description">ふたつの輪郭がほどけて、ひとしずくになる。</p></div><div className="dl-study-note"><span className="dl-study-number">02 <span>/ FLOW</span></span><span>つながる、かたちと色。</span></div></div>
      <section className="dl-stage" aria-label="融合のプレイエリア" aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" aria-label="水滴をつかんで融合させるプレイエリア" aria-describedby="fusion-instructions" tabIndex={0}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !options.paused ? 'is-live' : ''}/>{options.paused ? 'PAUSED' : 'TWO BECOME ONE'}</span><span className="dl-stage-index">P / 002</span></div>
        <span className="dl-corner dl-corner-bl"/><span className="dl-corner dl-corner-br"/>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRestart(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && options.paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => change({ paused: false })}>つづける</button></div>}
        {status === 'ready' && !options.paused && <div className={`dl-touch-hint${touched ? ' is-dismissed' : ''}`} aria-hidden="true"><span className="dl-hint-dot"/>{preset === 'mix' ? '異なる色へ、そっとふれる' : 'ひとしずくを、もうひとしずくへ'}</div>}
        <div className="dl-stage-bottom"><span>{options.lighting === 'studio' ? 'SOFT STUDIO LIGHT' : 'NATURAL DAYLIGHT'}</span><output aria-label="雫の状態">{stats.merged ? `CYAN ${Math.round(stats.cyan * 100)}% · ROSE ${Math.round(stats.rose * 100)}%` : `${stats.count} ${stats.count === 1 ? 'DROP' : 'DROPS'}`}</output></div>
      </section>
      <div className="fusion-presets" role="group" aria-label="融合の試し方">{([['pair','ふたつの雫'],['mix','色をまぜる'],['chain','つづけて融合']] as const).map(([value,label]) => <button key={value} aria-pressed={preset === value} onClick={() => { setPreset(value); change({ paused: false }); }} className={preset === value ? 'is-active' : ''}>{label}</button>)}</div>
      {preset === 'mix' && <div className="fusion-ratio"><label htmlFor="fusion-ratio">液体の量 <span>CYAN : ROSE</span></label><select id="fusion-ratio" value={ratio} onChange={e => { setRatio(Number(e.target.value)); change({ paused: false }); }}><option value="1">1 : 1</option><option value="4">4 : 1</option><option value="0.25">1 : 4</option><option value="10">10 : 1</option><option value="0.1">1 : 10</option></select><span>変更すると並べ直します</span></div>}
      <div className="dl-controls">
        <div className="dl-control-group dl-lighting"><span className="dl-control-label">光</span><div className="dl-segment" role="group" aria-label="照明"><button aria-pressed={options.lighting === 'studio'} className={options.lighting === 'studio' ? 'is-active' : ''} onClick={() => change({ lighting: 'studio' })}>スタジオ</button><button aria-pressed={options.lighting === 'daylight'} className={options.lighting === 'daylight' ? 'is-active' : ''} onClick={() => change({ lighting: 'daylight' })}>自然光</button></div></div>
        <div className="dl-control-actions"><button className="dl-quiet-button" aria-pressed={options.inspection} onClick={() => change({ inspection: !options.inspection })}><Grid2X2 size={15}/><span>屈折を見る</span></button><span className="dl-control-divider"/><button className="dl-quiet-button" onClick={reset}><RotateCcw size={15}/><span>並べ直す</span></button><div className="dl-settings"><button ref={settingsButton} className="dl-icon-button" aria-label="表示と動きの設定" aria-expanded={settings} aria-controls="fusion-settings" onClick={() => setSettings(v => !v)}><SlidersHorizontal size={17}/></button>
        {settings && <div className="dl-settings-panel" id="fusion-settings" role="dialog" aria-label="表示と動きの設定"><div className="dl-settings-heading"><span>表示と動き</span><button ref={closeButton} className="dl-icon-button" aria-label="設定を閉じる" onClick={() => { setSettings(false); settingsButton.current?.focus(); }}><X size={15}/></button></div>
          <label className="dl-setting-row"><span>形だけを見る</span><input type="checkbox" checked={options.clay} onChange={e => change({ clay: e.target.checked })}/><span className="dl-switch"/></label>
          <label className="dl-setting-row"><span>揺れを控えめに</span><input type="checkbox" checked={options.reducedMotion} onChange={e => change({ reducedMotion: e.target.checked })}/><span className="dl-switch"/></label>
          <label className="dl-setting-row dl-select-setting"><span>色のなじみ方</span><select value={options.dyeFlow} onChange={e => change({ dyeFlow: e.target.value as FusionOptions['dyeFlow'] })}><option value="bloom">ふわっと広がる（試作）</option><option value="swirl">ゆるやかな渦（試作）</option><option value="classic">これまでの混ざり方</option></select></label>
          <label className="dl-setting-row dl-select-setting"><span>画質</span><select value={options.quality} onChange={e => change({ quality: e.target.value as FusionOptions['quality'] })}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
          <label className="dl-setting-row"><span>動作情報を表示</span><input type="checkbox" checked={showStats} onChange={e => setShowStats(e.target.checked)}/><span className="dl-switch"/></label>
          <button className="dl-pause-setting" onClick={() => { change({ paused: !options.paused }); setSettings(false); }}>{options.paused ? '再開する' : '一時停止'}</button>
        </div>}</div></div>
      </div>
      <p className="dl-play-instructions" id="fusion-instructions">{preset === 'mix' ? '自由な混色の実験です。異なる色も、触れると混ざります。' : 'つかんで、同じ色へ。融合したあとも、そのまま動かせます。'}<span>R で並べ直す · Esc で一時停止</span></p>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>かたちがつながり、色がなじむ。融合の試作。</p></div><div className="dl-footer-right">{showStats && <output className="dl-stats">{Math.round(stats.fps)} fps <span>p95 {stats.p95.toFixed(1)} ms</span></output>}<a href="?play=chapters">三つの道へ<ArrowUpRight size={14}/></a><a href="?lab=droplets">一粒の実験へ<ArrowUpRight size={14}/></a></div></footer>
  </div></div>;
}
