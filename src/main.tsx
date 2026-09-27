import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import "@/styles.css";
import { routeKey, type RouteKey } from "./route-key";
import { welcomed } from "./experiments/welcome/steps";

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
  "play=hitofude": async () => (await import("./experiments/hitofude/HitofudePlay")).default,
  "play=michi": async () => (await import("./experiments/michi/MichiPlay")).default,
  "play=curling": async () => (await import("./experiments/curling/CurlingPlay")).default,
  "play=welcome": async () => (await import("./experiments/welcome/WelcomePlay")).default,
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
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* private mode */ }
    const Screen = await routes[routeKey(window.location.search, welcomed(storage))]();
    createRoot(el).render(<Screen />);
  } catch {
    el.textContent = "水滴の準備ができませんでした。ページを再読み込みしてください。";
  }
}

// The trial channel (/next/, built with VITE_CHANNEL=next) says so in a corner,
// so nobody mistakes it for the version shared with family and friends.
if (import.meta.env.VITE_CHANNEL === "next") {
  const tag = document.createElement("div");
  tag.textContent = "試作版";
  tag.setAttribute("aria-hidden", "true");
  tag.style.cssText = "position:fixed;left:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:9999;padding:3px 8px;border-radius:999px;background:rgba(30,40,44,.55);color:#f2f1ec;font:10px/1.4 -apple-system,sans-serif;letter-spacing:.1em;pointer-events:none";
  document.body.appendChild(tag);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
