import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cachePrefix, cacheVersion, precacheLists, serviceWorkerSource } from "./src/offline-sw";

const src = fileURLToPath(new URL("./src", import.meta.url));

const hash = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
function listFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(join(directory, entry.name), relative) : [relative];
  });
}
/** Writes dist/sw.js: every built file kept on the device for offline play (src/offline-sw.ts). Not for the itch ZIP (VITE_NO_SW=1). */
function offlineWorker(): Plugin {
  let out = "dist";
  return {
    name: "pura-offline-worker",
    apply: "build",
    configResolved(config) { out = join(config.root, config.build.outDir); },
    closeBundle: {
      order: "post",
      handler() {
        if (process.env.VITE_NO_SW === "1") return;
        const names = listFiles(out);
        const { core, optional } = precacheLists(names);
        const version = cacheVersion([...core, ...optional].map(name => ({ name, hash: hash(readFileSync(join(out, name))) })), hash);
        writeFileSync(join(out, "sw.js"), serviceWorkerSource({ prefix: cachePrefix(process.env.VITE_CHANNEL), version, core, optional }));
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react(), offlineWorker()],
  resolve: {
    alias: { "@": src },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    modulePreload: false,
    target: "es2018",
  },
});
