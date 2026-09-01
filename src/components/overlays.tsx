"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEVELS, SANDBOX, SANDBOX_COUNT } from "@/game/levels";
import type { HudSnap } from "@/game/sim";
import type { LevelRecord } from "@/game/save";
import { HUE_LABEL, type HueId } from "@/game/palette";
import { cn } from "@/lib/utils";

const HUE_CLASS: Record<HueId, string> = {
  cyan: "bg-cyan",
  rose: "bg-rose",
  amber: "bg-amber",
};

const HUE_TEXT: Record<HueId, string> = {
  cyan: "text-cyan",
  rose: "text-rose",
  amber: "text-amber",
};

function pressProps(fn: () => void) {
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button > 0) return;
      e.stopPropagation();
      fn();
    },
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      fn();
    },
  };
}

function LoadMark({ label }: { label: string }) {
  return (
    <div className="mt-8 flex items-center gap-5">
      <div className="pura-load" aria-hidden>
        <span className="pura-load-track" />
        <span className="pura-load-ring">
          <span className="bg-cyan" />
        </span>
        <span className="pura-load-ring pura-load-ring-2">
          <span className="bg-rose" />
        </span>
        <span className="pura-load-ring pura-load-ring-3">
          <span className="bg-amber" />
        </span>
        <span className="pura-load-core" />
      </div>
      <div>
        <p className="text-sm text-muted">
          {label}
          <span className="pura-load-dots" />
        </p>
        <p className="mt-1 text-[11px] tracking-wide text-subtle">画面をタップしておくと、準備でき次第開始します</p>
      </div>
    </div>
  );
}

export function BootScreen() {
  return (
    <main className="grain absolute inset-0 overflow-hidden bg-bg text-fg">
      <div
        data-pura-act="play"
        className="absolute inset-0 z-50 flex flex-col justify-center px-6 py-16"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <span className="absolute left-[8%] top-[14%] size-44 rounded-full bg-cyan/30 blur-3xl" />
          <span className="absolute right-[6%] top-[28%] size-52 rounded-full bg-rose/25 blur-3xl" />
          <span className="absolute bottom-[16%] left-[38%] size-40 rounded-full bg-amber/25 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <p className="text-xs font-medium tracking-[0.28em] text-muted">LIQUID CORE</p>
          <h1 className="font-display mt-3 text-6xl font-semibold tracking-[-0.04em] text-fg sm:text-7xl">
            PURA
          </h1>
          <LoadMark label="読み込み中" />
        </div>
      </div>
    </main>
  );
}

export function TitleScreen({
  onPlay,
  onSelect,
  starting,
}: {
  onPlay: () => void;
  onSelect: () => void;
  starting?: boolean;
}) {
  return (
    <div
      data-pura-act="play"
      className="absolute inset-0 z-[100] flex flex-col justify-center bg-bg px-6 py-16 pointer-events-auto"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <span className="absolute left-[8%] top-[14%] size-44 rounded-full bg-cyan/30 blur-3xl" />
        <span className="absolute right-[6%] top-[28%] size-52 rounded-full bg-rose/25 blur-3xl" />
        <span className="absolute bottom-[16%] left-[38%] size-40 rounded-full bg-amber/25 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <p className="rise-in text-xs font-medium tracking-[0.28em] text-muted">
          LIQUID CORE
        </p>
        <h1 className="font-display mt-3 text-6xl font-semibold tracking-[-0.04em] text-fg sm:text-7xl">
          PURA
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          散らばる雫を集め、ひとつの核にする。同色は融け合い、混色は純度を削る。
        </p>
        <ul className="mt-6 space-y-1.5 text-xs leading-relaxed text-subtle">
          <li>ドラッグで掴む。同色は自然に凝集する。</li>
          <li>異色は弾く。ゆっくり押し込むと混ざり、純度が落ちる。</li>
          <li>混ざっても同色を足せば純度は戻る。ダブルタップで分離もできる。</li>
        </ul>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            data-pura-act="play"
            className="relative z-10 h-14 flex-1"
            {...pressProps(onPlay)}
          >
            {starting ? "開始しています" : "開始"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            data-pura-act="select"
            className="relative z-10 h-14 flex-1"
            {...pressProps(onSelect)}
          >
            ステージ
          </Button>
        </div>
        <p className="mt-4 text-[11px] tracking-wide text-subtle">
          {starting ? "場を開いています…" : "画面をタップしても開始"}
        </p>
      </div>
    </div>
  );
}

export function LevelSelect({
  best,
  onBack,
  onPick,
}: {
  best: Record<string, LevelRecord>;
  onBack: () => void;
  onPick: (id: number) => void;
}) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-bg/92 px-5 py-8 pointer-events-auto">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center gap-1 text-sm text-muted hover:text-fg"
        >
          <ChevronLeft className="size-4" />
          戻る
        </button>
        <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight">ステージ</h2>
        <p className="mt-2 text-sm text-muted">色を分け、核の純度を保て。</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LEVELS.map((lv) => {
            const rec = best[String(lv.id)];
            return (
              <button
                key={lv.id}
                type="button"
                onClick={() => onPick(lv.id)}
                className="flex min-h-28 flex-col items-start rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-left transition-[background-color,border-color] duration-[var(--motion-quick)] hover:bg-surface-2"
              >
                <span className="text-[11px] tracking-[0.2em] text-subtle">{lv.code}</span>
                <span className="font-display mt-2 text-lg font-medium">{lv.name}</span>
                <span className="mt-auto flex gap-1 pt-3">
                  {[1, 2, 3].map((s) => (
                    <span
                      key={s}
                      className={cn(
                        "h-1 w-4 rounded-full",
                        rec && rec.stars >= s ? "bg-accent" : "bg-border",
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onPick(0)}
          className="mt-3 flex w-full items-center justify-between rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-4 text-left hover:bg-surface-2"
        >
          <span>
            <span className="block text-[11px] tracking-[0.2em] text-subtle">{SANDBOX.code}</span>
            <span className="font-display mt-1 block text-lg">{SANDBOX.name}</span>
          </span>
          <span className="text-xs text-muted">エンドレス</span>
        </button>
      </div>
    </div>
  );
}

export function Hud({
  hud,
  muted,
  onPause,
  onMute,
  onReset,
  sandboxCount,
  onSandboxBump,
}: {
  hud: HudSnap;
  muted: boolean;
  onPause: () => void;
  onMute: () => void;
  onReset?: () => void;
  sandboxCount?: number;
  onSandboxBump?: (delta: number) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg/70 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] tracking-[0.22em] text-subtle">{hud.code}</span>
            <span className="font-display text-sm font-medium">{hud.name}</span>
          </div>
          {!hud.sandbox && (
            <div className="mt-2 flex gap-3">
              {hud.cores.map((c) => {
                const pct = c.target <= 0 ? 0 : Math.min(1, c.mass / c.target);
                return (
                  <div key={c.hue} className="w-16">
                    <div className="flex justify-between text-[10px] tracking-wide text-muted">
                      <span className={HUE_TEXT[c.hue]}>{HUE_LABEL[c.hue]}</span>
                      <span className="tabular">{Math.round(pct * 100)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                      <div
                        className={cn("h-full rounded-full", HUE_CLASS[c.hue])}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-subtle tabular">
                      純度 {c.purity > 0 ? Math.round(c.purity * 100) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {hud.sandbox && (
            <div className="mt-2">
              <div className="text-[11px] tracking-wide text-muted">
                エンドレス
                <span className="ml-2 tabular text-subtle">いま {hud.drops}</span>
              </div>
              {onSandboxBump && (
                <div className="pointer-events-auto mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] tracking-wide text-subtle">初期</span>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-sm text-fg hover:bg-surface-2 disabled:opacity-30"
                    disabled={(sandboxCount ?? SANDBOX_COUNT.fallback) <= SANDBOX_COUNT.min}
                    aria-label="初期の雫を減らす"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSandboxBump(-SANDBOX_COUNT.step);
                    }}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm tabular text-fg">
                    {sandboxCount ?? SANDBOX_COUNT.fallback}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-11 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface text-sm text-fg hover:bg-surface-2 disabled:opacity-30"
                    disabled={(sandboxCount ?? SANDBOX_COUNT.fallback) >= SANDBOX_COUNT.max}
                    aria-label="初期の雫を増やす"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSandboxBump(SANDBOX_COUNT.step);
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex gap-2">
          {onReset && (
            <Button variant="subtle" size="icon" onClick={onReset} aria-label="初期状態に戻す">
              <RotateCcw className="size-4" />
            </Button>
          )}
          <Button variant="subtle" size="icon" onClick={onMute} aria-label={muted ? "サウンドオン" : "ミュート"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button variant="subtle" size="icon" onClick={onPause} aria-label="一時停止">
            <Pause className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="max-w-[70%] text-[11px] leading-relaxed text-muted">{hud.hint}</p>
        {hud.selectedPurity != null && hud.selectedHue && (
          <div className="rounded-full border border-border bg-bg/70 px-3 py-1.5 text-[11px] tabular backdrop-blur-sm">
            <span className={HUE_TEXT[hud.selectedHue]}>{HUE_LABEL[hud.selectedHue]}</span>
            <span className="ml-2 text-fg">{Math.round(hud.selectedPurity * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PauseMenu({
  onResume,
  onRetry,
  onMenu,
}: {
  onResume: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-6 backdrop-blur-[2px] pointer-events-auto">
      <div className="w-full max-w-sm rounded-[calc(var(--radius-md)+24px)] border border-border bg-surface p-6">
        <h2 className="font-display text-2xl font-semibold">一時停止</h2>
        <p className="mt-2 text-sm text-muted">場はそのまま残る。</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" {...pressProps(onResume)}>
            <Play className="size-4" />
            再開
          </Button>
          <Button size="lg" variant="ghost" {...pressProps(onRetry)}>
            <RotateCcw className="size-4" />
            やり直す
          </Button>
          <Button size="lg" variant="subtle" {...pressProps(onMenu)}>
            メニュー
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WinScreen({
  stars,
  time,
  purity,
  hasNext,
  onNext,
  onRetry,
  onMenu,
}: {
  stars: number;
  time: number;
  purity: number;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70 px-6 backdrop-blur-[2px] pointer-events-auto">
      <div className="w-full max-w-sm rounded-[calc(var(--radius-md)+24px)] border border-border bg-surface p-6">
        <p className="text-[11px] tracking-[0.24em] text-muted">CORE STABLE</p>
        <h2 className="font-display mt-2 text-2xl font-semibold">凝集完了</h2>
        <div className="mt-5 flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                stars >= s ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-3">
            <div className="text-[11px] text-subtle">時間</div>
            <div className="mt-1 tabular text-fg">{formatTime(time)}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-border bg-bg px-3 py-3">
            <div className="text-[11px] text-subtle">平均純度</div>
            <div className="mt-1 tabular text-fg">{Math.round(purity * 100)}%</div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {hasNext && (
            <Button size="lg" {...pressProps(onNext)}>
              次へ
            </Button>
          )}
          <Button size="lg" variant="ghost" {...pressProps(onRetry)}>
            やり直す
          </Button>
          <Button size="lg" variant="subtle" {...pressProps(onMenu)}>
            メニュー
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
