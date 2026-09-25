import * as THREE from 'three';

// Simple animated water: two blues mixed by drifting noise, a soft light web on top
// and a gentle swell. Everything is in world space, so neighbouring water tiles join up.
export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x2f9fd0) },
        uShallow: { value: new THREE.Color(0x63dbe2) },
        uFoam: { value: new THREE.Color(0xffffff) },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.5 + uTime * 1.3) * 0.03 + sin(wp.z * 0.6 - uTime) * 0.03;
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uFoam;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      // distance to the nearest cell border: a thin bright web like light on a pond
      float cells(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p);
        float f1 = 8.0, f2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash2(i + g));
          float d = length(g + o - f);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        return f2 - f1;
      }
      void main() {
        float t = uTime;
        float n = noise(vWorld.xz * 0.12 + vec2(t * 0.04, t * 0.03)) * 0.7 + noise(vWorld.xz * 0.35 - t * 0.05) * 0.3;
        vec3 col = mix(uDeep, uShallow, n);
        float web = 1.0 - smoothstep(0.02, 0.09, cells(vWorld.xz * 0.6, t * 0.7));
        col = mix(col, uFoam, web * 0.22);
        gl_FragColor = vec4(col, 0.86);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
