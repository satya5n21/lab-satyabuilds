export interface Quality {
  mobile: boolean;
  /** Multiplier on vegetation counts. */
  density: number;
  shadowMap: number;
  maxPixelRatio: number;
  /** Lake reflection resolution relative to the viewport. */
  reflectionScale: number;
  msaa: number;
  terrainResolution: number;
}

export function detectQuality(): Quality {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 620;
  const mobile = coarse || small;
  return mobile
    ? {
        mobile,
        density: 0.5,
        shadowMap: 1024,
        maxPixelRatio: 1.5,
        reflectionScale: 0.33,
        msaa: 0,
        terrainResolution: 220,
      }
    : {
        mobile,
        density: 1,
        shadowMap: 2048,
        maxPixelRatio: 1.6,
        reflectionScale: 0.5,
        msaa: 4,
        terrainResolution: 300,
      };
}
