import assert from 'node:assert/strict';
import test from 'node:test';
import { routeKey } from '../src/route-key';

test('the bare URL opens instant play; the original PURA stays at ?play=classic', () => {
  assert.equal(routeKey(''), 'play=open');
  assert.equal(routeKey('?play=classic'), 'play=classic');
  assert.equal(routeKey('?play=stages&mode=score&stage=3'), 'play=stages');
  assert.equal(routeKey('?play=free'), 'play=free');
  assert.equal(routeKey('?play=hitofude&board=2'), 'play=hitofude');
  assert.equal(routeKey('?play=michi&board=31'), 'play=michi');
  assert.equal(routeKey('?play=bench'), 'play=bench');
  assert.equal(routeKey('?play=chapters&chapter=2'), 'play=chapters');
  assert.equal(routeKey('?lab=droplets&feel=baseline'), 'lab=droplets');
  assert.equal(routeKey('?lab=fusion&mixing=bloom'), 'lab=fusion');
  assert.equal(routeKey('?play=unknown'), 'play=open', 'unknown values fall back to instant play');
  assert.equal(routeKey('?sound=off'), 'play=open');
});
