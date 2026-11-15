import { BufferAttribute, BufferGeometry, Color, MathUtils, Mesh, MeshStandardMaterial } from 'three';
import { patchLiving } from '../core/livingMaterial';
import type { Quality } from '../core/quality';
import type { SharedUniforms } from '../core/uniforms';
import { TerrainField } from './TerrainField';

const { clamp, smoothstep } = MathUtils;

const HALF_SIZE = 540;
/** Share of the grid spacing that is linear; the rest grows cubically so detail concentrates in the valley. */
const LINEAR = 0.2;

/** The valley, foothills and mountains as one mesh, coloured from height, slope and noise. */
export class Terrain {
  readonly mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly axis: Float32Array;
  private readonly res: number;
  private readonly glow: Float32Array;

  constructor(private readonly field: TerrainField, shared: SharedUniforms, quality: Quality) {
    const res = (this.res = quality.terrainResolution + 1);
    const axis = (this.axis = new Float32Array(res));
    for (let i = 0; i < res; i++) {
      const u = (i / (res - 1)) * 2 - 1;
      axis[i] = HALF_SIZE * (LINEAR * u + (1 - LINEAR) * u * u * u);
    }

    const count = res * res;
    const positions = new Float32Array(count * 3);
    for (let k = 0; k < res; k++) {
      for (let i = 0; i < res; i++) {
        const o = (k * res + i) * 3;
        positions[o] = axis[i];
        positions[o + 1] = field.heightAt(axis[i], axis[k]);
        positions[o + 2] = axis[k];
      }
    }

    const indices = new Uint32Array((res - 1) * (res - 1) * 6);
    let p = 0;
    for (let k = 0; k < res - 1; k++) {
      for (let i = 0; i < res - 1; i++) {
        const a = k * res + i;
        const b = a + 1;
        const c = a + res;
        const d = c + 1;
        indices[p++] = a;
        indices[p++] = c;
        indices[p++] = b;
        indices[p++] = b;
        indices[p++] = c;
        indices[p++] = d;
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new BufferAttribute(this.paint(positions, geometry.attributes.normal.array as Float32Array), 3));
    this.glow = new Float32Array(count * 3);
    geometry.setAttribute('aGlowPool', new BufferAttribute(this.glow, 3));
    geometry.computeBoundingSphere();

    const material = patchLiving(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
      shared,
      { terrain: true },
    );
    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  private paint(positions: Float32Array, normals: Float32Array): Float32Array {
    const n = this.field.detail;
    const colors = new Float32Array(positions.length);
    const mossA = new Color('#0e4a45');
    const mossB = new Color('#176238');
    const violet = new Color('#472a6c');
    const rose = new Color('#86365f');
    const shore = new Color('#14202a');
    const bed = new Color('#08121a');
    const rock = new Color('#3b3350');
    const rockHi = new Color('#685a86');
    const snow = new Color('#e9dcf4');
    const c = new Color();
    const tmp = new Color();

    for (let v = 0; v < positions.length; v += 3) {
      const x = positions[v];
      const h = positions[v + 1];
      const z = positions[v + 2];
      const slope = 1 - normals[v + 1];
      const n1 = n.noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
      const n2 = n.fbm(x * 0.06 + 50, z * 0.06, 2);
      const n3 = n.noise(x * 0.033 - 20, z * 0.033 + 70);

      c.copy(mossA).lerp(mossB, n1);
      c.lerp(violet, smoothstep(n2, 0.1, 0.6) * 0.9);
      c.lerp(rose, smoothstep(n3, 0.5, 0.85) * 0.65);

      const rocky = Math.max(smoothstep(slope, 0.1, 0.34), smoothstep(h, 11, 28));
      tmp.copy(rock).lerp(rockHi, clamp(n1 * 0.7 + (h - 14) / 60, 0, 1));
      c.lerp(tmp, rocky);
      const snowAmt = smoothstep(h + n2 * 7, 31, 47) * (1 - smoothstep(slope, 0.28, 0.62));
      c.lerp(snow, snowAmt);

      c.lerp(shore, 1 - smoothstep(h, 0.05, 1.2));
      c.lerp(bed, 1 - smoothstep(h, -1.4, -0.1));

      colors[v] = c.r;
      colors[v + 1] = c.g;
      colors[v + 2] = c.b;
    }
    return colors;
  }

  private indexBelow(value: number): number {
    const axis = this.axis;
    let lo = 0;
    let hi = this.res - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (axis[mid] <= value) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Paint a soft pool of coloured light on the ground (lit at night by the plant above it). */
  addGlowPool(x: number, z: number, radius: number, color: Color, strength: number): void {
    const axis = this.axis;
    const res = this.res;
    const i0 = this.indexBelow(x - radius);
    const i1 = Math.min(res - 1, this.indexBelow(x + radius) + 1);
    const k0 = this.indexBelow(z - radius);
    const k1 = Math.min(res - 1, this.indexBelow(z + radius) + 1);
    for (let k = k0; k <= k1; k++) {
      const dz = axis[k] - z;
      for (let i = i0; i <= i1; i++) {
        const dx = axis[i] - x;
        const d = Math.sqrt(dx * dx + dz * dz) / radius;
        if (d >= 1) continue;
        const w = (1 - d * d) * (1 - d * d) * strength;
        const o = (k * res + i) * 3;
        this.glow[o] += color.r * w;
        this.glow[o + 1] += color.g * w;
        this.glow[o + 2] += color.b * w;
      }
    }
  }

  commitGlow(): void {
    const g = this.glow;
    for (let i = 0; i < g.length; i++) g[i] = Math.min(g[i], 1.2);
    this.mesh.geometry.attributes.aGlowPool.needsUpdate = true;
  }
}
