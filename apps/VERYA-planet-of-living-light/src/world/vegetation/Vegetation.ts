import {
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { patchLiving, type LivingOptions } from '../core/livingMaterial';
import { Noise2D, mulberry32 } from '../core/noise';
import type { Quality } from '../core/quality';
import type { SharedUniforms } from '../core/uniforms';
import type { Terrain } from '../terrain/Terrain';
import type { TerrainField } from '../terrain/TerrainField';
import { instantiate, scatter, type Placement } from './scatter';
import {
  FLOWER_HINGE,
  buildBell,
  buildFlower,
  buildGlowCap,
  buildHaloCap,
  buildLanternPod,
  buildSprout,
  buildTree,
  buildVeinFan,
  type FlowerPalette,
} from './species';

/** Where the default camera stands — tall plants keep this view corridor open. */
const VIEWPOINT = { x: 0, z: 58 };

const FLOWER_PALETTES: (FlowerPalette & { pool: string })[] = [
  { base: '#ffe0f4', mid: '#ff6fb8', tip: '#c21c7c', core: '#fff0b0', pool: '#ff5aa8' },
  { base: '#ece0ff', mid: '#9b6cff', tip: '#5a2cd0', core: '#b8fff5', pool: '#8a5cff' },
  { base: '#e2ffff', mid: '#42e2f2', tip: '#1088c2', core: '#ffffff', pool: '#30d8f0' },
  { base: '#eafff4', mid: '#40eab8', tip: '#109070', core: '#ffd4f2', pool: '#30e0a8' },
];

function livingMaterial(shared: SharedUniforms, options: LivingOptions, roughness = 0.62): MeshStandardMaterial {
  return patchLiving(
    new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side: DoubleSide }),
    shared,
    { plant: true, ...options },
  );
}

/** Grows and plants the whole ecosystem as a handful of instanced meshes. */
export class Vegetation {
  readonly group = new Group();

  constructor(field: TerrainField, terrain: Terrain, shared: SharedUniforms, quality: Quality) {
    const rng = mulberry32(90417);
    const patches = new Noise2D(5521);
    const n = (count: number) => Math.round(count * quality.density);
    const cluster = (x: number, z: number, freq: number, ox: number, lo: number, hi: number) => {
      const v = patches.noise(x * freq + ox, z * freq - ox) * 0.5 + 0.5;
      return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    };
    const nearViewpoint = (x: number, z: number, radius: number) => {
      // distance to the segment from the camera toward the lake
      const t = Math.min(1, Math.max(0, (VIEWPOINT.z - z) / 30));
      const dz = z - (VIEWPOINT.z - 30 * t);
      const dx = x - VIEWPOINT.x;
      return dx * dx + dz * dz < radius * radius;
    };

    /* ---------------- Medusa trees ---------------- */
    const heroSpots: [number, number, number][] = [
      [-25, 41, 1.25],
      [23, 44, 1.1],
      [-47, 6, 1.35],
      [44, -6, 1.3],
      [34, 26, 0.95],
      [-12, -42, 1.2],
      [16, -40, 1.05],
      [-38, -30, 1.15],
    ];
    const treePlacements: Placement[] = [];
    for (const [x, z, scale] of heroSpots) {
      const y = field.heightAt(x, z);
      if (y > 0.5) treePlacements.push({ x, y, z, scale, rotation: rng() * 6.28, seed: rng() });
    }
    treePlacements.push(
      ...scatter(
        field,
        rng,
        {
          count: n(100),
          radiusMin: 16,
          radiusMax: 165,
          falloff: 0.62,
          minHeight: 0.7,
          maxHeight: 16,
          maxSlope: 0.5,
          minDistance: 7.5,
          scale: [0.75, 1.45],
          density: (x, z) => cluster(x, z, 0.018, 3.3, 0.38, 0.7),
          reject: (x, z) => nearViewpoint(x, z, 13),
        },
        treePlacements,
      ),
    );

    const trunkMaterial = livingMaterial(shared, { glowStrength: 1.4, translucency: 0, duskShift: 0.12 }, 0.72);
    const VARIANTS = 3;
    const models = Array.from({ length: VARIANTS }, () => buildTree(rng));
    const byVariant: Placement[][] = Array.from({ length: VARIANTS }, () => []);
    treePlacements.forEach((p, i) => byVariant[i % VARIANTS].push(p));

    const bellMatrices: Matrix4[] = [];
    const bellColors: Color[] = [];
    const bellSeeds: number[] = [];
    const tints = [new Color(1, 1, 1), new Color(1.1, 0.72, 0.98), new Color(0.72, 0.95, 1.2), new Color(1.0, 0.9, 0.7)];
    const m4 = new Matrix4();
    const q = new Quaternion();
    const qTilt = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const dir = new Vector3();
    const scl = new Vector3();

    models.forEach((model, v) => {
      const placements = byVariant[v];
      if (placements.length === 0) return;
      const trunks = instantiate(model.geometry, trunkMaterial, placements, {
        castShadow: true,
        tilt: 0.05,
        sink: 0.1,
        glow: (p) => 0.7 + p.seed * 0.6,
      });
      trunks.name = `tree-trunks-${v}`;
      this.group.add(trunks);

      const instanceMatrix = new Matrix4();
      placements.forEach((p, i) => {
        trunks.getMatrixAt(i, instanceMatrix);
        const tint = tints[Math.floor(p.seed * 9.99) % tints.length];
        for (const tip of model.tips) {
          pos.copy(tip.position).applyMatrix4(instanceMatrix);
          dir.copy(tip.direction).transformDirection(instanceMatrix);
          dir.lerp(up, 0.6).normalize();
          qTilt.setFromUnitVectors(up, dir);
          q.setFromAxisAngle(up, rng() * 6.28).premultiply(qTilt);
          const s = tip.size * p.scale * 1.95;
          scl.set(s, s * (0.9 + rng() * 0.3), s);
          pos.addScaledVector(dir, -0.12 * s);
          bellMatrices.push(m4.compose(pos, q, scl).clone());
          bellColors.push(tint.clone().multiplyScalar(0.88 + rng() * 0.24));
          bellSeeds.push(rng());
        }
      });

      for (const p of placements) terrain.addGlowPool(p.x, p.z, 9 * p.scale, new Color('#3a7cff'), 0.07);
    });

    const bellGeometry = buildBell(rng);
    const bellMaterial = livingMaterial(shared, { glowStrength: 1.25, translucency: 0.5, duskShift: 0.35 }, 0.42);
    const bells = new InstancedMesh(bellGeometry, bellMaterial, bellMatrices.length);
    const bellInst = new Float32Array(bellMatrices.length * 4);
    bellMatrices.forEach((matrix, i) => {
      bells.setMatrixAt(i, matrix);
      bells.setColorAt(i, bellColors[i]);
      bellInst[i * 4] = bellSeeds[i];
      bellInst[i * 4 + 1] = (bellSeeds[i] * 3.7) % 1;
      bellInst[i * 4 + 2] = 0.75 + bellSeeds[i] * 0.5;
    });
    bellGeometry.setAttribute('aInst', new InstancedBufferAttribute(bellInst, 4));
    bells.castShadow = true;
    bells.receiveShadow = true;
    bells.computeBoundingSphere();
    bells.name = 'tree-bells';
    this.group.add(bells);

    /* ---------------- Halo caps (near the groves) ---------------- */
    const haloPlacements: Placement[] = [];
    let guard = n(170) * 30;
    while (haloPlacements.length < n(170) && guard-- > 0 && treePlacements.length > 0) {
      const tree = treePlacements[Math.floor(rng() * treePlacements.length)];
      const a = rng() * 6.28;
      const r = 2.5 + rng() * 9;
      const x = tree.x + Math.cos(a) * r;
      const z = tree.z + Math.sin(a) * r;
      const y = field.heightAt(x, z);
      if (y < 0.45 || field.slopeAt(x, z) > 0.55 || nearViewpoint(x, z, 5)) continue;
      haloPlacements.push({ x, y, z, scale: 0.45 + rng() * rng() * 1.5, rotation: rng() * 6.28, seed: rng() });
    }
    const haloMaterial = livingMaterial(shared, { glowStrength: 1.7, translucency: 0.25, duskShift: 0.2 }, 0.5);
    const halo = instantiate(buildHaloCap(rng), haloMaterial, haloPlacements, {
      castShadow: true,
      tilt: 0.12,
      color: (p, c) => {
        if (p.seed > 0.66) c.setRGB(0.75, 1.0, 1.25);
        else if (p.seed > 0.33) c.setRGB(1.2, 0.85, 1.0);
        c.multiplyScalar(0.9 + ((p.seed * 13) % 1) * 0.25);
      },
      glow: (p) => 0.7 + p.seed * 0.6,
    });
    halo.name = 'halo-caps';
    this.group.add(halo);
    const haloPool = new Color('#4ad8ff');
    for (const p of haloPlacements) terrain.addGlowPool(p.x, p.z, 3.2 * p.scale + 1.2, haloPool, 0.16);

    /* ---------------- Lantern pods (along the water) ---------------- */
    const podPlacements = scatter(field, rng, {
      count: n(150),
      radiusMax: 110,
      falloff: 0.6,
      minHeight: 0.3,
      maxHeight: 2.6,
      maxSlope: 0.5,
      minDistance: 1.6,
      scale: [0.7, 1.7],
      density: (x, z) => 0.25 + 0.75 * cluster(x, z, 0.05, 11.7, 0.35, 0.7),
    });
    const podMaterial = livingMaterial(shared, { glowStrength: 1.8, translucency: 0.45, duskShift: 0.1 }, 0.45);
    const pods = instantiate(buildLanternPod(), podMaterial, podPlacements, {
      castShadow: true,
      tilt: 0.1,
      color: (p, c) => {
        if (p.seed > 0.7) c.setRGB(0.7, 1.0, 1.2);
        c.multiplyScalar(0.9 + ((p.seed * 17) % 1) * 0.25);
      },
      glow: (p) => 0.65 + p.seed * 0.7,
    });
    pods.name = 'lantern-pods';
    this.group.add(pods);
    const podPool = new Color('#ff8ab8');
    for (const p of podPlacements) terrain.addGlowPool(p.x, p.z, 2.6 * p.scale, podPool, 0.16);

    /* ---------------- Vein fans ---------------- */
    const fanPlacements = scatter(field, rng, {
      count: n(150),
      radiusMax: 125,
      falloff: 0.6,
      minHeight: 0.4,
      maxHeight: 9,
      maxSlope: 0.5,
      minDistance: 4.2,
      scale: [0.6, 1.5],
      density: (x, z) => cluster(x, z, 0.03, 27.1, 0.4, 0.68),
      reject: (x, z) => nearViewpoint(x, z, 4),
    });
    const fanMaterial = livingMaterial(shared, { veins: true, glowStrength: 1.6, translucency: 0.55, duskShift: 0.3 }, 0.5);
    const fans = instantiate(buildVeinFan(rng), fanMaterial, fanPlacements, {
      castShadow: true,
      tilt: 0.08,
      color: (p, c) => {
        if (p.seed > 0.75) c.setRGB(1.15, 0.8, 1.15);
        else if (p.seed < 0.25) c.setRGB(0.8, 1.05, 1.2);
        c.multiplyScalar(0.9 + ((p.seed * 11) % 1) * 0.2);
      },
      glow: (p) => 0.7 + p.seed * 0.6,
    });
    fans.name = 'vein-fans';
    this.group.add(fans);
    const fanPool = new Color('#28e0b0');
    for (const p of fanPlacements) terrain.addGlowPool(p.x, p.z, 3.4 * p.scale, fanPool, 0.1);

    /* ---------------- Lumen lilies ---------------- */
    FLOWER_PALETTES.forEach((palette, i) => {
      const meadow = scatter(field, rng, {
        count: n(120),
        radiusMax: 100,
        falloff: 0.6,
        minHeight: 0.3,
        maxHeight: 8,
        maxSlope: 0.6,
        scale: [0.7, 1.75],
        density: (x, z) => cluster(x, z, 0.045, 40 + i * 31.7, 0.5, 0.74),
      });
      // A scattering in the foreground so the default view always has flowers close by.
      const foreground = scatter(field, rng, {
        count: n(34),
        cx: VIEWPOINT.x,
        cz: VIEWPOINT.z - 12,
        radiusMax: 30,
        falloff: 0.7,
        minHeight: 0.3,
        scale: [0.7, 1.6],
        density: (x, z) => 0.15 + 0.85 * cluster(x, z, 0.09, 80 + i * 17.3, 0.45, 0.7),
        reject: (x, z) => (x - VIEWPOINT.x) ** 2 + (z - VIEWPOINT.z) ** 2 < 16,
      });
      const placements = [...meadow, ...foreground];
      const material = livingMaterial(
        shared,
        { petals: true, hingeY: FLOWER_HINGE, glowStrength: 1.6, translucency: 0.7, duskShift: 0.15 },
        0.4,
      );
      const flowers = instantiate(buildFlower(palette), material, placements, {
        layer: 1,
        tilt: 0.14,
        color: (p, c) => c.setScalar(0.88 + ((p.seed * 23) % 1) * 0.24),
        glow: (p) => 0.6 + p.seed * 0.8,
      });
      flowers.name = `lumen-lilies-${i}`;
      this.group.add(flowers);
      const pool = new Color(palette.pool);
      for (const p of placements) terrain.addGlowPool(p.x, p.z, 2.1 * p.scale, pool, 0.13);
    });

    /* ---------------- Ground cover ---------------- */
    const sproutPlacements = scatter(field, rng, {
      count: n(6200),
      radiusMax: 118,
      falloff: 0.62,
      minHeight: 0.22,
      maxHeight: 12,
      maxSlope: 0.7,
      scale: [0.6, 1.9],
      density: (x, z) => 0.2 + 0.8 * cluster(x, z, 0.035, 63.1, 0.3, 0.7),
    });
    const sproutMaterial = livingMaterial(shared, { glowStrength: 1.5, translucency: 0.5, duskShift: 0.3 }, 0.6);
    const sprouts = instantiate(buildSprout(rng), sproutMaterial, sproutPlacements, {
      layer: 1,
      tilt: 0.15,
      sink: 0.02,
      color: (p, c) => {
        if (p.seed > 0.72) c.setRGB(0.9, 0.62, 1.25);
        else if (p.seed > 0.6) c.setRGB(1.25, 0.6, 0.95);
        c.multiplyScalar(0.85 + ((p.seed * 29) % 1) * 0.3);
      },
      glow: (p) => 0.5 + p.seed * 0.9,
    });
    sprouts.name = 'glimmer-sprouts';
    this.group.add(sprouts);

    const capPlacements = scatter(field, rng, {
      count: n(2400),
      radiusMax: 110,
      falloff: 0.62,
      minHeight: 0.15,
      maxHeight: 10,
      maxSlope: 0.7,
      scale: [0.09, 0.3],
      density: (x, z) => cluster(x, z, 0.06, 91.3, 0.42, 0.7),
    });
    const capMaterial = livingMaterial(shared, { glowStrength: 1.8, translucency: 0.1, duskShift: 0.1 }, 0.5);
    const caps = instantiate(buildGlowCap(), capMaterial, capPlacements, {
      layer: 1,
      sink: 0.0,
      color: (p, c) => {
        if (p.seed > 0.6) c.setRGB(0.45, 1.25, 1.3);
        else if (p.seed < 0.2) c.setRGB(1.3, 0.6, 1.0);
      },
      glow: (p) => 0.5 + p.seed,
    });
    caps.name = 'glow-caps';
    this.group.add(caps);

    terrain.commitGlow();
  }
}
