export interface SimParams {
  /** Black hole gravitational strength (mass), 1 = reference mass. */
  strength: number;
  /** Simulation time scale. */
  speed: number;
  /** Target number of ambient particles. */
  count: number;
  trails: boolean;
  paused: boolean;
}

export const DEFAULT_PARAMS: SimParams = {
  strength: 1,
  speed: 1,
  count: 600,
  trails: true,
  paused: false,
};

export const RANGES = {
  strength: { min: 0.3, max: 2.5, step: 0.05 },
  speed: { min: 0.1, max: 3, step: 0.05 },
  count: { min: 50, max: 2000, step: 10 },
} as const;

/** Reference mass in millions of solar masses for strength = 1 (Sgr A*-like). */
export const REFERENCE_MASS_MSUN_MILLIONS = 4.3;
/** Schwarzschild radius per solar mass, in km. */
export const RS_KM_PER_MSUN = 2.953;

export interface HudStats {
  fps: number;
  alive: number;
  bound: number;
  escaping: number;
  swallowed: number;
  stars: number;
}
