import {
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Object3D,
} from 'three';
import type { Rng } from '../core/noise';
import type { TerrainField } from '../terrain/TerrainField';

export interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  /** Stable per-plant random in [0, 1). */
  seed: number;
}

export interface ScatterOptions {
  count: number;
  /** Centre of the scatter disc. */
  cx?: number;
  cz?: number;
  radiusMin?: number;
  radiusMax: number;
  /** Radial exponent: 0.5 spreads plants evenly, higher values gather them toward the centre. */
  falloff?: number;
  minHeight?: number;
  maxHeight?: number;
  maxSlope?: number;
  minDistance?: number;
  scale: [number, number];
  /** Probability 0 … 1 of accepting a candidate at this spot. */
  density?: (x: number, z: number) => number;
  reject?: (x: number, z: number) => boolean;
}

/** Rejection-sample plant positions that respect water, slopes, spacing and density noise. */
export function scatter(field: TerrainField, rng: Rng, o: ScatterOptions, existing: Placement[] = []): Placement[] {
  const out: Placement[] = [];
  const rMin = o.radiusMin ?? 0;
  const minH = o.minHeight ?? 0.35;
  const maxH = o.maxHeight ?? 14;
  const maxSlope = o.maxSlope ?? 0.6;
  const minD2 = (o.minDistance ?? 0) ** 2;
  let attempts = o.count * 40;
  while (out.length < o.count && attempts-- > 0) {
    const a = rng() * Math.PI * 2;
    const r = rMin + (o.radiusMax - rMin) * Math.pow(rng(), o.falloff ?? 0.5);
    const x = (o.cx ?? 0) + Math.cos(a) * r;
    const z = (o.cz ?? 0) + Math.sin(a) * r;
    if (o.reject?.(x, z)) continue;
    if (o.density && rng() > o.density(x, z)) continue;
    const y = field.heightAt(x, z);
    if (y < minH || y > maxH) continue;
    if (field.slopeAt(x, z) > maxSlope) continue;
    if (minD2 > 0) {
      let crowded = false;
      for (const p of out) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD2) {
          crowded = true;
          break;
        }
      }
      if (!crowded) {
        for (const p of existing) {
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD2) {
            crowded = true;
            break;
          }
        }
      }
      if (crowded) continue;
    }
    out.push({
      x,
      y,
      z,
      scale: o.scale[0] + (o.scale[1] - o.scale[0]) * rng(),
      rotation: rng() * Math.PI * 2,
      seed: rng(),
    });
  }
  return out;
}

export interface InstanceOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Layer 1 is drawn by the main camera only — it is skipped in the lake reflection. */
  layer?: number;
  /** Random lean, radians. */
  tilt?: number;
  /** Sink into the ground slightly so bases never float. */
  sink?: number;
  color?: (p: Placement, out: Color) => void;
  glow?: (p: Placement) => number;
}

const _dummy = new Object3D();
const _color = new Color();

/** Build one InstancedMesh for a set of placements, with per-instance phase / glow data. */
export function instantiate(
  geometry: BufferGeometry,
  material: Material,
  placements: Placement[],
  o: InstanceOptions = {},
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, placements.length);
  const inst = new Float32Array(placements.length * 4);
  placements.forEach((p, i) => {
    _dummy.position.set(p.x, p.y - (o.sink ?? 0.06) * p.scale, p.z);
    const tilt = o.tilt ?? 0;
    _dummy.rotation.set((p.seed - 0.5) * 2 * tilt, p.rotation, (((p.seed * 7.13) % 1) - 0.5) * 2 * tilt);
    _dummy.scale.setScalar(p.scale);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    if (o.color) {
      _color.setRGB(1, 1, 1);
      o.color(p, _color);
      mesh.setColorAt(i, _color);
    }
    inst[i * 4] = p.seed;
    inst[i * 4 + 1] = (p.seed * 3.71) % 1;
    inst[i * 4 + 2] = o.glow ? o.glow(p) : 1;
    inst[i * 4 + 3] = 0;
  });
  geometry.setAttribute('aInst', new InstancedBufferAttribute(inst, 4));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = o.castShadow ?? false;
  mesh.receiveShadow = o.receiveShadow ?? true;
  if (o.layer !== undefined) mesh.layers.set(o.layer);
  mesh.computeBoundingSphere();
  return mesh;
}
