import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue, purityOf, type HueId } from '../../game/palette';
import type { CoreStat } from '../../game/sim';
import { MichiSimulation, type RingState } from './simulation';
import { chapterOf, MICHI, MICHI_BOARDS, michiBoard, nextBoard } from './boards';
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
import './michi.css';

const HUE_NAMES: Record<HueId, string> = { cyan: 'シアン', rose: 'ローズ', amber: 'アンバー' };
const RECORD_KEY = 'pura-flow-michi-v1';
type Records = { best: Record<number, number>; last: number };
type Reading = { cores: CoreStat[]; rings: RingState[]; held: { hue: HueId; purity: number } | null; count: number; won: { stars: number; time: number } | null; elapsed: number; separations: number };

function readRecords(): Records {
  try { const d = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null'); if (d?.v === 1) return { best: d.best ?? {}, last: d.last ?? MICHI_BOARDS[0].id }; } catch { /* no records yet */ }
  return { best: {}, last: MICHI_BOARDS[0].id };
}
function writeRecords(records: Records) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify({ v: 1, ...records })); } catch { /* play continues without records */ }
}

export default function MichiPlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<MichiSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [records, setRecords] = useState(readRecords);
  const [boardId, setBoardId] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('board'));
    return MICHI_BOARDS.some(b => b.id === id) ? id : michiBoard(records.last).id;
  });
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [reading, setReading] = useState<Reading>({ cores: [], rings: [], held: null, count: 0, won: null, elapsed: 0, separations: 0 });
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const walls = useWalls();
  const board = michiBoard(boardId);
  const chapter = chapterOf(board.id);

  useEffect(() => {
    let alive = true;
    setStatus('loading'); setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('play', 'michi'); url.searchParams.set('board', String(board.id));
    window.history.replaceState(window.history.state, '', url);
    setRecords(previous => { const next = { ...previous, last: board.id }; writeRecords(next); return next; });
    const sim = new MichiSimulation(board.id); simulation.current = sim;
    let done: boolean[] = [];
    let celebrated = false;
    const update = () => {
      if (!alive) return;
      const cores = board.rings ? [] : sim.core.coreStats();
      const rings = sim.rings();
      // A goal newly met rings its bell; the clear plays the finale.
      const met = board.rings ? rings.map(r => r.delivered) : cores.map(c => c.done);
      met.forEach((m, i) => { if (m && done[i] === false && !sim.won) feedback.ready(board.rings ? rings[i].hue : cores[i].hue); });
      done = met;
      if (sim.won && !celebrated) {
        celebrated = true;
        feedback.delivered(board.rings?.at(-1)?.hue ?? cores.at(-1)?.hue ?? 'cyan', true);
        setRecords(previous => {
          const next = { ...previous, best: { ...previous.best, [board.id]: Math.max(previous.best[board.id] ?? 0, sim.won!.stars) } };
          writeRecords(next); return next;
        });
      }
      if (!sim.won) celebrated = false;
      const held = sim.core.drops.find(d => d.id === sim.core.grabbedId);
      setReading({ cores, rings, count: sim.core.drops.length, won: sim.won ? { stars: sim.won.stars, time: sim.won.time } : null,
        elapsed: sim.core.elapsed, separations: sim.separations,
        held: held ? { hue: dominantHue(held.pigment), purity: purityOf(held.pigment) } : null });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight, obstacles: board.stones,
        goals: board.rings ? () => sim.rings().map((r, i) => ({ ...board.rings![i], ready: r.ready, completed: r.delivered })) : undefined });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [boardId, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, walls, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, boardId, retry, look, walls]);
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
  const choose = (id: number) => { setBoardId(id); setRetry(v => v + 1); setPaused(false); window.scrollTo(0, 0); };
  const next = nextBoard(board.id);
  const stars = (id: number) => records.best[id] ?? 0;
  const discovery = board.discovery && !reading.won && reading.separations === 0 && reading.elapsed > board.discovery.after ? board.discovery.text : null;

  return <div className="droplet-lab purity-scene stage-play michi-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>道</span><span className="dl-edition-rule"/><span>BOARD <b>{board.code}</b></span></div></header>
    <ModeNav current="michi"/>
    <main>
      <nav className="michi-chapters" aria-label="章を選ぶ">{MICHI.map(c => {
        const earned = c.boards.reduce((n, b) => n + stars(b.id), 0);
        return <button key={c.id} aria-current={c.id === chapter.id ? 'step' : undefined} onClick={() => choose(c.boards[0].id)}>
          <span>第{c.id}章</span><b>{c.name}</b><small>★{earned}/{c.boards.length * 3}</small></button>;
      })}</nav>
      <p className="michi-lead">{chapter.lead}</p>
      <nav className="stage-picker michi-boards" aria-label="面を選ぶ" style={{ gridTemplateColumns: `repeat(${chapter.boards.length}, 1fr)` }}>{chapter.boards.map(b =>
        <button key={b.id} aria-current={b.id === board.id ? 'step' : undefined} onClick={() => choose(b.id)}><span>{b.code}</span><small>{'★'.repeat(stars(b.id)) || b.name}</small></button>)}</nav>
      <p className="stage-title"><b>{board.name}</b>{board.hint}</p>
      <section className="dl-stage purity-stage stage-board" aria-label={`道 ${board.code} ${board.name}`} aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={board.hint}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : reading.won ? 'CLEAR' : `MICHI ${board.code}`}</span><span className="dl-stage-index">{reading.count}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {reading.won && <div className="stage-clear" role="status"><span>{'★'.repeat(reading.won.stars)}<i>{'★'.repeat(3 - reading.won.stars)}</i></span><small>{Math.round(reading.won.time)}秒</small>{next && <button onClick={() => choose(next.id)}>次へ <ArrowUpRight size={13}/></button>}</div>}
        {discovery && <p className="stage-discovery" role="status">{discovery}</p>}
        <div className="dl-stage-bottom"><output aria-live="polite">{reading.held ? `${HUE_NAMES[reading.held.hue]} · 純度 ${Math.floor(reading.held.purity * 100 + 1e-8)}%` : `${reading.count} DROPS`}</output><span>純度 {Math.round(board.purity * 100)}% 以上</span></div>
      </section>
      <div className="stage-cores">
        {reading.cores.map(c => <div key={c.hue} data-color={c.hue} className={c.done ? 'is-done' : ''}>
          <span>{HUE_NAMES[c.hue]}の核</span><i><b style={{ width: `${Math.min(100, c.mass / c.target * 100)}%` }}/></i><small>{c.done ? '達成' : `${Math.floor(Math.min(1, c.mass / c.target) * 100)}%`}</small></div>)}
        {reading.rings.map(r => <div key={r.hue} data-color={r.hue} className={r.delivered ? 'is-done' : ''}>
          <span>{HUE_NAMES[r.hue]}を輪へ</span><i><b style={{ width: `${Math.min(100, r.gathered * 100)}%` }}/></i><small>{r.delivered ? '届いた' : r.ready ? (r.inRing ? '…' : '輪へ') : `${Math.floor(Math.min(1, r.gathered) * 100)}%`}</small></div>)}
      </div>
      <div className="purity-actions"><button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>やり直す</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>{board.rings
          ? `色ごとに全部をひとつにまとめ、純度${Math.round(board.purity * 100)}%以上のまま、その色の輪の中へ。止まって少し待つと届きます。`
          : `色ごとに、その色の${Math.round(board.targetFrac * 100)}%以上をひとつの核に集めます。核の純度が${Math.round(board.purity * 100)}%以上で達成。全色そろうとクリアです。`}</p>
        <p>どの面も同じ決まりです。同じ色は触れるとひとつに、違う色ははじき合います。つかんで押し込むと混ざり、純度が下がります。混ざった雫は素早く2回たたくと、入った色を取り出せます。</p>
        <p>星: 純度99.5%以上で3つ、必要な純度+4%以上で2つ。時間制限はありません。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：やり直す · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>道、四つの章。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=stages">元祖8ステージ<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="?play=chapters">三つの道（旧）<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
