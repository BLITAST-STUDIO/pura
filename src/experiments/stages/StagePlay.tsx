import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue, purityOf, type HueId } from '../../game/palette';
import { getLevel, LEVELS, SANDBOX_COUNT } from '../../game/levels';
import type { CoreStat } from '../../game/sim';
import { clampSandboxCount, StageSimulation, stageDropHeight, STAGE_IDS, type MixRule, type StageMode, type StageScale } from './simulation';
import type { ScoreBreakdown } from './score';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { LookPicker } from '../look-picker';
import { initialLook, initialUi, type Look, type Ui } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import './stages.css';

const HUE_NAMES: Record<HueId, string> = { cyan: 'シアン', rose: 'ローズ', amber: 'アンバー' };
const BEST_KEY = 'pura-flow-stages-v1';
const SCORE_KEY = 'pura-flow-score-v1';
type Reading = { cores: CoreStat[]; held: { hue: HueId; purity: number } | null; count: number; won: { stars: number; time: number } | null;
  score: { running: number; combo: number; spits: number; note: { kind: 'combo' | 'spit'; value: number } | null; result: ScoreBreakdown | null } | null };

function readBest(key = BEST_KEY): Record<number, number> {
  try { const d = JSON.parse(localStorage.getItem(key) ?? 'null'); return d?.v === 1 && d.best ? d.best : {}; } catch { return {}; }
}
function writeBest(best: Record<number, number>, key = BEST_KEY) {
  try { localStorage.setItem(key, JSON.stringify({ v: 1, best })); } catch { /* play continues without records */ }
}
function setQuery(values: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
  window.history.replaceState(window.history.state, '', url);
}

export default function StagePlay() {
  const query = new URLSearchParams(window.location.search);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<StageSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [stage, setStage] = useState(() => { const id = Number(query.get('stage') ?? 1); return STAGE_IDS.includes(id) ? id : 1; });
  const [scale, setScale] = useState<StageScale>(() => query.get('scale') === 'original' ? 'original' : 'large');
  const [mix, setMix] = useState<MixRule>(() => query.get('mix') === 'legacy' ? 'legacy' : 'press');
  const [mode, setMode] = useState<StageMode>(() => query.get('mode') === 'score' ? 'score' : 'stage');
  const [bestScore, setBestScore] = useState(() => readBest(SCORE_KEY));
  const [sandboxCount, setSandboxCount] = useState(() => clampSandboxCount(Number(query.get('count') ?? SANDBOX_COUNT.fallback)));
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [reading, setReading] = useState<Reading>({ cores: [], held: null, count: 0, won: null, score: null });
  const [best, setBest] = useState(readBest);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const def = getLevel(stage)!;

  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    setQuery({ play: 'stages', stage: String(stage), scale, mix, mode, ...(def.sandbox ? { count: String(sandboxCount) } : {}) });
    const sim = new StageSimulation({ stage, scale, mix, sandboxCount, mode }); simulation.current = sim;
    let done: boolean[] = [];
    let celebrated = false;
    const update = () => {
      if (!alive) return;
      const cores = def.sandbox ? [] : sim.core.coreStats();
      // A colour's core newly complete rings its bell; the clear plays the finale.
      cores.forEach((c, i) => { if (c.done && done[i] === false && !sim.won) feedback.ready(c.hue); });
      done = cores.map(c => c.done);
      if (sim.won && !celebrated) {
        celebrated = true;
        feedback.delivered(cores.at(-1)?.hue ?? 'cyan', true);
        setBest(previous => {
          const next = { ...previous, [stage]: Math.max(previous[stage] ?? 0, sim.won!.stars) };
          writeBest(next); return next;
        });
        const total = sim.score?.result?.total;
        if (total !== undefined) setBestScore(previous => {
          const next = { ...previous, [stage]: Math.max(previous[stage] ?? 0, total) };
          writeBest(next, SCORE_KEY); return next;
        });
      }
      if (!sim.won) celebrated = false;
      const held = sim.core.drops.find(d => d.id === sim.core.grabbedId);
      setReading({ cores, count: sim.core.drops.length, won: sim.won ? { stars: sim.won.stars, time: sim.won.time } : null,
        held: held ? { hue: dominantHue(held.pigment), purity: purityOf(held.pigment) } : null,
        score: sim.score ? { running: sim.score.running, combo: sim.score.combo(sim.core.time), spits: sim.score.spits, result: sim.score.result,
          note: sim.lastNote && sim.core.time - sim.lastNote.time < 1.1 ? { kind: sim.lastNote.kind, value: sim.lastNote.value } : null } : null });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [stage, scale, mix, sandboxCount, mode, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, stage, scale, mix, sandboxCount, mode, retry, look]);
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
  const choose = (id: number) => { setStage(id); setPaused(false); window.scrollTo(0, 0); };
  const next = LEVELS.find(l => l.id === stage + 1);

  return <div className="droplet-lab purity-scene stage-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>STAGE <b>{def.code}</b></span></div></header>
    <ModeNav current={mode === 'score' ? 'score' : 'stages'} onSelect={{ stages: () => setMode('stage'), score: () => { setMode('score'); if (def.sandbox) setStage(1); } }}/>
    <main>
      <nav className="stage-picker" aria-label="ステージを選ぶ">{STAGE_IDS.map(id => { const l = getLevel(id)!; return <button key={id} aria-current={id === stage ? 'step' : undefined} onClick={() => choose(id)}><span>{l.code}</span><small>{l.sandbox ? 'サンド' : '★'.repeat(best[id] ?? 0) || l.name}</small></button>; })}</nav>
      {def.sandbox && <div className="stage-compare"><div><span>雫の数</span><select value={sandboxCount} onChange={e => setSandboxCount(clampSandboxCount(Number(e.target.value)))}>{Array.from({ length: (SANDBOX_COUNT.max - SANDBOX_COUNT.min) / SANDBOX_COUNT.step + 1 }, (_, i) => SANDBOX_COUNT.min + i * SANDBOX_COUNT.step).map(n => <option key={n} value={n}>{n}</option>)}</select></div></div>}
      {mode === 'score' && !def.sandbox && <p className="stage-best">スコアアタック · この面のベスト {bestScore[stage] ?? '—'}</p>}
      <p className="stage-title"><b>{def.name}</b>{def.hint}</p>
      <section className="dl-stage purity-stage stage-board" aria-label={`ステージ ${def.code} ${def.name}`} aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={def.hint}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : reading.won ? 'CLEAR' : `STAGE ${def.code}`}</span><span className="dl-stage-index">{reading.count}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {reading.score && !reading.score.result && <div className="stage-score" aria-live="off"><b>{reading.score.running}</b>{reading.score.combo > 1 && <span className="is-combo">コンボ ×{reading.score.combo}</span>}{reading.score.note && <span className={reading.score.note.kind === 'spit' ? 'is-spit' : 'is-gain'}>{reading.score.note.kind === 'spit' ? `吐き出し ${reading.score.note.value}` : `+${reading.score.note.value}`}</span>}</div>}
        {reading.score?.result && <div className="stage-result" role="status"><strong>{reading.score.result.total}</strong><small>クリア {reading.score.result.clear} · 純度 {reading.score.result.purity} · 速さ {reading.score.result.speed} · コンボ {reading.score.result.combo} · 吐き出し {reading.score.result.spit}</small></div>}
        {reading.won && <div className="stage-clear" role="status"><span>{'★'.repeat(reading.won.stars)}<i>{'★'.repeat(3 - reading.won.stars)}</i></span><small>{Math.round(reading.won.time)}秒</small>{next && <button onClick={() => choose(next.id)}>次へ <ArrowUpRight size={13}/></button>}</div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{reading.held ? `${HUE_NAMES[reading.held.hue]} · 純度 ${Math.floor(reading.held.purity * 100 + 1e-8)}%` : `${reading.count} DROPS`}</output><span>{def.sandbox ? 'SANDBOX' : `純度 ${Math.round(def.purity * 100)}% 以上`}</span></div>
      </section>
      {!def.sandbox && <div className="stage-cores">{reading.cores.map(c => <div key={c.hue} data-color={c.hue} className={c.done ? 'is-done' : ''}>
        <span>{HUE_NAMES[c.hue]}の核</span><i><b style={{ width: `${Math.min(100, c.mass / c.target * 100)}%` }}/></i><small>{c.done ? '達成' : `${Math.floor(Math.min(1, c.mass / c.target) * 100)}%`}</small>
      </div>)}</div>}
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>やり直す</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>色ごとに、その色の{Math.round(def.targetFrac * 100)}%以上を一つの核に集めます。核の純度が{Math.round(def.purity * 100)}%以上で達成。全色そろうとクリアです。</p>
        <p>違う色はぶつかると跳ね返ります。つかんで押し込むと混ざり、純度が下がります。混ざった雫は素早く2回タップすると、入った色を取り出せます。</p>
        <p>星: 平均純度99.5%以上で3つ、必要純度+4%以上で2つ。時間制限はありません。</p>
        {mode === 'score' && <p>スコアアタック: クリアの基本点に、純度と速さのボーナス。1.2秒以内に同じ色の融合を続けるとコンボで加点。混ざった融合でコンボは途切れます。吐き出し（2回タップ）は使うたびに減点、取り出す量が多いほど大きく減ります。</p>}
        <div className="stage-compare" role="group" aria-label="比較用の設定">
          <div><span>雫の大きさ</span><button aria-pressed={scale === 'large'} onClick={() => setScale('large')}>大きめ</button><button aria-pressed={scale === 'original'} onClick={() => setScale('original')}>元祖の大きさ</button></div>
          <div><span>混ぜ方</span><button aria-pressed={mix === 'press'} onClick={() => setMix('press')}>押し込み0.35秒</button><button aria-pressed={mix === 'legacy'} onClick={() => setMix('legacy')}>元祖の判定（難しめ）</button></div>
        </div>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：やり直す · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>元祖の8ステージ、テストプレイ。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=free">自由モード<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="?play=open">三色で自由に<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
