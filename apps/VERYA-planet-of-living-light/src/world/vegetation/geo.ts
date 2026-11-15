import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

/** Per-vertex look for organic geometry. */
export interface VertStyle {
  color: Color;
  /** Wind displacement in world units at full gust. */
  sway: number;
  /** Bioluminescent emission mask 0 … 1. */
  glow: number;
}

/**
 * Accumulates one merged, indexed geometry with the custom attributes the
 * living material understands (colour, sway, glow, optional petal hinge).
 */
export class GeoBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly sway: number[] = [];
  private readonly glow: number[] = [];
  private readonly uvs: number[] = [];
  private readonly petal: number[] = [];
  private readonly indices: number[] = [];
  private usesPetals = false;

  get count(): number {
    return this.positions.length / 3;
  }

  vert(x: number, y: number, z: number, color: Color, sway = 0, glow = 0, u = 0, v = 0): number {
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    this.sway.push(sway);
    this.glow.push(glow);
    this.uvs.push(u, v);
    this.petal.push(0, 0, 0, 0);
    return this.count - 1;
  }

  /** Mark a vertex as part of a petal that rotates about `axis` through the hinge. */
  setPetal(index: number, ax: number, ay: number, az: number, along: number): void {
    this.usesPetals = true;
    const o = index * 4;
    this.petal[o] = ax;
    this.petal[o + 1] = ay;
    this.petal[o + 2] = az;
    this.petal[o + 3] = along;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setAttribute('aSway', new Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aGlow', new Float32BufferAttribute(this.glow, 1));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    if (this.usesPetals) g.setAttribute('aPetal', new Float32BufferAttribute(this.petal, 4));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const _t = new Vector3();
const _b = new Vector3();
const _style: VertStyle = { color: new Color(), sway: 0, glow: 0 };

/** A tapered tube swept along a path, with an optional pointed cap. */
export function addTube(
  b: GeoBuilder,
  points: Vector3[],
  segments: number,
  radius: (t: number) => number,
  style: (t: number, j: number, out: VertStyle) => void,
  cap = true,
): void {
  const n = points.length;
  const start = b.count;
  const normal = new Vector3(1, 0, 0);
  _t.subVectors(points[1], points[0]).normalize();
  if (Math.abs(_t.x) > 0.9) normal.set(0, 0, 1);

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    _t.subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]).normalize();
    normal.addScaledVector(_t, -normal.dot(_t)).normalize();
    _b.crossVectors(_t, normal);
    const r = radius(t);
    const p = points[i];
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const cs = Math.cos(a) * r;
      const sn = Math.sin(a) * r;
      _style.sway = 0;
      _style.glow = 0;
      style(t, j, _style);
      b.vert(
        p.x + normal.x * cs + _b.x * sn,
        p.y + normal.y * cs + _b.y * sn,
        p.z + normal.z * cs + _b.z * sn,
        _style.color,
        _style.sway,
        _style.glow,
      );
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = start + i * segments + j;
      const bb = start + i * segments + ((j + 1) % segments);
      b.quad(a, bb, bb + segments, a + segments);
    }
  }
  if (cap) {
    const last = points[n - 1];
    _style.sway = 0;
    _style.glow = 0;
    style(1, 0, _style);
    const r = radius(1);
    const tip = b.vert(last.x + _t.x * r, last.y + _t.y * r, last.z + _t.z * r, _style.color, _style.sway, _style.glow);
    const ring = start + (n - 1) * segments;
    for (let j = 0; j < segments; j++) b.tri(ring + j, ring + ((j + 1) % segments), tip);
  }
}

export interface ProfilePoint {
  r: number;
  y: number;
}

/** A surface of revolution around the Y axis; `shape` may wobble each ring to break the symmetry. */
export function addLathe(
  b: GeoBuilder,
  profile: ProfilePoint[],
  segments: number,
  center: Vector3,
  style: (k: number, j: number, out: VertStyle) => void,
  shape?: (k: number, phi: number, point: ProfilePoint) => void,
): void {
  const start = b.count;
  const pt: ProfilePoint = { r: 0, y: 0 };
  for (let k = 0; k < profile.length; k++) {
    for (let j = 0; j < segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      pt.r = profile[k].r;
      pt.y = profile[k].y;
      shape?.(k, phi, pt);
      _style.sway = 0;
      _style.glow = 0;
      style(k, j, _style);
      b.vert(
        center.x + Math.cos(phi) * pt.r,
        center.y + pt.y,
        center.z + Math.sin(phi) * pt.r,
        _style.color,
        _style.sway,
        _style.glow,
        j / segments,
        k / (profile.length - 1),
      );
    }
  }
  for (let k = 0; k < profile.length - 1; k++) {
    for (let j = 0; j < segments; j++) {
      const a = start + k * segments + j;
      const bb = start + k * segments + ((j + 1) % segments);
      b.quad(a, bb, bb + segments, a + segments);
    }
  }
}
