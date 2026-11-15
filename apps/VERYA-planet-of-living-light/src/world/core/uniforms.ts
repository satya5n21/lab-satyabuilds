import { Color, Vector3 } from 'three';

/**
 * Uniforms shared by every material in the world. They are passed by
 * reference, so the environment is written once per frame and every shader
 * (sky, terrain, water, plants, moons) reads the same values.
 */
export function createSharedUniforms() {
  return {
    /** Real-time animation clock — independent of simulated time. */
    uTime: { value: 0 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uGround: { value: new Color() },
    uSunGlow: { value: new Color() },
    uGlowAmt: { value: 0 },
    uAntiGlow: { value: new Color() },
    /** Sun colour scaled by its normalised intensity. */
    uSunLight: { value: new Color() },
    uBio: { value: 0 },
    uOpen: { value: 0 },
    uDusk: { value: 0 },
    uWind: { value: 1 },
    uMist: { value: 0 },
    uStarVis: { value: 0 },
    uVeil: { value: 0 },
    uFogDensity: { value: 0.003 },
  };
}

export type SharedUniforms = ReturnType<typeof createSharedUniforms>;
