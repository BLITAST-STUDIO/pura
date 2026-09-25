import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBO_WINDOW, parSeconds, ScoreAttack } from '../src/experiments/stages/score';
import { StageSimulation } from '../src/experiments/stages/simulation';

test('pure fusions in quick succession build a combo; a gap or a mixed fusion breaks it', () => {
  const s = new ScoreAttack(10000, 24, 0.9);
  assert.equal(s.fusion(0, true), 0, 'a single fusion is not a combo');
  assert.equal(s.fusion(0.5, true), 20);
  assert.equal(s.fusion(1.0, true), 40);
  assert.equal(s.combo(1.1), 3);
  assert.equal(s.combo(1.0 + COMBO_WINDOW + 0.01), 0, 'the chain fades');
  assert.equal(s.fusion(3, true), 0, 'too late: a new chain starts');
  assert.equal(s.fusion(3.2, false), 0);
  assert.equal(s.fusion(3.4, true), 0, 'a mixed fusion broke the chain');
  assert.equal(s.longestChain, 3);
  for (let i = 0; i < 30; i++) s.fusion(10 + i * 0.1, true);
  assert.ok(s.running > 0);
});

test('every spit costs, and a bigger release costs more', () => {
  const s = new ScoreAttack(10000, 24, 0.9);
  const small = s.spit(100), large = s.spit(2000);
  assert.ok(small >= 60 && large > small);
  assert.equal(s.spits, 2);
  assert.equal(s.running, 0, 'the running score never goes negative');
});

test('clearing adds purity and a decaying speed bonus; faster is better, never negative', () => {
  const fast = new ScoreAttack(10000, 24, 0.9).finish(10, 1);
  const slow = new ScoreAttack(10000, 24, 0.9).finish(200, 1);
  const muddy = new ScoreAttack(10000, 24, 0.9).finish(10, 0.9);
  assert.ok(fast.total > slow.total && fast.total > muddy.total);
  assert.equal(fast.purity, 1000);
  assert.equal(muddy.purity, 0);
  assert.ok(slow.speed > 0 && slow.speed < 100);
  assert.ok(Math.abs(new ScoreAttack(1, 24, .9).finish(parSeconds(24), 1).speed - 1500 / Math.E) < 1);
  const spent = new ScoreAttack(10000, 24, 0.9);
  for (let i = 0; i < 100; i++) spent.spit(9000);
  assert.equal(spent.finish(9999, 0.9).total, 0);
});

test('score attack runs on the legacy stage: fusion combos, spit cost and final breakdown', () => {
  const s = new StageSimulation({ stage: 1, scale: 'large', mix: 'press', sandboxCount: 60, mode: 'score' });
  assert.ok(s.score);
  for (const d of s.core.drops) { d.x = 210; d.y = 280; d.vx = d.vy = 0; }
  for (let i = 0; i < 60 && !s.won; i++) s.tick(1 / 60);
  assert.ok(s.won && s.score!.result);
  assert.ok(s.score!.result!.combo > 0, 'a burst of fusions is a combo');
  assert.equal(s.score!.result!.total, s.score!.result!.clear + s.score!.result!.purity + s.score!.result!.speed + s.score!.result!.combo + s.score!.result!.spit);
  assert.equal(new StageSimulation({ stage: 1, scale: 'large', mix: 'press', sandboxCount: 60 }).score, null, 'the relaxed mode has no score');
  assert.equal(new StageSimulation({ stage: 0, scale: 'large', mix: 'press', sandboxCount: 60, mode: 'score' }).score, null, 'no score in the sandbox');
});

test('a double-tap separation in score attack is charged', () => {
  const s = new StageSimulation({ stage: 2, scale: 'large', mix: 'press', sandboxCount: 60, mode: 'score' });
  const cyan = s.core.drops.find(d => d.pigment.cyan > 0)!, rose = s.core.drops.find(d => d.pigment.rose > 0)!;
  s.core.drops = [cyan, rose];
  rose.pigment.cyan = 200; rose.mass += 200; // a rose drop with a little cyan inside
  s.grab(rose.id); s.release(); for (let i = 0; i < 6; i++) s.tick(1 / 60);
  assert.equal(s.grab(rose.id), false);
  assert.equal(s.score!.spits, 1);
  assert.equal(s.lastNote?.kind, 'spit');
  assert.ok(s.lastNote!.value < 0);
});
