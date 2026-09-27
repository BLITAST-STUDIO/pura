/**
 * The BGM (2026-09-27, RYO: ambient music, generated with Gemini: "The White
 * Basin", a D drone with slow pads). The file is baked by
 * scripts/make-music-loop.mjs: the intro plays once, then [loopStart, loopEnd)
 * repeats, its last `crossfade` seconds already blended into what precedes
 * loopStart. Times are seconds of the baked file. No CSS here, so Node tests
 * can import it.
 */
export const MUSIC_LOOP = {
  file: 'audio/the-white-basin-v1.m4a',
  loopStart: 39.01,
  loopEnd: 131.98,
  crossfade: 10,
  /** Output gain: puts the loop at about -30 dBFS RMS, well under the touch sounds (peaks -20 to -11). */
  level: 0.15,
} as const;

export type MusicLoop = typeof MUSIC_LOOP;

/** Where `played` seconds of playback from the start land in the file. */
export function musicPosition(played: number, loop: Pick<MusicLoop, 'loopStart' | 'loopEnd'> = MUSIC_LOOP): number {
  if (!(played > 0)) return 0;
  if (played < loop.loopEnd) return played;
  return loop.loopStart + (played - loop.loopStart) % (loop.loopEnd - loop.loopStart);
}
