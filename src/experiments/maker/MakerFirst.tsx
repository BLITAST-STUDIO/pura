import { useEffect, useRef, useState } from 'react';
import { createFusionExperience } from '../fusion-lab/renderer';
import { stageDropHeight } from '../stages/simulation';
import { initialCaustic, initialRipple } from '../look-defaults';
import type { Look } from '../look';
import type { SensoryFeedback } from '../sensory/feedback';
import { ClearGlow } from '../clear-glow';
import { cloneLayout, type Layout, type Selection } from './layout';
import { LayoutSimulation, MakerSimulation, verifiesClear, type RecordedShot } from './simulation';
import { canPlace, clampPiece, emptyLayout, firstStep, FIRST_DROP_R, FIRST_DROPS, FIRST_STONE_R, FIRST_STONES } from './onboarding';

type Phase = 'intro' | 'place' | 'test' | 'cleared' | 'studio';
export const phrases = (text: string) => text.split(/(?<=、)/);

/**
 * Phase 1 of the stage maker's onboarding: the whole screen is the board, and
 * nothing is shown but a line of text. Three drops, two stones (no sizes or
 * shapes yet), then try it; it has to be cleared to go on.
 */
export function MakerFirst({ feedback, look, onDone, onSkip }: {
  feedback: SensoryFeedback; look: Look;
  onDone: (layout: Layout, proof: RecordedShot[]) => void; onSkip: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [layout, setLayout] = useState<Layout>(emptyLayout), layoutRef = useRef(layout);
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState({ remaining: 0, shots: 0, cleared: false, failed: false });
  const [nudge, setNudge] = useState('');
  const [ready, setReady] = useState(false);
  const proof = useRef<RecordedShot[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const step = firstStep(layout);
  const phaseRef = useRef(phase); phaseRef.current = phase;

  const apply = (next: Layout) => { layoutRef.current = next; setLayout(next); };
  // The title line, then the first request.
  useEffect(() => { const t = window.setTimeout(() => setPhase(p => (p === 'intro' ? 'place' : p)), 2800); return () => clearTimeout(t); }, []);
  useEffect(() => { if (!nudge) return; const t = window.setTimeout(() => setNudge(''), 1800); return () => clearTimeout(t); }, [nudge]);
  // After the clear: the line, then the studio's welcome.
  useEffect(() => { if (phase !== 'cleared') return; const t = window.setTimeout(() => setPhase('studio'), 3200); return () => clearTimeout(t); }, [phase]);

  useEffect(() => {
    if (phase === 'cleared' || phase === 'studio') return;
    let alive = true, announced = false;
    setReady(false);
    const testing = phase === 'test';
    const sim = testing ? new MakerSimulation(layoutRef.current) : new LayoutSimulation(layoutRef.current);
    if (sim instanceof LayoutSimulation) sim.selection = null;
    let dragging: Selection | null = null;
    const edit = sim instanceof LayoutSimulation ? {
      start(x: number, y: number, hit: Selection | null) {
        if (hit) { dragging = hit; sim.selection = hit; return true; }
        const current = layoutRef.current, want = firstStep(current);
        if (phaseRef.current !== 'place' || want === 'ready') return false;
        const piece = want === 'drops' ? { x: Math.round(x), y: Math.round(y), r: FIRST_DROP_R } : { x: Math.round(x), y: Math.round(y), r: FIRST_STONE_R };
        if (!canPlace(current, piece)) { setNudge('もう少し、離して。'); return false; }
        const next = cloneLayout(current);
        (want === 'drops' ? next.drops : next.stones).push(piece);
        apply(next); sim.setLayout(next);
        dragging = { kind: want === 'drops' ? 'drop' : 'stone', index: (want === 'drops' ? next.drops : next.stones).length - 1 };
        sim.selection = dragging;
        feedback.grab(piece.r, piece.x, 420);
        return true;
      },
      move(x: number, y: number) {
        if (!dragging) return;
        const current = layoutRef.current, list = dragging.kind === 'drop' ? current.drops : current.stones;
        const piece = list[dragging.index]; if (!piece) return;
        const moved = clampPiece(piece, x, y);
        if (!canPlace(current, moved, dragging)) return;
        const next = cloneLayout(current); (dragging.kind === 'drop' ? next.drops : next.stones)[dragging.index] = moved;
        apply(next); sim.setLayout(next); sim.selection = dragging;
      },
      end() { dragging = null; sim.selection = null; },
      selection: () => sim.selectedPoint(),
    } : undefined;
    const update = () => {
      if (!alive || !(sim instanceof MakerSimulation)) return;
      const result = sim.result;
      setReading({ remaining: sim.remaining, shots: sim.shots, cleared: !!result?.cleared, failed: !!result && !result.cleared });
      if (result?.cleared && !announced && verifiesClear(layoutRef.current, sim.proof)) {
        announced = true; proof.current = sim.proof.map(s => ({ ...s }));
        feedback.delivered('cyan', true);
        window.setTimeout(() => { if (alive) setPhase('cleared'); }, 900);
      }
    };
    let experience: ReturnType<typeof createFusionExperience> | null = null;
    try {
      experience = createFusionExperience(canvas.current!, { onReady: () => { if (alive) setReady(true); } },
        { simulation: sim, obstacles: layoutRef.current.stones, height: stageDropHeight, feedback, onUpdate: update, edit,
          showSelected: testing, aimAnywhere: testing, aim: testing ? () => (sim as MakerSimulation).aim : undefined });
      experience.setOptions({ lighting: 'studio', look, walls: 'rim', ripple: initialRipple(), caustic: initialCaustic(), dyeFlow: 'bloom', fit: 'screen' });
      update();
    } catch { /* the board stays empty; skipping still works */ }
    return () => { alive = false; experience?.dispose(); };
  }, [phase === 'test' ? 'test' : phase === 'cleared' || phase === 'studio' ? 'done' : 'place', attempt]);

  const test = () => { setReading({ remaining: FIRST_DROPS - 1, shots: 0, cleared: false, failed: false }); setPhase('test'); };
  const rearrange = () => { setPhase('place'); };
  const retry = () => setAttempt(n => n + 1);
  const finish = () => onDone(layoutRef.current, proof.current);

  const line = phase === 'intro' ? { main: '自分だけの世界を、つくろう。', sub: '' }
    : phase === 'place' ? step === 'drops' ? { main: `まずは、雫を${FIRST_DROPS}つ。`, sub: '好きな場所に、ふれて置く。' }
      : step === 'stones' ? { main: `次に、石を${FIRST_STONES}つ。`, sub: '雫の行く手を、ふさいだり、導いたり。' }
        : { main: 'ためしてみましょう。', sub: '置いたものは、動かせます。' }
    : phase === 'test' ? { main: '全部の雫を、ひとつに。', sub: '雫を引いて、離す。' }
      // How many shots it took: the one number the first phase shows.
      : phase === 'cleared' ? { main: 'あなただけの世界が、できました。', sub: reading.shots === 1 ? '1打で、ひとふで。' : `${reading.shots}打で、ひとつに。` }
        : { main: 'あなたのために、スタジオを用意しました。', sub: 'ここでは、もっといろいろなことができます。' };
  const count = phase === 'place' && step !== 'ready' ? { have: step === 'drops' ? layout.drops.length : layout.stones.length, of: step === 'drops' ? FIRST_DROPS : FIRST_STONES, kind: step } : null;

  return <div className={`maker-first is-${phase}`} data-step={phase === 'place' ? step : phase}>
    <canvas ref={canvas} className="dl-canvas" aria-label="何もない盤。ふれて、雫や石を置く。"/>
    <ClearGlow show={phase === 'cleared'}/>
    <div className="maker-first-line" key={`${phase}-${phase === 'place' ? step : ''}`} role="status">
      {/* Phrases break after 、 so a line never splits mid-word on a phone. */}
      <p>{phrases(line.main).map((t, i) => <span key={i}>{t}</span>)}</p>{line.sub && <small>{line.sub}</small>}
      {count && <div className={`maker-first-count is-${count.kind}`} aria-hidden="true">{Array.from({ length: count.of }, (_, i) => <i key={i} className={i < count.have ? 'is-done' : ''}/>)}</div>}
    </div>
    {nudge && <p className="maker-first-nudge" role="status">{nudge}</p>}
    {ready && phase === 'place' && step === 'ready' && <div className="maker-first-actions"><button className="maker-first-go" onClick={test}>ためす</button></div>}
    {phase === 'test' && <>
      <div className="maker-first-reading" aria-live="polite"><b>{reading.shots}</b><span>打</span><small>{reading.cleared ? 'ひとつに' : `あと ${reading.remaining}つ`}</small></div>
      <div className="maker-first-actions"><button onClick={rearrange}>配置しなおす</button><button className={reading.failed ? 'maker-first-go' : ''} onClick={retry}>{reading.failed ? 'もう一度' : 'やり直す'}</button></div>
    </>}
    {phase === 'studio' && <div className="maker-first-actions"><button className="maker-first-go" onClick={finish}>スタジオへ</button></div>}
    {phase !== 'studio' && <button className="maker-first-skip" onClick={onSkip}>とばす</button>}
  </div>;
}
