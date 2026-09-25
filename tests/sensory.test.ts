import assert from 'node:assert/strict';
import test from 'node:test';
import { fusionCue, impactCue, ImpactGate, IMPACT_THRESHOLD, panFor, sizeFactor } from '../src/experiments/sensory/cues';
import { createSensoryFeedback, readSensoryPreferences, SENSORY_KEY, writeSensoryPreferences } from '../src/experiments/sensory/feedback';
import { detectHapticMode, type Haptics } from '../src/experiments/sensory/haptics';
import type { DropletAudio } from '../src/experiments/sensory/audio';

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
  assert.deepEqual(readSensoryPreferences(store, ''), { sound: true, haptics: true });
  assert.equal(writeSensoryPreferences({ sound: false, haptics: true }, store), true);
  assert.deepEqual(readSensoryPreferences(store, ''), { sound: false, haptics: true });
  assert.deepEqual(readSensoryPreferences(memoryStorage({ [SENSORY_KEY]: '{bad' }), ''), { sound: true, haptics: true });
  assert.deepEqual(readSensoryPreferences(memoryStorage({ [SENSORY_KEY]: '{"v":2,"sound":false}' }), ''), { sound: true, haptics: true });
  assert.deepEqual(readSensoryPreferences(store, '?haptics=off'), { sound: false, haptics: false });
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readSensoryPreferences(broken, ''), { sound: true, haptics: true });
  assert.equal(writeSensoryPreferences({ sound: true, haptics: true }, broken), false);
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
  feedback.setPreferences({ sound: false, haptics: false });
  assert.deepEqual(played.at(-1), { name: 'enabled', args: [false] });
  assert.equal(hapticsEnabled, false);
  feedback.unlock();
  assert.ok(!played.some(p => p.name === 'unlock'), 'a muted page does not start audio');
  feedback.dispose();
});
