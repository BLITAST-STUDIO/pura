import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Grid2X2, Pause, Play, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { HueId } from "../../game/palette";
import { createDropletExperience } from "./renderer";
import "./droplet-lab.css";
import { useSensoryFeedback } from "../sensory/useSensoryFeedback";
import { causticQuery, initialCaustic, initialRipple, rippleQuery } from "../look-defaults";

type Experience = ReturnType<typeof createDropletExperience>;
type Status = "loading" | "ready" | "error";
type Stats = { fps: number; frameP95: number; grabbed: boolean };
type Refinement = "baseline" | "refined";

function updateComparisonQuery(key: "feel" | "view" | "ripple" | "caustic", value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
}

const colors: { id: HueId; label: string; name: string }[] = [
  { id: "cyan", label: "CYAN", name: "シアン" },
  { id: "rose", label: "ROSE", name: "ローズ" },
  { id: "amber", label: "AMBER", name: "アンバー" },
];

export function DropletLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const experienceRef = useRef<Experience | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const [hue, setHue] = useState<HueId>("cyan");
  const [lighting, setLighting] = useState<"studio" | "daylight">("studio");
  const [inspection, setInspection] = useState(false);
  const [refinement, setRefinement] = useState<Refinement>(() =>
    new URLSearchParams(window.location.search).get("feel") === "baseline" ? "baseline" : "refined",
  );
  const [clay, setClay] = useState(() => new URLSearchParams(window.location.search).get("view") === "clay");
  const [ripple, setRipple] = useState(initialRipple);
  const [caustic, setCaustic] = useState<"artistic" | "shape">(initialCaustic);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [quality, setQuality] = useState<"high" | "balanced">("high");
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<Stats>({ fps: 0, frameP95: 0, grabbed: false });
  const { feedback, preferences: sensory, change: changeSensory } = useSensoryFeedback();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let mounted = true;
    setStatus("loading");
    setError("");
    try {
      experienceRef.current = createDropletExperience(canvas, {
        onReady: () => { if (mounted) setStatus("ready"); },
        onError: (message) => {
          if (!mounted) return;
          setError(message);
          setStatus("error");
        },
        onStats: (nextStats) => { if (mounted) setStats(nextStats); },
        onInteraction: () => { if (mounted) setTouched(true); },
      }, feedback);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "描画を開始できませんでした。");
      setStatus("error");
    }
    return () => {
      mounted = false;
      experienceRef.current?.dispose();
      experienceRef.current = null;
    };
  }, [restart]);

  useEffect(() => {
    experienceRef.current?.setOptions({ hue, lighting, inspection, refinement, clay, ripple, caustic, reducedMotion, quality, paused });
  }, [hue, lighting, inspection, refinement, clay, ripple, caustic, reducedMotion, quality, paused, restart]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsOpen) {
          setSettingsOpen(false);
          settingsButtonRef.current?.focus();
        } else if (status === "ready") {
          setPaused((value) => !value);
        }
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key.toLowerCase() === "r" && status === "ready") {
        event.preventDefault();
        experienceRef.current?.reset();
        setPaused(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, status]);

  useEffect(() => {
    if (!settingsOpen) return;
    settingsCloseRef.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [settingsOpen]);

  const reset = () => {
    experienceRef.current?.reset();
    setPaused(false);
  };

  return (
    <div className="droplet-lab" data-hue={hue} data-lighting={lighting}>
      <div className="dl-shell">
        <header className="dl-header">
          <a className="dl-brand" href="./" aria-label="PURA はじめる">
            <span className="dl-brand-symbol" aria-hidden="true" />
            <span>PURA<span className="dl-brand-period">.</span></span>
          </a>
          <div className="dl-edition"><span>FLOW</span><span className="dl-edition-rule" /><span>MATERIAL STUDY <b>001</b></span></div>
        </header>

        <main>
          <div className="dl-intro">
            <div>
              <p className="dl-eyebrow"><span />THE FEEL OF WATER</p>
              <h1>ひとしずくに、触れる。</h1>
              <p className="dl-description">つかんで、滑らせて。光と、かたちを感じる。</p>
            </div>
            <div className="dl-study-note"><span className="dl-study-number">01 <span>/ 01</span></span><span>一滴から、はじめる。</span></div>
          </div>

          <section className="dl-stage" aria-label="水滴のプレイエリア" aria-busy={status === "loading"}>
            <canvas
              ref={canvasRef}
              className={`dl-canvas${stats.grabbed ? " is-grabbed" : ""}`}
              tabIndex={status === "ready" ? 0 : -1}
              aria-label="水滴をつかんで動かせるプレイエリア"
              aria-describedby="dl-play-instructions"
            />
            <div className="dl-stage-top" aria-hidden="true">
              <span className="dl-stage-label"><span className={status === "ready" && !paused ? "is-live" : ""} />{paused ? "PAUSED" : "ONE DROP, IN MOTION"}</span>
              <span className="dl-stage-index">P / 001</span>
            </div>
            <span className="dl-corner dl-corner-bl" aria-hidden="true" />
            <span className="dl-corner dl-corner-br" aria-hidden="true" />

            {status === "loading" && (
              <div className="dl-stage-overlay" role="status">
                <span className="dl-loading-orbit" aria-hidden="true" />
                <span>光を整えています</span>
              </div>
            )}
            {status === "error" && (
              <div className="dl-stage-overlay dl-error" role="alert">
                <p>水滴を表示できませんでした</p>
                <span>「もう一度試す」で、水滴の表示をやり直せます。</span>
                <button className="dl-action-button" onClick={() => { setPaused(false); setRestart((value) => value + 1); }}><RotateCcw size={15} />もう一度試す</button>
                <details><summary>詳細</summary><p>{error}</p></details>
              </div>
            )}
            {status === "ready" && paused && (
              <div className="dl-stage-overlay dl-pause-overlay">
                <button className="dl-resume" onClick={() => setPaused(false)}><Play size={18} fill="currentColor" /><span>つづける</span></button>
                <span>ひと休み。</span>
              </div>
            )}
            {status === "ready" && !paused && (
              <div className={`dl-touch-hint${touched ? " is-dismissed" : ""}`} aria-hidden="true"><span className="dl-hint-dot" />水滴をつかんで、ゆっくり動かす</div>
            )}
            <div className="dl-stage-bottom" aria-hidden="true"><span>{lighting === "studio" ? "SOFT STUDIO LIGHT" : "NATURAL DAYLIGHT"}</span><span>{colors.find((color) => color.id === hue)?.label} / 100%</span></div>
          </section>

          <div className="dl-controls" aria-label="水滴の見た目と操作">
            <div className="dl-control-group dl-colors">
              <span className="dl-control-label">色</span>
              <div className="dl-color-options" role="group" aria-label="水滴の色">
                {colors.map((color) => (
                  <button key={color.id} className={`dl-color${hue === color.id ? " is-active" : ""}`} data-color={color.id} onClick={() => setHue(color.id)} aria-label={color.name} aria-pressed={hue === color.id}>
                    <span className="dl-swatch">{hue === color.id && <Check size={12} strokeWidth={2.8} />}</span><span>{color.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dl-control-group dl-lighting">
              <span className="dl-control-label">光</span>
              <div className="dl-segment" role="group" aria-label="照明">
                <button className={lighting === "studio" ? "is-active" : ""} onClick={() => setLighting("studio")} aria-pressed={lighting === "studio"}>スタジオ</button>
                <button className={lighting === "daylight" ? "is-active" : ""} onClick={() => setLighting("daylight")} aria-pressed={lighting === "daylight"}>自然光</button>
              </div>
            </div>
            <div className="dl-control-actions">
              <button className={`dl-quiet-button dl-floor-toggle${inspection ? " is-active" : ""}`} aria-pressed={inspection} onClick={() => setInspection((value) => !value)} title="床の模様を切り替える"><Grid2X2 size={15} /><span>屈折を見る</span></button>
              <span className="dl-control-divider" aria-hidden="true" />
              <button className="dl-quiet-button dl-reset" onClick={reset} disabled={status !== "ready"} title="水滴を元の位置に戻す（R）"><RotateCcw size={15} /><span>リセット</span></button>
              <div className="dl-settings" ref={settingsRef}>
                <button className={`dl-icon-button${settingsOpen ? " is-active" : ""}`} ref={settingsButtonRef} aria-label="表示と動きの設定" aria-expanded={settingsOpen} aria-controls="dl-settings-panel" onClick={() => setSettingsOpen((value) => !value)}><SlidersHorizontal size={17} /></button>
                {settingsOpen && (
                  <div className="dl-settings-panel" id="dl-settings-panel" role="dialog" aria-label="表示と動きの設定">
                    <div className="dl-settings-heading"><span>表示と動き</span><button className="dl-icon-button" ref={settingsCloseRef} aria-label="設定を閉じる" onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }}><X size={15} /></button></div>
                    <div className="dl-comparison-settings">
                      <label className="dl-setting-row dl-select-setting"><span>触り心地</span><select value={refinement} onChange={(event) => {
                        const next = event.target.value as Refinement;
                        setRefinement(next);
                        updateComparisonQuery("feel", next);
                      }} aria-describedby="dl-feel-description"><option value="refined">今回の調整</option><option value="baseline">保存した感触</option></select></label>
                      <p className="dl-setting-description" id="dl-feel-description">いつでも保存した感触に戻せます。</p>
                      {refinement === "refined" && <label className="dl-setting-row"><span>縁が波打つ</span><input type="checkbox" checked={ripple} onChange={(event) => {
                        setRipple(event.target.checked);
                        updateComparisonQuery("ripple", rippleQuery(event.target.checked));
                      }} aria-describedby="dl-ripple-description" /><span className="dl-switch" aria-hidden="true" /></label>}
                      {refinement === "refined" && <p className="dl-setting-description" id="dl-ripple-description">当たった側から縁にさざ波が回り、壁に押し付けたまま潰れます。</p>}
                      {refinement === "refined" && <label className="dl-setting-row"><span>形から床の光を描く</span><input type="checkbox" checked={caustic === "shape"} onChange={(event) => {
                        const next = event.target.checked ? "shape" : "artistic";
                        setCaustic(next); updateComparisonQuery("caustic", causticQuery(event.target.checked));
                      }} /><span className="dl-switch" aria-hidden="true" /></label>}
                      <label className="dl-setting-row"><span>形だけを見る</span><input type="checkbox" checked={clay} onChange={(event) => {
                        setClay(event.target.checked);
                        updateComparisonQuery("view", event.target.checked ? "clay" : null);
                      }} aria-describedby="dl-shape-description" /><span className="dl-switch" aria-hidden="true" /></label>
                      <p className="dl-setting-description" id="dl-shape-description">透明感を隠して、輪郭と揺れを確かめる。</p>
                    </div>
                    <label className="dl-setting-row"><span>揺れを控えめに</span><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /><span className="dl-switch" aria-hidden="true" /></label>
                    <label className="dl-setting-row dl-select-setting"><span>画質</span><select value={quality} onChange={(event) => setQuality(event.target.value as "high" | "balanced")}><option value="high">美しさを優先</option><option value="balanced">軽さを優先</option></select></label>
                    <label className="dl-setting-row"><span>音</span><input type="checkbox" checked={sensory.sound} onChange={(event) => changeSensory({ sound: event.target.checked })} /><span className="dl-switch" aria-hidden="true" /></label>
                    {feedback.hapticMode !== "none" && <label className="dl-setting-row"><span>{feedback.hapticMode === "ios-switch" ? "振動（iPhoneは試験的）" : "振動"}</span><input type="checkbox" checked={sensory.haptics} onChange={(event) => changeSensory({ haptics: event.target.checked })} /><span className="dl-switch" aria-hidden="true" /></label>}
                    <label className="dl-setting-row"><span>動作情報を表示</span><input type="checkbox" checked={showStats} onChange={(event) => setShowStats(event.target.checked)} /><span className="dl-switch" aria-hidden="true" /></label>
                    <button className="dl-pause-setting" disabled={status !== "ready"} onClick={() => { setPaused((value) => !value); setSettingsOpen(false); settingsButtonRef.current?.focus(); }}>{paused ? <Play size={14} /> : <Pause size={14} />}<span>{paused ? "再開する" : "一時停止"}</span><kbd>Esc</kbd></button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="dl-play-instructions" id="dl-play-instructions">つかんで移動 · 離すと滑る<span>R でリセット · Esc で一時停止</span></p>
        </main>

        <footer className="dl-footer">
          <div><span className="dl-footer-title">A LITTLE MOMENT OF FLOW.</span><p>一滴の質感と動きの試作。融合の実験も試せます。</p></div>
          <div className="dl-footer-right">
            {showStats && <output className="dl-stats" aria-label="描画の動作情報">{Math.round(stats.fps)} fps<span>p95 {stats.frameP95.toFixed(1)} ms</span></output>}
            <a href="?lab=fusion">融合の実験へ<ArrowUpRight size={14} /></a>
            <a href="?play=classic">PURA オリジナル<ArrowUpRight size={14} /></a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default DropletLab;
