import { CircleGeometry, Color, Matrix4 } from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { EnvState } from '../../simulation/environment';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../core/glsl';
import type { Quality } from '../core/quality';
import type { SharedUniforms } from '../core/uniforms';
import { WATER_LEVEL } from './TerrainField';

const WATER_SHADER = {
  name: 'VeyraWater',
  uniforms: {
    color: { value: null as Color | null },
    tDiffuse: { value: null },
    textureMatrix: { value: null as Matrix4 | null },
    uWaterDeep: { value: new Color('#06222c') },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vRefUv;
    varying vec3 vWPos;
    void main(){
      vRefUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uWaterDeep;
    uniform float uTime;
    uniform float uBio;
    uniform float uMist;
    uniform float uFogDensity;
    uniform vec3 uSunLight;
    varying vec4 vRefUv;
    varying vec3 vWPos;
    ${NOISE_GLSL}
    ${ATMOSPHERE_GLSL}

    void main(){
      vec2 p = vWPos.xz;
      float t = uTime;
      // Two scales of slow ripples
      vec2 big = vec2(vnoise(p * 0.5 + vec2(t * 0.11, t * 0.07)), vnoise(p * 0.5 + vec2(31.7 - t * 0.09, 12.3 + t * 0.05))) - 0.5;
      vec2 fine = vec2(vnoise(p * 2.3 + vec2(t * 0.3, -t * 0.21)), vnoise(p * 2.3 + vec2(7.1 - t * 0.25, 3.3 + t * 0.28))) - 0.5;
      vec2 rip = big * 0.7 + fine * 0.3;

      vec3 toCam = cameraPosition - vWPos;
      float dist = length(toCam);
      vec3 V = toCam / dist;
      vec3 N = normalize(vec3(rip.x * 0.55, 1.0, rip.y * 0.55));
      float fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 4.0);

      vec4 uv = vRefUv;
      uv.xy += rip * 0.07 * uv.w * (0.25 + 0.75 / (1.0 + dist * 0.03));
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;

      vec3 col = mix(uWaterDeep, refl, clamp(fres * 1.1 + 0.22, 0.0, 1.0));

      // Sun sparkle on the ripples
      vec3 R = reflect(-V, normalize(vec3(rip.x * 0.9, 1.0, rip.y * 0.9)));
      col += uSunLight * pow(max(dot(R, uSunDir), 0.0), 260.0) * 2.5;

      // Luminous plankton drifting in slow swirls after dark
      float swirl = smoothstep(0.46, 0.8, fbm2(p * 0.065 + vec2(t * 0.012, -t * 0.008)));
      float spark = pow(vnoise(p * 3.2 + vec2(t * 0.35, t * 0.2)), 3.0);
      col += vec3(0.06, 0.78, 0.9) * swirl * (0.22 + 1.1 * spark) * uBio * 0.6;

      // Sky-matched fog
      vec3 dir = -V;
      float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      float mist = (1.0 - exp(-dist * 0.011)) * uMist;
      fog = clamp(fog + mist * (1.0 - fog), 0.0, 1.0);
      vec3 fogCol = atmosphere(normalize(vec3(dir.x, 0.035, dir.z)));
      col = mix(col, fogCol, fog);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** The lake: a true planar reflection of the world, rippled, tinted and lit by plankton at night. */
export class Water {
  readonly mesh: Reflector;
  private readonly scale: number;

  constructor(shared: SharedUniforms, quality: Quality, width: number, height: number) {
    this.scale = quality.reflectionScale;
    const geometry = new CircleGeometry(175, 64);
    this.mesh = new Reflector(geometry, {
      textureWidth: Math.max(64, Math.floor(width * this.scale)),
      textureHeight: Math.max(64, Math.floor(height * this.scale)),
      clipBias: 0.02,
      multisample: quality.mobile ? 0 : 2,
      shader: WATER_SHADER,
    });
    // Reflector clones its uniforms; re-link the shared ones by reference.
    Object.assign(this.material.uniforms, shared);
    this.material.fog = false;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.name = 'water';
  }

  private get material() {
    return this.mesh.material as import('three').ShaderMaterial;
  }

  update(env: EnvState): void {
    (this.material.uniforms.uWaterDeep.value as Color).copy(env.water);
  }

  setSize(width: number, height: number): void {
    this.mesh
      .getRenderTarget()
      .setSize(Math.max(64, Math.floor(width * this.scale)), Math.max(64, Math.floor(height * this.scale)));
  }
}
