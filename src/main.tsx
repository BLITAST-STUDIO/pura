import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import "@/styles.css";
import { routeKey, type RouteKey } from "./route-key";

/**
 * Entry routing. Since 2026-09-26 the bare URL opens the new instant play
 * (requirement 7.1: touch the drops at once). The original PURA stays whole at
 * ?play=classic. Every screen is loaded on demand.
 */
type Route = () => Promise<ComponentType>;
const routes: Record<RouteKey, Route> = {
  "play=classic": async () => (await import("@/components/game-app")).GameApp,
  "play=bench": async () => (await import("./experiments/bench/BenchPlay")).default,
  "play=free": async () => (await import("./experiments/free/FreePlay")).default,
  "play=stages": async () => (await import("./experiments/stages/StagePlay")).default,
  "play=open": async () => (await import("./experiments/open-play/OpenPlay")).default,
  "play=first": async () => (await import("./experiments/purity-scene/PurityScene")).default,
  "play=chapters": async () => (await import("./experiments/purity-scene/PurityScene")).default,
  "lab=fusion": async () => (await import("./experiments/fusion-lab/FusionLab")).default,
  "lab=droplets": async () => (await import("./experiments/droplet-lab/DropletLab")).DropletLab,
};

async function boot() {
  const el = document.getElementById("root");
  if (!el) return;
  try {
    const Screen = await routes[routeKey(window.location.search)]();
    createRoot(el).render(<Screen />);
  } catch {
    el.textContent = "水滴の準備ができませんでした。ページを再読み込みしてください。";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
