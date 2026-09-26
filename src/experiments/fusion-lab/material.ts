import * as THREE from 'three';
import { createLiquidMaterial } from '../droplet-lab/liquid-material';
import { FIELD_GLSL } from './shape';

/** Shader patching must fail loudly: a silent miss would drop a whole feature. */
function must(source: string, target: string, replacement: string): string {
  if (!source.includes(target)) throw new Error(`Fusion material: shader anchor not found: ${target}`);
  return source.replace(target, replacement);
}

export function createFusionMaterial(background: THREE.Texture) {
  const material = createLiquidMaterial(background);
  Object.assign(material.uniforms, {
    uLobeCount: { value: 0 }, uLobes: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
    uBlend: { value: .03 }, uAbsorption: { value: new THREE.Vector3() },
    uSeedCount: { value: 0 }, uSeeds: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
    uDyes: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
    uMix: { value: 1 }, uAge: { value: 0 },
    uInternalFlow: { value: 0 }, uFlowPhase: { value: 0 },
    uFlowFrame: { value: new THREE.Vector4(0, 0, 1, 0) },
  });
  material.vertexShader = must(material.vertexShader, 'uniform mat4 uWorldToDrop;', 'uniform mat4 uWorldToDrop; uniform vec2 uSurfaceBend;');
  material.vertexShader = must(material.vertexShader, 'vec3 shaped = position;', `
        float h=position.z-.007;
        vec3 shaped=position+vec3(uSurfaceBend*h*h,0.);`);
  material.vertexShader = must(material.vertexShader, 'vec3 shapedNormal = normal;',
    'vec3 shapedNormal=vec3(normal.xy,normal.z-2.*h*dot(uSurfaceBend,normal.xy));');
  material.fragmentShader = must(material.fragmentShader, 'const vec3 CENTER', `${FIELD_GLSL}
    uniform vec3 uAbsorption;
    uniform float uSeedCount;
    uniform vec4 uSeeds[5];
    uniform vec3 uDyes[5];
    uniform float uMix;
    uniform float uAge;
    uniform float uInternalFlow;
    uniform float uFlowPhase;
    uniform vec4 uFlowFrame;
    vec2 eddy(vec2 p, vec2 center, float turn, float falloff) {
      vec2 d=p-center;
      float a=turn*exp(-dot(d,d)*falloff);
      float c=cos(a), s=sin(a);
      return center+vec2(c*d.x-s*d.y,s*d.x+c*d.y);
    }
    vec3 dye(vec3 p) {
      if (uMix > .999) return uAbsorption;
      vec2 q=p.xy;
      float bloomSoftness=0.;
      if(uInternalFlow>.5) {
        // A smooth fold of the dye field, independent of the surface and simulation.
        // A slight initial fold avoids a perfectly flat seam; no frame-random noise.
        vec2 axis=uFlowFrame.zw, tangent=vec2(-axis.y,axis.x);
        vec2 offset=q-uFlowFrame.xy;
        vec2 local=vec2(dot(offset,axis),dot(offset,tangent));
        float phase=uFlowPhase;
        float direction=sin(phase)>.0?1.:-1.;
        float turn=(.22+1.05*(1.-exp(-uAge*4.)))*exp(-uAge*.65);
        float depth=p.z-.48;
        if(uInternalFlow>1.5) {
          // A brief, rounded billow of dye grows from the contact region.
          // Depth-dependent lobes stay coherent over time, like ink opening in water.
          float puff=(1.-exp(-uAge*8.))*exp(-uAge*1.5);
          float width=.15+.29*(1.-exp(-uAge*3.));
          float y=local.y+.09*sin(phase)+depth*.24;
          float upper=exp(-pow((y-.18)/width,2.));
          float lower=exp(-pow((y+.29)/(width*.85),2.));
          float seam=exp(-local.x*local.x*4.5);
          local.x+=direction*.52*puff*(upper-.8*lower)*seam;
          local.y*=1.-.18*puff*seam;
          local.x+=.085*puff*sin(y*8.+depth*5.+phase-uAge*1.7)*seam;
          bloomSoftness=.2*puff*seam;
        }
        local=eddy(local,vec2(.035*sin(phase),.22+.06*cos(phase)),direction*turn,3.2);
        local=eddy(local,vec2(-.08,-.27),-direction*turn*.42,5.);
        local.x+=.04*sin(local.y*5.+depth*3.+phase+uAge*1.4)
          *exp(-dot(local,local)*1.8)*exp(-uAge*.7);
        local.x+=depth*.07*sin(phase+uAge*.9)*exp(-uAge*.7);
        q=uFlowFrame.xy+axis*local.x+tangent*local.y;
      } else {
        float spin=.45*sin(uAge*3.)*exp(-uAge*.8);
        float angle=spin*(1.-clamp(length(q)*.4,0.,1.));
        q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
        q+=vec2(sin(q.y*9.+uAge*3.),sin(q.x*7.-uAge*2.))*.07*sin(min(uAge*3.,3.14159));
      }
      vec3 pigment=vec3(0.); float sum=0.;
      for (int i=0;i<5;i++) {
        if(float(i)>=uSeedCount) break;
        vec4 s=uSeeds[i];
        float w=exp(-dot(q-s.xy,q-s.xy)/(s.z*s.z*.4+.03))*s.w;
        pigment+=uDyes[i]*w; sum+=w;
      }
      return mix(sum>.00001?pigment/sum:uAbsorption,uAbsorption,
        uMix+(1.-uMix)*bloomSoftness);
    }
    const vec3 CENTER`);
  material.fragmentShader = must(material.fragmentShader, 'if (dot(uSurfaceBend, uSurfaceBend) > 1.0e-12 || uRimActive > 0.5) {', `
    if(uLobeCount>.5) {
      float speed=length(localRay);
      float t=0.0008/max(speed,.0001);
      float previous=0.; bool found=false;
      for(int i=0;i<96;i++) {
        float d=field(localOrigin+localRay*t);
        if(d>=0.) { found=true; break; }
        previous=t;
        t+=max(.0007,abs(d)*.8)/max(speed,.0001);
        if(t*speed>8.) break;
      }
      if(!found) return false;
      for(int j=0;j<12;j++) {
        float middle=(previous+t)*.5;
        if(field(localOrigin+localRay*middle)<0.) previous=middle; else t=middle;
      }
      travel=t;
      vec3 p=localOrigin+localRay*t;
      point=(uDropToWorld*vec4(p,1.)).xyz;
      normal=worldNormal(fieldNormal(p));
      return true;
    }
    if (dot(uSurfaceBend, uSurfaceBend) > 1.0e-12 || uRimActive > 0.5) {`);
  material.fragmentShader = must(material.fragmentShader, 'vec3 normal = normalize(vWorldNormal);', `vec3 normal = normalize(vWorldNormal);
    if(uLobeCount>.5) normal=worldNormal(fieldNormal((uWorldToDrop*vec4(vWorldPosition,1.)).xyz));`);
  const start = material.fragmentShader.indexOf('        float peak =');
  const end = material.fragmentShader.indexOf('        vec3 color =', start);
  material.fragmentShader = material.fragmentShader.slice(0, start) + `
        vec3 opticalDepth=vec3(0.);
        for(int sampleIndex=0;sampleIndex<8;sampleIndex++) {
          float t=(float(sampleIndex)+.5)/8.;
          vec3 p=(uWorldToDrop*vec4(mix(vWorldPosition,exitPoint,t),1.)).xyz;
          opticalDepth+=dye(p)*max(distanceInside,0.)/8.;
        }
        transmitted*=exp(-opticalDepth);
        vec3 glowTint=exp(-uAbsorption*.6);
` + material.fragmentShader.slice(end);
  return material;
}
