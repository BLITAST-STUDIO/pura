import assert from 'node:assert/strict';
import test from 'node:test';
import { challengeFrom, challengeOutcome, challengeText, challengeUrl } from '../src/experiments/hitofude/share';
import { ROUND_LABELS, roundHoles } from '../src/experiments/hitofude/golf';

test("a challenge link opens the same hole with the sender's strokes, and only that", () => {
  const url = challengeUrl('https://example.test/pura/?play=hitofude&board=3&walls=line', 13, 2);
  assert.equal(url, 'https://example.test/pura/?play=hitofude&board=13&vs=2');
  assert.equal(challengeFrom(new URL(url).search), 2);
  assert.equal(challengeFrom('?play=hitofude&board=13'), null);
  assert.equal(challengeFrom('?vs=0'), null); assert.equal(challengeFrom('?vs=2.5'), null); assert.equal(challengeFrom('?vs=99'), null);
  assert.equal(challengeText({ code: '13', name: 'たまつき二つ', par: 3 }, 1), 'PURA ひとふで 13「たまつき二つ」を1打（ひとふで −2）で。いける？');
  assert.deepEqual([challengeOutcome(1, 2), challengeOutcome(2, 2), challengeOutcome(3, 2)], ['挑戦に勝ち', '挑戦と同じ', '挑戦に届かず']);
});

test('rounds: the front nine, the back nine, or all eighteen', () => {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  assert.deepEqual(roundHoles('out', holes), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(roundHoles('in', holes), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.equal(roundHoles('full', holes).length, 18);
  assert.deepEqual(Object.keys(ROUND_LABELS), ['out', 'in', 'full']);
});
