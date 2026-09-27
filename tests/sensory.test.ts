import assert from 'node:assert/strict';
import test from 'node:test';
import { fusionCue, impactCue, ImpactGate, IMPACT_THRESHOLD, panFor, sizeFactor } from '../src/experiments/sensory/cues';
import { createSensoryFeedback, readSensoryPreferences, SENSORY_KEY, writeSensoryPreferences } from '../src/experiments/sensory/feedback';
import { detectHapticMode, type Haptics } from '../src/experiments/sensory/haptics';
import type { DropletAudio } from '../src/experiments/sensory/audio';
import type { Music } from '../src/experiments/sensory/music';
import { MUSIC_LOOP, MUSIC_VOLUME_DEFAULT, musicGain, musicPosition, volumeCurve } from '../src/experiments/sensory/music-loop';
import { existsSync, statSync } from 'node:fs';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, data };
}

function fakes() {
  const played: { name: string; args: unknown[] }[] = [];
  const pulses: (number | number[])[] = [];
  const audio: DropletAudio = {
    context: null,
    unlock() { played.push({ name: 'unlock', args: [] }); },
    setEnabled(enabled) { played.push({ name: 'enabled', args: [enabled] }); },
    setVolume(volume) { played.push({ name: 'volume', args: [volume] }); },
    touch: (...args) => { played.push({ name: 'touch', args }); },
    impact: (...args) => { played.push({ name: 'impact', args }); },
    fusion: (...args) => { played.push({ name: 'fusion', args }); },
    chime: (...args) => { played.push({ name: 'chime', args }); },
    rewind: () => { played.push({ name: 'rewind', args: [] }); },
    split: (...args) => { played.push({ name: 'split', args }); },
    dispose() {},
  };
  const haptics: Haptics = { mode: 'vibrate', setEnabled() {}, pulse: p => { pulses.push(p); }, dispose() {} };
  return { audio, haptics, played, pulses };
}

test('larger drops sound lower, within a gentle bounded range', () => {
  assert.equal(sizeFactor(44), 1);
  assert.ok(sizeFactor(88) < sizeFactor(44) && sizeFactor(22) > sizeFactor(44));
  assert.ok(sizeFactor(1e6) >= 0.62 && sizeFactor(1) <= 1.45);
  assert.equal(sizeFactor(Number.NaN), 1);
});

test('stereo position stays narrow and centred', () => {
  assert.equal(panFor(275, 550), 0);
  assert.ok(panFor(0, 550) < 0 && panFor(550, 550) > 0);
  assert.ok(Math.abs(panFor(-900, 550)) <= 0.35);
  assert.equal(panFor(10, 0), 0);
});

test('soft touches are silent; impacts grow with force but never exceed full scale', () => {
  assert.equal(impactCue(IMPACT_THRESHOLD - 1, 44, 'wall'), null);
  const soft = impactCue(IMPACT_THRESHOLD + 20, 44, 'wall')!;
  const hard = impactCue(800, 44, 'wall')!;
  const extreme = impactCue(1e6, 44, 'obstacle')!;
  assert.ok(soft.gain > 0 && soft.gain < hard.gain && hard.gain <= extreme.gain);
  assert.equal(extreme.gain, 1);
  assert.ok(soft.haptic < hard.haptic && extreme.haptic <= 18);
  assert.equal(extreme.surface, 'obstacle');
});

test('a pure fusion rings clear; a mixed one is muddier and pulses twice', () => {
  const pure = fusionCue(60, 1);
  const mixed = fusionCue(60, 0.62);
  assert.equal(pure.clarity, 1);
  assert.ok(mixed.clarity < 0.3);
  assert.deepEqual(pure.haptic, [12]);
  assert.equal(mixed.haptic.length, 3);
  assert.equal(fusionCue(60, 0.999).clarity, 1, 'rounding noise still counts as pure');
});

test('holding a drop against a wall is one impact, a later separate hit is another', () => {
  const gate = new ImpactGate();
  assert.equal(gate.onset(1, 0), true);
  for (let frame = 1; frame < 120; frame++) assert.equal(gate.onset(1, frame / 60), false);
  assert.equal(gate.onset(1, 2 + 0.2), true, 'after a quiet gap');
  assert.equal(gate.onset(2, 2.21), true, 'drops are independent');
});

test('preferences default on, persist, ignore malformed data, and URL can mute one visit', () => {
  const store = memoryStorage();
  assert.deepEqual(readSensoryPreferences(store, ''), { sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.equal(writeSensoryPreferences({ sound: false, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 }, store), true);
  assert.deepEqual(readSensoryPreferences(store, ''), { sound: false, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.deepEqual(readSensoryPreferences(memoryStorage({ [SENSORY_KEY]: '{bad' }), ''), { sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.deepEqual(readSensoryPreferences(memoryStorage({ [SENSORY_KEY]: '{"v":2,"sound":false}' }), ''), { sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.deepEqual(readSensoryPreferences(store, '?haptics=off'), { sound: false, haptics: false, music: true, soundVolume: 1, musicVolume: 0.6 });
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readSensoryPreferences(broken, ''), { sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.equal(writeSensoryPreferences({ sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 }, broken), false);
});

test('haptic mode: vibration where available, the iOS switch tick on iPhone, otherwise none', () => {
  assert.equal(detectHapticMode({ userAgent: 'Android', maxTouchPoints: 5, vibrate: () => true }), 'vibrate');
  assert.equal(detectHapticMode({ userAgent: 'Windows Chrome', maxTouchPoints: 0, vibrate: () => true }), 'none', 'no motor on desktop');
  assert.equal(detectHapticMode({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }), 'ios-switch');
  assert.equal(detectHapticMode({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), 'ios-switch');
  assert.equal(detectHapticMode({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), 'none');
  assert.equal(detectHapticMode(undefined), 'none');
});

test('feedback routes each event once, gates sustained contact, and counts what it issued', () => {
  const { audio, haptics, played, pulses } = fakes();
  const feedback = createSensoryFeedback({ audio, haptics });
  feedback.grab(44, 100, 550);
  for (let frame = 0; frame < 30; frame++) feedback.contact(7, 600, 44, 30, 550, 'wall', frame / 60);
  feedback.contact(7, 20, 44, 30, 550, 'wall', 5);
  feedback.fusion(76, 275, 550, 1);
  feedback.ready('cyan');
  feedback.delivered('cyan', true);
  feedback.rewind();
  const names = played.map(p => p.name);
  assert.deepEqual(names, ['touch', 'impact', 'fusion', 'chime', 'chime', 'rewind']);
  const impact = played[1].args as [number, number, string, number];
  assert.equal(impact[2], 'wall');
  assert.ok(impact[3] < 0, 'a left-side hit pans left');
  const finale = played[4].args as [number, number[]];
  assert.equal(finale[1].length, 4, 'finishing plays the full arpeggio');
  assert.equal(pulses.length, 6);
  assert.deepEqual(feedback.status().counts, { grab: 1, impact: 1, fusion: 1, ready: 1, delivered: 1, rewind: 1, split: 0 });
  feedback.dispose();
});

test('muting sound and haptics reaches both outputs', () => {
  const { audio, haptics, played } = fakes();
  let hapticsEnabled = true;
  haptics.setEnabled = enabled => { hapticsEnabled = enabled; };
  const feedback = createSensoryFeedback({ audio, haptics });
  feedback.setPreferences({ sound: false, haptics: false, music: true, soundVolume: 1, musicVolume: 0.6 });
  assert.deepEqual(played.at(-1), { name: 'enabled', args: [false] });
  assert.equal(hapticsEnabled, false);
  feedback.unlock();
  assert.ok(!played.some(p => p.name === 'unlock'), 'a muted page does not start audio');
  feedback.dispose();
});

test('the sound nudge appears only when sound is on, the board was touched, and audio is still blocked', async () => {
  const { soundNudgeNeeded } = await import('../src/experiments/sensory/sound-nudge-logic');
  assert.equal(soundNudgeNeeded('suspended', true, true), true);
  assert.equal(soundNudgeNeeded('interrupted', true, true), true, 'after a call or another app');
  assert.equal(soundNudgeNeeded('running', true, true), false);
  assert.equal(soundNudgeNeeded('suspended', false, true), false, 'not before the first touch');
  assert.equal(soundNudgeNeeded('suspended', true, false), false, 'not when sound is off');
  assert.equal(soundNudgeNeeded('idle', true, true), false);
});

function fakeMusic() {
  const calls: string[] = [];
  const music: Music = {
    setEnabled: on => { calls.push(`enabled:${on}`); },
    setVolume: volume => { calls.push(`volume:${volume}`); },
    update: () => { calls.push('update'); },
    status: () => ({ state: 'off', position: null, gain: 0 }),
    dispose: () => { calls.push('dispose'); },
  };
  return { music, calls };
}

test('the BGM follows its own switch and the sound switch, starts with a touch, and is remembered', () => {
  const store = memoryStorage();
  assert.equal(readSensoryPreferences(store, '').music, true, 'on by default');
  writeSensoryPreferences({ sound: true, haptics: true, music: false, soundVolume: 1, musicVolume: 0.6 }, store);
  assert.equal(readSensoryPreferences(store, '').music, false);
  assert.equal(readSensoryPreferences(memoryStorage(), '?music=off').music, false, 'off for one visit');
  const { audio, haptics } = fakes();
  const { music, calls } = fakeMusic();
  const feedback = createSensoryFeedback({ audio, haptics, music });
  feedback.setPreferences({ sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  feedback.setPreferences({ sound: false, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  feedback.setPreferences({ sound: true, haptics: true, music: false, soundVolume: 1, musicVolume: 0.6 });
  assert.deepEqual(calls.filter(c => c.startsWith('enabled')), ['enabled:true', 'enabled:false', 'enabled:false'], 'music plays only while sound is on too');
  feedback.setPreferences({ sound: true, haptics: true, music: true, soundVolume: 1, musicVolume: 0.6 });
  feedback.unlock();
  assert.equal(calls.at(-1), 'update', 'a touch that starts audio also starts the music');
  feedback.dispose();
  assert.equal(calls.at(-1), 'dispose');
});

test('the BGM loop: the intro plays once, then the loop repeats', () => {
  const { loopStart, loopEnd, crossfade } = MUSIC_LOOP;
  assert.ok(loopStart > crossfade && loopEnd - loopStart > 60, 'a long loop, with room before it for the blended seam');
  assert.equal(musicPosition(10), 10);
  assert.equal(musicPosition(loopEnd - 1), loopEnd - 1);
  assert.ok(Math.abs(musicPosition(loopEnd + 5) - (loopStart + 5)) < 1e-9, 'past the end, back to the loop start, not the intro');
  assert.ok(Math.abs(musicPosition(loopEnd + 3 * (loopEnd - loopStart) + 2) - (loopStart + 2)) < 1e-9);
  assert.equal(musicPosition(-1), 0);
  const file = `public/${MUSIC_LOOP.file}`;
  assert.ok(existsSync(file) && statSync(file).size > 1_000_000, 'the baked file ships with the site');
});

test('volume sliders: stored and bounded, the default music level unchanged, zero music is off', () => {
  const store = memoryStorage();
  const defaults = readSensoryPreferences(store, '');
  assert.equal(defaults.soundVolume, 1, 'effects start at the approved level');
  assert.equal(defaults.musicVolume, MUSIC_VOLUME_DEFAULT);
  assert.ok(Math.abs(musicGain(MUSIC_VOLUME_DEFAULT) - MUSIC_LOOP.level) < 1e-12, 'the default slider keeps the tuned music level');
  assert.ok(musicGain(1) > MUSIC_LOOP.level * 2.5 && musicGain(1) < MUSIC_LOOP.level * 3, 'room to turn the music up (about +9 dB)');
  assert.equal(musicGain(0), 0);
  assert.ok(Math.abs(volumeCurve(0.5) - 0.25) < 1e-12, 'half the slider is about -12 dB');
  assert.equal(volumeCurve(Number.NaN), 0);
  writeSensoryPreferences({ ...defaults, soundVolume: 0.4, musicVolume: 0.9 }, store);
  assert.deepEqual([readSensoryPreferences(store, '').soundVolume, readSensoryPreferences(store, '').musicVolume], [0.4, 0.9]);
  const odd = memoryStorage({ [SENSORY_KEY]: '{"v":1,"soundVolume":7,"musicVolume":"loud"}' });
  assert.deepEqual([readSensoryPreferences(odd, '').soundVolume, readSensoryPreferences(odd, '').musicVolume], [1, MUSIC_VOLUME_DEFAULT], 'out of range or malformed values are bounded or ignored');
  const { audio, haptics, played } = fakes();
  const { music, calls } = fakeMusic();
  const feedback = createSensoryFeedback({ audio, haptics, music });
  feedback.setPreferences({ ...defaults, soundVolume: 0.3, musicVolume: 0 });
  assert.ok(played.some(p => p.name === 'volume' && p.args[0] === 0.3), 'the effects slider reaches the sound');
  assert.deepEqual(calls.slice(-2), ['volume:0', 'enabled:false'], 'music at zero does not load or play');
  feedback.previewSound(); feedback.previewSound();
  assert.equal(played.filter(p => p.name === 'touch').length, 1, 'the slider preview is throttled');
  feedback.dispose();
});
