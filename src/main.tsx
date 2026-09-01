import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/game-app";
import "@/styles.css";

function boot() {
  const el = document.getElementById("root");
  if (!el) return;
  createRoot(el).render(<GameApp />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
