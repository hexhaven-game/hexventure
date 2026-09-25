import * as THREE from 'three';
import { INNER_RADIUS } from '../world/HexGrid';

// Landing marker under the held tile (from Hexhaven): a soft hex glow with rings rippling inwards.
export function createLandingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) }, uInner: { value: INNER_RADIUS } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uInner;
      varying vec2 vP;
      void main() {
        vec2 p = abs(vP);
        float d = max(p.x, p.x * 0.5 + p.y * 0.8660254) / uInner; // 0 centre .. 1 edge (pointy along z)
        float edge = smoothstep(0.84, 0.96, d) * (1.0 - smoothstep(0.97, 1.0, d));
        float ring = smoothstep(0.08, 0.0, abs(fract(d - uTime * 0.9) - 0.5) - 0.38);
        float fill = 0.16 * (1.0 - d);
        float a = edge * 0.9 + ring * 0.3 * (1.0 - d * 0.6) + fill;
        vec3 col = mix(uColor, vec3(1.0), 0.35 + 0.25 * sin(uTime * 4.0));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }
    `,
  });
}
