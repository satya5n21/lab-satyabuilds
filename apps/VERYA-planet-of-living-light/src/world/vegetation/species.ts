import { BufferGeometry, Color, MathUtils, Vector3 } from 'three';
import type { Rng } from '../core/noise';
import { GeoBuilder, addLathe, addTube, type ProfilePoint } from './geo';

const { lerp, clamp } = MathUtils;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Medusa trees — pale forking trunks crowned with jellyfish-like bells */
/* ------------------------------------------------------------------ */

export interface BranchTip {
  position: Vector3;
  direction: Vector3;
  size: number;
}

export interface TreeModel {
  geometry: BufferGeometry;
  tips: BranchTip[];
}

export function buildTree(rng: Rng): TreeModel {
  const b = new GeoBuilder();
  const tips: BranchTip[] = [];
  const base = new Color('#1a2040');
  const mid = new Color('#6c5d9e');
  const top = new Color('#cfc0ee');
  const vein = new Color('#62f2e6');
  const MAX_DEPTH = 2;

  const grow = (start: Vector3, dir: Vector3, length: number, r0: number, depth: number): void => {
    const steps = depth === 0 ? 7 : 5;
    const points = [start.clone()];
    const d = dir.clone();
    const p = start.clone();
    const bend = new Vector3(rng() - 0.5, depth === 0 ? 0 : 0.3 + rng() * 0.35, rng() - 0.5).multiplyScalar(
      depth === 0 ? 0.55 : 1.15,
    );
    for (let i = 1; i <= steps; i++) {
      d.addScaledVector(bend, 1 / steps).normalize();
      p.addScaledVector(d, length / steps);
      points.push(p.clone());
    }
    const r1 = r0 * (depth === MAX_DEPTH ? 0.5 : 0.66);
    const y0 = points[0].y;
    const y1 = points[steps].y;
    addTube(
      b,
      points,
      6,
      (t) => lerp(r0, r1, t) * (depth === 0 ? 1 + 1.2 * Math.pow(1 - t, 5) : 1),
      (t, j, o) => {
        const k = clamp(lerp(y0, y1, t) / 10.5, 0, 1);
        o.color.copy(base).lerp(mid, clamp(k * 2.2, 0, 1)).lerp(top, clamp(k * 2.2 - 1, 0, 1));
        // A single luminous vein runs the length of every limb
        if (j === 0) {
          o.color.lerp(vein, 0.8);
          o.glow = 0.9;
        }
      },
      depth === MAX_DEPTH,
    );

    if (depth === MAX_DEPTH) {
      tips.push({ position: p.clone(), direction: d.clone(), size: 0.85 + rng() * 0.45 });
      return;
    }
    const children = depth === 0 ? 3 : rng() < 0.35 ? 3 : 2;
    const u = new Vector3(1, 0, 0);
    if (Math.abs(d.x) > 0.9) u.set(0, 0, 1);
    u.addScaledVector(d, -u.dot(d)).normalize();
    const v = new Vector3().crossVectors(d, u);
    const offset = rng() * TAU;
    for (let c = 0; c < children; c++) {
      const phi = offset + (c / children) * TAU + (rng() - 0.5) * 0.6;
      const spread = (depth === 0 ? 0.55 : 0.7) + rng() * 0.3;
      const childDir = d
        .clone()
        .multiplyScalar(Math.cos(spread))
        .addScaledVector(u, Math.cos(phi) * Math.sin(spread))
        .addScaledVector(v, Math.sin(phi) * Math.sin(spread))
        .normalize();
      grow(p, childDir, length * (0.56 + rng() * 0.14), r1, depth + 1);
    }
  };

  grow(new Vector3(0, -0.35, 0), new Vector3(0, 1, 0), 5 + rng() * 2.4, 0.33 + rng() * 0.1, 0);
  return { geometry: b.build(), tips };
}

/** A translucent bell with a scalloped glowing rim and trailing filaments. Unit radius. */
export function buildBell(rng: Rng): BufferGeometry {
  const b = new GeoBuilder();
  const SEG = 12;
  const RINGS = 5;
  const apex = new Color('#43288f');
  const body = new Color('#8a44c8');
  const rim = new Color('#34e6cc');
  const under = new Color('#ff7fd0');
  const tipCol = new Color('#ffd0f4');
  const center = new Vector3();

  const profile: ProfilePoint[] = [];
  for (let k = 0; k <= RINGS; k++) {
    const theta = (k / RINGS) * 1.92;
    profile.push({ r: Math.max(0.02, Math.sin(theta)), y: 0.62 * Math.cos(theta) });
  }
  addLathe(
    b,
    profile,
    SEG,
    center,
    (k, j, o) => {
      const t = k / RINGS;
      o.color.copy(apex).lerp(body, clamp(t * 1.8, 0, 1)).lerp(rim, clamp(t * 2.4 - 1.3, 0, 1));
      o.glow = t * t * t;
      // A ring of pale luminous spots on the crown
      if (k === 2 && j % 2 === 0) {
        o.color.lerp(tipCol, 0.6);
        o.glow = 0.7;
      }
      o.sway = 0.03 + 0.06 * t;
    },
    (k, phi, pt) => {
      const t = k / RINGS;
      const scallop = Math.cos(phi * 6) * t * t;
      pt.r *= 1 + 0.08 * scallop;
      pt.y -= 0.07 * scallop;
    },
  );

  // Soft glowing underside
  const rimStart = RINGS * SEG;
  const hub = b.vert(0, 0.2, 0, under, 0.03, 0.35);
  for (let j = 0; j < SEG; j++) b.tri(hub, rimStart + ((j + 1) % SEG), rimStart + j);

  // Trailing filaments
  const FIL = 7;
  const c = new Color();
  for (let f = 0; f < FIL; f++) {
    const phi = (f / FIL) * TAU + rng() * 0.5;
    const len = 1.0 + rng() * 1.1;
    const rx = Math.cos(phi);
    const rz = Math.sin(phi);
    const tx = -rz;
    const tz = rx;
    const STEPS = 5;
    let prevA = -1;
    let prevB = -1;
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const rad = 0.86 + 0.1 * Math.sin(t * Math.PI) - 0.12 * t;
      const y = -0.2 - t * len;
      const w = 0.045 * (1 - 0.6 * t);
      c.copy(rim).lerp(tipCol, t * t);
      const sway = 0.07 + 0.5 * t * t;
      const glow = 0.3 + 0.7 * t * t;
      const a = b.vert(rx * rad - tx * w, y, rz * rad - tz * w, c, sway, glow);
      const d = b.vert(rx * rad + tx * w, y, rz * rad + tz * w, c, sway, glow);
      if (s > 0) b.quad(prevA, prevB, d, a);
      prevA = a;
      prevB = d;
    }
  }
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Lumen lilies — lantern buds by night, open stars by day              */
/* ------------------------------------------------------------------ */

export interface FlowerPalette {
  base: string;
  mid: string;
  tip: string;
  core: string;
}

export const FLOWER_HINGE = 1.0;

export function buildFlower(palette: FlowerPalette): BufferGeometry {
  const b = new GeoBuilder();
  const H = FLOWER_HINGE;
  const stemLo = new Color('#12403c');
  const stemHi = new Color('#3aa890');
  const cBase = new Color(palette.base);
  const cMid = new Color(palette.mid);
  const cTip = new Color(palette.tip);
  const cCore = new Color(palette.core);
  const c = new Color();

  // Stem
  const stem: Vector3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    stem.push(new Vector3(Math.sin(t * Math.PI) * 0.07, t * H, Math.sin(t * Math.PI * 0.5) * 0.0));
  }
  addTube(
    b,
    stem,
    4,
    (t) => lerp(0.034, 0.02, t),
    (t, _j, o) => {
      o.color.copy(stemLo).lerp(stemHi, t);
      o.sway = 0.14 * t * t;
    },
    false,
  );

  // Petals, modelled closed (a bud); the vertex shader swings them open about the hinge.
  const PETALS = 6;
  const L = 0.54;
  const ALONG = 5;
  for (let p = 0; p < PETALS; p++) {
    const phi = (p / PETALS) * TAU;
    const rx = Math.cos(phi);
    const rz = Math.sin(phi);
    const tx = -rz;
    const tz = rx;
    const ax = Math.sin(phi);
    const az = -Math.cos(phi);
    const rows: number[][] = [];
    for (let i = 0; i <= ALONG; i++) {
      const s = i / ALONG;
      const width = 0.17 * Math.pow(Math.sin(Math.PI * Math.min(0.995, 0.1 + s * 0.9)), 0.8);
      const out = 0.03 + 0.12 * Math.sin(s * Math.PI * 0.88);
      const row: number[] = [];
      for (let w = -1; w <= 1; w++) {
        const cup = out - w * w * 0.04;
        c.copy(cBase).lerp(cMid, clamp(s * 1.6, 0, 1)).lerp(cTip, clamp(s * 2 - 1, 0, 1) * 0.8);
        const idx = b.vert(
          rx * cup + tx * w * width,
          H + s * L,
          rz * cup + tz * w * width,
          c,
          0.14,
          0.55 - 0.25 * s,
          (w + 1) / 2,
          s,
        );
        b.setPetal(idx, ax, 0, az, s);
        row.push(idx);
      }
      rows.push(row);
    }
    for (let i = 0; i < ALONG; i++) {
      for (let w = 0; w < 2; w++) {
        b.quad(rows[i][w], rows[i][w + 1], rows[i + 1][w + 1], rows[i + 1][w]);
      }
    }
  }

  // Glowing heart
  addLathe(
    b,
    [
      { r: 0.01, y: 0.2 },
      { r: 0.075, y: 0.15 },
      { r: 0.095, y: 0.07 },
      { r: 0.06, y: 0.0 },
    ],
    6,
    new Vector3(0, H, 0),
    (_k, _j, o) => {
      o.color.copy(cCore);
      o.glow = 1;
      o.sway = 0.14;
    },
  );
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Halo caps — tall stalks stacked with luminous tiers                  */
/* ------------------------------------------------------------------ */

export function buildHaloCap(rng: Rng): BufferGeometry {
  const b = new GeoBuilder();
  const stalkLo = new Color('#5a4a80');
  const stalkHi = new Color('#d8ccf0');
  const capTop = new Color('#35195f');
  const capEdge = new Color('#d254d8');
  const gill = new Color('#7ff4ff');
  const height = 3.0;
  const lean = (rng() - 0.5) * 0.5;

  const spine: Vector3[] = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    spine.push(new Vector3(Math.sin(t * 1.4) * lean, t * height - 0.2, Math.sin(t * 2.2) * lean * 0.5));
  }
  addTube(
    b,
    spine,
    5,
    (t) => lerp(0.13, 0.06, t),
    (t, _j, o) => {
      o.color.copy(stalkLo).lerp(stalkHi, t);
      o.sway = 0.1 * t * t;
    },
    false,
  );

  const tiers = [
    { at: 0.46, r: 0.95 },
    { at: 0.74, r: 0.66 },
    { at: 1.0, r: 0.42 },
  ];
  tiers.forEach((tier, ti) => {
    const idx = Math.round(tier.at * 7);
    const c = spine[idx];
    const r = tier.r * (0.9 + rng() * 0.2);
    const sway = 0.1 * tier.at * tier.at;
    const profile: ProfilePoint[] = [
      { r: 0.02, y: 0.2 * r + 0.03 },
      { r: 0.45 * r, y: 0.17 * r },
      { r: 0.85 * r, y: 0.06 * r },
      { r: r, y: -0.03 * r },
      { r: 0.94 * r, y: -0.1 * r },
      { r: 0.5 * r, y: -0.04 * r },
      { r: 0.08, y: -0.01 },
    ];
    addLathe(
      b,
      profile,
      10,
      c,
      (k, j, o) => {
        if (k <= 2) {
          o.color.copy(capTop).lerp(capEdge, k / 3);
          // Scattered luminous freckles
          o.glow = k === 1 && (j + ti) % 3 === 0 ? 0.55 : 0.04 * k;
          if (o.glow > 0.3) o.color.lerp(gill, 0.5);
        } else if (k <= 4) {
          o.color.copy(capEdge).lerp(gill, 0.35);
          o.glow = 1;
        } else {
          o.color.copy(gill);
          o.glow = 0.75;
        }
        o.sway = sway;
      },
      (k, phi, pt) => {
        if (k >= 2 && k <= 4) {
          pt.r *= 1 + 0.05 * Math.sin(phi * 5 + ti);
          pt.y += 0.02 * Math.sin(phi * 3 + ti * 2);
        }
      },
    );
  });
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Lantern pods — arching stalks hung with warm glowing bulbs           */
/* ------------------------------------------------------------------ */

export function buildLanternPod(): BufferGeometry {
  const b = new GeoBuilder();
  const stalkLo = new Color('#173a44');
  const stalkHi = new Color('#4fa0a0');
  const bulbTop = new Color('#ff8fd0');
  const bulbLow = new Color('#ffd27a');
  const husk = new Color('#5a2a70');

  const spine: Vector3[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = t * 2.25;
    spine.push(new Vector3(0.75 * (1 - Math.cos(ang)) * 0.62, Math.sin(ang) * 1.5 + t * 0.35 - 0.15, 0));
  }
  addTube(
    b,
    spine,
    4,
    (t) => lerp(0.07, 0.025, t),
    (t, _j, o) => {
      o.color.copy(stalkLo).lerp(stalkHi, t);
      o.sway = 0.12 * t * t;
    },
    false,
  );

  const tip = spine[N];
  const hang = new Vector3(tip.x, tip.y - 0.02, tip.z);
  addLathe(
    b,
    [
      { r: 0.02, y: 0.0 },
      { r: 0.1, y: -0.05 },
      { r: 0.2, y: -0.2 },
      { r: 0.26, y: -0.4 },
      { r: 0.2, y: -0.6 },
      { r: 0.02, y: -0.74 },
    ],
    7,
    hang,
    (k, _j, o) => {
      if (k <= 1) {
        o.color.copy(husk);
        o.glow = 0.05;
      } else {
        o.color.copy(bulbTop).lerp(bulbLow, (k - 2) / 3);
        o.glow = 0.85 + 0.15 * ((k - 2) / 3);
      }
      o.sway = 0.2 + 0.05 * k;
    },
  );
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Vein fans — rosettes of giant leaves traced with glowing veins       */
/* ------------------------------------------------------------------ */

export function buildVeinFan(rng: Rng): BufferGeometry {
  const b = new GeoBuilder();
  const LEAVES = 5;
  const ALONG = 9;
  const ACROSS = 4;
  const cBase = new Color('#0b4f43');
  const cMid = new Color('#17a27a');
  const cEdge = new Color('#7a40c4');
  const c = new Color();

  for (let l = 0; l < LEAVES; l++) {
    const phi = (l / LEAVES) * TAU + (rng() - 0.5) * 0.5;
    const rx = Math.cos(phi);
    const rz = Math.sin(phi);
    const tx = -rz;
    const tz = rx;
    const length = 2.6 + rng() * 1.3;
    const width = 0.75 + rng() * 0.35;
    const droop = 1.45 + rng() * 0.45;
    const startTilt = 0.22 + rng() * 0.2;

    const rows: number[][] = [];
    let cr = 0.12;
    let cy = -0.1;
    for (let i = 0; i <= ALONG; i++) {
      const s = i / ALONG;
      const tilt = startTilt + (droop - startTilt) * s * s;
      if (i > 0) {
        cr += Math.sin(tilt) * (length / ALONG);
        cy += Math.cos(tilt) * (length / ALONG);
      }
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(0.995, 0.06 + s * 0.94)), 0.65) * (1 - 0.25 * s);
      // normal of the blade in the radial plane, used to fold the edges upward
      const nr = -Math.cos(tilt);
      const ny = Math.sin(tilt);
      const row: number[] = [];
      for (let a = 0; a <= ACROSS; a++) {
        const u = (a / ACROSS) * 2 - 1;
        const fold = Math.abs(u) * w * 0.34 + Math.sin(s * 9 + l) * 0.03 * Math.abs(u);
        const r = cr + nr * fold;
        const y = cy + ny * fold;
        c.copy(cBase).lerp(cMid, clamp(s * 1.5, 0, 1)).lerp(cEdge, clamp(Math.abs(u) * 0.75 + s * 0.35 - 0.3, 0, 1));
        row.push(b.vert(rx * r + tx * u * w, y, rz * r + tz * u * w, c, 0.5 * s * s, 1, a / ACROSS, s));
      }
      rows.push(row);
    }
    for (let i = 0; i < ALONG; i++) {
      for (let a = 0; a < ACROSS; a++) {
        b.quad(rows[i][a], rows[i][a + 1], rows[i + 1][a + 1], rows[i + 1][a]);
      }
    }
  }
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Ground cover                                                         */
/* ------------------------------------------------------------------ */

/** A tuft of fine blades whose tips light up. */
export function buildSprout(rng: Rng): BufferGeometry {
  const b = new GeoBuilder();
  const lo = new Color('#0b3838');
  const hi = new Color('#66f6e2');
  const c = new Color();
  const BLADES = 4;
  for (let i = 0; i < BLADES; i++) {
    const phi = (i / BLADES) * TAU + rng() * 1.2;
    const h = 0.4 + rng() * 0.45;
    const lean = 0.2 + rng() * 0.45;
    const rx = Math.cos(phi);
    const rz = Math.sin(phi);
    const tx = -rz;
    const tz = rx;
    let pa = -1;
    let pb = -1;
    for (let s = 0; s <= 2; s++) {
      const t = s / 2;
      const r = 0.04 + lean * h * t * t;
      const y = h * t;
      const w = 0.03 * (1 - 0.8 * t);
      c.copy(lo).lerp(hi, t * t);
      const a = b.vert(rx * r - tx * w, y, rz * r - tz * w, c, 0.16 * t * t, t * t);
      const d = b.vert(rx * r + tx * w, y, rz * r + tz * w, c, 0.16 * t * t, t * t);
      if (s > 0) b.quad(pa, pb, d, a);
      pa = a;
      pb = d;
    }
  }
  return b.build();
}

/** Low luminous buttons — the living carpet of the valley floor. */
export function buildGlowCap(): BufferGeometry {
  const b = new GeoBuilder();
  const top = new Color('#b9a2ff');
  const edge = new Color('#5b3fc0');
  addLathe(
    b,
    [
      { r: 0.02, y: 0.42 },
      { r: 0.7, y: 0.3 },
      { r: 1.0, y: 0.0 },
    ],
    6,
    new Vector3(),
    (k, _j, o) => {
      o.color.copy(top).lerp(edge, k / 2);
      o.glow = 1 - k * 0.3;
    },
  );
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Sky skimmers — small gliding organisms                               */
/* ------------------------------------------------------------------ */

export function buildSkimmer(): BufferGeometry {
  const b = new GeoBuilder();
  const body = new Color('#2a3566');
  const wing = new Color('#6fd8e8');
  const edge = new Color('#ffb6ea');
  // Body runs along +Z (forward); aSway carries the distance along the wing.
  const nose = b.vert(0, 0, 0.7, body, 0, 0.2);
  const tail = b.vert(0, 0, -0.9, edge, 0, 1);
  const back = b.vert(0, 0.09, -0.05, body, 0, 0);
  const belly = b.vert(0, -0.06, -0.05, body, 0, 0);
  for (const side of [-1, 1]) {
    const midFront = b.vert(side * 0.55, 0.02, 0.2, wing, 0.5, 0.15);
    const midBack = b.vert(side * 0.5, 0.0, -0.35, wing, 0.5, 0.5);
    const tip = b.vert(side * 1.25, 0.0, -0.25, edge, 1, 1);
    b.tri(nose, midFront, back);
    b.tri(back, midFront, midBack);
    b.tri(back, midBack, tail);
    b.tri(midFront, tip, midBack);
    b.tri(nose, belly, midFront);
    b.tri(belly, midBack, midFront);
    b.tri(belly, tail, midBack);
  }
  return b.build();
}
