import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/game-app";
import "@/styles.css";

async function boot() {
  const el = document.getElementById("root");
  if (!el) return;
  if (new URLSearchParams(window.location.search).get('play') === 'free') {
    try {
      const { default: FreePlay } = await import('./experiments/free/FreePlay');
      createRoot(el).render(<FreePlay />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else if (new URLSearchParams(window.location.search).get('play') === 'stages') {
    try {
      const { default: StagePlay } = await import('./experiments/stages/StagePlay');
      createRoot(el).render(<StagePlay />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else if (new URLSearchParams(window.location.search).get('play') === 'open') {
    try {
      const { default: OpenPlay } = await import('./experiments/open-play/OpenPlay');
      createRoot(el).render(<OpenPlay />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else if (['first', 'chapters'].includes(new URLSearchParams(window.location.search).get('play') ?? '')) {
    try {
      const { default: PurityScene } = await import('./experiments/purity-scene/PurityScene');
      createRoot(el).render(<PurityScene />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else if (new URLSearchParams(window.location.search).get('lab') === 'fusion') {
    try {
      const { default: FusionLab } = await import('./experiments/fusion-lab/FusionLab');
      createRoot(el).render(<FusionLab />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else if (new URLSearchParams(window.location.search).get('lab') === 'droplets') {
    try {
      const { DropletLab } = await import('./experiments/droplet-lab/DropletLab');
      createRoot(el).render(<DropletLab />);
    } catch {
      el.textContent = '水滴の準備ができませんでした。ページを再読み込みしてください。';
    }
  } else {
    createRoot(el).render(<GameApp />);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
