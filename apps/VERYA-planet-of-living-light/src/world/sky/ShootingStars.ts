import { AdditiveBlending, DoubleSide, Group, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { EnvState } from '../../simulation/environment';

const DISTANCE = 1500;

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uProgress;
uniform float uStrength;
void main(){
  // uv.x runs tail (0) → head (1)
  float head = uProgress * 1.35;
  float along = vUv.x;
  float trail = smoothstep(head - 0.42, head, along) * step(along, head);
  float width = 1.0 - abs(vUv.y - 0.5) * 2.0;
  width = pow(max(width, 0.0), 2.5);
  float fade = sin(clamp(uProgress, 0.0, 1.0) * 3.14159);
  vec3 col = mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.97, 0.9), trail);
  gl_FragColor = vec4(col * trail * trail * width * fade * uStrength * 3.2, 1.0);
}
`;

interface Meteor {
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  life: number;
  duration: number;
}

const _dir = new Vector3();
const _travel = new Vector3();
const _side = new Vector3();
const _toCam = new Vector3();
const _basis = new Matrix4();
const WORLD_UP = new Vector3(0, 1, 0);

/** Occasional meteors streaking across the night sky, placed where the camera is looking. */
export class ShootingStars {
  readonly group = new Group();
  private readonly meteors: Meteor[] = [];
  private cooldown = 3;

  constructor() {
    const geometry = new PlaneGeometry(1, 1);
    for (let i = 0; i < 3; i++) {
      const mesh = new Mesh(
        geometry,
        new ShaderMaterial({
          uniforms: { uProgress: { value: 0 }, uStrength: { value: 1 } },
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side: DoubleSide,
          fog: false,
        }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = -9;
      mesh.matrixAutoUpdate = false;
      this.meteors.push({ mesh, life: 0, duration: 1 });
      this.group.add(mesh);
    }
  }

  private spawn(meteor: Meteor, camera: PerspectiveCamera): void {
    // Pick a point in the upper sky roughly in front of the camera
    camera.getWorldDirection(_dir);
    const heading = Math.atan2(_dir.x, -_dir.z) + (Math.random() - 0.5) * 1.3;
    const elevation = 0.38 + Math.random() * 0.5;
    _dir.set(Math.sin(heading) * Math.cos(elevation), Math.sin(elevation), -Math.cos(heading) * Math.cos(elevation));

    _side.crossVectors(_dir, WORLD_UP).normalize();
    const down = new Vector3().crossVectors(_side, _dir).negate();
    const slant = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8);
    _travel.copy(down).multiplyScalar(0.55).addScaledVector(_side, slant).normalize();

    const length = 260 + Math.random() * 240;
    const width = 5 + Math.random() * 4;
    _toCam.copy(_dir).negate();
    _side.crossVectors(_toCam, _travel).normalize();
    _basis.makeBasis(_travel, _side, _toCam);
    meteor.mesh.matrix.copy(_basis).scale(new Vector3(length, width, 1)).setPosition(_dir.multiplyScalar(DISTANCE));
    meteor.mesh.matrixWorldNeedsUpdate = true;
    meteor.mesh.material.uniforms.uProgress.value = 0;
    meteor.mesh.visible = true;
    meteor.life = 0;
    meteor.duration = 0.75 + Math.random() * 0.6;
  }

  update(dt: number, env: EnvState, camera: PerspectiveCamera): void {
    this.group.position.copy(camera.position);
    const night = env.starVis;
    this.cooldown -= dt;
    if (night > 0.55 && this.cooldown <= 0) {
      const free = this.meteors.find((m) => !m.mesh.visible);
      if (free) this.spawn(free, camera);
      this.cooldown = 3.5 + Math.random() * 6.5;
    }
    for (const m of this.meteors) {
      if (!m.mesh.visible) continue;
      m.life += dt;
      const p = m.life / m.duration;
      m.mesh.material.uniforms.uProgress.value = p;
      m.mesh.material.uniforms.uStrength.value = night;
      if (p >= 1) m.mesh.visible = false;
    }
  }
}
