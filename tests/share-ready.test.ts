import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
/** Width and height from a PNG's header. */
const png = (path: string) => { const b = readFileSync(path); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('the page stays out of search results but previews well in messages', () => {
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /property="og:image" content="https:\/\/blitast-studio\.github\.io\/pura\/og\.jpg"/, 'messaging apps need an absolute image URL');
  assert.ok(existsSync('public/og.jpg'));
});

test('it can be added to the home screen and opens like an app', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'PURA');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './', 'relative, so the stable root and /next/ each start at home');
  for (const icon of manifest.icons) {
    const [w, h] = png(`public/${icon.src}`);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
  assert.ok(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable'));
  assert.deepEqual(png('public/apple-touch-icon.png'), [180, 180]);
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/apple-touch-icon\.png"/);
  assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
});
