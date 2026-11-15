import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three';
import type { EnvState } from '../../simulation/environment';
import { mulberry32 } from '../core/noise';
import type { Quality } from '../core/quality';
import type { SharedUniforms } from '../core/uniforms';
import type { TerrainField } from '../terrain/TerrainField';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uVisibility;
uniform float uPixelRatio;
uniform float uSize;
varying vec3 vColor;
varying float vAlpha;

void main(){
  vec3 p = position;
  float t = uTime * 0.12 + aSeed.x * 100.0;
  // Slow wandering plus a gentle rise that loops
  p.x += sin(t * 1.3 + aSeed.y * 6.28) * 2.0 + sin(t * 0.37 + aSeed.z * 9.0) * 3.0;
  p.z += cos(t * 1.1 + aSeed.z * 6.28) * 2.0 + cos(t * 0.29 + aSeed.y * 7.0) * 3.0;
  float rise = fract(aSeed.w + uTime * 0.011 * (0.5 + aSeed.x));
  p.y += rise * 9.0 + sin(t * 0.9 + aSeed.w * 6.28) * 0.6;
  float life = sin(rise * 3.14159);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.5 + 0.5 * sin(uTime * (0.8 + aSeed.y * 2.2) + aSeed.z * 30.0);
  float size = uSize * (0.45 + aSeed.x * 0.9) * uPixelRatio * (160.0 / max(-mv.z, 1.0));
  gl_PointSize = clamp(size, 1.5, 12.0 * uPixelRatio);

  vec3 cyan = vec3(0.25, 0.95, 1.0);
  vec3 violet = vec3(0.68, 0.45, 1.0);
  vec3 pink = vec3(1.0, 0.5, 0.82);
  vec3 turquoise = vec3(0.3, 1.0, 0.75);
  float k = aSeed.z;
  vColor = k < 0.4 ? mix(cyan, turquoise, k / 0.4) : (k < 0.75 ? mix(violet, cyan, (k - 0.4) / 0.35) : mix(pink, violet, (k - 0.75) / 0.25));
  float distFade = smoothstep(260.0, 60.0, -mv.z) * smoothstep(1.0, 4.0, -mv.z);
  vAlpha = life * (0.35 + 0.65 * twinkle) * uVisibility * distFade;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  float core = smoothstep(0.16, 0.0, d);
  gl_FragColor = vec4(vColor * (a * 0.5 + core * 1.5) * vAlpha, 1.0);
}
`;

/** Drifting luminous spores — barely-there motes by day, a slow snowfall of light by night. */
export class Spores {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  constructor(field: TerrainField, shared: SharedUniforms, quality: Quality) {
    const rng = mulberry32(4417);
    const count = Math.round(1500 * quality.density);
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 105 * Math.pow(rng(), 0.6);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = Math.max(field.heightAt(x, z), 0) + 0.3;
      positions[i * 3 + 2] = z;
      seeds[i * 4] = rng();
      seeds[i * 4 + 1] = rng();
      seeds[i * 4 + 2] = rng();
      seeds[i * 4 + 3] = rng();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));

    const material = new ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uVisibility: { value: 0 },
        uPixelRatio: { value: 1 },
        uSize: { value: quality.mobile ? 2.6 : 3.2 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    this.points.name = 'spores';
  }

  update(env: EnvState, pixelRatio: number): void {
    const u = this.points.material.uniforms;
    u.uVisibility.value = env.particles;
    u.uPixelRatio.value = pixelRatio;
  }
}
