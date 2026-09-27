import assert from 'node:assert/strict';
import test from 'node:test';
import { routeKey } from '../src/route-key';

test('the bare URL opens instant play; the original PURA stays at ?play=classic', () => {
  assert.equal(routeKey(''), 'play=open');
  assert.equal(routeKey('?play=classic'), 'play=classic');
  assert.equal(routeKey('?play=stages&mode=score&stage=3'), 'play=stages');
  assert.equal(routeKey('?play=free'), 'play=free');
  assert.equal(routeKey('?play=endless'), 'play=endless');
  assert.equal(routeKey('?play=hitofude&board=2'), 'play=hitofude');
  assert.equal(routeKey('?play=michi&board=31'), 'play=michi');
  assert.equal(routeKey('?play=curling&vs=two'), 'play=curling');
  assert.equal(routeKey('?play=bench'), 'play=bench');
  assert.equal(routeKey('?play=chapters&chapter=2'), 'play=chapters');
  assert.equal(routeKey('?lab=droplets&feel=baseline'), 'lab=droplets');
  assert.equal(routeKey('?lab=fusion&mixing=bloom'), 'lab=fusion');
  assert.equal(routeKey('?play=unknown'), 'play=open', 'unknown values fall back to instant play');
  assert.equal(routeKey('?sound=off'), 'play=open');
  assert.equal(routeKey('', false), 'play=welcome', 'a first visit gets the welcome');
  assert.equal(routeKey('?sound=off', false), 'play=welcome');
  assert.equal(routeKey('?play=michi', false), 'play=michi', 'a shared link goes where it points');
  assert.equal(routeKey('?play=unknown', false), 'play=open');
  assert.equal(routeKey('?play=welcome'), 'play=welcome', 'the welcome can be replayed');
});

test('the mode gallery offers the same ways to play as the mode bar, each to a route', async () => {
  const { GALLERY } = await import('../src/experiments/mode-gallery-data');
  const { MODES } = await import('../src/experiments/mode-nav-data');
  assert.deepEqual(GALLERY.map(m => m.id), MODES.map(m => m.id));
  for (const m of GALLERY) assert.notEqual(routeKey(new URL(m.href, 'https://x.test/pura/').search, false), 'play=welcome', `${m.name} opens its mode, not the welcome`);
});
