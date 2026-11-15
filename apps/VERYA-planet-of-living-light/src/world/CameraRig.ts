import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WATER_LEVEL, type TerrainField } from './terrain/TerrainField';

const HOME_TARGET = new Vector3(0, 13, 0);
const HOME_POSITION = new Vector3(0, 8.4, 58);
const BASE_FOV = 52;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const _offset = new Vector3();
const _spherical = new Spherical();

/**
 * Orbit + zoom around the lake, a slow cinematic drift while the day plays,
 * a smooth "return home" move, and a guard that keeps the lens above ground.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private interacting = false;
  private idle = 10;
  private driftGain = 0;
  private driftPhase = 0;
  private cinematic = false;
  private tween: { from: Spherical; to: Spherical; t: number; duration: number } | null = null;

  constructor(dom: HTMLElement, private readonly field: TerrainField, aspect: number) {
    this.camera = new PerspectiveCamera(BASE_FOV, aspect, 0.3, 5000);
    this.camera.position.copy(HOME_POSITION);
    this.camera.layers.enable(1);
    this.setAspect(aspect);

    const c = (this.controls = new OrbitControls(this.camera, dom));
    c.target.copy(HOME_TARGET);
    c.enableDamping = true;
    c.dampingFactor = 0.06;
    c.enablePan = false;
    c.rotateSpeed = 0.42;
    c.zoomSpeed = 0.7;
    c.minDistance = 20;
    c.maxDistance = 118;
    c.minPolarAngle = MathUtils.degToRad(52);
    c.maxPolarAngle = MathUtils.degToRad(101);
    c.addEventListener('start', this.onStart);
    c.addEventListener('end', this.onEnd);
    c.update();
  }

  private onStart = (): void => {
    this.interacting = true;
    this.tween = null;
    this.controls.enabled = true;
  };

  private onEnd = (): void => {
    this.interacting = false;
    this.idle = 0;
  };

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // On tall screens widen the vertical field of view so the horizon keeps its breadth.
    let fov = BASE_FOV;
    if (aspect < 1.25) {
      const horizontal = MathUtils.degToRad(60);
      fov = MathUtils.clamp(MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontal / 2) / aspect)), BASE_FOV, 82);
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setCinematic(on: boolean): void {
    this.cinematic = on;
  }

  /** Glide back to the opening composition. */
  reset(): void {
    const from = new Spherical().setFromVector3(_offset.subVectors(this.camera.position, this.controls.target));
    const to = new Spherical().setFromVector3(_offset.subVectors(HOME_POSITION, HOME_TARGET));
    // take the short way round
    let dTheta = to.theta - from.theta;
    while (dTheta > Math.PI) dTheta -= Math.PI * 2;
    while (dTheta < -Math.PI) dTheta += Math.PI * 2;
    to.theta = from.theta + dTheta;
    const travel = Math.abs(dTheta) + Math.abs(to.phi - from.phi) + Math.abs(to.radius - from.radius) / 60;
    this.tween = { from, to, t: 0, duration: MathUtils.clamp(0.9 + travel * 0.7, 1.0, 2.6) };
    this.controls.enabled = false;
  }

  update(dt: number, playing: boolean): void {
    const { camera, controls } = this;

    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      const k = easeInOut(tw.t);
      _spherical.set(
        MathUtils.lerp(tw.from.radius, tw.to.radius, k),
        MathUtils.lerp(tw.from.phi, tw.to.phi, k),
        MathUtils.lerp(tw.from.theta, tw.to.theta, k),
      );
      camera.position.setFromSpherical(_spherical).add(controls.target);
      if (tw.t >= 1) {
        this.tween = null;
        controls.enabled = true;
        this.driftPhase = 0;
        this.idle = 0;
      }
    } else {
      // Subtle drift: a slow sway around the lake and a gentle rise and fall.
      this.idle += dt;
      const wantDrift = (playing || this.cinematic) && !this.interacting && this.idle > 1.6;
      this.driftGain += ((wantDrift ? 1 : 0) - this.driftGain) * (1 - Math.exp(-dt * 1.2));
      if (this.driftGain > 0.001) {
        const amp = MathUtils.degToRad(this.cinematic ? 15 : 6);
        const w = (Math.PI * 2) / (this.cinematic ? 110 : 80);
        const prev = this.driftPhase;
        this.driftPhase += dt * this.driftGain;
        const dAz = amp * (Math.sin(w * this.driftPhase) - Math.sin(w * prev));
        const dY = 1.1 * (Math.sin(w * 1.7 * this.driftPhase) - Math.sin(w * 1.7 * prev));
        _offset.subVectors(camera.position, controls.target);
        const cos = Math.cos(dAz);
        const sin = Math.sin(dAz);
        const x = _offset.x * cos - _offset.z * sin;
        const z = _offset.x * sin + _offset.z * cos;
        _offset.set(x, _offset.y + dY, z);
        camera.position.copy(controls.target).add(_offset);
      }
    }

    controls.update();

    // Never let the lens sink into the ground or the lake.
    const floor = Math.max(this.field.heightAt(camera.position.x, camera.position.z), WATER_LEVEL) + 1.7;
    if (camera.position.y < floor) {
      camera.position.y = floor;
      camera.lookAt(controls.target);
    }
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.onStart);
    this.controls.removeEventListener('end', this.onEnd);
    this.controls.dispose();
  }
}
