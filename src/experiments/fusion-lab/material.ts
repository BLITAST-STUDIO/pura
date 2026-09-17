import * as THREE from 'three';
import { createLiquidMaterial } from '../droplet-lab/liquid-material';
import { FIELD_GLSL } from './shape';

export function createFusionMaterial(background: THREE.Texture) {
  const material = createLiquidMaterial(background);
  Object.assign(material.uniforms, {
    uLobeCount: { value: 0 }, uLobes: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
    uBlend: { value: .03 }, uAbsorption: { value: new THREE.Vector3() },
    uSeedCount: { value: 0 }, uSeeds: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
    uDyes: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
    uMix: { value: 1 }, uAge: { value: 0 },
  });
  material.vertexShader = material.vertexShader.replace('uniform mat4 uWorldToDrop;', 'uniform mat4 uWorldToDrop; uniform vec2 uSurfaceBend;')
    .replace('vec4 world = modelMatrix * vec4(position, 1.0);', `
      float h=position.z-.007;
      vec3 p=position+vec3(uSurfaceBend*h*h,0.);
      vec3 bentNormal=vec3(normal.xy,normal.z-2.*h*dot(uSurfaceBend,normal.xy));
      vec4 world = modelMatrix * vec4(p, 1.0);`)
    .replaceAll('.xyz, normal)', '.xyz, bentNormal)');
  material.fragmentShader = material.fragmentShader.replace('const vec3 CENTER', `${FIELD_GLSL}
    uniform vec3 uAbsorption;
    uniform float uSeedCount;
    uniform vec4 uSeeds[5];
    uniform vec3 uDyes[5];
    uniform float uMix;
    uniform float uAge;
    vec3 dye(vec3 p) {
      if (uMix > .999) return uAbsorption;
      vec2 q=p.xy;
      float spin=.45*sin(uAge*3.)*exp(-uAge*.8);
      float angle=spin*(1.-clamp(length(q)*.4,0.,1.));
      q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
      q+=vec2(sin(q.y*9.+uAge*3.),sin(q.x*7.-uAge*2.))*.07*sin(min(uAge*3.,3.14159));
      vec3 pigment=vec3(0.); float sum=0.;
      for (int i=0;i<5;i++) {
        if(float(i)>=uSeedCount) break;
        vec4 s=uSeeds[i];
        float w=exp(-dot(q-s.xy,q-s.xy)/(s.z*s.z*.4+.03))*s.w;
        pigment+=uDyes[i]*w; sum+=w;
      }
      return mix(sum>.00001?pigment/sum:uAbsorption,uAbsorption,uMix);
    }
    const vec3 CENTER`);
  material.fragmentShader = material.fragmentShader.replace('if (dot(uSurfaceBend, uSurfaceBend) > 1.0e-12) {', `
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
    if (dot(uSurfaceBend, uSurfaceBend) > 1.0e-12) {`);
  material.fragmentShader = material.fragmentShader.replace('vec3 normal = normalize(vWorldNormal);', `vec3 normal = normalize(vWorldNormal);
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
` + material.fragmentShader.slice(end);
  return material;
}
