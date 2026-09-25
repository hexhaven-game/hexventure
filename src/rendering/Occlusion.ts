import * as THREE from 'three';
import { damp } from '../utils/math';

// Camera occlusion in the shader: parts of props that stand between the camera and the player
// are thinned out with a dither pattern (to 25% coverage), with a soft edge. Done per pixel, so the
// props of a tile can stay merged into one mesh (a big win for draw calls).

const uniforms = {
  uCam: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
  uFade: { value: 0 }, // 0 = off (build mode, title), 1 = on
};

const RADIUS = 2.3; // around the camera -> player line
const MIN_HEIGHT = 1.1; // above the ground; low things (grass, rocks, trunk bases) never fade

export function occlusionPatch(material: THREE.Material) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvOccWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOccWorld;
        uniform vec3 uCam;
        uniform vec3 uTarget;
        uniform float uFade;
        float bayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          int i = int(q.x) + int(q.y) * 4;
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return (m[i] + 0.5) / 16.0;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uFade > 0.001 && vOccWorld.y > uTarget.y + ${(MIN_HEIGHT - 1).toFixed(2)}) {
          vec3 seg = uTarget - uCam;
          float t = dot(vOccWorld - uCam, seg) / dot(seg, seg);
          if (t > 0.04 && t < 0.97) {
            float d = length(vOccWorld - (uCam + seg * t));
            float cover = mix(1.0, 0.25, smoothstep(${(RADIUS + 1).toFixed(1)}, ${(RADIUS - 0.6).toFixed(1)}, d) * uFade);
            if (bayer4(gl_FragCoord.xy) > cover) discard;
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => 'occlusion';
}

export class Occlusion {
  // camera and the player's chest; `enabled` eases the effect in and out
  update(camera: THREE.Vector3, target: THREE.Vector3, dt: number, enabled: boolean) {
    uniforms.uCam.value.copy(camera);
    uniforms.uTarget.value.copy(target);
    uniforms.uFade.value = damp(uniforms.uFade.value, enabled ? 1 : 0, 6, dt);
  }
}
