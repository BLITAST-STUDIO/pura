import assert from 'node:assert/strict';
import test from 'node:test';
import { DAILY_BASE_ID, DAILY_DATA, DAILY_HOLES, dailyIndex } from '../src/experiments/hitofude/daily-holes';
import { SHOT_BOARDS } from '../src/experiments/hitofude/boards';
import { replay } from '../scripts/hitofude-solve';

test('every daily hole is cleared by the shot it was built along', () => {
  DAILY_HOLES.forEach((hole, i) => {
    const [deg, power] = DAILY_DATA[i].shot;
    const sim = replay(hole, [{ id: 1000, angle: deg * Math.PI / 180, power }]);
    assert.deepEqual(sim.result, { cleared: true, shots: 1 }, hole.code);
  });
});

test('each daily hole has one main colour, and every other colour is a single drop', () => {
  for (const hole of DAILY_HOLES) {
    const main = hole.drops[0].hue;
    for (const hue of ['cyan', 'rose', 'amber'] as const) if (hue !== main) assert.ok(hole.drops.filter(d => d.hue === hue).length <= 1, hole.code);
  }
});

test('one hole per local day, in turn, never clashing with the course', () => {
  assert.equal(DAILY_HOLES.length, 30);
  assert.equal(dailyIndex(new Date(2026, 8, 27, 7)), 0);
  assert.equal(dailyIndex(new Date(2026, 8, 27, 23, 59)), 0, 'the whole local day');
  assert.equal(dailyIndex(new Date(2026, 8, 28, 0, 1)), 1);
  assert.equal(dailyIndex(new Date(2026, 9, 27)), 0, 'thirty days later, round again');
  assert.equal(dailyIndex(new Date(2026, 8, 26)), 29, 'before the first day wraps');
  const ids = new Set([...SHOT_BOARDS, ...DAILY_HOLES].map(b => b.id));
  assert.equal(ids.size, SHOT_BOARDS.length + DAILY_HOLES.length);
  assert.equal(DAILY_HOLES[0].id, DAILY_BASE_ID);
});
