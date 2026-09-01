#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outDir = join(root, "dist");
const artifacts = join(root, "artifacts");
const zipPath = join(artifacts, "pura-html.zip");

mkdirSync(artifacts, { recursive: true });

const build = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

copyFileSync(join(root, "public", "favicon.svg"), join(outDir, "favicon.svg"));

const assetDir = join(outDir, "assets");
const assets = readdirSync(assetDir);
const jsName = assets.find((f) => f.endsWith(".js"));
const cssName = assets.find((f) => f.endsWith(".css"));
if (!jsName || !cssName) {
  console.error("missing js/css in", assets);
  process.exit(1);
}

copyFileSync(join(assetDir, jsName), join(outDir, "game.js"));
copyFileSync(join(assetDir, cssName), join(outDir, "game.css"));
rmSync(assetDir, { recursive: true, force: true });

const cssText = readFileSync(join(outDir, "game.css"), "utf8");
const absHits = (cssText.match(/\.absolute\b/g) || []).length;
const flexHits = (cssText.match(/\.flex\b/g) || []).length;
if (absHits === 0 || flexHits === 0) {
  console.error(
    `game.css missing utilities (absolute=${absHits} flex=${flexHits}). Tailwind @source failed.`,
  );
  process.exit(1);
}
console.log(`css ok  absolute=${absHits} flex=${flexHits}  ${(cssText.length / 1024).toFixed(1)} KB`);

let html = readFileSync(join(outDir, "index.html"), "utf8");
html = html.replace(/<script type="module"[^>]*><\/script>\s*/g, "");
html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, "");
html = html.replace(/<link[^>]*href="\.\/assets\/[^"]+"[^>]*>\s*/g, "");
html = html.replace("</head>", `    <link rel="stylesheet" href="./game.css" />\n  </head>`);
if (!html.includes('src="./game.js"')) {
  html = html.replace(
    "</body>",
    `    <script src="./game.js" defer onerror="__puraFail('game.js を読み込めません')"></script>\n  </body>`,
  );
}
writeFileSync(join(outDir, "index.html"), html);

rmSync(zipPath, { force: true });
const py = `
import zipfile, os
root = ${JSON.stringify(outDir)}
out = ${JSON.stringify(zipPath)}
keep = {"index.html", "game.js", "game.css", "favicon.svg"}
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(root):
        for name in files:
            rel = os.path.relpath(os.path.join(dirpath, name), root).replace("\\\\", "/")
            if rel in keep:
                z.write(os.path.join(dirpath, name), os.path.basename(name))
print("wrote", out, os.path.getsize(out), zipfile.ZipFile(out).namelist())
`;
const zip = spawnSync("python3", ["-c", py], { cwd: root, stdio: "inherit" });
if (zip.status !== 0) process.exit(zip.status ?? 1);
console.log(`packed ${zipPath} (${(statSync(zipPath).size / 1024).toFixed(1)} KB)`);
