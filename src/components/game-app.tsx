"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PuraSim, type HudSnap } from "@/game/sim";
import { PuraRenderer } from "@/game/renderer";
import { createAudio } from "@/game/audio";
import { firstUnplayed, loadSave, recordResult, writeSave, type SaveData } from "@/game/save";
import { clampSandboxCount, SANDBOX_COUNT } from "@/game/levels";
import { BootScreen, Hud, LevelSelect, PauseMenu, TitleScreen, WinScreen } from "@/components/overlays";
import { cn } from "@/lib/utils";

type PuraWin = Window & {
  __puraIntent?: string | null;
  __puraGo?: (act: string) => void;
};

type Phase = "title" | "select" | "play" | "pause" | "won";
type Pending = { type: "play"; id: number } | { type: "select" } | null;

const EMPTY_HUD: HudSnap = {
  cores: [],
  selectedPurity: null,
  selectedHue: null,
  elapsed: 0,
  won: false,
  sandbox: false,
  hint: "",
  name: "",
  code: "",
  purityGoal: 1,
  drops: 0,
};

export function GameApp() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<PuraSim | null>(null);
  const rendRef = useRef<PuraRenderer | null>(null);
  const audioRef = useRef<ReturnType<typeof createAudio> | null>(null);
  const phaseRef = useRef<Phase>("title");
  const levelRef = useRef(1);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const pendingRef = useRef<Pending>(null);
  const lastStartAt = useRef(0);
  const suppressGrabRef = useRef(false);
  const apiRef = useRef({
    play: () => {},
    select: () => {},
  });

  const [phase, setPhase] = useState<Phase>("title");
  const [hud, setHud] = useState<HudSnap>(EMPTY_HUD);
  const [save, setSave] = useState<SaveData>({
    v: 1,
    muted: false,
    best: {},
    sandboxDrops: SANDBOX_COUNT.fallback,
  });
  const sandboxCountRef = useRef<number>(SANDBOX_COUNT.fallback);
  const [result, setResult] = useState({ stars: 0, time: 0, purity: 0 });
  const [booted, setBooted] = useState(false);
  const [starting, setStarting] = useState(false);

  function ensureSim(): PuraSim {
    if (!simRef.current) {
      const sim = new PuraSim();
      if (typeof matchMedia !== "undefined") {
        sim.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
      simRef.current = sim;
    }
    return simRef.current;
  }

  function applyView(): boolean {
    const wrap = wrapRef.current;
    const sim = simRef.current;
    if (!wrap || !sim) return false;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.min(rect.width, 2560);
    const cssH = Math.min(rect.height, 2560);
    for (const c of [glRef.current, ovRef.current]) {
      if (!c) continue;
      c.width = Math.max(1, Math.floor(cssW * dpr));
      c.height = Math.max(1, Math.floor(cssH * dpr));
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    sim.resize(cssW, cssH);
    return sim.w >= 120 && sim.h >= 120;
  }

  if (typeof window !== "undefined") {
    if (!simRef.current) ensureSim();
    (window as PuraWin).__puraGo = (act) => {
      if (act === "play") {
        if (phaseRef.current === "title" || phaseRef.current === "select") {
          startLevel(firstUnplayed());
        }
      } else if (act === "select") {
        if (phaseRef.current === "title") goSelect();
      }
    };
  }

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useLayoutEffect(() => {
    applyView();
    const pending = pendingRef.current;
    if (pending?.type === "play") startLevel(pending.id, true);
    else if (pending?.type === "select") goSelect();
    const win = window as PuraWin;
    const want = win.__puraIntent;
    if (want) {
      win.__puraIntent = null;
      if (want === "play") startLevel(firstUnplayed());
      else if (want === "select") goSelect();
    }
  }, []);

  useEffect(() => {
    const run = (act: string | null | undefined) => {
      if (act === "play") apiRef.current.play();
      if (act === "select") apiRef.current.select();
    };
    const fromDom = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.("[data-pura-act]");
      if (!el) return;
      run(el.getAttribute("data-pura-act"));
    };
    const fromCustom = (e: Event) => {
      run((e as CustomEvent<string>).detail);
    };
    document.addEventListener("pointerdown", fromDom, true);
    document.addEventListener("click", fromDom, true);
    window.addEventListener("pura-act", fromCustom as EventListener);
    const queued = (window as Window & { __puraIntent?: string | null }).__puraIntent;
    if (queued) {
      (window as Window & { __puraIntent?: string | null }).__puraIntent = null;
      run(queued);
    }
    return () => {
      document.removeEventListener("pointerdown", fromDom, true);
      document.removeEventListener("click", fromDom, true);
      window.removeEventListener("pura-act", fromCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    const sim = ensureSim();
    const audio = audioRef.current ?? createAudio();
    audioRef.current = audio;
    const stored = loadSave();
    setSave(stored);
    audio.setMuted(stored.muted);
    sim.sandboxTotal = stored.sandboxDrops;
    sandboxCountRef.current = stored.sandboxDrops;

    sim.onMerge = (mass, mixed) => audio.merge(mass, mixed);
    sim.onGrab = () => audio.grab();
    sim.onSplit = () => audio.split();
    sim.onBounce = () => audio.bounce();
    sim.onWin = (stars, time, purity) => {
      audio.win();
      setResult({ stars, time, purity });
      setSave((prev) => recordResult(prev, levelRef.current, stars, time, purity));
      setPhase("won");
    };

    const queued = pendingRef.current;
    applyView();
    if (queued?.type === "play") {
      lastStartAt.current = performance.now();
      levelRef.current = queued.id;
      if (queued.id === 0) sim.sandboxTotal = sandboxCountRef.current;
      sim.load(queued.id);
      applyView();
      if (sim.drops.length > 0) {
        pendingRef.current = null;
        setHud(sim.hud());
        phaseRef.current = "play";
        setPhase("play");
        setStarting(false);
      }
    } else if (queued?.type === "select") {
      pendingRef.current = null;
      phaseRef.current = "select";
      setPhase("select");
    }

    const gl = glRef.current;
    const ov = ovRef.current;
    const wrap = wrapRef.current;
    if (!gl || !ov || !wrap) {
      setBooted(true);
      return;
    }
    const renderer = new PuraRenderer(gl);
    rendRef.current = renderer;
    setBooted(true);

    const pump = () => {
      applyView();
      const win = window as PuraWin;
      const intent = win.__puraIntent;
      if (intent === "select" && phaseRef.current === "title") {
        win.__puraIntent = null;
        goSelect();
        return;
      }
      if (intent === "play" && (phaseRef.current === "title" || phaseRef.current === "select")) {
        win.__puraIntent = null;
        startLevel(firstUnplayed(), true);
      }
      const pending = pendingRef.current;
      if (pending?.type === "play") {
        if (pending.id === 0) sim.sandboxTotal = sandboxCountRef.current;
        levelRef.current = pending.id;
        if (sim.w >= 120 && sim.drops.length === 0) sim.load(pending.id);
        if (sim.drops.length > 0) {
          pendingRef.current = null;
          setHud(sim.hud());
          phaseRef.current = "play";
          setPhase("play");
          setStarting(false);
          setBooted(true);
        }
      }
    };

    const size = () => {
      pump();
    };
    size();
    if (phaseRef.current === "title" && sim.drops.length === 0) sim.load(0);
    applyView();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);
    const iv = window.setInterval(pump, 50);
    const halt = window.setTimeout(() => window.clearInterval(iv), 8000);

    let hudAcc = 0;
    let marked = false;
    const loop = (now: number) => {
      const last = lastRef.current || now;
      const dt = (now - last) / 1000;
      lastRef.current = now;
      const paused = phaseRef.current === "pause" || phaseRef.current === "won";
      if (!paused && sim.w >= 120) sim.tick(dt);
      if (phaseRef.current === "play") renderer.warmGl();
      const ctx = ov.getContext("2d");
      if (ctx && sim.w >= 120) renderer.draw(sim.frame(), ctx);
      if (!marked && sim.w >= 120) {
        marked = true;
        setBooted(true);
      }
      hudAcc += dt;
      if (hudAcc > 0.12 && (phaseRef.current === "play" || phaseRef.current === "pause")) {
        hudAcc = 0;
        setHud(sim.hud());
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const warm = window.setTimeout(() => {
      if (phaseRef.current === "play") renderer.warmGl();
    }, 48);

    const vis = () => {
      if (document.visibilityState === "visible") audio.unlock();
    };
    document.addEventListener("visibilitychange", vis);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (phaseRef.current === "play") setPhase("pause");
        else if (phaseRef.current === "pause") setPhase("play");
      }
      if (e.code === "KeyR" && (phaseRef.current === "play" || phaseRef.current === "pause")) {
        sim.load(levelRef.current);
        setPhase("play");
      }
    };
    window.addEventListener("keydown", onKey);

    type PuraProbe = {
      phase: () => Phase;
      drops: () => number;
      load: (id: number) => void;
      positions: () => { x: number; y: number; r: number }[];
      hud: () => HudSnap;
      engine: PuraSim;
    };
    (window as Window & { __pura?: PuraProbe }).__pura = {
      phase: () => phaseRef.current,
      drops: () => sim.drops.length,
      load: (id: number) => {
        levelRef.current = id;
        applyView();
        sim.load(id);
        applyView();
        phaseRef.current = "play";
        setPhase("play");
        setStarting(false);
      },
      positions: () => sim.drops.map((d) => ({ x: d.x, y: d.y, r: d.r })),
      hud: () => sim.hud(),
      engine: sim,
    };

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(warm);
      window.clearInterval(iv);
      window.clearTimeout(halt);
      ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
    };
  }, []);

  function startLevel(id: number, force = false) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && now - lastStartAt.current < 400 && phaseRef.current === "play") return;
    setStarting(true);
    lastStartAt.current = now;
    const sim = ensureSim();
    suppressGrabRef.current = true;
    levelRef.current = id;
    if (id === 0) sim.sandboxTotal = sandboxCountRef.current;
    applyView();
    sim.load(id);
    applyView();
    try {
      audioRef.current?.unlock();
    } catch {
      /* autoplay policies must not block start */
    }
    pendingRef.current = { type: "play", id };
    phaseRef.current = "play";
    setPhase("play");
    if (sim.drops.length === 0) return;
    pendingRef.current = null;
    setHud(sim.hud());
    setStarting(false);
  }

  function goSelect() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastStartAt.current < 400 && phaseRef.current === "select") return;
    lastStartAt.current = now;
    phaseRef.current = "select";
    setPhase("select");
    try {
      audioRef.current?.unlock();
    } catch {
      /* ignore */
    }
  }

  apiRef.current.play = () => {
    if (phaseRef.current !== "title") return;
    startLevel(firstUnplayed());
  };
  apiRef.current.select = () => {
    if (phaseRef.current !== "title") return;
    goSelect();
  };

  function onPointerDown(e: React.PointerEvent) {
    if (phaseRef.current !== "play") return;
    if (suppressGrabRef.current) return;
    audioRef.current?.unlock();
    const sim = simRef.current;
    const wrap = wrapRef.current;
    if (!sim || !wrap) return;
    wrap.setPointerCapture(e.pointerId);
    const rect = wrap.getBoundingClientRect();
    sim.pointerDown(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (phaseRef.current !== "play") return;
    const sim = simRef.current;
    const wrap = wrapRef.current;
    if (!sim || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    sim.pointerMove(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onPointerUp(e: React.PointerEvent) {
    suppressGrabRef.current = false;
    wrapRef.current?.releasePointerCapture(e.pointerId);
    simRef.current?.pointerUp();
  }

  function setSandboxCount(n: number) {
    const nextCount = clampSandboxCount(n);
    sandboxCountRef.current = nextCount;
    const next = { ...save, sandboxDrops: nextCount };
    setSave(next);
    writeSave(next);
    const sim = simRef.current;
    if (!sim || levelRef.current !== 0) return;
    suppressGrabRef.current = true;
    sim.sandboxTotal = nextCount;
    sim.load(0);
    setHud(sim.hud());
  }

  function bumpSandbox(delta: number) {
    setSandboxCount(sandboxCountRef.current + delta);
  }

  function toggleMute() {
    const next = { ...save, muted: !save.muted };
    setSave(next);
    writeSave(next);
    audioRef.current?.setMuted(next.muted);
  }

  const nextId = levelRef.current + 1;
  const hasNext = nextId >= 1 && nextId <= 8;

  return (
    <main className="grain absolute inset-0 overflow-hidden bg-bg text-fg">
      <div
        ref={wrapRef}
        className={cn(
          "absolute inset-0 z-0",
          phase === "play" ? "touch-none" : "pointer-events-none",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas
          ref={glRef}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            phase === "play" || phase === "pause" || phase === "won" ? "block" : "hidden",
          )}
        />
        <canvas
          ref={ovRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>

      {phase === "title" && !booted && <BootScreen />}
      {phase === "title" && booted && (
        <TitleScreen
          onPlay={() => startLevel(firstUnplayed())}
          onSelect={goSelect}
          starting={starting}
        />
      )}
      {phase === "select" && (
        <LevelSelect
          best={save.best}
          onBack={() => {
            phaseRef.current = "title";
            setPhase("title");
          }}
          onPick={startLevel}
        />
      )}
      {(phase === "play" || phase === "pause" || phase === "won") && (
        <Hud
          hud={hud}
          muted={save.muted}
          onPause={() => setPhase("pause")}
          onMute={toggleMute}
          onReset={hud.sandbox ? () => startLevel(levelRef.current, true) : undefined}
          sandboxCount={save.sandboxDrops}
          onSandboxBump={hud.sandbox ? bumpSandbox : undefined}
        />
      )}
      {phase === "pause" && (
        <PauseMenu
          onResume={() => setPhase("play")}
          onRetry={() => startLevel(levelRef.current, true)}
          onMenu={() => {
            simRef.current?.load(0);
            phaseRef.current = "title";
            setPhase("title");
          }}
        />
      )}
      {phase === "won" && (
        <WinScreen
          stars={result.stars}
          time={result.time}
          purity={result.purity}
          hasNext={hasNext}
          onNext={() => startLevel(nextId)}
          onRetry={() => startLevel(levelRef.current, true)}
          onMenu={() => {
            simRef.current?.load(0);
            phaseRef.current = "title";
            setPhase("title");
          }}
        />
      )}
    </main>
  );
}
