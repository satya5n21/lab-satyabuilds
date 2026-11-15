import { BackSide, Color, Group, Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3 } from 'three';
import type { EnvState } from '../../simulation/environment';
import { ATMOSPHERE_GLSL, NOISE_GLSL } from '../core/glsl';
import type { SharedUniforms } from '../core/uniforms';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uStarVis;
uniform vec3 uSunDisk;
uniform float uSunSize;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}

vec3 starLayer(vec3 d, float scale, float density, float size){
  vec3 p = d * scale;
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  vec3 rnd = hash33(ip);
  vec3 off = hash33(ip + 19.19) * 0.6 + 0.2;
  float dist = length(fp - off);
  float present = step(1.0 - density, rnd.x);
  float mag = pow(hash13(ip + 3.7), 5.0);
  float core = smoothstep(size, 0.0, dist);
  core *= core;
  float tw = 0.72 + 0.28 * sin(uTime * (1.2 + rnd.y * 2.6) + rnd.z * 40.0);
  vec3 tint = mix(vec3(0.66, 0.8, 1.0), vec3(1.0, 0.82, 0.7), rnd.y);
  return tint * core * present * (0.5 + 3.4 * mag) * tw;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 col = atmosphere(d);

  if (uStarVis > 0.004 && d.y > -0.04) {
    float fade = smoothstep(-0.02, 0.22, d.y) * uStarVis;
    vec3 stars = starLayer(d, 210.0, 0.034, 0.17) + starLayer(d, 85.0, 0.03, 0.13) * 1.7;
    // A river of faint dust and colour arcing over the valley
    vec3 bandN = vec3(0.5, -0.709, -0.497);
    float bd = dot(d, bandN);
    float band = exp(-bd * bd * 9.0);
    float n = fbm3(d * 3.4 + 11.0);
    float n2 = fbm3(d * 7.0 - 4.0);
    vec3 neb = mix(vec3(0.3, 0.12, 0.6), vec3(0.05, 0.42, 0.55), n2) * pow(n, 2.6) * band * 1.5;
    neb += vec3(0.5, 0.6, 1.0) * band * pow(vnoise3(d * 260.0), 10.0) * 0.5;
    col += (stars * (0.8 + band * 0.7) + neb) * fade;
  }

  // The sun: a broad, soft-limbed disk with a tight corona
  float cosA = clamp(dot(d, uSunDir), -1.0, 1.0);
  float ang = acos(cosA);
  float disk = smoothstep(uSunSize, uSunSize * 0.88, ang);
  float limb = 1.0 - 0.4 * pow(clamp(ang / uSunSize, 0.0, 1.0), 3.0);
  float corona = exp(-ang * 16.0) * 0.5 + exp(-ang * 55.0) * 1.1;
  float above = smoothstep(-0.035, 0.015, d.y);
  col += uSunDisk * (disk * limb * 7.0 + corona) * above;

  gl_FragColor = vec4(col, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCover;
uniform vec2 uCloudOffset;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}

float cloudNoise(vec2 uv){
  vec2 w = vec2(vnoise(uv * 0.7 + 13.1), vnoise(uv * 0.7 + 71.7)) - 0.5;
  return fbm2(uv + w * 0.9);
}

void main(){
  vec3 d = normalize(vDir);
  if (d.y < 0.012) discard;
  float inv = 1.0 / (d.y + 0.12);
  vec2 uv = d.xz * inv * 1.5 + uCloudOffset;

  float thr = 0.68 - 0.36 * uCover;
  float n = cloudNoise(uv);
  float dens = smoothstep(thr, thr + 0.2, n);
  float thick = smoothstep(thr + 0.08, thr + 0.36, n);

  // Fake volume: compare density with a sample a short step towards the sun
  vec2 toSun = normalize(uSunDir.xz + vec2(1e-4));
  float n2 = cloudNoise(uv + toSun * 0.3);
  float lit = clamp(0.55 + (n - n2) * 2.8, 0.0, 1.0);

  float sd = max(dot(d, uSunDir), 0.0);
  vec3 base = mix(uCloudShade, uCloudLit, lit);
  base = mix(base, uCloudShade, thick * 0.5);
  base += uSunGlow * uGlowAmt * (pow(sd, 6.0) * 0.3 + pow(sd, 40.0) * 0.9) * (1.0 - thick * 0.75);

  vec3 atm = atmosphere(d);
  float aerial = smoothstep(0.0, 0.42, d.y);
  vec3 col = mix(atm, base, 0.22 + 0.78 * aerial);
  float alpha = dens * smoothstep(0.012, 0.15, d.y) * 0.96;

  // High, wind-combed cirrus
  vec2 cu = vec2(uv.x * 0.24 + uv.y * 0.1, uv.y * 0.95) * 1.7 + uCloudOffset * 0.35 + 40.0;
  float cir = smoothstep(0.5, 0.86, fbm2(cu)) * 0.4 * smoothstep(0.05, 0.3, d.y) * (0.4 + uCover);
  vec3 cirCol = mix(atm, uCloudLit + uSunGlow * uGlowAmt * pow(sd, 5.0) * 0.5, 0.78);
  float total = alpha + cir * (1.0 - alpha);
  col = mix(cirCol, col, alpha / max(total, 1e-4));

  gl_FragColor = vec4(col, total);
}
`;

/** Sky dome (atmosphere, sun, stars) and a separate cloud dome drawn over the moons. */
export class Sky {
  readonly group = new Group();
  private readonly skyMaterial: ShaderMaterial;
  private readonly cloudMaterial: ShaderMaterial;

  constructor(shared: SharedUniforms) {
    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        ...shared,
        uSunDisk: { value: new Color(1, 1, 1) },
        uSunSize: { value: 0.043 },
      },
      vertexShader: DOME_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const dome = new Mesh(new SphereGeometry(2000, 40, 20), this.skyMaterial);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    dome.name = 'sky';

    this.cloudMaterial = new ShaderMaterial({
      uniforms: {
        ...shared,
        uCloudLit: { value: new Color() },
        uCloudShade: { value: new Color() },
        uCover: { value: 0.4 },
        uCloudOffset: { value: new Vector2() },
      },
      vertexShader: DOME_VERT,
      fragmentShader: CLOUD_FRAG,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const clouds = new Mesh(new SphereGeometry(1900, 40, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), this.cloudMaterial);
    clouds.renderOrder = -8;
    clouds.frustumCulled = false;
    clouds.name = 'clouds';

    this.group.add(dome, clouds);
  }

  update(env: EnvState, cameraPosition: Vector3, visualTime: number): void {
    this.group.position.copy(cameraPosition);
    this.skyMaterial.uniforms.uSunDisk.value.copy(env.sunDisk);
    const cu = this.cloudMaterial.uniforms;
    cu.uCloudLit.value.copy(env.cloudLit);
    cu.uCloudShade.value.copy(env.cloudShade);
    cu.uCover.value = env.cloudCover;
    // Clouds stream with planetary time (so the time-lapse shows weather moving)
    // and keep a slow real-time drift when the day is paused.
    cu.uCloudOffset.value.set(env.time * 0.15 + visualTime * 0.0035, env.time * 0.05 + visualTime * 0.0012);
  }
}
