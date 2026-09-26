import assert from 'node:assert/strict';
import test from 'node:test';
import { StageSimulation } from '../src/experiments/stages/simulation';
import { MICHI_STAGES, stageLevel } from '../src/experiments/stages/michi';
import { boardDrops } from '../src/experiments/boards';
import { addPigment, dominantHue, emptyPigment, purityOf, type HueId, type Pigment } from '../src/game/palette';

const sum = (list: Pigment[]) => list.reduce((a, b) => addPigment(a, b), emptyPigment());

test('each chapter 3 board cannot be completed without separating', () => {
  for (const stage of MICHI_STAGES) {
    const drops = boardDrops(stage.layout);
    for (const hue of stage.colors) {
      const quota = drops.reduce((n, d) => n + d.pigment[hue], 0);
      const target = quota * stage.targetFrac;
      // Best case without separating: every drop led by this colour, merged.
      const led = sum(drops.filter(d => dominantHue(d.pigment) === hue).map(d => d.pigment));
      const pure = drops.filter(d => purityOf(d.pigment) > 0.995 && dominantHue(d.pigment) === hue).reduce((n, d) => n + d.mass, 0);
      const mergedOk = led[hue] >= target && purityOf(led) >= stage.purity;
      assert.ok(!mergedOk && pure < target, `${stage.name}/${hue}: needs a separation (pure ${pure.toFixed(0)} of ${target.toFixed(0)})`);
    }
  }
});

function clearBySeparating(stageId: number) {
  const sim = new StageSimulation({ stage: stageId, scale: 'large', mix: 'press', sandboxCount: 30 });
  // Separate every cloudy drop with a quick double tap.
  for (const cloudy of sim.core.drops.filter(d => purityOf(d.pigment) < 0.995)) {
    sim.grab(cloudy.id); sim.release(); sim.tick(0.05); sim.grab(cloudy.id); sim.release();
  }
  for (let i = 0; i < 90; i++) sim.tick(1 / 60);
  // Gather: stack each colour on one spot so they fuse, then let it settle.
  const spots: Record<HueId, [number, number]> = { cyan: [110, 130], rose: [310, 130], amber: [210, 440] };
  for (const d of sim.core.drops) { const [x, y] = spots[dominantHue(d.pigment)]; d.x = x; d.y = y; d.vx = 0; d.vy = 0; }
  for (let i = 0; i < 120 && !sim.won; i++) sim.tick(1 / 60);
  return sim;
}

test('separating the cloudy drops, then gathering, completes each board', () => {
  for (const stage of MICHI_STAGES) {
    const sim = clearBySeparating(stage.id);
    assert.ok(sim.separations >= stage.layout.filter(d => d.mix).length, `${stage.name}: every cloudy drop separated`);
    assert.ok(sim.won, `${stage.name} is completed`);
    assert.equal(sim.won!.stars, 3, 'pure cores earn three stars');
  }
});

test('the designed boards keep their layout whatever the size setting, and legacy stages are untouched', () => {
  const large = new StageSimulation({ stage: 31, scale: 'large', mix: 'press', sandboxCount: 30 });
  const original = new StageSimulation({ stage: 31, scale: 'original', mix: 'press', sandboxCount: 30 });
  assert.deepEqual(large.core.drops.map(d => [d.x, d.y, d.r]), original.core.drops.map(d => [d.x, d.y, d.r]));
  assert.equal(large.core.fusionPolicy, 'held-press');
  assert.equal(stageLevel(3)?.name, '三色');
  assert.equal(new StageSimulation({ stage: 3, scale: 'large', mix: 'press', sandboxCount: 30 }).core.drops.length, 24);
});
