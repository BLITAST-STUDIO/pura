import test from 'node:test';
import assert from 'node:assert/strict';
import { FusionSimulation } from '../src/experiments/fusion-lab/simulation';
import { absorptionOf, ABSORPTION } from '../src/experiments/fusion-lab/composition';
import { FusionShape, UNIT_VOLUME, shapeField } from '../src/experiments/fusion-lab/shape';
import { addPigment } from '../src/game/palette';

const near = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('same-color fusion conserves amount, momentum and held ID, exposing detached parents', () => {
  const s = new FusionSimulation();
  const [a, b] = s.core.drops;
  a.x = 220; b.x = a.x + a.r + b.r - 1; a.vx = 120; b.vx = 0;
  s.grab(a.id); s.move(a.x + 25, a.y); s.tick(1/60);
  assert.equal(s.core.drops.length, 1); assert.equal(s.events.length, 1);
  const e = s.events[0], d = s.core.drops[0];
  near(d.mass, 9248); near(d.pigment.cyan, 9248);
  near(e.result.vx, (e.a.vx * e.a.mass + e.b.vx * e.b.mass) / d.mass);
  assert.equal(s.core.grabbedId, d.id);
  e.result.pigment.cyan = 0; e.a.x = -100;
  near(d.pigment.cyan, 9248); assert.ok(d.x > 0);
  const vx = d.vx; s.release(); near(d.vx, vx);
});

test('free mixing honors five amount ratios while legacy unlike contact still rebounds', () => {
  for (const ratio of [1,4,.25,10,.1]) {
    const s = new FusionSimulation(); s.reset('mix', ratio);
    const [a,b] = s.core.drops;
    a.x = 220; b.x = a.x + a.r + b.r - 1;
    s.tick(1/60); assert.equal(s.core.drops.length,1);
    const d = s.core.drops[0]; near(d.mass, 9248); near(d.pigment.cyan / d.mass, ratio/(1+ratio));
  }
  const s = new FusionSimulation(); s.reset('mix'); s.core.fusionPolicy = 'legacy';
  const [a,b] = s.core.drops; a.x=220;b.x=a.x+a.r+b.r-1;s.tick(1/60);
  assert.equal(s.core.drops.length,2); assert.equal(s.events.length,0);
});

test('a second fusion can happen on the next physics frame without an animation gate', () => {
  const s = new FusionSimulation(); s.reset('chain');
  const total = s.core.drops.reduce((sum,d)=>sum+d.mass,0);
  let current = s.core.drops[0]; s.grab(current.id);
  for(let i=0;i<4;i++) {
    const other = s.core.drops.find(d=>d.id!==current.id)!;
    current.x=200; current.y=250; other.x=200+current.r+other.r-1;other.y=250;
    s.move(200,250);s.tick(1/60);
    current=s.core.drops.find(d=>d.id===s.core.grabbedId)!;
    assert.ok(current);
  }
  assert.equal(s.core.drops.length,1); near(current.mass,total); assert.equal(s.events.length,4);
});

test('settled composition is unchanged by merge order and same-color absorption is invariant', () => {
  const a={cyan:1,rose:0,amber:0}, b={cyan:0,rose:4,amber:0}, c={cyan:0,rose:0,amber:2};
  assert.deepEqual(absorptionOf(addPigment(addPigment(a,b),c)), absorptionOf(addPigment(c,addPigment(b,a))));
  absorptionOf({cyan:25,rose:0,amber:0}).forEach((v,i)=>near(v,ABSORPTION.cyan[i]));
  absorptionOf(addPigment(a,b)).forEach((v,i)=>near(v,ABSORPTION.cyan[i]/5+ABSORPTION.rose[i]*4/5));
});

test('reset and resize preserve deterministic fixtures without random spawning', () => {
  const s=new FusionSimulation();s.reset('mix',.25);const before=s.core.drops.map(d=>({...d.pigment}));
  s.resize(600,800);assert.deepEqual(s.core.drops.map(d=>d.pigment),before);
  s.grab(s.core.drops[0].id);s.resize(700,900);assert.equal(s.core.grabbedId,null);
  s.reset('pair',1);assert.equal(s.core.drops.length,2);assert.ok(s.core.drops.every(d=>d.vx===0));
});

test('merging meshes remain finite, closed in volume and normalized to conserved amount', () => {
  const shape=new FusionShape();
  try {
    for(const ratio of [1,.25,10]) for(const age of [0,.06,.2,.8]) {
      const f=ratio/(ratio+1), ra=Math.sqrt(f), rb=Math.sqrt(1-f), dist=ra+rb;
      const progress=1-Math.exp(-age*7);
      const lobes=[{x:-dist*(1-f),r:ra,amount:f},{x:dist*f,r:rb,amount:1-f}].map(l=>({...l,x:l.x*(1-progress),y:0,r:l.r+(1-l.r)*progress,absorption:[1,0,0] as [number,number,number]}));
      shape.update(lobes,.018+.14*Math.sin(Math.PI*progress));
      assert.ok(shape.volume>1 && shape.volume<5); assert.ok(Number.isFinite(shape.correction));
      near(shape.volume*shape.correction**2,UNIT_VOLUME);
      assert.ok(shape.geometry.drawRange.count>100);
      assert.ok(shapeField(0,0,-.1,lobes,.02)>0);
    }
  } finally {shape.dispose();}
});

test('the connected neck has no unpaired mesh edges', () => {
  const shape=new FusionShape();
  try {
    shape.update([-1,1].map(side=>({x:side*.7,y:0,r:.71,amount:1,absorption:[1,0,0] as [number,number,number]})),.08);
    const p=shape.geometry.getAttribute('position');
    const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
    const edges=new Map<string,number>();
    for(let i=0;i<shape.geometry.drawRange.count;i+=3) {
      const vertices=[key(i),key(i+1),key(i+2)];
      if(new Set(vertices).size<3) continue;
      for(let j=0;j<3;j++) { const edge=[vertices[j],vertices[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1); }
    }
    assert.ok(edges.size>1000);
    for(const count of edges.values()) assert.equal(count,2);
  } finally { shape.dispose(); }
});

test('coarser grids for small merging drops stay closed and volume-corrected; pooled grids are reused', async () => {
  const { shapeResolution, ShapePool } = await import('../src/experiments/fusion-lab/shape');
  assert.equal(shapeResolution(60), 40); assert.equal(shapeResolution(40), 32); assert.equal(shapeResolution(20), 24);
  for (const resolution of [24, 32]) {
    const shape = new FusionShape(resolution);
    try {
      const lobes = [-1, 1].map(side => ({ x: side * .5, y: 0, r: .71, amount: 1, absorption: [1, 0, 0] as [number, number, number] }));
      shape.update(lobes, .08);
      assert.ok(shape.geometry.drawRange.count > 100);
      near(shape.volume * shape.correction ** 2, UNIT_VOLUME);
    } finally { shape.dispose(); }
  }
  const pool = new ShapePool();
  const a = pool.acquire(20); pool.release(a);
  assert.equal(pool.acquire(22), a, 'same resolution is reused');
  assert.notEqual(pool.acquire(60).resolution, a.resolution);
  pool.dispose();
});
