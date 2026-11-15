import { HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderTarget, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { EnvState } from '../simulation/environment';
import type { Quality } from './core/quality';

/**
 * Bloom spreads whatever it is given across the whole frame, so a single
 * invalid or runaway HDR pixel must never reach it.
 */
const SanitizeShader = {
  name: 'VeyraSanitize',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      gl_FragColor = vec4(clamp(c, 0.0, 48.0), 1.0);
    }
  `,
};

/** HDR render → soft bloom (sun, moons, bioluminescence) → filmic tone mapping. */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly target: WebGLRenderTarget;

  constructor(private readonly renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: Quality) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    this.target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: quality.msaa });
    this.composer = new EffectComposer(renderer, this.target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.4, 0.72, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  apply(env: EnvState): void {
    this.bloom.strength = env.bloomStrength;
    this.bloom.threshold = env.bloomThreshold;
    this.renderer.toneMappingExposure = env.exposure;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.target.dispose();
  }
}
