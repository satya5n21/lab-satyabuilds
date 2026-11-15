import {
  ACESFilmicToneMapping,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Material,
  Mesh,
  Object3D,
  PCFSoftShadowMap,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { SimulationClock } from '../simulation/clock';
import { computeEnvironment, createEnvState, type EnvState } from '../simulation/environment';
import { CameraRig } from './CameraRig';
import { PostFX } from './PostFX';
import { detectQuality, type Quality } from './core/quality';
import { createSharedUniforms, type SharedUniforms } from './core/uniforms';
import { Skimmers } from './life/Skimmers';
import { Spores } from './life/Spores';
import { Celestial } from './sky/Celestial';
import { ShootingStars } from './sky/ShootingStars';
import { Sky } from './sky/Sky';
import { Terrain } from './terrain/Terrain';
import { TerrainField } from './terrain/TerrainField';
import { Water } from './terrain/Water';
import { Vegetation } from './vegetation/Vegetation';

export interface WorldCallbacks {
  onReady?: () => void;
}

const SHADOW_CENTER = new Vector3(0, 0, 8);
const MOON_TINT = new Color('#8fa6ff');

/**
 * Owns the renderer and the frame loop, and wires the simulation clock to
 * every environmental system. Simulated time comes from the clock; wind,
 * twinkle and creatures run on a separate real-time clock so the world keeps
 * breathing while the day is paused.
 */
export class World {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly quality: Quality;
  private readonly shared: SharedUniforms;
  private readonly env: EnvState = createEnvState();
  private readonly rig: CameraRig;
  private readonly post: PostFX;
  private readonly sky: Sky;
  private readonly celestial: Celestial;
  private readonly shootingStars: ShootingStars;
  private readonly water: Water;
  private readonly spores: Spores;
  private readonly skimmers: Skimmers;
  private readonly sun: DirectionalLight;
  private readonly moon: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly resizeObserver: ResizeObserver;

  private displayTime: number;
  private visualTime = 0;
  private lastFrame = 0;
  private raf = 0;
  private disposed = false;
  private ready = false;
  private pixelRatio: number;
  private width = 1;
  private height = 1;
  private frameAccum = 0;
  private frameCount = 0;
  private slowFrames = 0;
  private headroom = 0;
  private warmup = 120;

  constructor(
    private readonly container: HTMLElement,
    private readonly clock: SimulationClock,
    private readonly callbacks: WorldCallbacks = {},
  ) {
    const quality = (this.quality = detectQuality());
    this.width = Math.max(1, container.clientWidth);
    this.height = Math.max(1, container.clientHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    this.displayTime = clock.now;

    const renderer = (this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(this.width, this.height);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.className = 'world__canvas';
    container.appendChild(renderer.domElement);

    this.scene.fog = new FogExp2(0x000000, 0.003);
    const shared = (this.shared = createSharedUniforms());

    // Terrain and water
    const field = new TerrainField();
    const terrain = new Terrain(field, shared, quality);
    this.water = new Water(shared, quality, this.width * this.pixelRatio, this.height * this.pixelRatio);
    this.scene.add(terrain.mesh, this.water.mesh);

    // Sky
    this.sky = new Sky(shared);
    this.celestial = new Celestial(shared);
    this.shootingStars = new ShootingStars();
    this.scene.add(this.sky.group, this.celestial.group, this.shootingStars.group);

    // Life
    const vegetation = new Vegetation(field, terrain, shared, quality);
    this.spores = new Spores(field, shared, quality);
    this.skimmers = new Skimmers(shared, quality.mobile ? 20 : 34);
    this.scene.add(vegetation.group, this.spores.points, this.skimmers.mesh);

    // Light
    this.sun = new DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const sc = this.sun.shadow.camera;
    sc.left = -125;
    sc.right = 125;
    sc.top = 125;
    sc.bottom = -125;
    sc.near = 20;
    sc.far = 760;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.12;
    this.sun.target.position.copy(SHADOW_CENTER);
    this.moon = new DirectionalLight(MOON_TINT, 0);
    this.hemi = new HemisphereLight(0xffffff, 0x000000, 1);
    this.scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi);

    this.rig = new CameraRig(renderer.domElement, field, this.width / this.height);
    this.post = new PostFX(renderer, this.scene, this.rig.camera, quality);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);

    this.raf = requestAnimationFrame(this.frame);
  }

  resetCamera(): void {
    this.rig.reset();
  }

  setCinematic(on: boolean): void {
    this.rig.setCinematic(on);
  }

  /** Diagnostics used while tuning. */
  get stats() {
    const info = this.renderer.info;
    return {
      triangles: info.render.triangles,
      calls: info.render.calls,
      pixelRatio: this.pixelRatio,
      displayTime: this.displayTime,
      quality: this.quality,
    };
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.applySize();
  }

  private applySize(): void {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.post.setSize(this.width, this.height, this.pixelRatio);
    this.water.setSize(this.width * this.pixelRatio, this.height * this.pixelRatio);
    this.rig.setAspect(this.width / this.height);
  }

  /** Step the render resolution down if the device cannot hold a smooth frame rate. */
  private adaptResolution(dt: number): void {
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    if (dt > 0.09 || document.hidden) return; // a stall, not a slow frame
    this.frameAccum += dt;
    if (dt > 1 / 33) this.slowFrames++;
    if (++this.frameCount < 100) return;
    const average = this.frameAccum / this.frameCount;
    const slowShare = this.slowFrames / this.frameCount;
    this.frameAccum = 0;
    this.frameCount = 0;
    this.slowFrames = 0;
    const ceiling = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    if (slowShare > 0.6 && this.pixelRatio > 0.7) {
      // Consistently below ~33 fps: trade resolution for smoothness.
      this.pixelRatio = Math.max(0.7, this.pixelRatio * 0.86);
      this.headroom = 0;
      this.applySize();
      this.warmup = 30;
    } else if (slowShare < 0.02 && average < 1 / 55 && this.pixelRatio < ceiling) {
      // Plenty of headroom for a while: restore sharpness.
      if (++this.headroom >= 5) {
        this.pixelRatio = Math.min(ceiling, this.pixelRatio * 1.12);
        this.headroom = 0;
        this.applySize();
        this.warmup = 30;
      }
    } else {
      this.headroom = 0;
    }
  }

  private applyEnvironment(env: EnvState): void {
    const u = this.shared;
    u.uSunDir.value.copy(env.sunDir);
    u.uZenith.value.copy(env.zenith);
    u.uHorizon.value.copy(env.horizon);
    u.uGround.value.copy(env.ground);
    u.uSunGlow.value.copy(env.glow);
    u.uGlowAmt.value = env.glowAmt;
    u.uAntiGlow.value.copy(env.antiGlow);
    u.uSunLight.value.copy(env.sunColor).multiplyScalar(env.sunIntensity / 3.6);
    u.uBio.value = env.bio;
    u.uOpen.value = env.bloom;
    u.uDusk.value = env.dusk;
    u.uWind.value = env.wind;
    u.uMist.value = env.mist;
    u.uStarVis.value = env.starVis;
    u.uVeil.value = env.veil;
    u.uFogDensity.value = env.fogDensity;

    const fog = this.scene.fog as FogExp2;
    fog.density = env.fogDensity;
    fog.color.copy(env.horizon);

    this.sun.color.copy(env.sunColor);
    this.sun.intensity = env.sunIntensity;
    this.sun.position.copy(SHADOW_CENTER).addScaledVector(env.lightDir, 380);
    // Skip the shadow pass at night without changing the light setup (no shader recompiles).
    this.renderer.shadowMap.autoUpdate = env.sunIntensity > 0.02;

    this.moon.intensity = env.moonLight;
    this.moon.position.copy(env.moonADir).multiplyScalar(300);

    this.hemi.color.copy(env.hemiSky);
    this.hemi.groundColor.copy(env.hemiGround);
    this.hemi.intensity = env.hemiIntensity;
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastFrame === 0 ? 1 / 60 : Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    // Simulation clock (planetary time) and visual clock (ambient motion) advance separately.
    this.clock.tick(dt);
    this.visualTime += dt;
    this.shared.uTime.value = this.visualTime;

    // Ease toward the clock so scrubbing and jumps glide instead of snapping.
    const target = this.clock.now;
    const gap = target - this.displayTime;
    this.displayTime = Math.abs(gap) < 1e-4 ? target : this.displayTime + gap * (1 - Math.exp(-dt * 9));

    const env = computeEnvironment(this.displayTime, this.env);
    this.applyEnvironment(env);

    this.rig.update(dt, this.clock.isPlaying);
    const camera = this.rig.camera;
    this.sky.update(env, camera.position, this.visualTime);
    this.celestial.update(env, camera.position);
    this.shootingStars.update(dt, env, camera);
    this.water.update(env);
    this.spores.update(env, this.pixelRatio);
    this.skimmers.update(this.visualTime);

    this.post.apply(env);
    this.post.render();

    if (!this.ready) {
      this.ready = true;
      this.callbacks.onReady?.();
    }
    this.adaptResolution(dt);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.post.dispose();
    this.water.mesh.dispose();
    this.sun.shadow.dispose();

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.scene.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => materials.add(m));
      else if (material) materials.add(material);
      const disposable = object as Object3D & { dispose?: () => void };
      if ((object as { isInstancedMesh?: boolean }).isInstancedMesh) disposable.dispose?.();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.scene.clear();

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
