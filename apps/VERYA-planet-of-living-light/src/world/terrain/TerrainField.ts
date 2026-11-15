import { MathUtils } from 'three';
import { Noise2D } from '../core/noise';

const { lerp, smoothstep } = MathUtils;

export const WATER_LEVEL = 0;
/** The lake at the heart of the valley. */
export const LAKE = { x: -3, z: 2, rx: 38, rz: 30 };
/** Low passes in the mountain wall where the sun rises and sets (radians, 0 = -Z, + = +X). */
const PASS_EAST = 0.72;
const PASS_WEST = -0.76;

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The analytic height field: rolling valley floor, lake basin, ring of ridged mountains. */
export class TerrainField {
  private readonly noise: Noise2D;
  readonly detail: Noise2D;

  constructor(seed = 20317) {
    this.noise = new Noise2D(seed);
    this.detail = new Noise2D(seed + 77);
  }

  heightAt(x: number, z: number): number {
    const n = this.noise;
    const r = Math.hypot(x, z);

    // Valley floor
    let h = 2.5 + n.fbm(x * 0.011, z * 0.011, 4) * 3.3 + n.fbm(x * 0.045 + 40, z * 0.045 - 17, 2) * 0.45;

    // Lake basin with an irregular shoreline
    const lx = (x - LAKE.x) / LAKE.rx;
    const lz = (z - LAKE.z) / LAKE.rz;
    const wobble = n.noise(x * 0.028 + 5, z * 0.028 - 9) * 0.2;
    const ld = Math.sqrt(lx * lx + lz * lz) + wobble;
    const basin = 1 - smoothstep(ld, 0.6, 1.32);
    h = lerp(h, -2.8, basin);

    // Foothills and the mountain wall
    const az = Math.atan2(x, -z);
    const de = angleDiff(az, PASS_EAST);
    const dw = angleDiff(az, PASS_WEST);
    const pass = 1 - 0.8 * Math.exp(-(de * de) / 0.07) - 0.8 * Math.exp(-(dw * dw) / 0.07);
    const foot = smoothstep(r, 62, 150);
    h += foot * (n.fbm(x * 0.02 + 7, z * 0.02 + 3, 3) * 0.5 + 0.5) * 5.5 * (0.4 + 0.6 * pass);
    const m = smoothstep(r, 105, 335);
    if (m > 0) {
      const ridge = n.ridged(x * 0.0052 + 100, z * 0.0052 + 100, 5);
      const massif = n.fbm(x * 0.0023 - 50, z * 0.0023 + 80, 2) * 0.5 + 0.5;
      h += Math.pow(m, 1.6) * (10 + ridge * 96 * (0.5 + 0.5 * massif)) * pass;
    }
    return h;
  }

  /** Steepness as rise/run. */
  slopeAt(x: number, z: number): number {
    const e = 0.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}
