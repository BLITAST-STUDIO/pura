import { useEffect, useRef, useState } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { createFusionExperience, type FusionOptions } from '../fusion-lab/renderer';
import { FreeSimulation } from '../free/simulation';
import { stageDropHeight } from '../stages/simulation';
import { initialCaustic, initialRipple } from '../look-defaults';
import { AUTO_SETTLE_MS, BENCH_SCENARIOS, BENCH_TIMING, summarize, type BenchResult } from './measure';
import '../droplet-lab/droplet-lab.css';
import '../purity-scene/purity-scene.css';
import '../stages/stages.css';
import './bench.css';

/**
 * On-device measurement (requirement 11.2): the numbers only mean something on
 * the player's phone, so the page runs itself and shows a copyable table.
 * A scripted "finger" circles one drop so the board is not merely idle.
 */
function environment() {
  let gpu = 'unknown';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'no webgl2');
  } catch { /* keep unknown */ }
  return { userAgent: navigator.userAgent, gpu, dpr: devicePixelRatio, screen: `${screen.width}×${screen.height}`, cores: navigator.hardwareConcurrency ?? null };
}

export default function BenchPlay() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<BenchResult[]>([]);
  const [phase, setPhase] = useState('準備中');
  const [done, setDone] = useState(false);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const [copied, setCopied] = useState(false);
  const env = useRef(environment());

  useEffect(() => {
    let cancelled = false;
    setResults([]); setDone(false); setCopied(false);
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    (async () => {
      for (const [index, scenario] of BENCH_SCENARIOS.entries()) {
        if (cancelled) return;
        const sim = new FreeSimulation({ count: scenario.count, colors: 3, mix: 'same' });
        let ready = false;
        const experience = createFusionExperience(canvas.current!, { onReady: () => { ready = true; } }, { simulation: sim, height: stageDropHeight });
        const auto = scenario.quality === 'auto';
        experience.setOptions({ quality: (auto ? 'high' : scenario.quality) as FusionOptions['quality'], adaptive: auto, lighting: 'studio', dyeFlow: 'bloom', paused: false, reducedMotion: false,
          ripple: initialRipple(), caustic: initialCaustic() });
        while (!ready && !cancelled) await wait(50);
        if (index === 0 && run === 0) setReadyMs(Math.round(performance.now()));
        // The circling finger: the drop nearest the centre, a small loop around its start.
        const target = [...sim.core.drops].sort((a, b) => Math.hypot(a.x - sim.width / 2, a.y - sim.height / 2) - Math.hypot(b.x - sim.width / 2, b.y - sim.height / 2))[0];
        sim.grab(target.id);
        const origin = { x: target.x, y: target.y };
        const intervals: number[] = [];
        let last = 0, frame = 0, measuring = false;
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const t = (now - start) / 1000;
          sim.move(origin.x + Math.cos(t * 5) * 8, origin.y + Math.sin(t * 5) * 8);
          if (measuring && last && !document.hidden) intervals.push(now - last);
          last = now; frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        const label = scenario.quality === 'high' ? '美しさ優先' : scenario.quality === 'auto' ? '自動調整' : '軽さ優先';
        setPhase(`${index + 1}/${BENCH_SCENARIOS.length} · ${scenario.count}個 · ${label} · 慣らし`);
        await wait(auto ? AUTO_SETTLE_MS : BENCH_TIMING.warmupMs);
        measuring = true;
        setPhase(`${index + 1}/${BENCH_SCENARIOS.length} · ${scenario.count}個 · ${label} · 計測中`);
        await wait(BENCH_TIMING.measureMs);
        cancelAnimationFrame(frame);
        const c = canvas.current!;
        const result = { ...summarize(scenario, intervals, sim.core.drops.length, { width: c.width, height: c.height }),
          pixelRatio: Number(JSON.parse(c.dataset.resolution ?? '{}').pixelRatio ?? 0) };
        experience.dispose();
        if (cancelled) return;
        setResults(previous => [...previous, result]);
      }
      if (!cancelled) { setPhase('完了'); setDone(true); }
    })();
    return () => { cancelled = true; };
  }, [run]);

  const report = () => JSON.stringify({ at: new Date().toISOString(), readyMs, env: env.current, timing: BENCH_TIMING, results }, null, 1);
  const copy = async () => { try { await navigator.clipboard.writeText(report()); setCopied(true); } catch { setCopied(false); } };

  return <div className="droplet-lab purity-scene stage-play bench-play" data-lighting="studio" data-hue="cyan"><div className="dl-shell">
    <header className="dl-header"><a className="dl-brand" href="./" aria-label="PURA はじめる"><span className="dl-brand-symbol"/><span>PURA<span className="dl-brand-period">.</span></span></a><div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule"/><span>BENCH</span></div></header>
    <main>
      <p className="stage-title"><b>計測</b>このまま画面を開いておいてください。約{Math.round((BENCH_SCENARIOS.length * (BENCH_TIMING.warmupMs + BENCH_TIMING.measureMs) + AUTO_SETTLE_MS - BENCH_TIMING.warmupMs) / 1000 / 5) * 5}秒で終わります。触らなくて大丈夫です。</p>
      <p className="bench-phase" role="status">{phase}</p>
      <section className="dl-stage purity-stage stage-board bench-board" aria-label="計測中の盤面"><canvas ref={canvas} className="dl-canvas" aria-hidden="true"/></section>
      <table className="bench-table"><thead><tr><th>個数</th><th>画質</th><th>fps</th><th>中央値</th><th>p95</th><th>50ms超</th></tr></thead>
        <tbody>{results.map(r => <tr key={`${r.count}-${r.quality}`} className={r.medianMs > 20 ? 'is-slow' : ''}><td>{r.count}</td><td>{r.quality === 'high' ? '美しさ' : r.quality === 'auto' ? `自動 ${r.pixelRatio}×` : '軽さ'}</td><td>{r.fps}</td><td>{r.medianMs} ms</td><td>{r.p95Ms} ms</td><td>{r.over50}</td></tr>)}</tbody></table>
      <p className="bench-note">表示まで {readyMs ?? '—'} ms · DPR {env.current.dpr} · {env.current.gpu}</p>
      <div className="purity-actions"><button onClick={copy} disabled={!done}><Copy size={15}/><span>{copied ? 'コピーしました' : '結果をコピー'}</span></button><button onClick={() => setRun(v => v + 1)} disabled={!done} aria-label="もう一度計測"><RotateCcw size={15}/></button></div>
      <p className="bench-note">端末が省電力モードのときは画面更新が30fpsに制限されることがあります。スマホの結果とPCの結果は比べられません。</p>
    </main>
  </div></div>;
}
