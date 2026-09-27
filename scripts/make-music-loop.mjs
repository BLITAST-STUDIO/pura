// Bake the BGM loop (docs/pura-v1/MUSIC.md). The generated track builds, then fades out,
// so it does not loop as is: the intro [0, B) plays once, then [B, E) repeats. The last
// CROSSFADE seconds before E fade in the seconds just before B, so wrapping from E to B
// continues exactly as the first pass did. B and E were chosen where the harmony and the
// spectrum of the two joined stretches match best (scratch analysis, 2026-09-27).
// Usage (macOS): afconvert -f WAVE -d LEF32 assets-src/music/the-white-basin.mp3 /tmp/src.wav
//   node scripts/make-music-loop.mjs /tmp/src.wav /tmp/loop.wav
//   afconvert -f m4af -d aac -b 160000 /tmp/loop.wav public/audio/the-white-basin-v1.m4a
import { readFileSync, writeFileSync } from 'node:fs';
import { MUSIC_LOOP } from '../src/experiments/sensory/music-loop.ts';

const [input, output] = process.argv.slice(2);
const buf = readFileSync(input);
let p = 12, data, rate, channels;
while (p < buf.length) {
  const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
  if (id === 'fmt ') { channels = buf.readUInt16LE(p + 10); rate = buf.readUInt32LE(p + 12); }
  if (id === 'data') { data = new Float32Array(buf.buffer.slice(buf.byteOffset + p + 8, buf.byteOffset + p + 8 + size)); break; }
  p += 8 + size + (size & 1);
}
const { loopStart, loopEnd, crossfade } = MUSIC_LOOP;
const B = Math.round(loopStart * rate), E = Math.round(loopEnd * rate), O = Math.round(crossfade * rate);
// Half a second past E carries on from B, in case a decoder's loop end lands a hair late.
const extra = Math.round(0.5 * rate), length = E + extra;
const out = new Float32Array(length * channels);
for (let c = 0; c < channels; c++) {
  const at = i => data[i * channels + c];
  for (let i = 0; i < E - O; i++) out[i * channels + c] = at(i);
  for (let i = 0; i < O; i++) {
    const t = (i + 0.5) / O * Math.PI / 2; // equal power: the two stretches are unrelated moments
    out[(E - O + i) * channels + c] = at(E - O + i) * Math.cos(t) + at(B - O + i) * Math.sin(t);
  }
  for (let i = 0; i < extra; i++) out[(E + i) * channels + c] = at(B + i);
}
let peak = 0, sum = 0;
for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
for (let i = B * channels; i < E * channels; i++) sum += out[i] * out[i];
const scale = peak > 0.97 ? 0.97 / peak : 1;
const pcm = Buffer.alloc(out.length * 2);
for (let i = 0; i < out.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[i] * scale * 32767))), i * 2);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(output, Buffer.concat([header, pcm]));
const db = x => (20 * Math.log10(x)).toFixed(2);
console.log({ seconds: length / rate, loop: [loopStart, loopEnd], peakDb: db(peak * scale), loopRmsDb: db(Math.sqrt(sum / ((E - B) * channels)) * scale), scale });
