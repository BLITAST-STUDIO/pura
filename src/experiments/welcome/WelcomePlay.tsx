import { useEffect, useRef, useState } from 'react';
import { createFusionExperience } from '../fusion-lab/renderer';
import { MichiSimulation } from '../michi/simulation';
import { stageDropHeight } from '../stages/simulation';
import { useSensoryFeedback } from '../sensory/useSensoryFeedback';
import { SoundNudge } from '../sensory/sound-nudge';
import { ClearGlow } from '../clear-glow';
import { useWalls } from '../walls';
import { applyPageTone, initialLook, initialUi } from '../look';
import { initialCaustic, initialRipple } from '../look-defaults';
import { INTRO_TEXT } from '../intro-line';
import { ModeGallery } from '../mode-gallery';
import { WELCOME_STEPS, WELCOMED_KEY, type WelcomeStep } from './steps';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import '../phone-play.css';
import './welcome.css';

type Spot = { id: number; x: number; y: number; r: number };
const HUE: Record<string, string> = { cyan: '#5fbfcb', rose: '#d77f9f', amber: '#dcae5b' };


function markWelcomed() {
  try { localStorage.setItem(WELCOMED_KEY, '1'); localStorage.setItem('pura-flow-intro-v1', '1'); } catch { /* shown again next time */ }
}

/** The goal as a picture: n small drops of a colour, then one. */
function Picture({ step }: { step: WelcomeStep }) {
  if (!step.picture.length) return null;
  return <div className="welcome-picture" aria-hidden="true">{step.picture.map(g => <span key={g.hue}>
    {Array.from({ length: g.from }, (_, i) => <i key={i} style={{ background: HUE[g.hue] }}/>)}
    <em>→</em><b style={{ background: HUE[g.hue] }}/>
  </span>)}</div>;
}

export default function WelcomePlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState('loading');
  const [won, setWon] = useState(false);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [still, setStill] = useState(0);
  const [holding, setHolding] = useState(false);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const { feedback, preferences: sensory } = useSensoryFeedback();
  const walls = useWalls();
  const [look] = useState(initialLook);
  const [ui] = useState(initialUi);
  const step = WELCOME_STEPS[stepIndex];
  useEffect(() => applyPageTone(ui), [ui]);
  useEffect(() => { document.title = 'PURA'; }, []);

  useEffect(() => {
    if (finished) return;
    let alive = true, advanced = false, touches = 0, lastTouch = performance.now(), timer = 0;
    setStatus('loading'); setWon(false); setStill(0);
    const sim = new MichiSimulation(step.board, 'legacy');
    const update = () => {
      if (!alive || !canvas.current) return;
      const rect = canvas.current.getBoundingClientRect();
      setStage({ w: rect.width, h: rect.height });
      try { setSpots(JSON.parse(canvas.current.dataset.drops ?? '[]').map((d: { id: number; screenX: number; screenY: number; r: number }) => ({ id: d.id, x: d.screenX, y: d.screenY, r: d.r }))); } catch { /* next time */ }
      if (sim.touches !== touches) { touches = sim.touches; lastTouch = performance.now(); }
      setHolding(sim.core.grabbedId !== null);
      setStill((performance.now() - lastTouch) / 1000);
      const done = step.id === 0 ? sim.touches > 0 && sim.core.grabbedId === null : !!sim.won;
      if (done && !advanced) {
        advanced = true; setWon(true);
        const last = stepIndex === WELCOME_STEPS.length - 1;
        if (step.id === 0) feedback.ready('cyan'); else feedback.delivered(step.picture[0]?.hue ?? 'cyan', last);
        timer = window.setTimeout(() => {
          if (!alive) return;
          if (last) { markWelcomed(); setFinished(true); } else setStepIndex(i => i + 1);
        }, step.id === 0 ? 500 : 1600);
      }
    };
    let experience: ReturnType<typeof createFusionExperience> | null = null;
    try {
      experience = createFusionExperience(canvas.current!, {
        onReady: () => { if (alive) setStatus('ready'); },
        onError: () => { if (alive) setStatus('error'); },
      }, { simulation: sim, onUpdate: update, feedback, height: stageDropHeight });
      experience.setOptions({ paused: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, quality: 'high', lighting: 'studio', dyeFlow: 'bloom', look, walls, fit: 'screen', ripple: initialRipple(), caustic: initialCaustic() });
      update();
    } catch { setStatus('error'); }
    return () => { alive = false; clearTimeout(timer); experience?.dispose(); };
  }, [stepIndex, finished]);

  const skip = () => { markWelcomed(); location.href = './?play=open'; };
  // The ghost: from a small drop onto the biggest (drag), or from the big drop toward the rest (flick).
  const biggest = [...spots].sort((a, b) => b.r - a.r)[0];
  const others = spots.filter(s => s !== biggest);
  const smallest = [...others].sort((a, b) => a.r - b.r)[0];
  const showGhost = status === 'ready' && !won && !holding && !!step.ghost && still >= step.ghostAfter && !!biggest && others.length > 0;
  let ghost: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (showGhost && step.ghost === 'drag' && smallest) ghost = { x0: smallest.x, y0: smallest.y, x1: biggest.x, y1: biggest.y };
  if (showGhost && step.ghost === 'flick') {
    const cx = others.reduce((n, s) => n + s.x, 0) / others.length, cy = others.reduce((n, s) => n + s.y, 0) / others.length;
    const len = Math.hypot(cx - biggest.x, cy - biggest.y) || 1;
    ghost = { x0: biggest.x, y0: biggest.y, x1: biggest.x + (cx - biggest.x) / len * 70, y1: biggest.y + (cy - biggest.y) / len * 70 };
  }
  const breathe = step.id === 0 && status === 'ready' && !won && biggest;

  return <div className="droplet-lab purity-scene stage-play welcome-play is-phone" data-look={look} data-ui={ui} data-lighting="studio" data-hue="cyan"><div className="dl-shell"><main>
    <section className="dl-stage purity-stage stage-board" aria-label="はじめて" aria-busy={status === 'loading'}>
      <canvas ref={canvas} className="dl-canvas" tabIndex={0} aria-label="雫に触れて、動かしてみる"/>
      {!finished && <div className="welcome-top" aria-hidden="true">
        <div className="welcome-dots">{WELCOME_STEPS.map((s, i) => <i key={s.id} className={i < stepIndex || (i === stepIndex && won) ? 'is-done' : i === stepIndex ? 'is-now' : ''}/>)}</div>
        <Picture step={step}/>
      </div>}
      {!finished && <button className="welcome-skip" onClick={skip}>とばす</button>}
      <SoundNudge feedback={feedback} sound={sensory.sound}/>
      {breathe && <span className="welcome-breathe" style={{ left: biggest.x, top: biggest.y, width: biggest.r * 2 * (stage.w / 420) * 1.25, height: biggest.r * 2 * (stage.w / 420) * 1.25 }}/>}
      {ghost && <span key={`${stepIndex}-${Math.round(ghost.x0)}`} className={`welcome-ghost is-${step.ghost}`}
        style={{ left: ghost.x0, top: ghost.y0, ['--dx' as string]: `${ghost.x1 - ghost.x0}px`, ['--dy' as string]: `${ghost.y1 - ghost.y0}px` }}><i/></span>}
      <ClearGlow show={won && step.id !== 0}/>
      {status === 'loading' && <div className="dl-stage-overlay" role="status"><span className="dl-loading-orbit"/></div>}
      {finished && <div className="welcome-end" role="dialog" aria-label="遊び方を選ぶ">
        <p className="welcome-line">{INTRO_TEXT}</p>
        <p className="welcome-sub">ここから、好きな遊び方で。</p>
        <ModeGallery/>
      </div>}
    </section>
  </main></div></div>;
}
