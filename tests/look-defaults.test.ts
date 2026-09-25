import assert from 'node:assert/strict';
import test from 'node:test';
import { causticQuery, initialCaustic, initialRipple, rippleQuery } from '../src/experiments/look-defaults';

test('ripple and shape floor light are the default look; the earlier look stays reachable', () => {
  assert.equal(initialRipple(''), true);
  assert.equal(initialCaustic(''), 'shape');
  assert.equal(initialRipple('?ripple=on'), true, 'older shared links keep working');
  assert.equal(initialCaustic('?caustic=shape'), 'shape');
  assert.equal(initialRipple('?ripple=off'), false);
  assert.equal(initialCaustic('?caustic=artistic'), 'artistic');
  assert.equal(rippleQuery(true), null);
  assert.equal(rippleQuery(false), 'off');
  assert.equal(causticQuery(true), null);
  assert.equal(causticQuery(false), 'artistic');
});
