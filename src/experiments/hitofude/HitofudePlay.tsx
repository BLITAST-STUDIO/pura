import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw, Send, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { dominantHue } from '../../game/palette';
import { HitofudeSimulation, shotLimit, type ShotResult } from './simulation';
import { SHOT_BOARDS } from './boards';
import { holeStrokes, relative, Round, ROUND_LABELS, roundHoles, scoreName, totals, type Card, type RoundKind } from './golf';
import { challengeFrom, challengeOutcome, challengeText, challengeUrl } from './share';
import { stageDropHeight } from '../stages/simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { ModeNav } from '../mode-nav';
import { ClearGlow } from '../clear-glow';
import { LookPicker } from '../look-picker';
import { useWalls } from '../walls';
import { initialLook, initialUi, type Look, type Ui } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import './hitofude.css';

const RECORD_KEY = 'pura-flow-hitofude-v2';
const PARS = SHOT_BOARDS.map(b => b.par);
const IDS = SHOT_BOARDS.map(b => b.id);
const HALVES = [{ label: 'OUT', holes: SHOT_BOARDS.slice(0, 9) }, { label: 'IN', holes: SHOT_BOARDS.slice(9, 18) }];
/** Best strokes per hole, and the best round (against par) per kind; `round` was the front nine before the back nine existed. */
type Records = { best: Record<number, number>; round: number | null; rounds?: Partial<Record<RoundKind, number>> };
type Reading = { shots: number; left: number; remaining: number; result: ShotResult | null };

function readRecords(): Records {
  try {
    const d = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null');
    if (d?.v === 2) return { best: d.best ?? {}, round: d.round ?? null, rounds: d.rounds ?? (d.round !== null && d.round !== undefined ? { out: d.round } : {}) };
  } catch { /* no records yet */ }
  return { best: {}, round: null, rounds: {} };
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
  // A round plays its holes in order; null is free practice.
  const round = useRef<{ kind: RoundKind; ids: number[]; play: Round } | null>(null);
  const [challenge] = useState(() => challengeFrom(window.location.search));
  const [shared, setShared] = useState('');
  const [roundCard, setRoundCard] = useState<Card | null>(null);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const walls = useWalls();
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
        let finished: { kind: RoundKind; diff: number } | null = null;
        if (r && r.ids[r.play.hole] === board.id) {
          r.play.record(strokes); setRoundCard([...r.play.card]);
          if (r.play.finished) finished = { kind: r.kind, diff: r.play.totals.diff };
        }
        setRecords(previous => {
          const best = { ...previous.best, [board.id]: Math.min(previous.best[board.id] ?? Infinity, strokes) };
          const rounds = { ...previous.rounds };
          if (finished) rounds[finished.kind] = Math.min(rounds[finished.kind] ?? Infinity, finished.diff);
          const next = { best, round: previous.round, rounds };
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
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, walls, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, boardId, retry, look, walls]);
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
  const startRound = (kind: RoundKind) => {
    const holes = roundHoles(kind, SHOT_BOARDS);
    round.current = { kind, ids: holes.map(b => b.id), play: new Round(holes.map(b => b.par)) };
    setRoundCard([...round.current.play.card]); go(holes[0].id);
  };
  const restartRound = () => { if (round.current) startRound(round.current.kind); };
  const practice = () => { round.current = null; setRoundCard(null); };
  const share = async (strokes: number) => {
    const url = challengeUrl(window.location.href, board.id, strokes), text = challengeText(board, strokes);
    try {
      if (navigator.share) { await navigator.share({ title: 'PURA ひとふで', text, url }); setShared('送りました'); }
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared('リンクをコピーしました'); }
    } catch { setShared(''); }
  };
  const result = reading.result;
  const strokes = result ? holeStrokes(result, board.par) : null;
  const inRound = roundCard !== null;
  const kind = round.current?.kind ?? null;
  const roundIds = round.current?.ids ?? [];
  const next = inRound ? SHOT_BOARDS.find(b => b.id === roundIds[roundIds.indexOf(board.id) + 1]) : SHOT_BOARDS[index + 1];
  const roundDone = inRound && roundCard.every(s => s !== null);
  // The card shows all eighteen holes: this round's strokes, or each hole's best in practice.
  const card: Card = SHOT_BOARDS.map(b => inRound ? (roundIds.includes(b.id) ? roundCard[roundIds.indexOf(b.id)] : null) : records.best[b.id] ?? null);
  const sum = inRound ? totals(roundCard, roundIds.map(id => SHOT_BOARDS.find(b => b.id === id)!.par)) : totals(card, PARS);
  const holeInOne = !!result?.cleared && result.shots === 1;
  const best = (k: RoundKind) => records.rounds?.[k];

  return <div className="droplet-lab purity-scene stage-play hitofude-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>ひとふで</span><span className="dl-edition-rule"/><span>HOLE <b>{board.code}</b></span></div></header>
    <ModeNav current="hitofude"/>
    <main>
      <div className="stage-modes hitofude-modes" role="group" aria-label="回り方"><button aria-pressed={!inRound} onClick={practice}>練習</button>
        {(['out', 'in', 'full'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => startRound(k)}>{ROUND_LABELS[k]}</button>)}
        <span>{inRound ? `${Math.min(roundIds.length, sum.holes + (roundDone ? 0 : 1))}/${roundIds.length} · ${relative(sum.diff)}` : best('full') !== undefined ? `18H ベスト ${relative(best('full')!)}` : best('out') !== undefined ? `前半ベスト ${relative(best('out')!)}` : ''}</span></div>
      {HALVES.map(half => <nav key={half.label} className="stage-picker hitofude-holes" aria-label={`${half.label}のホールを選ぶ`}>{half.holes.map(b => {
        const s2 = card[IDS.indexOf(b.id)];
        return <button key={b.id} aria-current={b.id === board.id ? 'step' : undefined} disabled={inRound && b.id !== board.id} onClick={() => go(b.id)}>
          <span>{b.code}</span><small>{s2 === null ? `P${b.par}` : relative(s2 - b.par)}</small></button>;
      })}</nav>)}
      {challenge !== null && <p className="hitofude-challenge">挑戦状: この盤面を{challenge}打で決めた人がいます。</p>}
      <p className="stage-title"><b>{board.name}</b>{board.hint}<span className="hole-par">パー{board.par}</span></p>
      <section className="dl-stage purity-stage stage-board" aria-label={`ひとふで ホール${board.code} ${board.name}`} aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label={board.hint}/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : `HOLE ${board.code} · PAR ${board.par}`}</span><span className="dl-stage-index">{reading.remaining}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {holeInOne && !reduced && <div className="hole-in-one" aria-hidden="true"><i/><b>ひとふで</b></div>}
        <ClearGlow show={!!result?.cleared && !holeInOne}/>
        {result && strokes !== null && <div className="stage-clear" role="status">
          <span className="hole-score">{result.cleared ? scoreName(strokes, board.par) : 'ギブアップ'}</span><small>{relative(strokes - board.par)} · {strokes}打{challenge !== null && result.cleared ? ` · ${challengeOutcome(strokes, challenge)}` : ''}</small>
          {result.cleared && !inRound && <button className="share" aria-label="この盤面を送る" onClick={() => share(strokes)}><Send size={12}/></button>}
          {inRound ? (next && !roundDone && <button onClick={() => go(next.id)}>次のホールへ <ArrowUpRight size={13}/></button>)
            : result.cleared ? (next && <button onClick={() => go(next.id)}>次へ <ArrowUpRight size={13}/></button>) : <button onClick={again}>もう一度 <RotateCcw size={12}/></button>}
        </div>}
        {shared && <p className="hitofude-shared" role="status" onAnimationEnd={() => setShared('')}>{shared}</p>}
        {roundDone && <div className="round-summary" role="status"><small>{kind ? ROUND_LABELS[kind] : ''} 終了</small><strong>{relative(sum.diff)}</strong><span>{sum.strokes}打 · パー{sum.par}{kind && best(kind) === sum.diff ? ' · ベスト' : ''}</span><button onClick={restartRound}>もう一度回る <RotateCcw size={12}/></button></div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{result?.cleared ? 'ひとつに' : `あと ${reading.remaining} つ`}</output><span>{reading.shots}打目{reading.shots ? 'まで' : ''}</span></div>
      </section>
      <div className="shot-meter" aria-label={`のこり ${reading.left}打`}><span>のこり</span>{Array.from({ length: shotLimit(board.par) }, (_, i) => <i key={i} className={i < reading.left ? 'is-left' : ''}/>)}<small>{board.min === 1 ? '最少1打（ひとふで）' : `最少${board.min}打`}</small></div>
      {HALVES.map((half, h) => {
        const offset = h * 9, pars = PARS.slice(offset, offset + 9), part = card.slice(offset, offset + 9), sub = totals(part, pars);
        return <table key={half.label} className="scorecard" aria-label={`${half.label} ${inRound ? 'このラウンド' : 'ベスト'}`}>
          <thead><tr><th>{half.label}</th>{half.holes.map(b => <th key={b.id} className={b.id === board.id ? 'is-current' : ''}>{b.id}</th>)}<th>計</th></tr></thead>
          <tbody>
            <tr><th>パー</th>{pars.map((p, i) => <td key={i}>{p}</td>)}<td>{pars.reduce((x, y) => x + y, 0)}</td></tr>
            <tr><th>{inRound ? '打数' : 'ベスト'}</th>{part.map((v, i) => <td key={i} data-under={v !== null && v < pars[i] ? '' : undefined} data-one={v === 1 ? '' : undefined}>{v ?? '·'}</td>)}<td>{sub.holes ? relative(sub.diff) : '·'}</td></tr>
          </tbody>
        </table>;
      })}
      <div className="purity-actions">
        {inRound ? <button onClick={restartRound} disabled={status !== 'ready'}><RotateCcw size={15}/><span>最初から回り直す</span></button>
          : <button onClick={again} disabled={status !== 'ready'}><RotateCcw size={15}/><span>やり直す</span></button>}
        <button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>雫に触れて、引いて、離す。雫は反対の向きへ滑り出します。遠くまで引くほど強く、床の点線が向きと強さの目安です。短く引いただけなら、打数に数えません。</p>
        <p>同じ色は触れるとひとつに、違う色ははじき合います（当てて押し出すこともできます）。石は動きません。色ごとにひとつにまとめたらホールアウト。</p>
        <p>パーより少ない打数ほど良いスコア。1打で決めると「ひとふで」。パー+3打で決まらなければギブアップ（パー+4として数えます）。練習は何度でもやり直せます。ラウンドは前半9（1〜9番）・後半9（10〜18番）・18ホールから選び、一度ずつ回ります。決めたホールは、送るボタンから「この盤面、◯打で決めた」と友だちに送れます。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
        <p>R：やり直す（練習） · Esc：一時停止</p>
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>18ホール。引いて、離して、ひとつに。</p></div></footer>
  </div></div>;
}
