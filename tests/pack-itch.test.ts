import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { packageBuild } from "../scripts/pack-itch.mjs";

test("itch archive preserves Vite module HTML, lazy chunks and relative nested assets", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "pura pack fixture "));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const buildDirectory = join(temporary, "dist");
  const fixture: Record<string, string> = {
    "index.html": '<!doctype html><script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="stylesheet" href="./assets/main-abc.css">',
    "favicon.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    "assets/index-abc.js": 'import("./droplet-lab-def.js");',
    "assets/droplet-lab-def.js": 'export const texture = new URL("./textures/floor.svg", import.meta.url);',
    "assets/main-abc.css": '.absolute{position:absolute}.flex{display:flex}',
    "assets/droplet-lab-def.css": '.lab{background:url("./textures/floor.svg")}',
    "assets/textures/floor.svg": '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10"/></svg>',
  };
  for (const [relative, content] of Object.entries(fixture)) {
    const target = join(buildDirectory, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const destination = join(temporary, "artifacts", "pura-html.zip");
  const result = packageBuild(buildDirectory, destination);
  const inspect = spawnSync("python3", ["-c", `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps({name: archive.read(name).decode("utf-8") for name in archive.namelist()}))
`, destination], { encoding: "utf8" });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.deepEqual(JSON.parse(inspect.stdout), fixture);
  assert.deepEqual(result.files, Object.keys(fixture).sort());
  assert.ok(result.bytes > 0);
  for (const [relative, content] of Object.entries(fixture)) {
    assert.equal(readFileSync(join(buildDirectory, relative), "utf8"), content,
      `Packaging must not rewrite build file ${relative}.`);
  }
});

test("itch packaging retains the existing Tailwind utility validation", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "pura-invalid-pack-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  writeFileSync(join(temporary, "index.html"), "<!doctype html>");
  writeFileSync(join(temporary, "main.css"), ".lab{display:block}");
  assert.throws(() => packageBuild(temporary, join(temporary, "pura-html.zip")), /CSS missing utilities/);
});
