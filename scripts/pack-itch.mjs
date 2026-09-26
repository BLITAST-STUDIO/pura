#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function listFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? listFiles(join(directory, entry.name), relative)
      : [relative];
  }).sort();
}

/** Keep Vite's HTML, module imports, styles and relative asset paths intact. */
export function packageBuild(buildDirectory, destination) {
  const files = listFiles(buildDirectory);
  if (!files.includes("index.html")) throw new Error("Build output is missing index.html.");
  const css = files.filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(join(buildDirectory, name), "utf8")).join("\n");
  const absoluteUtilities = (css.match(/\.absolute\b/g) || []).length;
  const flexUtilities = (css.match(/\.flex\b/g) || []).length;
  if (absoluteUtilities === 0 || flexUtilities === 0) {
    throw new Error(`Build CSS missing utilities (absolute=${absoluteUtilities} flex=${flexUtilities}). Tailwind @source failed.`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  // Python is already used by the original packaging command. Arguments keep
  // filesystem paths out of executable source, including paths with spaces.
  const zip = spawnSync("python3", ["-c", `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(root).as_posix())
`, resolve(buildDirectory), resolve(destination)], { encoding: "utf8" });
  if (zip.error) throw zip.error;
  if (zip.status !== 0) throw new Error(zip.stderr || `ZIP creation failed (${zip.status}).`);
  return { files, bytes: statSync(destination).size, absoluteUtilities, flexUtilities };
}

function main() {
  const build = spawnSync("npx", ["vite", "build"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);

  const zipPath = join(root, "artifacts", "pura-html.zip");
  const result = packageBuild(join(root, "dist"), zipPath);
  console.log(`css ok  absolute=${result.absoluteUtilities} flex=${result.flexUtilities}`);
  console.log(`packed ${zipPath} (${(result.bytes / 1024).toFixed(1)} KB, ${result.files.length} files)`);
}

// Importing the helper in tests must not trigger a build or replace an archive.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
