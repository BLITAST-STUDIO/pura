import assert from 'node:assert/strict';
import test from 'node:test';
import { causticQuery, initialCaustic, initialRipple, rippleQuery } from '../src/experiments/look-defaults';
import { initialLook, initialUi, lookScene } from '../src/experiments/look';

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

test('the light page with the gallery board is the default; the earlier look stays reachable', () => {
  // Node has no localStorage, so only the URL and the defaults decide here.
  assert.equal(initialUi(''), 'light');
  assert.equal(initialLook(''), 'gallery');
  assert.equal(initialUi('?ui=dark'), 'dark');
  assert.equal(initialLook('?look=studio'), 'studio', 'the look approved before 2026-09-26');
  assert.equal(initialLook('?look=night'), 'night');
  assert.equal(initialLook('?look=unknown'), 'gallery');
  assert.equal(lookScene('studio', true).floor, '#c6c9c2', 'studio keeps its approved values');
});
