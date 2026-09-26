import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue } from '../../game/palette';
import { HitofudeSimulation, shotLimit, type ShotResult } from './simulation';
import { SHOT_BOARDS } from './boards';
import { holeStrokes, relative, Round, scoreName, totals, type Card } from './golf';
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

const RECORD_KEY = 'pura-flow-hitofude-v2';
const PARS = SHOT_BOARDS.map(b => b.par);
type Records = { best: Record<number, number>; round: number | null };
type Reading = { shots: number; left: number; remaining: number; result: ShotResult | null };

function readRecords(): Records {
  try { const d = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null'); if (d?.v === 2) return { best: d.best ?? {}, round: d.round ?? null }; } catch { /* no records yet */ }
  return { best: {}, round: null };
}
function writeRecords(records: Records) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify({ v: 2, ...records })); } catch { /* play continues without records */ }
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
  const [records, setRecords] = useState(readRecords);
  // A round plays the nine holes in order; null is free practice.
  const round = useRef<Round | null>(null);
  const [roundCard, setRoundCard] = useState<Card | null>(null);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const index = Math.max(0, SHOT_BOARDS.findIndex(b => b.id === boardId));
  const board = SHOT_BOARDS[index];

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
        const strokes = holeStrokes(result, board.par);
        if (result.cleared) {
          const biggest = [...sim.core.drops].sort((a, b) => b.mass - a.mass)[0];
          const hue = biggest ? dominantHue(biggest.pigment) : 'cyan';
          // The namesake shot rings twice.
          if (result.shots === 1) { feedback.ready(hue); window.setTimeout(() => feedback.delivered(hue, true), 220); }
          else feedback.delivered(hue, true);
        }
        const r = round.current;
        let roundDiff: number | null = null;
        if (r && r.hole === index) {
          r.record(strokes); setRoundCard([...r.card]);
          if (r.finished) roundDiff = r.totals.diff;
        }
        setRecords(previous => {
          const best = { ...previous.best, [board.id]: Math.min(previous.best[board.id] ?? Infinity, strokes) };
          const next = { best, round: roundDiff === null ? previous.round : Math.min(previous.round ?? Infinity, roundDiff) };
          writeRecords(next); return next;
        });
      }
      if (!result) announced = false;
      setReading({ shots: sim.shots, left: sim.shotsLeft, remaining: sim.remaining, result });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight, aim: () => sim.aim, obstacles: board.stones });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [boardId, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, boardId, retry, look]);
  const again = () => { if (round.current) return; experience.current?.restoreState(() => simulation.current?.reset()); setPaused(false); };
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
  const go = (id: number) => { setBoardId(id); setRetry(v => v + 1); setPaused(false); window.scrollTo(0, 0); };
  const startRound = () => { round.current = new Round(PARS); setRoundCard([...round.current.card]); go(SHOT_BOARDS[0].id); };
  const practice = () => { round.current = null; setRoundCard(null); };
  const result = reading.result;
  const strokes = result ? holeStrokes(result, board.par) : null;
  const next = SHOT_BOARDS[index + 1];
  const inRound = roundCard !== null;
  const roundDone = inRound && roundCard.every(s => s !== null);
  const card: Card = roundCard ?? SHOT_BOARDS.map(b => records.best[b.id] ?? null);
  const sum = totals(card, PARS);
  const holeInOne = !!result?.cleared && result.shots === 1;

  return <div className="droplet-lab purity-scene stage-play hitofude-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>ひとふで</span><span className="dl-edition-rule"/><span>HOLE <b>{board.code}</b></span></div></header>
    <ModeNav current="hitofude"/>
    <main>
      <div className="stage-modes" role="group" aria-label="回り方"><button aria-pressed={!inRound} onClick={practice}>練習</button><button aria-pressed={inRound} onClick={startRound}>ラウンド</button>
        <span>{inRound ? `${Math.min(9, sum.holes + (roundDone ? 0 : 1))}/9 ホール · ${relative(sum.diff)}` : `ラウンドのベスト ${records.round === null ? '—' : relative(records.round)}`}</span></div>
      <nav className="stage-picker" aria-label="ホールを選ぶ">{SHOT_BOARDS.map((b, i) => {
        const s = card[i];
        return <button key={b.id} aria-current={b.id === board.id ? 'step' : undefined} disabled={inRound && b.id !== board.id} onClick={() => go(b.id)}>
          <span>{b.code}</span><small>{s === null ? `P${b.par}` : relative(s - b.par)}</small></button>;
      })}</nav>
      <p className="stage-title"><b>{board.name}</b>{board.hint}<span className="hole-par">パー{board.par}</span></p>
      <section className="dl-stage purity-stage stage-board" aria-label={`ひとふで ホール${board.code} ${board.name}`} aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={board.hint}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : `HOLE ${board.code} · PAR ${board.par}`}</span><span className="dl-stage-index">{reading.remaining}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {holeInOne && !reduced && <div className="hole-in-one" aria-hidden="true"><i/><b>ひとふで</b></div>}
        {result && strokes !== null && <div className="stage-clear" role="status">
          <span className="hole-score">{result.cleared ? scoreName(strokes, board.par) : 'ギブアップ'}</span><small>{relative(strokes - board.par)} · {strokes}打</small>
          {inRound ? (next && !roundDone && <button onClick={() => go(next.id)}>次のホールへ <ArrowUpRight size={13}/></button>)
            : result.cleared ? (next && <button onClick={() => go(next.id)}>次へ <ArrowUpRight size={13}/></button>) : <button onClick={again}>もう一度 <RotateCcw size={12}/></button>}
        </div>}
        {roundDone && <div className="round-summary" role="status"><small>ラウンド終了</small><strong>{relative(sum.diff)}</strong><span>{sum.strokes}打 · パー{sum.par}{records.round === sum.diff ? ' · ベスト' : ''}</span><button onClick={startRound}>もう一度回る <RotateCcw size={12}/></button></div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{result?.cleared ? 'ひとつに' : `あと ${reading.remaining} つ`}</output><span>{reading.shots}打目{reading.shots ? 'まで' : ''}</span></div>
      </section>
      <div className="shot-meter" aria-label={`のこり ${reading.left}打`}><span>のこり</span>{Array.from({ length: shotLimit(board.par) }, (_, i) => <i key={i} className={i < reading.left ? 'is-left' : ''}/>)}<small>{board.min === 1 ? '最少1打（ひとふで）' : `最少${board.min}打`}</small></div>
      <table className="scorecard" aria-label={inRound ? 'このラウンドのスコア' : '各ホールのベスト'}>
        <thead><tr><th>{inRound ? 'ラウンド' : 'ベスト'}</th>{SHOT_BOARDS.map(b => <th key={b.id} className={b.id === board.id ? 'is-current' : ''}>{b.id}</th>)}<th>計</th></tr></thead>
        <tbody>
          <tr><th>パー</th>{PARS.map((p, i) => <td key={i}>{p}</td>)}<td>{PARS.reduce((a, b) => a + b, 0)}</td></tr>
          <tr><th>打数</th>{card.map((s, i) => <td key={i} data-under={s !== null && s < PARS[i] ? '' : undefined} data-one={s === 1 ? '' : undefined}>{s ?? '·'}</td>)}<td>{sum.holes ? relative(sum.diff) : '·'}</td></tr>
        </tbody>
      </table>
      <div className="purity-actions">
        {inRound ? <button onClick={startRound} disabled={status !== 'ready'}><RotateCcw size={15}/><span>1番から回り直す</span></button>
          : <button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>やり直す</span></button>}
        <button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>雫に触れて、引いて、離す。雫は反対の向きへ滑り出します。遠くまで引くほど強く、床の点線が向きと強さの目安です。短く引いただけなら、打数に数えません。</p>
        <p>同じ色は触れるとひとつに、違う色ははじき合います（当てて押し出すこともできます）。石は動きません。色ごとにひとつにまとめたらホールアウト。</p>
        <p>パーより少ない打数ほど良いスコア。1打で決めると「ひとふで」。パー+3打で決まらなければギブアップ（パー+4として数えます）。練習は何度でもやり直せ、ラウンドは1番から9番まで一度ずつ回ります。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：やり直す（練習） · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>ひとふで、9ホールの試作コース。</p></div><span className="open-links"><a className="purity-lab-link" href="?play=stages">ステージ<ArrowUpRight size={14}/></a> <a className="purity-lab-link" href="./">三色で自由に<ArrowUpRight size={14}/></a></span></footer>
  </div></div>;
}
