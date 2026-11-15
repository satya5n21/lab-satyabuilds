import { DoubleSide, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { patchLiving } from '../core/livingMaterial';
import { mulberry32 } from '../core/noise';
import type { SharedUniforms } from '../core/uniforms';
import { LAKE } from '../terrain/TerrainField';
import { buildSkimmer } from '../vegetation/species';

interface Skimmer {
  flock: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  bob: number;
  size: number;
}

const FLOCKS = [
  { x: LAKE.x + 4, z: LAKE.z - 4, rx: 30, rz: 22, h: 13 },
  { x: -36, z: 24, rx: 16, rz: 13, h: 17 },
  { x: 38, z: -22, rx: 20, rz: 15, h: 21 },
];

const _pos = new Vector3();
const _next = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _m = new Matrix4();
const WORLD_UP = new Vector3(0, 1, 0);

/** Small gliding organisms that wheel over the lake in loose flocks. */
export class Skimmers {
  readonly mesh: InstancedMesh;
  private readonly skimmers: Skimmer[] = [];

  constructor(shared: SharedUniforms, count = 34) {
    const rng = mulberry32(771);
    const geometry = buildSkimmer();
    const material = patchLiving(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: DoubleSide }),
      shared,
      { plant: true, flap: true, glowStrength: 1.6, translucency: 0.5, duskShift: 0 },
    );
    this.mesh = new InstancedMesh(geometry, material, count);
    const inst = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this.skimmers.push({
        flock: i % FLOCKS.length,
        radius: 0.45 + rng() * 0.55,
        height: (rng() - 0.5) * 7,
        speed: (0.1 + rng() * 0.07) * (rng() < 0.5 ? 1 : -1),
        phase: rng() * Math.PI * 2,
        bob: rng() * Math.PI * 2,
        size: 0.55 + rng() * 0.6,
      });
      inst[i * 4] = rng();
      inst[i * 4 + 1] = rng();
      inst[i * 4 + 2] = 1;
    }
    geometry.setAttribute('aInst', new InstancedBufferAttribute(inst, 4));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = 'skimmers';
    this.update(0);
  }

  private pathAt(s: Skimmer, t: number, out: Vector3): Vector3 {
    const f = FLOCKS[s.flock];
    const a = s.phase + t * s.speed;
    // A lazy, slightly wobbling ellipse
    const wob = 1 + 0.18 * Math.sin(a * 3 + s.bob);
    return out.set(
      f.x + Math.cos(a) * f.rx * s.radius * wob,
      f.h + s.height + Math.sin(t * 0.35 + s.bob) * 1.6 + Math.sin(a * 2 + s.bob) * 1.2,
      f.z + Math.sin(a) * f.rz * s.radius * wob,
    );
  }

  update(time: number): void {
    this.skimmers.forEach((s, i) => {
      this.pathAt(s, time, _pos);
      this.pathAt(s, time + 0.25, _next);
      _fwd.subVectors(_next, _pos).normalize();
      _right.crossVectors(WORLD_UP, _fwd).normalize();
      // Bank into the turn
      const bank = -Math.sign(s.speed) * 0.38;
      _right.applyAxisAngle(_fwd, bank);
      _up.crossVectors(_fwd, _right).normalize();
      _m.makeBasis(_right, _up, _fwd);
      _m.scale(_next.setScalar(s.size));
      _m.setPosition(_pos);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
