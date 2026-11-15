import { Color, MathUtils, Vector3 } from 'three';
import { DAY_END, DAY_START } from './clock';

/**
 * The environmental model: one pure function from planetary time to every
 * value the world needs (sun position, sky colours, light, fog, glow …).
 * Milestones are keyframes; everything in between is interpolated, so the day
 * is one continuous simulation rather than a handful of scenes.
 */

export const SUNRISE = 5.45;
export const SUNSET = 18.5;

const { clamp, lerp, smoothstep, degToRad } = MathUtils;

interface KeyDef {
  t: number;
  zenith: string;
  horizon: string;
  glow: string;
  glowAmt: number;
  anti: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  cloudLit: string;
  cloudShade: string;
  cover: number;
  fog: number;
  mist: number;
  stars: number;
  bio: number;
  dusk: number;
}

// prettier-ignore
const KEY_DEFS: KeyDef[] = [
  { t: 5.0,   zenith: '#060925', horizon: '#2a2266', glow: '#ff6a5a', glowAmt: 0.55, anti: '#32266a', sun: '#ff8060', sunI: 0.0,  hemiSky: '#2c3c80', hemiGround: '#0b1626', hemiI: 0.36, cloudLit: '#54468c', cloudShade: '#101130', cover: 0.30, fog: 0.0040, mist: 0.85, stars: 1.0,  bio: 1.0,  dusk: 0 },
  { t: 5.6,   zenith: '#12184e', horizon: '#7a4a8c', glow: '#ff7a4a', glowAmt: 1.0,  anti: '#5a4a90', sun: '#ff8a5a', sunI: 0.4,  hemiSky: '#4a4f95', hemiGround: '#141a2c', hemiI: 0.45, cloudLit: '#c86a8a', cloudShade: '#221c48', cover: 0.33, fog: 0.0040, mist: 0.8,  stars: 0.6,  bio: 0.86, dusk: 0 },
  { t: 6.3,   zenith: '#2c3a90', horizon: '#f08a7a', glow: '#ffa040', glowAmt: 1.25, anti: '#b07aa8', sun: '#ffa868', sunI: 1.4,  hemiSky: '#8a7ac0', hemiGround: '#2a2238', hemiI: 0.65, cloudLit: '#ffb38a', cloudShade: '#5a4078', cover: 0.36, fog: 0.0037, mist: 0.6,  stars: 0.14, bio: 0.56, dusk: 0 },
  { t: 7.0,   zenith: '#3b63c8', horizon: '#ffc48a', glow: '#ffcf70', glowAmt: 1.1,  anti: '#e8a0b0', sun: '#ffc890', sunI: 2.3,  hemiSky: '#9db0e8', hemiGround: '#3a3038', hemiI: 0.82, cloudLit: '#ffe0b8', cloudShade: '#8a78a8', cover: 0.38, fog: 0.0033, mist: 0.35, stars: 0.0,  bio: 0.28, dusk: 0 },
  { t: 8.3,   zenith: '#2f7ee0', horizon: '#b4e0ee', glow: '#fff0c8', glowAmt: 0.55, anti: '#c8d8f0', sun: '#fff0d8', sunI: 3.1,  hemiSky: '#a8caff', hemiGround: '#3a4038', hemiI: 1.0,  cloudLit: '#ffffff', cloudShade: '#93a8c8', cover: 0.40, fog: 0.0027, mist: 0.1,  stars: 0.0,  bio: 0.06, dusk: 0 },
  { t: 12.0,  zenith: '#1a78e0', horizon: '#9ae4ec', glow: '#ffffff', glowAmt: 0.35, anti: '#b0e0f0', sun: '#fff8ea', sunI: 3.6,  hemiSky: '#a0d0ff', hemiGround: '#3a4a40', hemiI: 1.1,  cloudLit: '#ffffff', cloudShade: '#8fa8cc', cover: 0.42, fog: 0.0023, mist: 0.0,  stars: 0.0,  bio: 0.0,  dusk: 0 },
  { t: 15.6,  zenith: '#2674d8', horizon: '#bce0e6', glow: '#fff0d0', glowAmt: 0.5,  anti: '#c0d8f0', sun: '#fff0d0', sunI: 3.3,  hemiSky: '#a8c8f8', hemiGround: '#40443a', hemiI: 1.05, cloudLit: '#fff8ec', cloudShade: '#90a0c4', cover: 0.42, fog: 0.0025, mist: 0.0,  stars: 0.0,  bio: 0.0,  dusk: 0.1 },
  { t: 16.9,  zenith: '#4470c8', horizon: '#ffcf98', glow: '#ffb860', glowAmt: 1.0,  anti: '#e0a8c0', sun: '#ffc880', sunI: 2.7,  hemiSky: '#b8b0e0', hemiGround: '#443830', hemiI: 0.85, cloudLit: '#ffd8a8', cloudShade: '#8a6f9c', cover: 0.42, fog: 0.0028, mist: 0.1,  stars: 0.0,  bio: 0.03, dusk: 0.4 },
  { t: 17.5,  zenith: '#5560b4', horizon: '#ff9a58', glow: '#ff8a38', glowAmt: 1.45, anti: '#ff8fb0', sun: '#ff9c4c', sunI: 2.2,  hemiSky: '#c890a8', hemiGround: '#3c262a', hemiI: 0.72, cloudLit: '#ffac6c', cloudShade: '#7a4a7c', cover: 0.42, fog: 0.0031, mist: 0.2,  stars: 0.0,  bio: 0.1,  dusk: 0.75 },
  { t: 18.1,  zenith: '#3a3288', horizon: '#f0607c', glow: '#ff6a38', glowAmt: 1.5,  anti: '#b070c0', sun: '#ff7040', sunI: 1.0,  hemiSky: '#8a60a8', hemiGround: '#241a30', hemiI: 0.6,  cloudLit: '#ff7a70', cloudShade: '#4a2c68', cover: 0.38, fog: 0.0034, mist: 0.35, stars: 0.12, bio: 0.45, dusk: 1.0 },
  { t: 18.55, zenith: '#1a1858', horizon: '#8a3f92', glow: '#ff5a58', glowAmt: 1.0,  anti: '#5a48a0', sun: '#ff6048', sunI: 0.15, hemiSky: '#5048a0', hemiGround: '#141630', hemiI: 0.42, cloudLit: '#b05a90', cloudShade: '#221a4c', cover: 0.33, fog: 0.0036, mist: 0.5,  stars: 0.55, bio: 0.82, dusk: 1.0 },
  { t: 19.0,  zenith: '#07092c', horizon: '#33287c', glow: '#d0407c', glowAmt: 0.6,  anti: '#2e2a78', sun: '#ff6050', sunI: 0.0,  hemiSky: '#36428e', hemiGround: '#0c1830', hemiI: 0.36, cloudLit: '#5c4a9c', cloudShade: '#101236', cover: 0.28, fog: 0.0036, mist: 0.6,  stars: 1.0,  bio: 1.15, dusk: 1.0 },
];

type ColorField = 'zenith' | 'horizon' | 'glow' | 'anti' | 'sun' | 'hemiSky' | 'hemiGround' | 'cloudLit' | 'cloudShade';
type ScalarField = 'glowAmt' | 'sunI' | 'hemiI' | 'cover' | 'fog' | 'mist' | 'stars' | 'bio' | 'dusk';

const COLOR_FIELDS: ColorField[] = ['zenith', 'horizon', 'glow', 'anti', 'sun', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudShade'];
const SCALAR_FIELDS: ScalarField[] = ['glowAmt', 'sunI', 'hemiI', 'cover', 'fog', 'mist', 'stars', 'bio', 'dusk'];

type Key = { t: number } & Record<ColorField, Color> & Record<ScalarField, number>;

const KEYS: Key[] = KEY_DEFS.map((d) => {
  const k = { t: d.t } as Key;
  for (const f of COLOR_FIELDS) k[f] = new Color(d[f]);
  for (const f of SCALAR_FIELDS) k[f] = d[f];
  return k;
});

export interface EnvState {
  time: number;
  /** Unit vector pointing from the ground towards the sun. */
  sunDir: Vector3;
  sunElevation: number;
  /** Direction of the directional light (never dips below the horizon). */
  lightDir: Vector3;
  sunColor: Color;
  sunIntensity: number;
  sunDisk: Color;
  zenith: Color;
  horizon: Color;
  ground: Color;
  glow: Color;
  glowAmt: number;
  antiGlow: Color;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  cloudLit: Color;
  cloudShade: Color;
  cloudCover: number;
  fogDensity: number;
  mist: number;
  starVis: number;
  /** Bioluminescence, 0 (dormant) … ~1.15 (radiant). */
  bio: number;
  /** Flower openness 0 … 1. */
  bloom: number;
  /** Evening foliage colour shift 0 … 1. */
  dusk: number;
  particles: number;
  wind: number;
  /** Daylight veil in front of the moons and the gas giant. */
  veil: number;
  moonLight: number;
  water: Color;
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  giantDir: Vector3;
  moonADir: Vector3;
  moonBDir: Vector3;
}

export function createEnvState(): EnvState {
  return {
    time: DAY_START,
    sunDir: new Vector3(0, 1, 0),
    sunElevation: 0,
    lightDir: new Vector3(0, 1, 0),
    sunColor: new Color(),
    sunIntensity: 0,
    sunDisk: new Color(),
    zenith: new Color(),
    horizon: new Color(),
    ground: new Color(),
    glow: new Color(),
    glowAmt: 0,
    antiGlow: new Color(),
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 0,
    cloudLit: new Color(),
    cloudShade: new Color(),
    cloudCover: 0,
    fogDensity: 0.003,
    mist: 0,
    starVis: 0,
    bio: 0,
    bloom: 0,
    dusk: 0,
    particles: 0,
    wind: 1,
    veil: 0,
    moonLight: 0,
    water: new Color(),
    exposure: 1,
    bloomStrength: 0.4,
    bloomThreshold: 0.9,
    giantDir: new Vector3(),
    moonADir: new Vector3(),
    moonBDir: new Vector3(),
  };
}

/** Sky direction from azimuth (0 = straight ahead, + = right) and elevation, in degrees. */
export function skyDirection(azDeg: number, elDeg: number, out: Vector3): Vector3 {
  const a = degToRad(azDeg);
  const e = degToRad(elDeg);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

const signedPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** The sun climbs steeply out of the eastern pass, arcs high overhead and falls into the western one. */
export function sunAngles(time: number): { az: number; el: number } {
  const x = (time - SUNRISE) / (SUNSET - SUNRISE);
  const el = 64 * signedPow(Math.sin(Math.PI * x), 1.5);
  const az = 35 * signedPow(Math.cos(Math.PI * clamp(x, -0.06, 1.06)), 0.55) - 1;
  return { az, el };
}

function findSegment(time: number): { a: Key; b: Key; f: number } {
  const t = clamp(time, DAY_START, DAY_END);
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  return { a, b, f: clamp((t - a.t) / (b.t - a.t), 0, 1) };
}

const WATER_NIGHT = new Color('#03101c');
const WATER_DAY = new Color('#0b3c4c');
const DISK_WHITE = new Color('#fff6e4');

export function computeEnvironment(time: number, out: EnvState): EnvState {
  const { a, b, f } = findSegment(time);
  out.time = time;

  out.zenith.lerpColors(a.zenith, b.zenith, f);
  out.horizon.lerpColors(a.horizon, b.horizon, f);
  out.glow.lerpColors(a.glow, b.glow, f);
  out.antiGlow.lerpColors(a.anti, b.anti, f);
  out.sunColor.lerpColors(a.sun, b.sun, f);
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, f);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, f);
  out.cloudLit.lerpColors(a.cloudLit, b.cloudLit, f);
  out.cloudShade.lerpColors(a.cloudShade, b.cloudShade, f);
  out.ground.copy(out.horizon).multiplyScalar(0.45);

  out.glowAmt = lerp(a.glowAmt, b.glowAmt, f);
  out.hemiIntensity = lerp(a.hemiI, b.hemiI, f);
  out.cloudCover = lerp(a.cover, b.cover, f);
  out.fogDensity = lerp(a.fog, b.fog, f) * 0.72;
  out.mist = lerp(a.mist, b.mist, f) * 0.5;
  out.starVis = lerp(a.stars, b.stars, f);
  out.bio = lerp(a.bio, b.bio, f);
  out.dusk = lerp(a.dusk, b.dusk, f);

  // Sun
  const { az, el } = sunAngles(time);
  skyDirection(az, el, out.sunDir);
  out.sunElevation = el;
  skyDirection(az, Math.max(el, 2.5), out.lightDir);
  const above = smoothstep(Math.sin(degToRad(el)), -0.02, 0.1);
  out.sunIntensity = lerp(a.sunI, b.sunI, f) * above;
  const warmth = smoothstep(el, 4, 32);
  out.sunDisk.copy(out.sunColor).lerp(DISK_WHITE, warmth * 0.75);

  // Living things
  out.bloom = smoothstep(time, 5.9, 8.0) * (1 - 0.9 * smoothstep(time, 17.7, 18.9));
  const bioN = clamp(out.bio, 0, 1);
  out.particles = 0.1 + 0.9 * bioN;
  out.wind = 0.55 + 0.45 * smoothstep(out.sunIntensity, 0.4, 3.0);

  // Sky bodies
  out.veil = smoothstep(out.sunIntensity, 0.0, 2.6);
  out.moonLight = 0.04 + 0.34 * out.starVis;
  skyDirection(-10, 21, out.giantDir);
  const dayT = (clamp(time, DAY_START, DAY_END) - DAY_START) / (DAY_END - DAY_START);
  skyDirection(lerp(25, 20, dayT), lerp(15, 24, dayT), out.moonADir);
  skyDirection(lerp(9, 14, dayT), lerp(27, 24.5, dayT), out.moonBDir);

  // Look
  out.water.lerpColors(WATER_NIGHT, WATER_DAY, clamp(out.sunIntensity / 3, 0, 1));
  out.exposure = lerp(1.0, 1.12, out.starVis);
  out.bloomStrength = lerp(0.2, 0.42, bioN);
  out.bloomThreshold = lerp(1.0, 0.92, bioN);
  return out;
}

/* ---------------------------------------------------------------- */
/* Read-outs for the interface                                        */
/* ---------------------------------------------------------------- */

export interface Phase {
  index: number;
  numeral: string;
  name: string;
  start: number;
}

export const PHASES: Phase[] = [
  { index: 0, numeral: 'I', name: 'First Light', start: 5 },
  { index: 1, numeral: 'II', name: 'Sunrise', start: 6.25 },
  { index: 2, numeral: 'III', name: 'Alien Noon', start: 9.5 },
  { index: 3, numeral: 'IV', name: 'Golden Hour', start: 16.25 },
  { index: 4, numeral: 'V', name: 'The Afterglow', start: 18.35 },
];

export function phaseAt(time: number): Phase {
  let phase = PHASES[0];
  for (const p of PHASES) if (time >= p.start) phase = p;
  return phase;
}

export interface Readout {
  atmosphere: string;
  light: number;
  bio: number;
  bioStatus: string;
}

function atmosphereLabel(time: number): string {
  if (time < 5.9) return 'Pre-dawn mist';
  if (time < 7.6) return 'Rose haze, clearing';
  if (time < 10) return 'Clear · thin cloud';
  if (time < 15.5) return 'Clear · drifting cumulus';
  if (time < 17) return 'Warm thermals';
  if (time < 18.2) return 'Amber haze';
  if (time < 18.7) return 'Twilight veil';
  return 'Still · night mist';
}

export function readoutAt(time: number): Readout {
  const { a, b, f } = findSegment(time);
  const { el } = sunAngles(time);
  const above = smoothstep(Math.sin(degToRad(el)), -0.02, 0.1);
  const sun = (lerp(a.sunI, b.sunI, f) * above) / 3.6;
  const ambient = lerp(a.hemiI, b.hemiI, f) / 1.1;
  const light = clamp(0.92 * sun + 0.08 * ambient, 0, 1);
  const bio = clamp(lerp(a.bio, b.bio, f) / 1.15, 0, 1);
  const waking = time > 12;
  let bioStatus: string;
  if (bio > 0.82) bioStatus = 'Radiant';
  else if (bio > 0.45) bioStatus = waking ? 'Glowing' : 'Dimming';
  else if (bio > 0.04) bioStatus = waking ? 'Awakening' : 'Fading';
  else bioStatus = 'Dormant';
  return { atmosphere: atmosphereLabel(time), light, bio, bioStatus };
}
