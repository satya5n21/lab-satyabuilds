import type { Material } from 'three';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from './glsl';
import type { SharedUniforms } from './uniforms';

/**
 * Extends a lit, shadow-receiving standard material with the "living world"
 * behaviours: wind sway, petals that open, bioluminescent emission,
 * back-lit translucency, evening colour shift and sky-matched fog.
 * Built-in lighting and shadows stay intact — we only inject into the shader.
 */
export interface LivingOptions {
  /** Organic geometry carrying aSway / aGlow attributes. */
  plant?: boolean;
  /** Petal hinge rotation driven by the bloom uniform (needs aPetal). */
  petals?: boolean;
  /** Procedural glowing leaf veins from the uv attribute. */
  veins?: boolean;
  /** Wing flapping instead of wind sway (aSway = distance along the wing). */
  flap?: boolean;
  /** Ground detail, glow pools and luminous mycelium. */
  terrain?: boolean;
  glowStrength?: number;
  translucency?: number;
  hingeY?: number;
  duskShift?: number;
}

const VERT_DECL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uOpen;
varying vec3 vWPos;
#ifdef VEYRA_PLANT
  attribute float aSway;
  attribute float aGlow;
  varying float vGlow;
  varying vec2 vLUv;
  varying float vPhase;
  #ifdef USE_INSTANCING
    attribute vec4 aInst;
  #endif
#endif
#ifdef VEYRA_PETALS
  attribute vec4 aPetal;
  uniform float uHingeY;
  vec3 vyRot(vec3 v, vec3 k, float a){
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
#endif
#ifdef VEYRA_TERRAIN
  attribute vec3 aGlowPool;
  varying vec3 vPool;
#endif
`;

const VERT_NORMAL = /* glsl */ `
#ifdef VEYRA_PLANT
  #ifdef USE_INSTANCING
    vec4 vyInst = aInst;
  #else
    vec4 vyInst = vec4(0.0, 0.5, 1.0, 0.0);
  #endif
#endif
#ifdef VEYRA_PETALS
  float vyOpen = clamp(uOpen * 1.3 - vyInst.x * 0.3, 0.0, 1.0);
  vyOpen = vyOpen * vyOpen * (3.0 - 2.0 * vyOpen);
  float vyAng = vyOpen * (1.0 + 0.55 * aPetal.w);
  bool vyIsPetal = dot(aPetal.xyz, aPetal.xyz) > 0.5;
  if (vyIsPetal) objectNormal = vyRot(objectNormal, aPetal.xyz, vyAng);
#endif
`;

const VERT_POSITION = /* glsl */ `
#ifdef VEYRA_PETALS
  if (vyIsPetal) {
    vec3 vyHinge = vec3(0.0, uHingeY, 0.0);
    transformed = vyRot(transformed - vyHinge, aPetal.xyz, vyAng) + vyHinge;
  }
#endif
#ifdef VEYRA_FLAP
  transformed.y += aSway * sin(uTime * 5.5 + vyInst.x * 50.0 - aSway * 1.5) * 0.45;
#endif
`;

const VERT_PROJECT = /* glsl */ `
vec4 vyWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  vyWorld = instanceMatrix * vyWorld;
#endif
vyWorld = modelMatrix * vyWorld;
#ifdef VEYRA_PLANT
  vGlow = aGlow * vyInst.z;
  vLUv = uv;
  vPhase = vyInst.x;
  #ifndef VEYRA_FLAP
    #ifdef USE_INSTANCING
      vec3 vyRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float vyScale = length(instanceMatrix[1].xyz);
    #else
      vec3 vyRoot = modelMatrix[3].xyz;
      float vyScale = 1.0;
    #endif
    float vyPh = vyInst.x * 6.2831;
    float vyW1 = sin(uTime * 1.05 + vyRoot.x * 0.21 + vyRoot.z * 0.17 + vyPh);
    float vyW2 = sin(uTime * 0.61 + vyRoot.x * 0.09 - vyRoot.z * 0.13 + vyPh * 1.7);
    float vyW3 = sin(uTime * 2.2 + vyWorld.y * 1.4 + vyPh * 3.1);
    float vyGust = 0.6 + 0.4 * sin(uTime * 0.17 + vyRoot.x * 0.03 + vyRoot.z * 0.021);
    vec3 vyDirW = vec3(0.8, 0.0, 0.6);
    vec3 vyOff = vyDirW * (vyW1 * 0.6 + vyW2 * 0.4) + vec3(-0.6, 0.0, 0.8) * vyW3 * 0.22;
    vyWorld.xyz += vyOff * (aSway * vyScale * uWind * vyGust);
  #endif
#endif
#ifdef VEYRA_TERRAIN
  vPool = aGlowPool;
#endif
vWPos = vyWorld.xyz;
vec4 mvPosition = viewMatrix * vyWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_DECL = /* glsl */ `
uniform float uTime;
uniform float uBio;
uniform float uDusk;
uniform float uMist;
uniform float uGlowStrength;
uniform float uTranslucency;
uniform float uDuskShift;
uniform vec3 uSunLight;
varying vec3 vWPos;
#ifdef VEYRA_PLANT
  varying float vGlow;
  varying vec2 vLUv;
  varying float vPhase;
#endif
#ifdef VEYRA_TERRAIN
  varying vec3 vPool;
#endif
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
`;

const FRAG_COLOR = /* glsl */ `
#ifdef VEYRA_PLANT
  float vyGlow = vGlow;
  #ifdef VEYRA_VEINS
    float vyU = abs(vLUv.x * 2.0 - 1.0);
    float vyMid = smoothstep(0.1, 0.02, vyU);
    float vyF = abs(fract(vLUv.y * 7.0 - vyU * 2.2) - 0.5);
    float vySide = smoothstep(0.4, 0.49, vyF) * smoothstep(0.98, 0.55, vyU) * smoothstep(0.02, 0.12, vyU);
    float vyVein = max(vyMid, vySide);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5 + vec3(0.04, 0.22, 0.2), vyVein * 0.5);
    vyGlow = vyVein * (0.3 + 0.7 * vLUv.y) * vGlow;
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.brg * vec3(1.05, 0.82, 1.1), uDusk * uDuskShift);
#endif
#ifdef VEYRA_TERRAIN
  float vyN1 = vnoise(vWPos.xz * 0.9);
  float vyN2 = vnoise(vWPos.xz * 4.3);
  diffuseColor.rgb *= 0.74 + 0.34 * vyN1 + 0.16 * vyN2;
#endif
`;

const FRAG_EMISSIVE = /* glsl */ `
#ifdef VEYRA_PLANT
  float vyPulse = 0.82 + 0.18 * sin(uTime * 1.3 + vPhase * 6.2831);
  totalEmissiveRadiance += diffuseColor.rgb * vyGlow * uBio * uGlowStrength * vyPulse;
  vec3 vyView = normalize(vWPos - cameraPosition);
  float vyBack = pow(max(dot(vyView, uSunDir), 0.0), 3.0);
  totalEmissiveRadiance += diffuseColor.rgb * uSunLight * vyBack * uTranslucency;
#endif
#ifdef VEYRA_TERRAIN
  float vyLow = smoothstep(11.0, 3.0, vWPos.y) * smoothstep(-0.1, 0.5, vWPos.y);
  float vyPatch = smoothstep(0.42, 0.72, vnoise(vWPos.xz * 0.045 + 9.0));
  float vyLine = abs(vnoise(vWPos.xz * 0.38) - 0.5);
  float vyMyc = smoothstep(0.035, 0.0, vyLine);
  vec3 vyMycCol = mix(vec3(0.08, 0.9, 0.85), vec3(0.55, 0.3, 1.0), vnoise(vWPos.xz * 0.02 + 3.0));
  totalEmissiveRadiance += vyMycCol * vyMyc * vyPatch * vyLow * uBio * 0.5;
  totalEmissiveRadiance += vPool * uBio * (0.35 + diffuseColor.rgb * 2.2);
  float vyShore = smoothstep(0.55, 0.0, abs(vWPos.y - 0.14));
  float vyShimmer = 0.55 + 0.45 * vnoise(vWPos.xz * 1.4 + uTime * 0.25);
  totalEmissiveRadiance += vec3(0.04, 0.72, 0.8) * vyShore * vyShimmer * uBio * 0.55;
#endif
`;

const FRAG_FOG = /* glsl */ `
#ifdef USE_FOG
  vec3 vyFogDir = normalize(vWPos - cameraPosition);
  float vyFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  float vyMist = (1.0 - exp(-vFogDepth * 0.011)) * exp(-max(vWPos.y, 0.0) * 0.15) * uMist;
  vyFog = clamp(vyFog + vyMist * (1.0 - vyFog), 0.0, 1.0);
  vec3 vyFogCol = atmosphere(normalize(vec3(vyFogDir.x, max(vyFogDir.y, 0.0) * 0.5 + 0.035, vyFogDir.z)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vyFogCol, vyFog);
#endif
`;

export function patchLiving<T extends Material>(material: T, shared: SharedUniforms, options: LivingOptions = {}): T {
  const defines: Record<string, string> = {};
  if (options.plant) defines.VEYRA_PLANT = '';
  if (options.petals) defines.VEYRA_PETALS = '';
  if (options.veins) defines.VEYRA_VEINS = '';
  if (options.flap) defines.VEYRA_FLAP = '';
  if (options.terrain) defines.VEYRA_TERRAIN = '';
  material.defines = { ...(material.defines ?? {}), ...defines };

  const local = {
    uGlowStrength: { value: options.glowStrength ?? 1 },
    uTranslucency: { value: options.translucency ?? 0 },
    uHingeY: { value: options.hingeY ?? 0 },
    uDuskShift: { value: options.duskShift ?? 0.35 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VERT_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_POSITION}`)
      .replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`)
      .replace('#include <fog_fragment>', FRAG_FOG);
  };
  return material;
}
