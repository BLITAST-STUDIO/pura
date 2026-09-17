import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/game-app";
import "@/styles.css";

async function boot() {
  const el = document.getElementById("root");
  if (!el) return;
  if (new URLSearchParams(window.location.search).get('lab') === 'fusion') {
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
