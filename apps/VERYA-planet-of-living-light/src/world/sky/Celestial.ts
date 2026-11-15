import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { EnvState } from '../../simulation/environment';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../core/glsl';
import type { SharedUniforms } from '../core/uniforms';

const DISTANCE = 1200;
const UP = new Vector3(0, 1, 0);

const BODY_VERT = /* glsl */ `
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vWPos;
void main(){
  vObjN = normal;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GIANT_FRAG = /* glsl */ `
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vWPos;
uniform float uTime;
uniform float uVeil;
uniform float uStarVis;
uniform vec3 uLightDir;
uniform vec3 uCenter;
uniform vec3 uRingNormal;
uniform float uRadius;
uniform float uRingInner;
uniform float uRingOuter;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}

void main(){
  vec3 n = normalize(vObjN);
  vec3 N = normalize(vWorldN);
  vec3 dir = normalize(vWPos - cameraPosition);

  // Banded, storm-streaked cloud tops
  float lat = n.y;
  float spin = uTime * 0.004;
  vec3 q = vec3(n.x * cos(spin) - n.z * sin(spin), n.y, n.x * sin(spin) + n.z * cos(spin));
  float warp = fbm3(vec3(q.x * 2.2, q.y * 9.0, q.z * 2.2));
  float b = lat * 6.5 + (warp - 0.5) * 1.5;
  float bands = sin(b * 3.14159) * 0.5 + 0.5;
  float fine = fbm3(vec3(q.x * 5.0, q.y * 34.0, q.z * 5.0) + warp * 2.0);
  vec3 cream = vec3(0.92, 0.76, 0.6);
  vec3 violet = vec3(0.46, 0.24, 0.56);
  vec3 teal = vec3(0.14, 0.5, 0.58);
  vec3 rose = vec3(0.86, 0.42, 0.5);
  vec3 base = mix(cream, violet, smoothstep(0.3, 0.8, bands));
  base = mix(base, teal, smoothstep(0.5, 1.0, sin(lat * 4.6 + 1.2 + warp) * 0.5 + 0.5) * 0.6);
  base = mix(base, rose, smoothstep(0.62, 0.9, fine) * 0.35);
  base *= 0.78 + 0.44 * fine;
  // A great storm
  vec2 sp = vec2(atan(q.z, q.x) - 0.6, (lat + 0.32) * 3.2);
  float storm = smoothstep(0.34, 0.1, length(sp * vec2(1.0, 1.9)));
  base = mix(base, vec3(1.0, 0.86, 0.74), storm * 0.7);

  float ndl = dot(N, uLightDir);
  float lit = smoothstep(-0.1, 0.4, ndl) * (0.25 + 0.75 * max(ndl, 0.0));

  // Shadow of the rings across the cloud tops
  vec3 P = vWPos - uCenter;
  float denom = dot(uLightDir, uRingNormal);
  if (abs(denom) > 1e-3) {
    float t = -dot(P, uRingNormal) / denom;
    if (t > 0.0) {
      float r = length(P + uLightDir * t) / uRadius;
      float ringShadow = smoothstep(uRingInner, uRingInner + 0.06, r) * smoothstep(uRingOuter, uRingOuter - 0.06, r);
      lit *= 1.0 - 0.6 * ringShadow;
    }
  }

  float rim = pow(1.0 - max(dot(N, -dir), 0.0), 3.0);
  vec3 surf = base * lit * mix(0.82, 1.3, uVeil);
  surf += vec3(0.45, 0.7, 1.0) * rim * (0.1 + 0.5 * lit);
  surf += base * 0.045 * uStarVis + vec3(0.2, 0.3, 0.7) * rim * 0.12 * uStarVis;

  vec3 col = atmosphere(dir) + surf * mix(1.0, 0.5, uVeil);
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vLocal;
varying vec3 vWPos;
void main(){
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec3 vWPos;
uniform float uVeil;
uniform float uStarVis;
uniform vec3 uLightDir;
uniform vec3 uCenter;
uniform vec3 uRingNormal;
uniform float uRadius;
uniform float uRingInner;
uniform float uRingOuter;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}

void main(){
  float r = length(vLocal) / uRadius;
  float t = (r - uRingInner) / (uRingOuter - uRingInner);
  if (t < 0.0 || t > 1.0) discard;
  float lanes = 0.55 + 0.45 * sin(t * 44.0 + sin(t * 9.0) * 2.4);
  float grain = vnoise(vec2(t * 150.0, 0.5));
  float dens = (0.35 + 0.65 * lanes) * (0.75 + 0.25 * grain);
  dens *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.93, t);
  dens *= 1.0 - 0.85 * smoothstep(0.035, 0.0, abs(t - 0.44));
  dens *= 1.0 - 0.6 * smoothstep(0.02, 0.0, abs(t - 0.74));
  dens *= mix(0.55, 1.0, smoothstep(0.0, 0.3, t));

  vec3 tint = mix(vec3(0.82, 0.68, 0.9), vec3(0.56, 0.86, 0.92), vnoise(vec2(t * 13.0, 2.0)));

  // The planet's shadow falls across the far side of the rings
  vec3 P = vWPos - uCenter;
  float bq = dot(P, uLightDir);
  float disc = bq * bq - (dot(P, P) - uRadius * uRadius);
  float shadow = (bq < 0.0) ? smoothstep(uRadius * uRadius * 0.08, 0.0, disc) : 1.0;
  shadow = mix(0.06, 1.0, shadow);

  float facing = 0.45 + 0.55 * abs(dot(uRingNormal, uLightDir));
  vec3 dir = normalize(vWPos - cameraPosition);
  vec3 lit = tint * facing * shadow * mix(0.72, 1.2, uVeil) + tint * 0.03 * uStarVis;
  vec3 col = atmosphere(dir) + lit * mix(1.0, 0.5, uVeil);
  gl_FragColor = vec4(col, clamp(dens, 0.0, 1.0) * 0.92);
}
`;

const MOON_FRAG = /* glsl */ `
varying vec3 vObjN;
varying vec3 vWorldN;
varying vec3 vWPos;
uniform float uVeil;
uniform float uStarVis;
uniform vec3 uLightDir;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSeed;
uniform float uBright;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}

void main(){
  vec3 n = normalize(vObjN);
  vec3 N = normalize(vWorldN);
  vec3 dir = normalize(vWPos - cameraPosition);
  float m = fbm3(n * 2.6 + uSeed);
  float c = fbm3(n * 9.0 + uSeed * 2.0);
  vec3 base = mix(uColorA, uColorB, smoothstep(0.38, 0.62, m));
  base *= 0.72 + 0.5 * c;
  // Scattered bright ejecta
  base += vec3(0.25) * smoothstep(0.72, 0.8, vnoise3(n * 5.0 + uSeed * 3.0));
  float ndl = dot(N, uLightDir);
  float lit = smoothstep(-0.04, 0.22, ndl) * (0.3 + 0.7 * max(ndl, 0.0));
  vec3 surf = base * lit * uBright + base * 0.05 * uStarVis;
  vec3 col = atmosphere(dir) + surf * mix(1.0, 0.5, uVeil);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface Moon {
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
  bias: number;
}

const _dir = new Vector3();
const _light = new Vector3();
const _right = new Vector3();
const _upLocal = new Vector3();
const _q = new Quaternion();

/** The ringed gas giant and the two moons — lit by the real sun direction, so they show phases. */
export class Celestial {
  readonly group = new Group();
  private readonly giant: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly ring: Mesh<RingGeometry, ShaderMaterial>;
  private readonly giantGroup = new Group();
  private readonly moonA: Moon;
  private readonly moonB: Moon;
  private readonly ringNormal = new Vector3();
  private readonly giantUniforms;

  constructor(shared: SharedUniforms) {
    const radius = DISTANCE * Math.tan((5.7 * Math.PI) / 180);
    this.giantUniforms = {
      uLightDir: { value: new Vector3(0, 1, 0) },
      uCenter: { value: new Vector3() },
      uRingNormal: { value: this.ringNormal },
      uRadius: { value: radius },
      uRingInner: { value: 1.34 },
      uRingOuter: { value: 2.28 },
    };

    this.giant = new Mesh(
      new SphereGeometry(radius, 72, 48),
      new ShaderMaterial({
        uniforms: { ...shared, ...this.giantUniforms },
        vertexShader: BODY_VERT,
        fragmentShader: GIANT_FRAG,
        fog: false,
      }),
    );
    this.giant.renderOrder = -9;

    this.ring = new Mesh(
      new RingGeometry(radius * 1.34, radius * 2.28, 180, 1),
      new ShaderMaterial({
        uniforms: { ...shared, ...this.giantUniforms },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = -9;
    this.giantGroup.add(this.giant, this.ring);

    this.moonA = this.makeMoon(shared, 2.2, '#cdbfe6', '#6f6592', 3.1, 1.25, 1.0);
    this.moonB = this.makeMoon(shared, 1.05, '#bff0ea', '#3f8f9c', 9.4, 1.4, 1.2);

    this.group.add(this.giantGroup, this.moonA.mesh, this.moonB.mesh);
    this.group.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  private makeMoon(shared: SharedUniforms, angularRadius: number, a: string, b: string, seed: number, bright: number, bias: number): Moon {
    const radius = DISTANCE * Math.tan((angularRadius * Math.PI) / 180);
    const mesh = new Mesh(
      new SphereGeometry(radius, 40, 28),
      new ShaderMaterial({
        uniforms: {
          ...shared,
          uLightDir: { value: new Vector3(0, 1, 0) },
          uColorA: { value: new Color(a) },
          uColorB: { value: new Color(b) },
          uSeed: { value: seed },
          uBright: { value: bright },
        },
        vertexShader: BODY_VERT,
        fragmentShader: MOON_FRAG,
        fog: false,
      }),
    );
    mesh.renderOrder = -9;
    mesh.rotation.set(seed, seed * 1.7, 0);
    return { mesh, bias };
  }

  /**
   * Bodies sit at a fixed sky direction. Their light direction is the true sun
   * direction nudged toward the viewer, which keeps the phases readable while
   * still tracking the sun across the day.
   */
  private lightFor(bodyDir: Vector3, sunDir: Vector3, bias: number, out: Vector3): Vector3 {
    return out.copy(sunDir).addScaledVector(bodyDir, -bias).normalize();
  }

  update(env: EnvState, cameraPosition: Vector3): void {
    this.group.position.copy(cameraPosition);

    // Gas giant
    _dir.copy(env.giantDir);
    this.giantGroup.position.copy(_dir).multiplyScalar(DISTANCE);
    // Ring plane: tipped toward the viewer and rolled, so the rings read as an open ellipse.
    _right.crossVectors(_dir, UP).normalize();
    _upLocal.crossVectors(_right, _dir).normalize();
    this.ringNormal
      .copy(_upLocal)
      .multiplyScalar(Math.cos(0.36))
      .addScaledVector(_dir, -Math.sin(0.36))
      .applyAxisAngle(_dir, -0.33)
      .normalize();
    _q.setFromUnitVectors(UP, this.ringNormal);
    this.giantGroup.quaternion.copy(_q);
    this.giantUniforms.uCenter.value.copy(this.giantGroup.position).add(cameraPosition);
    this.lightFor(_dir, env.sunDir, 0.85, _light);
    this.giantUniforms.uLightDir.value.copy(_light);

    // Moons
    this.placeMoon(this.moonA, env.moonADir, env.sunDir);
    this.placeMoon(this.moonB, env.moonBDir, env.sunDir);
  }

  private placeMoon(moon: Moon, dir: Vector3, sunDir: Vector3): void {
    moon.mesh.position.copy(dir).multiplyScalar(DISTANCE);
    this.lightFor(dir, sunDir, moon.bias, _light);
    moon.mesh.material.uniforms.uLightDir.value.copy(_light);
  }
}
