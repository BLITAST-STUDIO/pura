import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { CurlingSimulation, ENDS, HACK, HOG_Y, HOUSE, SHEET, STONES_PER_END, type EndResult, type Phase, type Team } from './simulation';
import { Planner } from './ai';
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
import '../hitofude/hitofude.css';
import './curling.css';

type Players = 'cpu' | 'two';
const NAMES: Record<Team, string> = { cyan: 'シアン', rose: 'ローズ' };
const RECORD_KEY = 'pura-flow-curling-v1';
type Reading = { end: number; ends: EndResult[]; turn: Team; hammer: Team; phase: Phase; left: Record<Team, number>; totals: Record<Team, number>;
  lastEnd: EndResult | null; standing: EndResult; note: 'hog' | 'out' | null; winner: Team | 'draw' | null; thinking: boolean };
const MARKINGS = {
  rings: [...HOUSE.rings.map(r => ({ x: HOUSE.x, y: HOUSE.y, r })), { x: HOUSE.x, y: HOUSE.y, r: 4, fill: true }, { x: HACK.x, y: HACK.y, r: 24 }],
  lines: [{ x0: 22, y0: HOG_Y, x1: SHEET.width - 22, y1: HOG_Y }, { x0: HOUSE.x, y0: HOUSE.y - HOUSE.r - 14, x1: HOUSE.x, y1: HOUSE.y + HOUSE.r + 14 },
    { x0: HOUSE.x - HOUSE.r - 14, y0: HOUSE.y, x1: HOUSE.x + HOUSE.r + 14, y1: HOUSE.y }],
};

function readRecord(): { wins: number; games: number } {
  try { const d = JSON.parse(localStorage.getItem(RECORD_KEY) ?? 'null'); if (d?.v === 1) return { wins: d.wins ?? 0, games: d.games ?? 0 }; } catch { /* none yet */ }
  return { wins: 0, games: 0 };
}

export default function CurlingPlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulation = useRef<CurlingSimulation | null>(null);
  const experience = useRef<ReturnType<typeof createFusionExperience> | null>(null);
  const [players, setPlayers] = useState<Players>(() => new URLSearchParams(window.location.search).get('vs') === 'two' ? 'two' : 'cpu');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [quality, setQuality] = useState<FusionOptions['quality']>('high');
  const [reading, setReading] = useState<Reading | null>(null);
  const [record, setRecord] = useState(readRecord);
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();
  const [look, setLook] = useState<Look>(initialLook);
  const [ui, setUi] = useState<Ui>(initialUi);
  const walls = useWalls();
  pausedRef.current = paused;

  useEffect(() => {
    let alive = true, thinking = false, frame = 0, timer = 0, counted = false;
    setStatus('loading'); setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('play', 'curling'); if (players === 'two') url.searchParams.set('vs', 'two'); else url.searchParams.delete('vs');
    window.history.replaceState(window.history.state, '', url);
    const sim = new CurlingSimulation(); simulation.current = sim;
    sim.control = players === 'cpu' ? ['cyan'] : ['cyan', 'rose'];
    let lastPhase: Phase = sim.phase;
    // The computer thinks in slices (the board keeps moving), shows its aim, then delivers.
    const think = () => {
      thinking = true;
      const planner = new Planner(sim);
      const slice = () => {
        if (!alive) return;
        if (pausedRef.current) { frame = requestAnimationFrame(slice); return; }
        if (!planner.step(40)) { frame = requestAnimationFrame(slice); return; }
        const shot = planner.shot();
        sim.preview = shot;
        timer = window.setTimeout(() => { if (!alive) return; sim.shoot(shot.angle, shot.power); thinking = false; }, 700);
      };
      frame = requestAnimationFrame(slice);
    };
    const update = () => {
      if (!alive) return;
      if (players === 'cpu' && sim.phase === 'aim' && sim.turn === 'rose' && !thinking) think();
      if (sim.phase !== lastPhase) {
        if (sim.phase === 'scored' && sim.lastEnd?.team) feedback.ready(sim.lastEnd.team);
        if (sim.phase === 'over' && !counted) {
          counted = true;
          if (sim.winner === 'cyan' || sim.winner === 'rose') feedback.delivered(sim.winner, true);
          if (players === 'cpu') setRecord(previous => {
            const next = { wins: previous.wins + (sim.winner === 'cyan' ? 1 : 0), games: previous.games + 1 };
            try { localStorage.setItem(RECORD_KEY, JSON.stringify({ v: 1, ...next })); } catch { /* keeps playing */ }
            return next;
          });
        }
        lastPhase = sim.phase;
      }
      setReading({ end: sim.end, ends: [...sim.ends], turn: sim.turn, hammer: sim.hammer, phase: sim.phase, left: sim.stonesLeft, totals: sim.totals,
        lastEnd: sim.lastEnd, standing: sim.standing, note: sim.note, winner: sim.winner, thinking });
    };
    try {
      experience.current = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: e => { if (alive) { setError(e); setStatus('error'); } },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight, aim: () => sim.aim, markings: MARKINGS });
      update();
    } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : String(e)); }
    return () => { alive = false; cancelAnimationFrame(frame); clearTimeout(timer); experience.current?.dispose(); experience.current = null; simulation.current = null; };
  }, [players, retry]);
  useEffect(() => {
    experience.current?.setOptions({ paused, reducedMotion: reduced, quality, lighting: 'studio', dyeFlow: 'bloom', look, walls, ripple: initialRipple(), caustic: initialCaustic() });
  }, [paused, reduced, quality, players, retry, look, walls]);
  const newGame = () => { setRetry(v => v + 1); setPaused(false); };
  const nextEnd = () => { simulation.current?.nextEnd(); };
  const r = reading;
  const you = (team: Team) => players === 'cpu' ? (team === 'cyan' ? 'あなた' : 'CPU') : NAMES[team];
  const columns = Math.max(ENDS, r?.ends.length ?? 0, r && r.phase !== 'over' ? r.end : 0);
  const turnLine = !r ? '' : r.phase === 'moving' ? '' : r.phase === 'aim'
    ? (players === 'cpu' && r.turn === 'rose' ? 'CPU（ローズ）が考えています…' : `${players === 'cpu' ? 'あなた' : NAMES[r.turn]}の番 · 引いて、離す`)
    : '';

  return <div className="droplet-lab purity-scene stage-play curling-play" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>カーリング</span><span className="dl-edition-rule"/><span>END <b>{r ? Math.min(r.end, columns) : 1}</b></span></div></header>
    <ModeNav current="curling"/>
    <main>
      <div className="stage-modes" role="group" aria-label="対戦相手"><button aria-pressed={players === 'cpu'} onClick={() => setPlayers('cpu')}>ひとりで（CPU）</button><button aria-pressed={players === 'two'} onClick={() => setPlayers('two')}>ふたりで</button>
        <span>{players === 'cpu' ? `CPUに ${record.wins}勝 / ${record.games}戦` : '1台を交代で'}</span></div>
      <table className="scorecard curling-board" aria-label="スコアボード">
        <thead><tr><th/>{Array.from({ length: columns }, (_, i) => <th key={i} className={r && r.phase !== 'over' && i + 1 === r.end ? 'is-current' : ''}>{i < ENDS ? i + 1 : '延'}</th>)}<th>計</th></tr></thead>
        <tbody>{(['cyan', 'rose'] as const).map(team => <tr key={team} data-team={team}>
          <th><i className="team-dot"/>{you(team)}{r && r.phase !== 'over' && r.hammer === team && <span className="hammer" title="ハンマー（最後の一投）">●</span>}</th>
          {Array.from({ length: columns }, (_, i) => { const e = r?.ends[i]; return <td key={i}>{e ? (e.team === team ? e.points : 0) : ''}</td>; })}
          <td>{r?.totals[team] ?? 0}</td></tr>)}</tbody>
      </table>
      <section className="dl-stage purity-stage stage-board" aria-label="カーリングのシート" aria-busy={status === 'loading'}>
        <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="引いて離すと、雫がハウスへ滑る"/>
        <div className="dl-stage-top" aria-hidden="true"><span className="dl-stage-label"><span className={status === 'ready' && !paused ? 'is-live' : ''}/>{paused ? 'PAUSED' : `END ${r?.end ?? 1}${r && r.end > ENDS ? ' · EXTRA' : ''}`}</span><span className="dl-stage-index">{r ? `${r.left.cyan + r.left.rose}` : ''}</span></div>
        {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/><span>光を整えています</span></div>}
        {status === 'error' && <div className="dl-stage-overlay dl-error" role="alert"><p>水滴を表示できませんでした</p><button className="dl-action-button" onClick={() => setRetry(v => v + 1)}>もう一度試す</button><details><summary>詳細</summary>{error}</details></div>}
        {status === 'ready' && paused && <div className="dl-stage-overlay"><button className="dl-resume" onClick={() => setPaused(false)}>つづける</button></div>}
        {r?.note && r.phase !== 'scored' && r.phase !== 'over' && <p className="stage-discovery curling-note" role="status">{r.note === 'hog' ? 'ホグラインに届かず、外れた' : '場外'}</p>}
        {r?.phase === 'scored' && r.lastEnd && <div className="stage-clear" role="status"><span className="hole-score">{r.lastEnd.team ? `${you(r.lastEnd.team)} ${r.lastEnd.points}点` : 'ブランク（0点）'}</span><small>第{r.end}エンド</small><button onClick={nextEnd}>{r.ends.length >= ENDS && r.totals.cyan !== r.totals.rose ? '結果へ' : '次のエンドへ'}</button></div>}
        {r?.phase === 'over' && <div className="round-summary" role="status"><small>試合終了</small><strong>{r.totals.cyan} – {r.totals.rose}</strong><span>{r.winner === 'draw' ? '引き分け' : `${you(r.winner as Team)}の勝ち`}</span><button onClick={newGame}>もう一試合 <RotateCcw size={12}/></button></div>}
        <div className="dl-stage-bottom"><output aria-live="polite">{turnLine}</output><span>{r && r.phase === 'aim' && r.standing.team ? `いま ${NAMES[r.standing.team]} ${r.standing.points}点` : ''}</span></div>
      </section>
      <div className="curling-stones">{(['cyan', 'rose'] as const).map(team => <div key={team} data-team={team}><span>{you(team)}</span>{Array.from({ length: STONES_PER_END }, (_, i) => <i key={i} className={r && i < r.left[team] ? 'is-left' : ''}/>)}</div>)}</div>
      <div className="purity-actions"><button onClick={newGame} disabled={status !== 'ready'}><RotateCcw size={15}/><span>最初から</span></button><button aria-label={paused ? '再開する' : '一時停止'} aria-pressed={paused} onClick={() => setPaused(p => !p)} disabled={status !== 'ready'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button><button aria-label={sensory.sound ? '音を消す' : '音を出す'} aria-pressed={sensory.sound} onClick={() => changeSensory({ sound: !sensory.sound })}>{sensory.sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button></div>
      <details className="purity-details open-details">
        <summary>遊び方と表示</summary>
        <p>下の丸から、雫を引いて離して滑らせます。強さの目安は、点線の長さ。ホグライン（横の線）を越えずに止まった雫と、壁に触れた雫は外れます。</p>
        <p>1エンドに{STONES_PER_END}つずつ交互に投げ、全部止まったら数えます。ハウス（円）に触れている雫のうち、中心にいちばん近い色が、相手のいちばん近い雫より内側にある数だけ得点。{ENDS}エンドの合計で勝負（同点なら延長1エンド）。</p>
        <p>ハンマー（●、最後の一投）は、点を取られた側に移ります。PURAならではの決まり: 同じ色どうしは触れるとひとつになり、大きく重くなるぶん中心に届きやすく動かしにくい一方、1つとしか数えません。違う色ははじき合い、当てて外に出せます。</p>
        <LookPicker look={look} onChange={setLook} ui={ui} onUi={setUi}/><label><span>画質</span><select value={quality} onChange={e => setQuality(e.target.value as FusionOptions['quality'])}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
        <label><span>揺れを控えめに</span><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/></label>
        <label><span>音</span><input type="checkbox" checked={sensory.sound} onChange={e => changeSensory({ sound: e.target.checked })}/></label>
        {feedback.hapticMode !== 'none' && <label><span>{feedback.hapticMode === 'ios-switch' ? '振動（iPhoneは試験的）' : '振動'}</span><input type="checkbox" checked={sensory.haptics} onChange={e => changeSensory({ haptics: e.target.checked })}/></label>}
      </details>
    </main>
    <footer className="dl-footer"><div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>雫のカーリング、試作。</p></div></footer>
  </div></div>;
}
