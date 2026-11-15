import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  Compass,
  Sparkles,
  Sun,
} from 'lucide-react';

// ============================================================================
// 1. TYPES & SIMULATION CONSTANTS
// ============================================================================

export type PlaybackSpeed = 1 | 4 | 8 | 16;

export interface TimeMilestone {
  id: string;
  label: string;
  shortLabel: string;
  hour: number;
}

export interface EnvironmentState {
  timeHours: number; // Continuous range: 5.00 to 19.00
  formattedTime: string;
  phaseName: string;
  atmosphericCondition: string;
  lightLevelPct: number;
  bioluminescencePct: number;

  // Celestial & Lighting
  sunDirection: THREE.Vector3;
  sunElevationDeg: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  moonLightColor: THREE.Color;
  moonLightIntensity: number;
  hemiSkyColor: THREE.Color;
  hemiGroundColor: THREE.Color;
  hemiIntensity: number;

  // Sky & Atmosphere
  skyZenithColor: THREE.Color;
  skyMidColor: THREE.Color;
  skyHorizonColor: THREE.Color;
  skySunGlowColor: THREE.Color;
  sunDiscIntensity: number;
  sunHaloIntensity: number;
  cloudLitColor: THREE.Color;
  cloudShadowColor: THREE.Color;
  cloudRimColor: THREE.Color;
  cloudOpacity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  starVisibility: number;
  moonVisibility: number;

  // Ecosystem & Post-Processing
  flowerOpenness: number; // 0 = closed glowing buds, 1 = full bloom
  bioluminescence: number; // 0.04 = subtle daytime shimmer, 1.0 = radiant nocturnal glow
  particleVisibility: number;
  foliageDayWarmth: number;
  bloomStrength: number;
  exposure: number;
}

const START_HOUR = 5.0;
const END_HOUR = 19.0;
const TOTAL_DAY_HOURS = END_HOUR - START_HOUR; // 14 planetary hours

// At 1x speed, 1 planetary hour takes 7.5 seconds (~105 seconds for a full 05:00 -> 19:00 cycle)
const BASE_HOURS_PER_SECOND = 1 / 7.5;

const TIME_MILESTONES: TimeMilestone[] = [
  { id: 'first-light', label: 'First Light', shortLabel: '05:00', hour: 5.0 },
  { id: 'sunrise', label: 'Sunrise', shortLabel: '07:00', hour: 7.0 },
  { id: 'noon', label: 'Alien Noon', shortLabel: '12:00', hour: 12.0 },
  { id: 'golden-hour', label: 'Golden Hour', shortLabel: '17:30', hour: 17.5 },
  { id: 'afterglow', label: 'The Afterglow', shortLabel: '19:00', hour: 19.0 },
];

// ============================================================================
// 2. CONTINUOUS ENVIRONMENTAL INTERPOLATION ENGINE (05:00 -> 19:00)
// ============================================================================

interface EnvKeyframe {
  hour: number;
  phaseName: string;
  condition: string;
  sunElevDeg: number;
  sunAzimDeg: number;
  sunColor: string;
  sunIntensity: number;
  moonLightColor: string;
  moonLightIntensity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  skyZenith: string;
  skyMid: string;
  skyHorizon: string;
  skySunGlow: string;
  sunDiscIntensity: number;
  sunHaloIntensity: number;
  cloudLit: string;
  cloudShadow: string;
  cloudRim: string;
  cloudOpacity: number;
  fogColor: string;
  fogDensity: number;
  starVisibility: number;
  moonVisibility: number;
  flowerOpenness: number;
  bioluminescence: number;
  particleVisibility: number;
  foliageDayWarmth: number;
  bloomStrength: number;
  exposure: number;
}

// Keyframes carefully crafted for continuous, filmic transitions across the entire alien day
const ENV_KEYFRAMES: EnvKeyframe[] = [
  {
    // 05:00 — First Light (Pre-dawn indigo/violet, stars, radiant cyan-violet bioluminescence)
    hour: 5.0,
    phaseName: 'First Light',
    condition: 'Ionized Pre-Dawn Mist',
    sunElevDeg: -2.2,
    sunAzimDeg: 58,
    sunColor: '#ff7a6b',
    sunIntensity: 0.22,
    moonLightColor: '#7898ff',
    moonLightIntensity: 0.72,
    hemiSkyColor: '#373578',
    hemiGroundColor: '#121c2e',
    hemiIntensity: 0.62,
    skyZenith: '#07091c',
    skyMid: '#1a1847',
    skyHorizon: '#482963',
    skySunGlow: '#ff6e7f',
    sunDiscIntensity: 0.45,
    sunHaloIntensity: 0.65,
    cloudLit: '#6c4982',
    cloudShadow: '#161538',
    cloudRim: '#d97898',
    cloudOpacity: 0.72,
    fogColor: '#231c47',
    fogDensity: 0.0044,
    starVisibility: 0.92,
    moonVisibility: 1.0,
    flowerOpenness: 0.03,
    bioluminescence: 1.0,
    particleVisibility: 0.96,
    foliageDayWarmth: 0.0,
    bloomStrength: 0.88,
    exposure: 1.12,
  },
  {
    // 06:00 — Dawn Awakening (Horizon ignites with violet-magenta and coral)
    hour: 6.0,
    phaseName: 'Dawn Horizon',
    condition: 'Prismatic Twilight Scatter',
    sunElevDeg: 3.5,
    sunAzimDeg: 67,
    sunColor: '#ff8a5b',
    sunIntensity: 0.85,
    moonLightColor: '#7b95f5',
    moonLightIntensity: 0.46,
    hemiSkyColor: '#5d478f',
    hemiGroundColor: '#1d273b',
    hemiIntensity: 0.78,
    skyZenith: '#11163d',
    skyMid: '#3c2a6e',
    skyHorizon: '#b54f74',
    skySunGlow: '#ff9659',
    sunDiscIntensity: 0.9,
    sunHaloIntensity: 0.95,
    cloudLit: '#e37e88',
    cloudShadow: '#2b2254',
    cloudRim: '#ffc285',
    cloudOpacity: 0.76,
    fogColor: '#4c3266',
    fogDensity: 0.0041,
    starVisibility: 0.45,
    moonVisibility: 0.88,
    flowerOpenness: 0.18,
    bioluminescence: 0.78,
    particleVisibility: 0.74,
    foliageDayWarmth: 0.25,
    bloomStrength: 0.72,
    exposure: 1.1,
  },
  {
    // 07:00 — Sunrise (Sun crests the eastern spires, golden-pink sky, flowers unfurling)
    hour: 7.0,
    phaseName: 'Sunrise',
    condition: 'Golden-Rose Atmospheric Surge',
    sunElevDeg: 11.5,
    sunAzimDeg: 78,
    sunColor: '#ffb469',
    sunIntensity: 1.95,
    moonLightColor: '#8aa4eb',
    moonLightIntensity: 0.2,
    hemiSkyColor: '#8f72b8',
    hemiGroundColor: '#2c3647',
    hemiIntensity: 0.95,
    skyZenith: '#1d346e',
    skyMid: '#684e96',
    skyHorizon: '#f2956b',
    skySunGlow: '#ffd28a',
    sunDiscIntensity: 1.15,
    sunHaloIntensity: 1.0,
    cloudLit: '#ffd4a3',
    cloudShadow: '#524178',
    cloudRim: '#fff0c2',
    cloudOpacity: 0.74,
    fogColor: '#8a627d',
    fogDensity: 0.0036,
    starVisibility: 0.08,
    moonVisibility: 0.65,
    flowerOpenness: 0.48,
    bioluminescence: 0.44,
    particleVisibility: 0.48,
    foliageDayWarmth: 0.55,
    bloomStrength: 0.48,
    exposure: 1.06,
  },
  {
    // 09:30 — Morning Radiance (Crisp alien azure-cyan sky, full ecosystem awakening)
    hour: 9.5,
    phaseName: 'Morning Bloom',
    condition: 'Clear Xenon-Azure Breeze',
    sunElevDeg: 38.0,
    sunAzimDeg: 114,
    sunColor: '#fff0d6',
    sunIntensity: 2.85,
    moonLightColor: '#90b2e8',
    moonLightIntensity: 0.05,
    hemiSkyColor: '#78b8e6',
    hemiGroundColor: '#2c4a52',
    hemiIntensity: 1.15,
    skyZenith: '#164d8c',
    skyMid: '#3782bd',
    skyHorizon: '#9ad6e3',
    skySunGlow: '#fff4d4',
    sunDiscIntensity: 1.25,
    sunHaloIntensity: 0.72,
    cloudLit: '#ffffff',
    cloudShadow: '#6893bd',
    cloudRim: '#fff9e6',
    cloudOpacity: 0.68,
    fogColor: '#7ebad1',
    fogDensity: 0.0028,
    starVisibility: 0.0,
    moonVisibility: 0.42,
    flowerOpenness: 0.92,
    bioluminescence: 0.12,
    particleVisibility: 0.25,
    foliageDayWarmth: 0.85,
    bloomStrength: 0.3,
    exposure: 1.02,
  },
  {
    // 12:00 — Alien Noon (Bright sunlight, vivid turquoise/violet/emerald canopy, clear ringed planet)
    hour: 12.0,
    phaseName: 'Alien Noon',
    condition: 'High Solar Irradiance',
    sunElevDeg: 62.0,
    sunAzimDeg: 175,
    sunColor: '#fff9ed',
    sunIntensity: 3.35,
    moonLightColor: '#9ab8eb',
    moonLightIntensity: 0.0,
    hemiSkyColor: '#7ec8f2',
    hemiGroundColor: '#2e5259',
    hemiIntensity: 1.28,
    skyZenith: '#13579e',
    skyMid: '#2e8bc7',
    skyHorizon: '#94dce8',
    skySunGlow: '#fffbe8',
    sunDiscIntensity: 1.3,
    sunHaloIntensity: 0.65,
    cloudLit: '#ffffff',
    cloudShadow: '#6b9cc4',
    cloudRim: '#ffffff',
    cloudOpacity: 0.64,
    fogColor: '#82c5db',
    fogDensity: 0.0025,
    starVisibility: 0.0,
    moonVisibility: 0.35,
    flowerOpenness: 1.0,
    bioluminescence: 0.05,
    particleVisibility: 0.2,
    foliageDayWarmth: 1.0,
    bloomStrength: 0.26,
    exposure: 1.0,
  },
  {
    // 15:00 — Sunlit Afternoon (Rich cobalt-teal sky, vibrant flora)
    hour: 15.0,
    phaseName: 'High Afternoon',
    condition: 'Warm Ionospheric Drift',
    sunElevDeg: 41.0,
    sunAzimDeg: 242,
    sunColor: '#ffebd1',
    sunIntensity: 2.9,
    moonLightColor: '#90aee8',
    moonLightIntensity: 0.04,
    hemiSkyColor: '#7ab0e0',
    hemiGroundColor: '#2e4752',
    hemiIntensity: 1.15,
    skyZenith: '#174887',
    skyMid: '#3b7cb8',
    skyHorizon: '#a8d4de',
    skySunGlow: '#ffebc2',
    sunDiscIntensity: 1.22,
    sunHaloIntensity: 0.74,
    cloudLit: '#fff7eb',
    cloudShadow: '#6688b3',
    cloudRim: '#fff2d6',
    cloudOpacity: 0.68,
    fogColor: '#84b5cc',
    fogDensity: 0.0028,
    starVisibility: 0.0,
    moonVisibility: 0.44,
    flowerOpenness: 0.9,
    bioluminescence: 0.11,
    particleVisibility: 0.26,
    foliageDayWarmth: 0.88,
    bloomStrength: 0.3,
    exposure: 1.02,
  },
  {
    // 17:30 — Golden Hour (Molten amber/orange sunlight, pink-amber horizon, long dramatic shadows)
    hour: 17.5,
    phaseName: 'Golden Hour',
    condition: 'Amber Rayleigh Scattering',
    sunElevDeg: 11.0,
    sunAzimDeg: 282,
    sunColor: '#ff9642',
    sunIntensity: 2.15,
    moonLightColor: '#8498e8',
    moonLightIntensity: 0.22,
    hemiSkyColor: '#9e689c',
    hemiGroundColor: '#2e2b42',
    hemiIntensity: 0.92,
    skyZenith: '#1b265c',
    skyMid: '#6e3d7a',
    skyHorizon: '#f5824a',
    skySunGlow: '#ffbe6b',
    sunDiscIntensity: 1.15,
    sunHaloIntensity: 1.05,
    cloudLit: '#ffba75',
    cloudShadow: '#4a3166',
    cloudRim: '#ffe3a8',
    cloudOpacity: 0.78,
    fogColor: '#8f5266',
    fogDensity: 0.0036,
    starVisibility: 0.08,
    moonVisibility: 0.7,
    flowerOpenness: 0.46,
    bioluminescence: 0.36,
    particleVisibility: 0.52,
    foliageDayWarmth: 0.52,
    bloomStrength: 0.48,
    exposure: 1.07,
  },
  {
    // 18:20 — Sunset Dusk (Crimson-violet horizon as sun touches western peaks, bioluminescence igniting)
    hour: 18.33,
    phaseName: 'Crimson Dusk',
    condition: 'Twilight Ionization Wave',
    sunElevDeg: 1.2,
    sunAzimDeg: 294,
    sunColor: '#ff5e4d',
    sunIntensity: 0.75,
    moonLightColor: '#7894f5',
    moonLightIntensity: 0.52,
    hemiSkyColor: '#56397d',
    hemiGroundColor: '#192138',
    hemiIntensity: 0.74,
    skyZenith: '#0d1136',
    skyMid: '#382161',
    skyHorizon: '#a83b63',
    skySunGlow: '#ff7059',
    sunDiscIntensity: 0.78,
    sunHaloIntensity: 0.92,
    cloudLit: '#cf5d78',
    cloudShadow: '#231b4a',
    cloudRim: '#ffa382',
    cloudOpacity: 0.78,
    fogColor: '#422659',
    fogDensity: 0.0042,
    starVisibility: 0.55,
    moonVisibility: 0.9,
    flowerOpenness: 0.16,
    bioluminescence: 0.76,
    particleVisibility: 0.82,
    foliageDayWarmth: 0.18,
    bloomStrength: 0.76,
    exposure: 1.11,
  },
  {
    // 19:00 — The Afterglow (Deep midnight indigo/purple, stars, twin moons, radiant living light!)
    hour: 19.0,
    phaseName: 'The Afterglow',
    condition: 'Nocturnal Bioluminescent Bloom',
    sunElevDeg: -5.5,
    sunAzimDeg: 304,
    sunColor: '#ff5268',
    sunIntensity: 0.05,
    moonLightColor: '#7a9cff',
    moonLightIntensity: 0.85,
    hemiSkyColor: '#313075',
    hemiGroundColor: '#101b2e',
    hemiIntensity: 0.64,
    skyZenith: '#040614',
    skyMid: '#15123d',
    skyHorizon: '#372059',
    skySunGlow: '#8f3b76',
    sunDiscIntensity: 0.0,
    sunHaloIntensity: 0.32,
    cloudLit: '#4c3875',
    cloudShadow: '#100f2e',
    cloudRim: '#8b68b8',
    cloudOpacity: 0.7,
    fogColor: '#1a153d',
    fogDensity: 0.0045,
    starVisibility: 1.0,
    moonVisibility: 1.0,
    flowerOpenness: 0.02,
    bioluminescence: 1.0,
    particleVisibility: 1.0,
    foliageDayWarmth: 0.0,
    bloomStrength: 0.96,
    exposure: 1.16,
  },
];

function cosineSmooth(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(clamped * Math.PI);
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function lerpHexColor(hexA: string, hexB: string, t: number, target = new THREE.Color()): THREE.Color {
  _cA.set(hexA);
  _cB.set(hexB);
  return target.copy(_cA).lerp(_cB, t);
}

export function formatPlanetaryTime(hours: number): string {
  const clamped = Math.max(START_HOUR, Math.min(END_HOUR, hours));
  const h = Math.floor(clamped);
  const m = Math.floor((clamped - h) * 60 + 0.0001);
  const adjH = m >= 60 ? h + 1 : h;
  const adjM = m >= 60 ? 0 : m;
  return `${String(adjH).padStart(2, '0')}:${String(adjM).padStart(2, '0')}`;
}

export function computeEnvironmentState(rawHours: number): EnvironmentState {
  const timeHours = Math.max(START_HOUR, Math.min(END_HOUR, rawHours));

  // Locate surrounding keyframes
  let idx = 0;
  for (let i = 0; i < ENV_KEYFRAMES.length - 1; i++) {
    if (timeHours >= ENV_KEYFRAMES[i].hour && timeHours <= ENV_KEYFRAMES[i + 1].hour) {
      idx = i;
      break;
    }
  }

  const k0 = ENV_KEYFRAMES[idx];
  const k1 = ENV_KEYFRAMES[Math.min(idx + 1, ENV_KEYFRAMES.length - 1)];
  const span = Math.max(0.0001, k1.hour - k0.hour);
  const rawAlpha = (timeHours - k0.hour) / span;
  const alpha = cosineSmooth(rawAlpha);

  const sunElevationDeg = lerpNum(k0.sunElevDeg, k1.sunElevDeg, alpha);
  const sunAzimuthDeg = lerpNum(k0.sunAzimDeg, k1.sunAzimDeg, alpha);

  // Convert elevation & azimuth into 3D world direction vector
  // Azimuth: 90 deg = +X (East), 180 deg = +Z (South/front-lit), 270 deg = -X (West)
  const elevRad = THREE.MathUtils.degToRad(sunElevationDeg);
  const azimRad = THREE.MathUtils.degToRad(sunAzimuthDeg);
  const cosElev = Math.cos(elevRad);
  const sunDirection = new THREE.Vector3(
    Math.sin(azimRad) * cosElev,
    Math.sin(elevRad),
    -Math.cos(azimRad) * cosElev
  ).normalize();

  const sunIntensity = lerpNum(k0.sunIntensity, k1.sunIntensity, alpha);
  const bioluminescence = lerpNum(k0.bioluminescence, k1.bioluminescence, alpha);

  // Calculate normalized light level percentage (0..100%)
  const lightLevelPct = Math.round(
    Math.max(4, Math.min(100, (sunIntensity / 3.35) * 96 + 4))
  );
  const bioluminescencePct = Math.round(Math.max(0, Math.min(100, bioluminescence * 100)));

  const activeFrame = rawAlpha < 0.5 ? k0 : k1;

  return {
    timeHours,
    formattedTime: formatPlanetaryTime(timeHours),
    phaseName: activeFrame.phaseName,
    atmosphericCondition: activeFrame.condition,
    lightLevelPct,
    bioluminescencePct,

    sunDirection,
    sunElevationDeg,
    sunColor: lerpHexColor(k0.sunColor, k1.sunColor, alpha),
    sunIntensity,
    moonLightColor: lerpHexColor(k0.moonLightColor, k1.moonLightColor, alpha),
    moonLightIntensity: lerpNum(k0.moonLightIntensity, k1.moonLightIntensity, alpha),
    hemiSkyColor: lerpHexColor(k0.hemiSkyColor, k1.hemiSkyColor, alpha),
    hemiGroundColor: lerpHexColor(k0.hemiGroundColor, k1.hemiGroundColor, alpha),
    hemiIntensity: lerpNum(k0.hemiIntensity, k1.hemiIntensity, alpha),

    skyZenithColor: lerpHexColor(k0.skyZenith, k1.skyZenith, alpha),
    skyMidColor: lerpHexColor(k0.skyMid, k1.skyMid, alpha),
    skyHorizonColor: lerpHexColor(k0.skyHorizon, k1.skyHorizon, alpha),
    skySunGlowColor: lerpHexColor(k0.skySunGlow, k1.skySunGlow, alpha),
    sunDiscIntensity: lerpNum(k0.sunDiscIntensity, k1.sunDiscIntensity, alpha),
    sunHaloIntensity: lerpNum(k0.sunHaloIntensity, k1.sunHaloIntensity, alpha),
    cloudLitColor: lerpHexColor(k0.cloudLit, k1.cloudLit, alpha),
    cloudShadowColor: lerpHexColor(k0.cloudShadow, k1.cloudShadow, alpha),
    cloudRimColor: lerpHexColor(k0.cloudRim, k1.cloudRim, alpha),
    cloudOpacity: lerpNum(k0.cloudOpacity, k1.cloudOpacity, alpha),
    fogColor: lerpHexColor(k0.fogColor, k1.fogColor, alpha),
    fogDensity: lerpNum(k0.fogDensity, k1.fogDensity, alpha),
    starVisibility: lerpNum(k0.starVisibility, k1.starVisibility, alpha),
    moonVisibility: lerpNum(k0.moonVisibility, k1.moonVisibility, alpha),

    flowerOpenness: lerpNum(k0.flowerOpenness, k1.flowerOpenness, alpha),
    bioluminescence,
    particleVisibility: lerpNum(k0.particleVisibility, k1.particleVisibility, alpha),
    foliageDayWarmth: lerpNum(k0.foliageDayWarmth, k1.foliageDayWarmth, alpha),
    bloomStrength: lerpNum(k0.bloomStrength, k1.bloomStrength, alpha),
    exposure: lerpNum(k0.exposure, k1.exposure, alpha),
  };
}

// ============================================================================
// 3. DETERMINISTIC NOISE & TERRAIN HEIGHTFIELD UTILITIES
// ============================================================================

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number, octaves = 5): number {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * (valueNoise2D(x * frequency, y * frequency) * 2.0 - 1.0);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function ridgeNoise2D(x: number, y: number, octaves = 4): number {
  let value = 0.0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    let signal = 1.0 - Math.abs(valueNoise2D(x * frequency, y * frequency) * 2.0 - 1.0);
    signal *= signal * weight;
    weight = Math.max(0.0, Math.min(1.0, signal * 1.8));
    value += signal * amplitude;
    frequency *= 2.12;
    amplitude *= 0.5;
  }
  return value;
}

/**
 * Computes the exact height of Veyra's alien valley, lagoon basin, terraced meadows,
 * and encircling mountain spires at any world (x, z) coordinate.
 */
export function getVeyraTerrainHeight(x: number, z: number): number {
  // Winding river/lagoon centerline in the valley floor
  const riverCenterX =
    Math.sin(z * 0.048) * 11.0 + Math.cos(z * 0.021 - 0.6) * 6.5 - 2.0;
  const distToRiver = Math.abs(x - riverCenterX);

  // Widen the lagoon in the central vista (-26 < z < 28)
  const lagoonPoolFactor = Math.exp(-Math.pow((z - 2.0) / 26.0, 2.0));
  const riverHalfWidth = 5.5 + lagoonPoolFactor * 11.5;

  // Radial distance from valley center for surrounding mountain amphitheater
  const radialDist = Math.hypot(x * 0.92, (z + 12.0) * 0.88);
  const rimT = THREE.MathUtils.smoothstep(radialDist, 42.0, 158.0);

  // Subtle opening pass in the far north-northeast so the horizon and sunrise shine through
  const northPassAngle = Math.atan2(x - 14.0, -(z + 15.0));
  const passCarve = 1.0 - 0.42 * Math.exp(-Math.pow(northPassAngle / 0.42, 2.0));

  // Base undulating alien hills & terraced plateaus
  const broadHills = fbm2D(x * 0.014 + 3.1, z * 0.014 - 1.7, 4) * 5.2;
  const detailUndulation = fbm2D(x * 0.045, z * 0.045, 3) * 1.15;

  // Alien geological terracing on mid-altitude slopes
  const rawMeadow = Math.max(0, broadHills + 2.6) + detailUndulation;
  const terraceStep = 2.4;
  const terracedMeadow =
    rawMeadow -
    0.35 * Math.sin((rawMeadow / terraceStep) * Math.PI * 2.0) * (terraceStep / (Math.PI * 2.0));

  // Mountain spires around the outer valley rim
  const spires = ridgeNoise2D(x * 0.016 - 4.2, z * 0.016 + 2.8, 5);
  const mountainHeight = Math.pow(rimT, 1.55) * (24.0 + spires * 54.0) * passCarve;

  let h = terracedMeadow * (0.45 + 0.55 * rimT) + mountainHeight;

  // Carve the lagoon & stream basin smoothly below y = 0
  const basinMask = THREE.MathUtils.smoothstep(distToRiver, riverHalfWidth * 0.45, riverHalfWidth + 9.0);
  const basinDepth = -2.35 * (1.0 - basinMask) * (1.0 - THREE.MathUtils.smoothstep(radialDist, 55.0, 95.0));

  h = h * (0.22 + 0.78 * basinMask) + basinDepth;

  // Keep foreground camera terrace slightly elevated and organic
  const camPad = Math.exp(-Math.pow((x + 14) / 16, 2) - Math.pow((z - 46) / 14, 2));
  h += camPad * 1.4;

  return h;
}

// ============================================================================
// 4. CUSTOM GLSL SHADERS (SKY, CLOUDS, CELESTIAL BODIES, TERRAIN, WATER, FLORA)
// ============================================================================

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uZenithColor;
  uniform vec3 uMidColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunGlowColor;
  uniform float uSunDiscIntensity;
  uniform float uSunHaloIntensity;
  uniform vec3 uCloudLitColor;
  uniform vec3 uCloudShadowColor;
  uniform vec3 uCloudRimColor;
  uniform float uCloudOpacity;
  uniform float uStarVisibility;

  varying vec3 vWorldDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3D(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbmClouds(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 5; i++) {
      v += a * noise3D(p);
      p = p * 2.04 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = clamp(dir.y, 0.0, 1.0);

    // Multi-band Rayleigh atmospheric sky gradient
    float horizonBlend = pow(1.0 - up, 2.35);
    float midBlend = smoothstep(0.0, 0.52, up);
    vec3 skyCol = mix(uHorizonColor, uMidColor, midBlend);
    skyCol = mix(skyCol, uZenithColor, smoothstep(0.32, 0.96, up));

    // Below horizon reflection bounce
    if (dir.y < 0.0) {
      skyCol = mix(uHorizonColor, uMidColor * 0.5, clamp(-dir.y * 3.0, 0.0, 1.0));
    }

    // Mie forward scattering & alien sun aureole
    float sunCos = max(dot(dir, normalize(uSunDir)), 0.0);
    float wideScatter = pow(sunCos, 4.0) * 0.42 * uSunHaloIntensity;
    float tightAureole = pow(sunCos, 28.0) * 0.72 * uSunHaloIntensity;
    float innerCorona = pow(sunCos, 220.0) * 1.45 * uSunDiscIntensity;
    float solarDisc = smoothstep(0.99915, 0.99972, sunCos) * 4.5 * uSunDiscIntensity;

    // Fade sun glow slightly below horizon
    float sunAboveHorizon = smoothstep(-0.08, 0.04, uSunDir.y);
    skyCol += uSunGlowColor * (wideScatter + tightAureole) * (0.45 + 0.55 * sunAboveHorizon);
    skyCol += mix(uSunGlowColor, vec3(1.0, 0.98, 0.92), 0.7) * (innerCorona + solarDisc) * sunAboveHorizon;

    // Procedural Twinkling Starfield & Faint Galactic Nebula
    if (uStarVisibility > 0.01 && dir.y > -0.02) {
      vec3 starGrid = dir * 260.0;
      vec3 cell = floor(starGrid);
      vec3 local = fract(starGrid) - 0.5;
      float rnd = hash(cell);
      if (rnd > 0.986) {
        float dist = length(local);
        float starSize = mix(0.04, 0.14, fract(rnd * 91.7));
        float core = smoothstep(starSize, 0.0, dist);
        float twinkle = 0.65 + 0.35 * sin(uTime * (2.2 + fract(rnd * 37.0) * 4.0) + rnd * 62.8);
        vec3 starTint = mix(vec3(0.72, 0.86, 1.0), vec3(1.0, 0.84, 0.96), fract(rnd * 19.3));
        float horizonFade = smoothstep(0.0, 0.25, dir.y);
        skyCol += starTint * core * twinkle * uStarVisibility * horizonFade * 1.45;
      }

      // Subtle violet-cyan alien nebula ribbon across the upper dome
      float bandCoord = dot(dir, normalize(vec3(0.45, 0.72, -0.52)));
      float bandMask = exp(-pow((bandCoord - 0.18) * 4.2, 2.0)) * smoothstep(0.05, 0.45, dir.y);
      float nebNoise = fbmClouds(dir * 3.8 + vec3(1.4, -0.8, 2.1));
      vec3 nebCol = mix(vec3(0.18, 0.12, 0.42), vec3(0.10, 0.36, 0.48), nebNoise);
      skyCol += nebCol * bandMask * nebNoise * uStarVisibility * 0.42;
    }

    // Procedural Volumetric-Look Alien Cloud Layer
    if (dir.y > 0.015) {
      // Project onto a curved atmospheric cloud shell
      vec2 cloudUV = dir.xz / (dir.y + 0.16);
      vec3 p = vec3(cloudUV * 0.72 + vec2(uTime * 0.0085, uTime * 0.0042), uTime * 0.003);

      float baseNoise = fbmClouds(p);
      float detailNoise = fbmClouds(p * 2.6 - vec3(uTime * 0.012, 0.0, 0.0));
      float cloudDensity = smoothstep(0.47, 0.78, baseNoise * 0.78 + detailNoise * 0.26);

      // Cloud self-shadowing & sun rim scattering
      float sunStep = fbmClouds(p + normalize(uSunDir).xzy * 0.16);
      float selfShadow = smoothstep(0.35, 0.78, sunStep);
      float forwardMie = pow(sunCos, 6.0) * 0.75;

      vec3 cloudCol = mix(uCloudLitColor, uCloudShadowColor, selfShadow * 0.78);
      cloudCol += uCloudRimColor * (1.0 - cloudDensity * 0.65) * (0.28 + forwardMie);

      float horizonDamp = smoothstep(0.015, 0.18, dir.y);
      float alpha = cloudDensity * uCloudOpacity * horizonDamp;
      skyCol = mix(skyCol, cloudCol, clamp(alpha, 0.0, 0.92));
    }

    // Subtle atmospheric horizon band softening
    skyCol = mix(skyCol, uHorizonColor, pow(1.0 - up, 11.0) * 0.35);

    gl_FragColor = vec4(skyCol, 1.0);
  }
`;

// Gas Giant & Ring Shaders
const GAS_GIANT_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GAS_GIANT_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSkyBlendColor;
  uniform float uAtmosphereBlend;
  uniform float uPlanetRadius;
  uniform vec3 uPlanetCenter;

  varying vec3 vNormalWorld;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.05;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 n = normalize(vNormalWorld);
    vec3 pNorm = normalize(vLocalPos);

    // Turbulent zonal atmospheric bands
    float lat = pNorm.y;
    float lon = atan(pNorm.z, pNorm.x);
    float swirl = fbm(vec2(lon * 2.2 + uTime * 0.006, lat * 6.5));
    float fineBand = fbm(vec2(lon * 4.5 - uTime * 0.009, lat * 16.0 + swirl * 1.4));

    float bandCoord = lat * 9.0 + swirl * 1.65 + fineBand * 0.45;
    float b1 = 0.5 + 0.5 * sin(bandCoord * 3.14159);
    float b2 = 0.5 + 0.5 * cos(bandCoord * 1.7 + 0.8);

    vec3 colDeepIndigo = vec3(0.20, 0.18, 0.44);
    vec3 colAmethyst = vec3(0.48, 0.34, 0.66);
    vec3 colChampagne = vec3(0.86, 0.74, 0.66);
    vec3 colTealBand = vec3(0.28, 0.54, 0.68);

    vec3 surfaceCol = mix(colDeepIndigo, colAmethyst, b1);
    surfaceCol = mix(surfaceCol, colChampagne, smoothstep(0.35, 0.85, b2) * 0.72);
    surfaceCol = mix(surfaceCol, colTealBand, smoothstep(0.55, 0.9, fineBand) * 0.42);

    // Day/night solar terminator + subtle planetshine on dark crescent
    float ndotl = dot(n, normalize(uSunDir));
    float dayMask = smoothstep(-0.14, 0.34, ndotl);
    float twilightRim = exp(-pow((ndotl + 0.02) * 6.0, 2.0)) * 0.25;

    // Fresnel atmospheric limb glow
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.4);
    vec3 limbCol = mix(vec3(0.45, 0.68, 1.0), vec3(0.85, 0.55, 0.95), 0.45);

    vec3 litCol = surfaceCol * (0.09 + 1.05 * dayMask);
    litCol += vec3(0.55, 0.32, 0.58) * twilightRim;
    litCol += limbCol * fresnel * (0.25 + 0.65 * dayMask);

    // Blend seamlessly into Veyra's atmospheric scatter
    vec3 finalCol = mix(litCol, uSkyBlendColor, uAtmosphereBlend);
    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

const PLANET_RING_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PLANET_RING_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform vec3 uSkyBlendColor;
  uniform float uAtmosphereBlend;
  uniform float uInnerRadius;
  uniform float uOuterRadius;

  varying vec3 vLocalPos;
  varying vec3 vWorldPos;

  void main() {
    float r = length(vLocalPos.xy);
    float t = clamp((r - uInnerRadius) / (uOuterRadius - uInnerRadius), 0.0, 1.0);

    // Concentric ringlets & Cassini-style divisions
    float ringWave1 = 0.5 + 0.5 * sin(t * 78.0);
    float ringWave2 = 0.5 + 0.5 * sin(t * 210.0 + 1.3);
    float cassiniGap = 1.0 - 0.85 * exp(-pow((t - 0.62) / 0.032, 2.0));
    float innerGap = 1.0 - 0.65 * exp(-pow((t - 0.24) / 0.025, 2.0));
    float edgeFade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t));

    float density = (0.38 + 0.35 * ringWave1 + 0.22 * ringWave2) * cassiniGap * innerGap * edgeFade;
    if (density < 0.02) discard;

    // Analytical ray-sphere shadow cast by the gas giant onto its rings
    vec3 relPos = vWorldPos - uPlanetCenter;
    vec3 sDir = normalize(uSunDir);
    float proj = dot(relPos, sDir);
    float shadow = 1.0;
    if (proj < 0.0) {
      float perpDist = length(relPos - sDir * proj);
      shadow = smoothstep(uPlanetRadius * 0.94, uPlanetRadius * 1.06, perpDist);
    }

    vec3 innerTint = vec3(0.68, 0.62, 0.88);
    vec3 outerTint = vec3(0.92, 0.82, 0.78);
    vec3 ringCol = mix(innerTint, outerTint, t) * (0.14 + 0.92 * shadow);
    ringCol = mix(ringCol, uSkyBlendColor, uAtmosphereBlend * 0.85);

    gl_FragColor = vec4(ringCol, clamp(density * 0.78, 0.0, 0.86));
  }
`;

// Procedural Moon Shader (crater relief + sun-synced phase + sky scatter)
const MOON_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormalWorld;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const MOON_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uGlowAccent;
  uniform vec3 uSkyBlendColor;
  uniform float uVisibility;
  uniform float uSeed;

  varying vec3 vNormalWorld;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + uSeed);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 n = normalize(vNormalWorld);
    vec3 p = normalize(vLocalPos);

    float maria = noise3(p * 3.4);
    float craters = noise3(p * 11.5);
    float micro = noise3(p * 26.0);
    float relief = maria * 0.55 + craters * 0.32 + micro * 0.13;

    vec3 baseCol = mix(uColorA, uColorB, smoothstep(0.28, 0.75, relief));
    // Subtle crystalline mineral fissures
    float fissure = smoothstep(0.76, 0.88, craters) * (1.0 - smoothstep(0.88, 0.95, craters));
    baseCol += uGlowAccent * fissure * 0.35;

    float ndotl = dot(n, normalize(uSunDir));
    float phase = smoothstep(-0.16, 0.32, ndotl);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

    vec3 lit = baseCol * (0.12 + 1.12 * phase) + uGlowAccent * rim * 0.25 * (0.3 + 0.7 * phase);
    // Daytime atmospheric scattering blends dark side into sky color
    vec3 finalCol = mix(uSkyBlendColor, lit, clamp(uVisibility * (0.45 + 0.55 * phase), 0.18, 1.0));

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

// Custom Alien Lagoon Water Shader
const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float w1 = sin(wp.x * 0.38 + uTime * 1.15) * cos(wp.z * 0.34 + uTime * 0.95) * 0.045;
    float w2 = sin((wp.x + wp.z) * 0.75 - uTime * 1.65) * 0.022;
    wp.y += w1 + w2;
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uSkyZenithColor;
  uniform vec3 uSkyHorizonColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uBioluminescence;

  varying vec3 vWorldPos;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 p = vWorldPos.xz;

    // Multi-layered animated capillary ripples for realistic normal perturbation
    float n1 = noise(p * 0.55 + vec2(uTime * 0.18, -uTime * 0.14));
    float n2 = noise(p * 1.45 + vec2(-uTime * 0.24, uTime * 0.21));
    float n3 = noise(p * 3.6 + vec2(uTime * 0.32, uTime * 0.28));

    float nx = (n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.08 + (n3 - 0.5) * 0.04;
    float nz = (n2 - 0.5) * 0.12 - (n1 - 0.5) * 0.08 + (n3 - 0.5) * 0.04;
    vec3 N = normalize(vec3(nx, 1.0, nz));

    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndotv = clamp(dot(N, V), 0.0, 1.0);

    // Schlick Fresnel sky & horizon reflection
    float fresnel = 0.04 + 0.96 * pow(1.0 - ndotv, 4.2);
    vec3 reflDir = reflect(-V, N);
    float reflUp = clamp(reflDir.y, 0.0, 1.0);
    vec3 skyRefl = mix(uSkyHorizonColor, uSkyZenithColor, pow(reflUp, 0.65));

    // Deep alien lagoon water body color
    vec3 deepWater = mix(vec3(0.02, 0.07, 0.14), vec3(0.04, 0.18, 0.26), clamp(uSunIntensity / 3.2, 0.0, 1.0));
    vec3 waterCol = mix(deepWater, skyRefl, fresnel * 0.88);

    // Sun & Moon specular glitter path
    vec3 L = normalize(uSunDir);
    if (L.y > -0.06) {
      vec3 H = normalize(L + V);
      float specTight = pow(max(dot(N, H), 0.0), 260.0) * 2.4;
      float specBroad = pow(max(dot(N, H), 0.0), 36.0) * 0.35;
      float horizonVis = smoothstep(-0.06, 0.06, L.y);
      waterCol += uSunColor * (specTight + specBroad) * clamp(uSunIntensity * 0.55, 0.15, 1.5) * horizonVis;
    }

    // Nocturnal moon & ringed-planet shimmer on the lagoon
    vec3 moonDir = normalize(vec3(0.28, 0.42, -0.86));
    vec3 Hmoon = normalize(moonDir + V);
    float moonSpec = pow(max(dot(N, Hmoon), 0.0), 140.0) * 0.65 * uBioluminescence;
    waterCol += vec3(0.55, 0.72, 1.0) * moonSpec;

    // Bioluminescent plankton & shoreline ripples during dawn and afterglow
    float planktonWave = smoothstep(0.62, 0.88, n1 * 0.6 + n2 * 0.4);
    float pulse = 0.75 + 0.25 * sin(uTime * 1.4 + p.x * 0.2 + p.y * 0.15);
    vec3 bioWaterGlow = mix(vec3(0.04, 0.85, 0.92), vec3(0.58, 0.24, 0.96), n2);
    waterCol += bioWaterGlow * planktonWave * uBioluminescence * pulse * 0.42;

    // Exponential squared distance fog matching terrain & sky
    float dist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    waterCol = mix(waterCol, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(waterCol, 0.93);
  }
`;

// ============================================================================
// 5. SKY & CELESTIAL BODIES BUILDER (SKY DOME, GAS GIANT, 2 MOONS, SHOOTING STARS)
// ============================================================================

interface SkyCelestialSystem {
  group: THREE.Group;
  update: (env: EnvironmentState, elapsed: number, delta: number) => void;
  dispose: () => void;
}

function createSkyAndCelestialSystem(): SkyCelestialSystem {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // 1. Atmospheric Sky Dome
  const skyGeo = new THREE.SphereGeometry(420, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.2, -0.8) },
      uZenithColor: { value: new THREE.Color('#07091c') },
      uMidColor: { value: new THREE.Color('#1a1847') },
      uHorizonColor: { value: new THREE.Color('#482963') },
      uSunGlowColor: { value: new THREE.Color('#ff6e7f') },
      uSunDiscIntensity: { value: 0.5 },
      uSunHaloIntensity: { value: 0.7 },
      uCloudLitColor: { value: new THREE.Color('#6c4982') },
      uCloudShadowColor: { value: new THREE.Color('#161538') },
      uCloudRimColor: { value: new THREE.Color('#d97898') },
      uCloudOpacity: { value: 0.72 },
      uStarVisibility: { value: 0.92 },
    },
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.frustumCulled = false;
  group.add(skyMesh);
  disposables.push(skyGeo, skyMat);

  // 2. Massive Ringed Gas Giant ("Aurelia Prime") in the distant upper-left sky
  const gasGiantGroup = new THREE.Group();
  const planetCenter = new THREE.Vector3(-118, 92, -265);
  gasGiantGroup.position.copy(planetCenter);
  gasGiantGroup.rotation.set(0.28, 0.22, -0.38);
  group.add(gasGiantGroup);

  const planetRadius = 34;
  const planetGeo = new THREE.SphereGeometry(planetRadius, 48, 36);
  const planetMat = new THREE.ShaderMaterial({
    vertexShader: GAS_GIANT_VERTEX_SHADER,
    fragmentShader: GAS_GIANT_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8) },
      uSkyBlendColor: { value: new THREE.Color('#1a1847') },
      uAtmosphereBlend: { value: 0.28 },
      uPlanetRadius: { value: planetRadius },
      uPlanetCenter: { value: planetCenter.clone() },
    },
  });
  const planetMesh = new THREE.Mesh(planetGeo, planetMat);
  gasGiantGroup.add(planetMesh);
  disposables.push(planetGeo, planetMat);

  const innerRingR = 43;
  const outerRingR = 82;
  const ringGeo = new THREE.RingGeometry(innerRingR, outerRingR, 96, 1);
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: PLANET_RING_VERTEX_SHADER,
    fragmentShader: PLANET_RING_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8) },
      uPlanetCenter: { value: planetCenter.clone() },
      uPlanetRadius: { value: planetRadius },
      uSkyBlendColor: { value: new THREE.Color('#1a1847') },
      uAtmosphereBlend: { value: 0.28 },
      uInnerRadius: { value: innerRingR },
      uOuterRadius: { value: outerRingR },
    },
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI * 0.44;
  gasGiantGroup.add(ringMesh);
  disposables.push(ringGeo, ringMat);

  // 3. Two Alien Moons with Distinct Sizes, Colors & Orbital Paths
  // Moon 1: Kaelos (Large silver-violet cratered moon)
  const moon1Geo = new THREE.SphereGeometry(11.5, 36, 28);
  const moon1Mat = new THREE.ShaderMaterial({
    vertexShader: MOON_VERTEX_SHADER,
    fragmentShader: MOON_FRAGMENT_SHADER,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8) },
      uColorA: { value: new THREE.Color('#5a5682') },
      uColorB: { value: new THREE.Color('#d2d8f5') },
      uGlowAccent: { value: new THREE.Color('#70b5ff') },
      uSkyBlendColor: { value: new THREE.Color('#1a1847') },
      uVisibility: { value: 1.0 },
      uSeed: { value: 1.7 },
    },
  });
  const moon1Mesh = new THREE.Mesh(moon1Geo, moon1Mat);
  group.add(moon1Mesh);
  disposables.push(moon1Geo, moon1Mat);

  // Moon 2: Lyra (Smaller warm-amber and cyan captured moonlet)
  const moon2Geo = new THREE.SphereGeometry(5.2, 28, 22);
  const moon2Mat = new THREE.ShaderMaterial({
    vertexShader: MOON_VERTEX_SHADER,
    fragmentShader: MOON_FRAGMENT_SHADER,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.5, 0.3, -0.8) },
      uColorA: { value: new THREE.Color('#6b4254') },
      uColorB: { value: new THREE.Color('#f5c69c') },
      uGlowAccent: { value: new THREE.Color('#42f5e3') },
      uSkyBlendColor: { value: new THREE.Color('#1a1847') },
      uVisibility: { value: 1.0 },
      uSeed: { value: 4.3 },
    },
  });
  const moon2Mesh = new THREE.Mesh(moon2Geo, moon2Mat);
  group.add(moon2Mesh);
  disposables.push(moon2Geo, moon2Mat);

  // 4. Shooting Stars for Dawn & Afterglow Twilight
  const shootingStars: {
    line: THREE.Line;
    mat: THREE.LineBasicMaterial;
    active: boolean;
    progress: number;
    duration: number;
    start: THREE.Vector3;
    velocity: THREE.Vector3;
    cooldown: number;
  }[] = [];

  for (let i = 0; i < 3; i++) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: i === 0 ? 0xa6f7ff : 0xf0c2ff,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.visible = false;
    group.add(line);
    disposables.push(lineGeo, lineMat);

    shootingStars.push({
      line,
      mat: lineMat,
      active: false,
      progress: 0,
      duration: 1.1,
      start: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      cooldown: 1.5 + i * 2.7,
    });
  }

  const update = (env: EnvironmentState, elapsed: number, delta: number) => {
    // Sky uniforms
    skyMat.uniforms.uTime.value = elapsed;
    skyMat.uniforms.uSunDir.value.copy(env.sunDirection);
    skyMat.uniforms.uZenithColor.value.copy(env.skyZenithColor);
    skyMat.uniforms.uMidColor.value.copy(env.skyMidColor);
    skyMat.uniforms.uHorizonColor.value.copy(env.skyHorizonColor);
    skyMat.uniforms.uSunGlowColor.value.copy(env.skySunGlowColor);
    skyMat.uniforms.uSunDiscIntensity.value = env.sunDiscIntensity;
    skyMat.uniforms.uSunHaloIntensity.value = env.sunHaloIntensity;
    skyMat.uniforms.uCloudLitColor.value.copy(env.cloudLitColor);
    skyMat.uniforms.uCloudShadowColor.value.copy(env.cloudShadowColor);
    skyMat.uniforms.uCloudRimColor.value.copy(env.cloudRimColor);
    skyMat.uniforms.uCloudOpacity.value = env.cloudOpacity;
    skyMat.uniforms.uStarVisibility.value = env.starVisibility;

    // Gas Giant & Rings
    const dayScatterBlend = THREE.MathUtils.lerp(0.14, 0.56, env.lightLevelPct / 100);
    const skyScatterMix = env.skyMidColor.clone().lerp(env.skyHorizonColor, 0.45);
    planetMat.uniforms.uTime.value = elapsed;
    planetMat.uniforms.uSunDir.value.copy(env.sunDirection);
    planetMat.uniforms.uSkyBlendColor.value.copy(skyScatterMix);
    planetMat.uniforms.uAtmosphereBlend.value = dayScatterBlend;

    ringMat.uniforms.uSunDir.value.copy(env.sunDirection);
    ringMat.uniforms.uSkyBlendColor.value.copy(skyScatterMix);
    ringMat.uniforms.uAtmosphereBlend.value = dayScatterBlend;

    // Orbital progression across the planetary day (05:00 -> 19:00)
    const dayNorm = (env.timeHours - START_HOUR) / TOTAL_DAY_HOURS; // 0..1

    // Moon 1 (Kaelos): majestic high arc in the upper-right sky
    const m1Angle = 0.36 + dayNorm * 0.42;
    moon1Mesh.position.set(
      Math.sin(m1Angle) * 195 + 28,
      98 + Math.sin(dayNorm * Math.PI) * 26,
      -245
    );
    moon1Mesh.rotation.y = dayNorm * 0.9;
    moon1Mat.uniforms.uSunDir.value.copy(env.sunDirection);
    moon1Mat.uniforms.uSkyBlendColor.value.copy(skyScatterMix);
    moon1Mat.uniforms.uVisibility.value = env.moonVisibility;

    // Moon 2 (Lyra): faster inner orbit across the central-right sky
    const m2Angle = -0.18 + dayNorm * 0.68;
    moon2Mesh.position.set(
      Math.sin(m2Angle) * 165 + 18,
      72 + Math.cos((dayNorm - 0.35) * Math.PI) * 24,
      -210
    );
    moon2Mesh.rotation.y = -dayNorm * 1.6;
    moon2Mat.uniforms.uSunDir.value.copy(env.sunDirection);
    moon2Mat.uniforms.uSkyBlendColor.value.copy(skyScatterMix);
    moon2Mat.uniforms.uVisibility.value = env.moonVisibility;

    // Shooting stars during dawn/afterglow when starVisibility > 0.35
    for (const s of shootingStars) {
      if (!s.active) {
        if (env.starVisibility > 0.35) {
          s.cooldown -= delta;
          if (s.cooldown <= 0) {
            s.active = true;
            s.progress = 0;
            s.duration = 0.85 + Math.random() * 0.6;
            s.start.set(
              (Math.random() - 0.4) * 240,
              95 + Math.random() * 75,
              -220 - Math.random() * 60
            );
            s.velocity.set(
              (Math.random() > 0.5 ? 1 : -1) * (55 + Math.random() * 45),
              -(28 + Math.random() * 24),
              (Math.random() - 0.5) * 20
            );
            s.line.visible = true;
          }
        }
      } else {
        s.progress += delta / s.duration;
        if (s.progress >= 1.0 || env.starVisibility <= 0.15) {
          s.active = false;
          s.line.visible = false;
          s.cooldown = 2.4 + Math.random() * 4.5;
        } else {
          const head = s.start.clone().addScaledVector(s.velocity, s.progress);
          const tail = s.start
            .clone()
            .addScaledVector(s.velocity, Math.max(0, s.progress - 0.18));
          const posAttr = s.line.geometry.getAttribute('position') as THREE.BufferAttribute;
          posAttr.setXYZ(0, tail.x, tail.y, tail.z);
          posAttr.setXYZ(1, head.x, head.y, head.z);
          posAttr.needsUpdate = true;

          const envelope = Math.sin(s.progress * Math.PI);
          s.mat.opacity = envelope * env.starVisibility * 0.85;
        }
      }
    }
  };

  return {
    group,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

// ============================================================================
// 6. ALIEN TERRAIN & REFLECTIVE LAGOON BUILDER
// ============================================================================

interface TerrainWaterSystem {
  group: THREE.Group;
  update: (env: EnvironmentState, elapsed: number) => void;
  dispose: () => void;
}

function createTerrainAndWaterSystem(): TerrainWaterSystem {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // 1. Procedural Alien Valley & Mountain Spire Terrain
  const terrainSize = 360;
  const segments = 220;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);

  const colShore = new THREE.Color('#131b2e');
  const colMeadowTeal = new THREE.Color('#183b4a');
  const colMeadowViolet = new THREE.Color('#2b254f');
  const colHighRock = new THREE.Color('#3a3357');
  const colPeakSlate = new THREE.Color('#5a4e78');
  const tempCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getVeyraTerrainHeight(x, z);
    posAttr.setY(i, y);

    // Biome vertex coloring by altitude & noise
    const biomeN = valueNoise2D(x * 0.045 + 7.1, z * 0.045 - 3.4);
    if (y < 0.75) {
      tempCol.copy(colShore).lerp(colMeadowTeal, THREE.MathUtils.smoothstep(y, -1.2, 0.75));
    } else if (y < 9.5) {
      tempCol
        .copy(colMeadowTeal)
        .lerp(colMeadowViolet, biomeN * 0.65)
        .lerp(colHighRock, THREE.MathUtils.smoothstep(y, 5.5, 9.5));
    } else {
      tempCol
        .copy(colHighRock)
        .lerp(colPeakSlate, THREE.MathUtils.smoothstep(y, 12.0, 42.0));
    }

    colors[i * 3] = tempCol.r;
    colors[i * 3 + 1] = tempCol.g;
    colors[i * 3 + 2] = tempCol.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  // Enhance MeshStandardMaterial with custom GLSL nocturnal bioluminescent soil veins
  const terrainUniforms = {
    uTime: { value: 0 },
    uBioluminescence: { value: 1.0 },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.08,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uBioluminescence = terrainUniforms.uBioluminescence;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPosition;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uBioluminescence;
         varying vec3 vWorldPosition;

         float veinNoise(vec2 p) {
           vec2 i = floor(p);
           vec2 f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
           float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
           float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
           float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
           return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
         }`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // Subtle bioluminescent mycelial soil veins across low valley meadows
         float valleyMask = smoothstep(0.15, 1.1, vWorldPosition.y) * (1.0 - smoothstep(4.5, 9.0, vWorldPosition.y));
         float nA = veinNoise(vWorldPosition.xz * 0.24);
         float nB = veinNoise(vWorldPosition.xz * 0.58 + vec2(4.2, -2.7));
         float ridge = 1.0 - abs(nA * 2.0 - 1.0);
         float veinLine = smoothstep(0.91, 0.985, ridge) * smoothstep(0.35, 0.75, nB);
         float pulse = 0.72 + 0.28 * sin(uTime * 1.3 + vWorldPosition.x * 0.14 + vWorldPosition.z * 0.12);
         vec3 veinCol = mix(vec3(0.05, 0.85, 0.95), vec3(0.65, 0.25, 0.98), nB);
         totalEmissiveRadiance += veinCol * veinLine * valleyMask * uBioluminescence * pulse * 0.85;`
      );
  };

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Reflective Alien Lagoon Water Plane (y = 0.0)
  const waterGeo = new THREE.PlaneGeometry(165, 165, 96, 96);
  waterGeo.rotateX(-Math.PI / 2);

  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.2, -0.8) },
      uSunColor: { value: new THREE.Color('#ff9642') },
      uSunIntensity: { value: 1.0 },
      uSkyZenithColor: { value: new THREE.Color('#07091c') },
      uSkyHorizonColor: { value: new THREE.Color('#482963') },
      uFogColor: { value: new THREE.Color('#231c47') },
      uFogDensity: { value: 0.0044 },
      uBioluminescence: { value: 1.0 },
    },
  });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(0, 0.0, -4);
  group.add(waterMesh);
  disposables.push(waterGeo, waterMat);

  const update = (env: EnvironmentState, elapsed: number) => {
    terrainUniforms.uTime.value = elapsed;
    terrainUniforms.uBioluminescence.value = env.bioluminescence;

    waterMat.uniforms.uTime.value = elapsed;
    waterMat.uniforms.uSunDir.value.copy(env.sunDirection);
    waterMat.uniforms.uSunColor.value.copy(env.sunColor);
    waterMat.uniforms.uSunIntensity.value = env.sunIntensity;
    waterMat.uniforms.uSkyZenithColor.value.copy(env.skyZenithColor);
    waterMat.uniforms.uSkyHorizonColor.value.copy(env.skyHorizonColor);
    waterMat.uniforms.uFogColor.value.copy(env.fogColor);
    waterMat.uniforms.uFogDensity.value = env.fogDensity;
    waterMat.uniforms.uBioluminescence.value = env.bioluminescence;
  };

  return {
    group,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

// ============================================================================
// 7. PROCEDURAL ALIEN ECOSYSTEM BUILDER (5 DISTINCT INSTANCED FLORA SPECIES)
// ============================================================================

interface EcosystemSystem {
  group: THREE.Group;
  update: (env: EnvironmentState, elapsed: number) => void;
  dispose: () => void;
}

/**
 * Merges an array of simple non-indexed or indexed BufferGeometries that all share
 * position, normal, uv, and a custom float `aGlowMask` attribute.
 */
function mergeAlienParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;

  for (const g of parts) {
    const pos = g.getAttribute('position');
    totalVerts += pos.count;
    const idx = g.getIndex();
    totalIndices += idx ? idx.count : pos.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const glowMasks = new Float32Array(totalVerts);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of parts) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const norm = g.getAttribute('normal') as THREE.BufferAttribute;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const glow = g.getAttribute('aGlowMask') as THREE.BufferAttribute | undefined;

    for (let i = 0; i < pos.count; i++) {
      const vi = vOffset + i;
      positions[vi * 3] = pos.getX(i);
      positions[vi * 3 + 1] = pos.getY(i);
      positions[vi * 3 + 2] = pos.getZ(i);

      normals[vi * 3] = norm ? norm.getX(i) : 0;
      normals[vi * 3 + 1] = norm ? norm.getY(i) : 1;
      normals[vi * 3 + 2] = norm ? norm.getZ(i) : 0;

      uvs[vi * 2] = uv ? uv.getX(i) : 0;
      uvs[vi * 2 + 1] = uv ? uv.getY(i) : 0;

      glowMasks[vi] = glow ? glow.getX(i) : 0;
    }

    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices[iOffset + i] = idx.getX(i) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[iOffset + i] = i + vOffset;
      }
      iOffset += pos.count;
    }

    vOffset += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('aGlowMask', new THREE.BufferAttribute(glowMasks, 1));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function stampGlowMask(geo: THREE.BufferGeometry, valueOrFn: number | ((x: number, y: number, z: number) => number)): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    arr[i] =
      typeof valueOrFn === 'number'
        ? valueOrFn
        : valueOrFn(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  geo.setAttribute('aGlowMask', new THREE.BufferAttribute(arr, 1));
  return geo;
}

// Geometry 1: Sylphora — Spiral-Fluted Branching Alien Canopy Tree
function buildSylphoraTreeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Sculpted spiral-fluted trunk with flared roots
  const trunkH = 7.4;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.68, trunkH, 12, 18, false);
  trunkGeo.translate(0, trunkH * 0.5, 0);
  const tPos = trunkGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const y = tPos.getY(i);
    const z = tPos.getZ(i);
    const t = y / trunkH;
    const angle = Math.atan2(z, x);
    // Fluted spiral ribs + gentle S-curve organic lean
    const flute = 1.0 + 0.18 * Math.sin(angle * 5.0 + y * 1.4) * (1.0 - t * 0.5);
    const leanX = Math.sin(t * Math.PI * 1.15) * 0.55;
    const leanZ = Math.cos(t * Math.PI * 0.9) * 0.25 - 0.25;
    tPos.setXYZ(i, x * flute + leanX, y, z * flute + leanZ);
  }
  trunkGeo.computeVertexNormals();
  // Glowing sap veins along the trunk flutes
  stampGlowMask(trunkGeo, (x, y, z) => {
    const ang = Math.atan2(z, x);
    const rib = Math.pow(0.5 + 0.5 * Math.sin(ang * 5.0 + y * 1.4), 5.0);
    return rib * 0.55;
  });
  parts.push(trunkGeo);

  // Tiered organic alien canopy whorls (sweeping concave umbrella-fronds)
  const tiers = [
    { y: 5.2, r: 2.35, tiltX: 0.16, tiltZ: -0.14, offsetX: -0.65, offsetZ: 0.25 },
    { y: 6.3, r: 2.85, tiltX: -0.12, tiltZ: 0.15, offsetX: 0.55, offsetZ: -0.2 },
    { y: 7.35, r: 3.3, tiltX: 0.05, tiltZ: -0.04, offsetX: 0.05, offsetZ: 0.05 },
    { y: 8.15, r: 1.95, tiltX: -0.08, tiltZ: 0.06, offsetX: -0.12, offsetZ: 0.1 },
  ];

  for (const tier of tiers) {
    const capGeo = new THREE.ConeGeometry(tier.r, 1.35, 18, 5, true);
    const cPos = capGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cPos.count; i++) {
      let x = cPos.getX(i);
      let y = cPos.getY(i);
      let z = cPos.getZ(i);
      const rad = Math.hypot(x, z);
      const normR = rad / tier.r;
      const ang = Math.atan2(z, x);
      // Scalloped alien frond edges & graceful droop at the tips
      const scallop = 1.0 + 0.18 * Math.sin(ang * 7.0) * normR;
      x *= scallop;
      z *= scallop;
      y = -Math.pow(normR, 1.65) * 0.95 + 0.35 + Math.sin(ang * 7.0) * 0.14 * normR;
      cPos.setXYZ(i, x, y, z);
    }
    capGeo.rotateX(tier.tiltX);
    capGeo.rotateZ(tier.tiltZ);
    capGeo.translate(tier.offsetX, tier.y, tier.offsetZ);
    capGeo.computeVertexNormals();
    // Canopy rim and underside glow brightly at night
    stampGlowMask(capGeo, (x, y, z) => {
      const r = Math.hypot(x - tier.offsetX, z - tier.offsetZ) / tier.r;
      return THREE.MathUtils.smoothstep(r, 0.25, 1.0) * 0.92;
    });
    parts.push(capGeo);
  }

  return mergeAlienParts(parts);
}

// Geometry 2: Aetheris — Kinetic Lotus Flower (petals articulate via vertex shader!)
function buildAetherisFlowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Graceful curved stem
  const stemGeo = new THREE.CylinderGeometry(0.032, 0.065, 1.15, 7, 6);
  stemGeo.translate(0, 0.575, 0);
  const sPos = stemGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sPos.count; i++) {
    const y = sPos.getY(i);
    sPos.setX(i, sPos.getX(i) + Math.sin((y / 1.15) * Math.PI) * 0.08);
  }
  stemGeo.computeVertexNormals();
  stampGlowMask(stemGeo, 0.18);
  parts.push(stemGeo);

  // Luminous stamen core at y = 1.18
  const coreGeo = new THREE.OctahedronGeometry(0.15, 1);
  coreGeo.scale(1.0, 1.45, 1.0);
  coreGeo.translate(0, 1.24, 0);
  stampGlowMask(coreGeo, 1.45);
  parts.push(coreGeo);

  // 2 concentric whorls of cupped lanceolate petals (encoded with high glow on tips & veins)
  const petalCounts = [6, 5];
  for (let ring = 0; ring < 2; ring++) {
    const count = petalCounts[ring];
    const pLen = ring === 0 ? 0.68 : 0.52;
    const pWid = ring === 0 ? 0.26 : 0.21;

    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + ring * 0.52;
      const pGeo = new THREE.PlaneGeometry(pWid, pLen, 4, 6);
      pGeo.translate(0, pLen * 0.5, 0);

      const pPos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pPos.count; i++) {
        const px = pPos.getX(i);
        const py = pPos.getY(i);
        const vNorm = py / pLen; // 0 at base, 1 at tip
        const uNorm = px / (pWid * 0.5); // -1..1
        // Taper into pointed alien lotus petal + cup inward
        const widthProfile = Math.sin(vNorm * Math.PI * 0.88 + 0.12);
        const cupZ = (1.0 - uNorm * uNorm) * 0.065 + Math.sin(vNorm * Math.PI) * 0.07;
        pPos.setXYZ(i, px * widthProfile, py, cupZ);
      }

      // Slight default resting tilt; vertex shader will dynamically open/close around y = 1.15!
      pGeo.rotateX(ring === 0 ? 0.24 : 0.15);
      pGeo.rotateY(angle);
      pGeo.translate(0, 1.14, 0);
      pGeo.computeVertexNormals();

      stampGlowMask(pGeo, (_x, y, _z) => {
        const tipT = THREE.MathUtils.clamp((y - 1.14) / pLen, 0, 1);
        return 0.45 + tipT * 0.85;
      });
      parts.push(pGeo);
    }
  }

  return mergeAlienParts(parts);
}

// Geometry 3: Mycelon — Fluted Parasol & Shelf Alien Mushrooms
function buildMycelonMushroomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const caps = [
    { x: 0, z: 0, h: 1.45, r: 0.72, tilt: 0.08 },
    { x: 0.42, z: 0.24, h: 0.95, r: 0.46, tilt: -0.18 },
    { x: -0.34, z: 0.28, h: 0.72, r: 0.36, tilt: 0.22 },
  ];

  for (const c of caps) {
    const stemGeo = new THREE.CylinderGeometry(c.r * 0.11, c.r * 0.22, c.h, 8, 6);
    stemGeo.translate(0, c.h * 0.5, 0);
    const sPos = stemGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < sPos.count; i++) {
      const y = sPos.getY(i);
      sPos.setX(i, sPos.getX(i) + Math.sin((y / c.h) * Math.PI) * c.tilt * 0.6);
    }
    stemGeo.translate(c.x, 0, c.z);
    stemGeo.computeVertexNormals();
    stampGlowMask(stemGeo, 0.25);
    parts.push(stemGeo);

    // Fluted wavy alien mushroom cap
    const capGeo = new THREE.ConeGeometry(c.r, c.r * 0.58, 20, 4, false);
    const cPos = capGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < cPos.count; i++) {
      let x = cPos.getX(i);
      let y = cPos.getY(i);
      let z = cPos.getZ(i);
      const rad = Math.hypot(x, z) / c.r;
      const ang = Math.atan2(z, x);
      const flute = 1.0 + 0.16 * Math.sin(ang * 9.0) * rad;
      x *= flute;
      z *= flute;
      y += Math.sin(ang * 9.0) * 0.045 * rad - Math.pow(rad, 2.0) * 0.08;
      cPos.setXYZ(i, x, y, z);
    }
    capGeo.rotateZ(c.tilt);
    capGeo.translate(c.x, c.h, c.z);
    capGeo.computeVertexNormals();
    stampGlowMask(capGeo, (_x, y, _z) => (y < c.h ? 1.15 : 0.65));
    parts.push(capGeo);
  }

  return mergeAlienParts(parts);
}

// Geometry 4: Velora — Giant Sweeping Veined Alien Frond Leaves
function buildVeloraGiantLeafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leafAngles = [-0.45, 0.42];

  for (let idx = 0; idx < leafAngles.length; idx++) {
    const scale = idx === 0 ? 1.0 : 0.78;
    const len = 2.45 * scale;
    const wid = 1.05 * scale;
    const geo = new THREE.PlaneGeometry(wid, len, 8, 12);
    geo.translate(0, len * 0.5, 0);

    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const v = THREE.MathUtils.clamp(py / len, 0, 1); // 0..1 (clamped against Float32 -0.0 epsilon)
      const u = px / (wid * 0.5); // -1..1

      // Heart-lanceolate alien blade profile
      const bladeWidth = Math.sin(Math.pow(v, 0.72) * Math.PI) * (1.0 + 0.15 * Math.sin(v * 14.0));
      // Dramatic fountain arch along length + V-fold along central midrib
      const archZ = Math.pow(v, 1.75) * 1.15 + Math.abs(u) * 0.14;
      const archY = Math.sin(v * Math.PI * 0.72) * len * 0.92;

      pos.setXYZ(i, px * bladeWidth, archY, archZ);
    }

    geo.rotateY(leafAngles[idx]);
    geo.computeVertexNormals();

    // Central midrib & lateral veins glow strongly
    stampGlowMask(geo, (x, y, _z) => {
      const rib = Math.exp(-Math.abs(x) * 6.5);
      const lateralVein = Math.pow(0.5 + 0.5 * Math.sin(y * 9.0 - Math.abs(x) * 8.0), 6.0);
      return Math.min(1.35, rib * 1.1 + lateralVein * 0.75);
    });
    parts.push(geo);
  }

  return mergeAlienParts(parts);
}

// Geometry 5: Lumina — Bioluminescent Bulb-Stalks & Curved Crystal Reeds
function buildLuminaTuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 5;

  for (let b = 0; b < blades; b++) {
    const ang = (b / blades) * Math.PI * 2 + 0.3;
    const h = 0.65 + (b % 3) * 0.28;
    const bladeGeo = new THREE.PlaneGeometry(0.11, h, 2, 5);
    bladeGeo.translate(0, h * 0.5, 0);

    const pos = bladeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const t = THREE.MathUtils.clamp(py / h, 0, 1);
      pos.setXYZ(i, px * (1.0 - t * 0.85), py, Math.pow(t, 1.8) * 0.26);
    }
    bladeGeo.rotateY(ang);
    bladeGeo.translate(Math.cos(ang) * 0.08, 0, Math.sin(ang) * 0.08);
    bladeGeo.computeVertexNormals();
    stampGlowMask(bladeGeo, (_x, y, _z) => THREE.MathUtils.smoothstep(y / h, 0.25, 1.0) * 0.85);
    parts.push(bladeGeo);

    // Add luminous spore bulb on 2 tallest stalks
    if (b < 2) {
      const bulbGeo = new THREE.OctahedronGeometry(0.065, 0);
      bulbGeo.scale(0.85, 1.5, 0.85);
      bulbGeo.translate(Math.cos(ang) * 0.32, h * 0.96, Math.sin(ang) * 0.32);
      stampGlowMask(bulbGeo, 1.4);
      parts.push(bulbGeo);
    }
  }

  return mergeAlienParts(parts);
}

function createAlienEcosystemSystem(): EcosystemSystem {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const sharedShaderUniforms = {
    uTime: { value: 0 },
    uBioluminescence: { value: 1.0 },
    uFlowerOpen: { value: 0.05 },
    uDayWarmth: { value: 0.0 },
  };

  /**
   * Creates an instanced alien flora mesh enhanced with custom GLSL wind sway,
   * optional petal opening/closing articulation, and veined bioluminescent emission.
   */
  function createInstancedSpecies(options: {
    geometry: THREE.BufferGeometry;
    count: number;
    palette: string[];
    bioPalette: string[];
    windAmplitude: number;
    isFlower?: boolean;
    castShadow?: boolean;
    roughness?: number;
  }): THREE.InstancedMesh {
    const {
      geometry,
      count,
      palette,
      bioPalette,
      windAmplitude,
      isFlower = false,
      castShadow = true,
      roughness = 0.62,
    } = options;

    const phases = new Float32Array(count);
    const bioColors = new Float32Array(count * 3);
    const cTmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      phases[i] = Math.random() * Math.PI * 2;
      cTmp.set(bioPalette[i % bioPalette.length]);
      bioColors[i * 3] = cTmp.r;
      bioColors[i * 3 + 1] = cTmp.g;
      bioColors[i * 3 + 2] = cTmp.b;
    }

    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geometry.setAttribute('aBioColor', new THREE.InstancedBufferAttribute(bioColors, 3));

    const mat = new THREE.MeshStandardMaterial({
      roughness,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sharedShaderUniforms.uTime;
      shader.uniforms.uBioluminescence = sharedShaderUniforms.uBioluminescence;
      shader.uniforms.uFlowerOpen = sharedShaderUniforms.uFlowerOpen;
      shader.uniforms.uDayWarmth = sharedShaderUniforms.uDayWarmth;
      shader.uniforms.uWindAmp = { value: windAmplitude };
      shader.uniforms.uIsFlower = { value: isFlower ? 1.0 : 0.0 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aGlowMask;
           attribute float aPhase;
           attribute vec3 aBioColor;
           uniform float uTime;
           uniform float uFlowerOpen;
           uniform float uWindAmp;
           uniform float uIsFlower;
           varying float vGlowMask;
           varying vec3 vBioColor;
           varying float vPhase;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vGlowMask = aGlowMask;
           vBioColor = aBioColor;
           vPhase = aPhase;

           // Kinetic flower petal opening/closing animation (05:00 closed -> 12:00 wide open -> 19:00 closed)
           if (uIsFlower > 0.5 && transformed.y > 1.14) {
             vec3 pivot = vec3(0.0, 1.14, 0.0);
             vec3 rel = transformed - pivot;
             float radialDist = length(rel.xz);
             if (radialDist > 0.06) {
               vec2 outDir = normalize(rel.xz);
               float openSpread = mix(-0.14, 0.42, uFlowerOpen);
               float heightLift = rel.y;
               rel.xz += outDir * heightLift * openSpread;
               rel.y *= mix(1.06, 0.78, uFlowerOpen);
               transformed = pivot + rel;
             }
           }

           // Gentle organic wind sway anchored at the plant's roots (y = 0)
           float heightWeight = clamp(transformed.y * 0.35, 0.0, 2.4);
           float gust = sin(uTime * 1.15 + aPhase) * 0.65 + cos(uTime * 0.68 + aPhase * 1.7) * 0.35;
           transformed.x += gust * uWindAmp * heightWeight;
           transformed.z += cos(uTime * 0.95 + aPhase * 1.3) * uWindAmp * 0.7 * heightWeight;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uBioluminescence;
           uniform float uDayWarmth;
           varying float vGlowMask;
           varying vec3 vBioColor;
           varying float vPhase;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           // Subtle warm golden-violet foliage tint shift during sunlit hours
           diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb * vec3(1.12, 1.04, 0.96), uDayWarmth);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float bioPulse = 0.78 + 0.22 * sin(uTime * 1.65 + vPhase);
           float activeBio = mix(0.06, 1.35, uBioluminescence);
           totalEmissiveRadiance += vBioColor * vGlowMask * activeBio * bioPulse;`
        );
    };

    const instMesh = new THREE.InstancedMesh(geometry, mat, count);
    instMesh.castShadow = castShadow;
    instMesh.receiveShadow = true;

    for (let i = 0; i < count; i++) {
      cTmp.set(palette[i % palette.length]);
      instMesh.setColorAt(i, cTmp);
    }
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;

    group.add(instMesh);
    disposables.push(geometry, mat);
    return instMesh;
  }

  // Build geometries
  const treeGeo = buildSylphoraTreeGeometry();
  const flowerGeo = buildAetherisFlowerGeometry();
  const mushroomGeo = buildMycelonMushroomGeometry();
  const giantLeafGeo = buildVeloraGiantLeafGeometry();
  const tuftGeo = buildLuminaTuftGeometry();

  const treeCount = 54;
  const flowerCount = 240;
  const mushroomCount = 210;
  const leafCount = 175;
  const tuftCount = 860;

  const treeInst = createInstancedSpecies({
    geometry: treeGeo,
    count: treeCount,
    palette: ['#2b6e7d', '#483475', '#21596e', '#63336e', '#2d7a73'],
    bioPalette: ['#24f0ff', '#a855f7', '#38bdf8', '#e879f9'],
    windAmplitude: 0.075,
    castShadow: true,
    roughness: 0.58,
  });

  const flowerInst = createInstancedSpecies({
    geometry: flowerGeo,
    count: flowerCount,
    palette: ['#d966a8', '#8b6be8', '#48c9d4', '#f082b4', '#a78bfa'],
    bioPalette: ['#38f8ff', '#f472b6', '#a855f7', '#5eead4'],
    windAmplitude: 0.055,
    isFlower: true,
    castShadow: false,
    roughness: 0.42,
  });

  const mushroomInst = createInstancedSpecies({
    geometry: mushroomGeo,
    count: mushroomCount,
    palette: ['#6d458c', '#3c6e85', '#8c4978', '#4c5299'],
    bioPalette: ['#22d3ee', '#c084fc', '#2dd4bf', '#f472b6'],
    windAmplitude: 0.025,
    castShadow: true,
    roughness: 0.5,
  });

  const giantLeafInst = createInstancedSpecies({
    geometry: giantLeafGeo,
    count: leafCount,
    palette: ['#1b5e63', '#2d4b73', '#1f6e62', '#3d396e'],
    bioPalette: ['#22f2ff', '#34d399', '#818cf8', '#2dd4bf'],
    windAmplitude: 0.085,
    castShadow: true,
    roughness: 0.54,
  });

  const tuftInst = createInstancedSpecies({
    geometry: tuftGeo,
    count: tuftCount,
    palette: ['#184e59', '#2b3966', '#1e5c57', '#3b2e63'],
    bioPalette: ['#22f5ff', '#a855f7', '#34d399', '#60a5fa'],
    windAmplitude: 0.065,
    castShadow: false,
    roughness: 0.65,
  });

  // Deterministic placement across Veyra's valley terraces, meadows, and shoreline
  const dummy = new THREE.Object3D();

  function placeInstances(
    instMesh: THREE.InstancedMesh,
    count: number,
    seedOffset: number,
    minY: number,
    maxY: number,
    minScale: number,
    maxScale: number,
    maxRadius: number
  ) {
    let placed = 0;
    let attempt = 0;
    while (placed < count && attempt < count * 18) {
      attempt++;
      const r1 = hash2D(attempt * 1.13 + seedOffset, seedOffset * 0.71);
      const r2 = hash2D(seedOffset * 1.91, attempt * 0.87 + seedOffset);
      const r3 = hash2D(attempt * 0.43, seedOffset * 2.31);

      const angle = r1 * Math.PI * 2;
      const radius = Math.sqrt(r2) * maxRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 6.0;

      // Keep clear sightline immediately in front of the hero camera
      if (Math.hypot(x + 14, z - 46) < 11.0) continue;

      const y = getVeyraTerrainHeight(x, z);
      if (y < minY || y > maxY) continue;

      // Check approximate slope to avoid floating on vertical cliffs
      const yx = getVeyraTerrainHeight(x + 0.8, z);
      const yz = getVeyraTerrainHeight(x, z + 0.8);
      const slope = Math.hypot(yx - y, yz - y) / 0.8;
      if (slope > 0.72) continue;

      const s = THREE.MathUtils.lerp(minScale, maxScale, r3);
      dummy.position.set(x, y - 0.06, z);
      dummy.rotation.set(
        (hash2D(attempt, 3.1) - 0.5) * 0.12,
        hash2D(attempt, 7.9) * Math.PI * 2,
        (hash2D(attempt, 5.4) - 0.5) * 0.12
      );
      dummy.scale.set(s, s * (0.9 + 0.22 * hash2D(attempt, 9.2)), s);
      dummy.updateMatrix();
      instMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }
    instMesh.count = placed;
    instMesh.instanceMatrix.needsUpdate = true;
  }

  placeInstances(treeInst, treeCount, 11.3, 0.45, 9.2, 0.82, 1.48, 66);
  placeInstances(flowerInst, flowerCount, 27.9, 0.18, 6.2, 0.75, 1.35, 58);
  placeInstances(mushroomInst, mushroomCount, 43.1, 0.22, 8.5, 0.65, 1.32, 62);
  placeInstances(giantLeafInst, leafCount, 61.7, 0.12, 6.8, 0.72, 1.35, 56);
  placeInstances(tuftInst, tuftCount, 83.5, 0.05, 7.8, 0.75, 1.55, 64);

  const update = (env: EnvironmentState, elapsed: number) => {
    sharedShaderUniforms.uTime.value = elapsed;
    sharedShaderUniforms.uBioluminescence.value = env.bioluminescence;
    sharedShaderUniforms.uFlowerOpen.value = env.flowerOpenness;
    sharedShaderUniforms.uDayWarmth.value = env.foliageDayWarmth;
  };

  return {
    group,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

// ============================================================================
// 8. ATMOSPHERE SPORES & FLYING ALIEN ORGANISMS BUILDER
// ============================================================================

interface AtmosphereCreaturesSystem {
  group: THREE.Group;
  update: (env: EnvironmentState, elapsed: number) => void;
  dispose: () => void;
}

function createAtmosphereAndCreaturesSystem(): AtmosphereCreaturesSystem {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // 1. Drifting Bioluminescent Spores / Pollen Particles (1,400 GPU-animated particles)
  const particleCount = 1400;
  const pGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const phases = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const colors = new Float32Array(particleCount * 3);

  const sporePalette = [
    new THREE.Color('#38f8ff'),
    new THREE.Color('#c084fc'),
    new THREE.Color('#5eead4'),
    new THREE.Color('#f472b6'),
    new THREE.Color('#fde68a'),
  ];

  for (let i = 0; i < particleCount; i++) {
    const x = (Math.random() - 0.5) * 115;
    const z = (Math.random() - 0.5) * 115 - 8;
    const groundY = Math.max(0, getVeyraTerrainHeight(x, z));
    const y = groundY + 0.4 + Math.random() * 14.5;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = 14.0 + Math.random() * 24.0;

    const c = sporePalette[i % sporePalette.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uVisibility: { value: 1.0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = color;
        vec3 pos = position;
        pos.x += sin(uTime * 0.42 + aPhase) * 1.45;
        pos.y += mod(uTime * 0.28 + aPhase * 2.0, 7.0) - 3.5;
        pos.z += cos(uTime * 0.36 + aPhase * 1.3) * 1.45;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = clamp((aSize * uPixelRatio) / max(-mvPosition.z, 1.0), 1.5, 16.0);
        vAlpha = 0.55 + 0.45 * sin(uTime * 2.1 + aPhase * 3.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uVisibility;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r2 = dot(cxy, cxy);
        if (r2 > 1.0) discard;
        float glow = exp(-r2 * 3.4);
        gl_FragColor = vec4(vColor * 1.45, glow * vAlpha * uVisibility * 0.85);
      }
    `,
  });

  const sporePoints = new THREE.Points(pGeo, pMat);
  sporePoints.frustumCulled = false;
  group.add(sporePoints);
  disposables.push(pGeo, pMat);

  // 2. Small Flying Alien Organisms ("Veyra Sky-Moths / Luminous Ribbon Mantas")
  const creatureCount = 26;
  const wingGeo = new THREE.PlaneGeometry(0.95, 0.55, 6, 2);
  wingGeo.rotateX(-Math.PI / 2);

  const creatureMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBioluminescence: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float span = abs(pos.x) / 0.475;
        // Graceful undulating manta-wing flap
        pos.y += sin(uTime * 6.5 - span * 1.4) * 0.16 * span;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uBioluminescence;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        // Sculpted twin-wing silhouette
        float wingShape = 1.0 - smoothstep(0.15, 0.95, abs(p.y) + abs(p.x) * 0.42);
        if (wingShape < 0.05) discard;
        vec3 col = mix(vec3(0.22, 0.95, 1.0), vec3(0.88, 0.45, 1.0), abs(p.x));
        float intensity = mix(0.45, 1.25, uBioluminescence);
        gl_FragColor = vec4(col * intensity, wingShape * 0.85);
      }
    `,
  });

  const creatures: {
    mesh: THREE.Mesh;
    radiusX: number;
    radiusZ: number;
    centerX: number;
    centerZ: number;
    baseY: number;
    speed: number;
    phase: number;
  }[] = [];

  for (let i = 0; i < creatureCount; i++) {
    const mesh = new THREE.Mesh(wingGeo, creatureMat);
    const scale = 0.55 + (i % 4) * 0.22;
    mesh.scale.setScalar(scale);
    group.add(mesh);

    creatures.push({
      mesh,
      radiusX: 10 + (i % 7) * 4.5,
      radiusZ: 9 + (i % 5) * 4.2,
      centerX: ((i % 5) - 2) * 9.5,
      centerZ: -4 + ((i % 4) - 1.5) * 8.0,
      baseY: 3.2 + (i % 6) * 1.45,
      speed: (i % 2 === 0 ? 1 : -1) * (0.22 + (i % 5) * 0.045),
      phase: i * 1.37,
    });
  }
  disposables.push(wingGeo, creatureMat);

  const update = (env: EnvironmentState, elapsed: number) => {
    pMat.uniforms.uTime.value = elapsed;
    pMat.uniforms.uVisibility.value = env.particleVisibility;

    creatureMat.uniforms.uTime.value = elapsed;
    creatureMat.uniforms.uBioluminescence.value = env.bioluminescence;

    for (const c of creatures) {
      const t = elapsed * c.speed + c.phase;
      const nx = c.centerX + Math.cos(t) * c.radiusX;
      const nz = c.centerZ + Math.sin(t * 1.5) * c.radiusZ;
      const ny = c.baseY + Math.sin(elapsed * 1.4 + c.phase) * 0.65;

      // Compute forward velocity vector so the organism faces its flight direction
      const dt = 0.04;
      const fx = c.centerX + Math.cos(t + dt * Math.sign(c.speed)) * c.radiusX;
      const fz = c.centerZ + Math.sin((t + dt * Math.sign(c.speed)) * 1.5) * c.radiusZ;
      const fy = c.baseY + Math.sin((elapsed + dt) * 1.4 + c.phase) * 0.65;

      c.mesh.position.set(nx, ny, nz);
      c.mesh.lookAt(fx, fy, fz);
    }
  };

  return {
    group,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

// ============================================================================
// 9. MAIN THREE.JS SCENE ENGINE (VeyraSceneEngine)
// ============================================================================

const HERO_CAMERA_POS = new THREE.Vector3(-14.5, 11.2, 46.5);
const HERO_CAMERA_TARGET = new THREE.Vector3(1.5, 11.8, -36.0);

class VeyraSceneEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  private sunLight: THREE.DirectionalLight;
  private moonLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private fog: THREE.FogExp2;

  private skySystem: SkyCelestialSystem;
  private terrainSystem: TerrainWaterSystem;
  private ecosystemSystem: EcosystemSystem;
  private atmosphereSystem: AtmosphereCreaturesSystem;

  private clock = new THREE.Clock();
  private rafId: number | null = null;
  private isDisposed = false;

  // Simulation state refs
  private simTimeHours = START_HOUR;
  private isPlaying = true;
  private playbackSpeed: PlaybackSpeed = 1;
  private afterglowHoldTimer = 0;

  // Camera reset & user interaction tracking
  private isResettingCamera = false;
  private resetProgress = 0;
  private resetStartPos = new THREE.Vector3();
  private resetStartTarget = new THREE.Vector3();
  private isUserInteracting = false;

  private onTelemetryUpdate: (env: EnvironmentState) => void;
  private lastUiSyncTime = 0;

  constructor(
    container: HTMLElement,
    onTelemetryUpdate: (env: EnvironmentState) => void
  ) {
    this.container = container;
    this.onTelemetryUpdate = onTelemetryUpdate;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if ('outputColorSpace' in this.renderer) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2('#231c47', 0.0042);
    this.scene.fog = this.fog;

    // 3. Camera & Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.4, 750);
    this.camera.position.copy(HERO_CAMERA_POS);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(HERO_CAMERA_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.65;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 110;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.update();

    this.controls.addEventListener('start', this.handleControlStart);
    this.controls.addEventListener('end', this.handleControlEnd);

    // 4. Dynamic Lighting Rig
    this.hemiLight = new THREE.HemisphereLight('#373578', '#121c2e', 0.65);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#ffb469', 1.5);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const shadowBound = 68;
    this.sunLight.shadow.camera.left = -shadowBound;
    this.sunLight.shadow.camera.right = shadowBound;
    this.sunLight.shadow.camera.top = shadowBound;
    this.sunLight.shadow.camera.bottom = -shadowBound;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Secondary nocturnal moonlight fill from Kaelos & Aurelia Prime
    this.moonLight = new THREE.DirectionalLight('#7a9cff', 0.75);
    this.moonLight.position.set(45, 85, -110);
    this.scene.add(this.moonLight);

    // 5. Build World Subsystems
    this.skySystem = createSkyAndCelestialSystem();
    this.scene.add(this.skySystem.group);

    this.terrainSystem = createTerrainAndWaterSystem();
    this.scene.add(this.terrainSystem.group);

    this.ecosystemSystem = createAlienEcosystemSystem();
    this.scene.add(this.ecosystemSystem.group);

    this.atmosphereSystem = createAtmosphereAndCreaturesSystem();
    this.scene.add(this.atmosphereSystem.group);

    // 6. Post-Processing Pipeline (Bloom for bioluminescence & solar corona)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.85,
      0.62,
      0.74
    );
    this.composer.addPass(this.bloomPass);

    // Apply initial 05:00 state immediately
    const initialEnv = computeEnvironmentState(this.simTimeHours);
    this.applyEnvironment(initialEnv, 0, 0.016);
    this.onTelemetryUpdate(initialEnv);

    window.addEventListener('resize', this.handleResize);
    this.animate();
  }

  private handleControlStart = () => {
    this.isUserInteracting = true;
    this.isResettingCamera = false;
  };

  private handleControlEnd = () => {
    this.isUserInteracting = false;
  };

  private handleResize = () => {
    if (this.isDisposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  };

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    if (playing && this.simTimeHours >= END_HOUR - 0.005) {
      this.simTimeHours = START_HOUR;
      this.afterglowHoldTimer = 0;
    }
  }

  public setPlaybackSpeed(speed: PlaybackSpeed): void {
    this.playbackSpeed = speed;
  }

  public setTimeHours(hours: number): void {
    this.simTimeHours = Math.max(START_HOUR, Math.min(END_HOUR, hours));
    this.afterglowHoldTimer = 0;
    const env = computeEnvironmentState(this.simTimeHours);
    this.applyEnvironment(env, this.clock.getElapsedTime(), 0.016);
    this.onTelemetryUpdate(env);
  }

  public restartDay(): void {
    this.simTimeHours = START_HOUR;
    this.afterglowHoldTimer = 0;
    this.isPlaying = true;
    const env = computeEnvironmentState(this.simTimeHours);
    this.applyEnvironment(env, this.clock.getElapsedTime(), 0.016);
    this.onTelemetryUpdate(env);
  }

  public resetCamera(): void {
    this.isResettingCamera = true;
    this.resetProgress = 0;
    this.resetStartPos.copy(this.camera.position);
    this.resetStartTarget.copy(this.controls.target);
  }

  private applyEnvironment(env: EnvironmentState, elapsed: number, delta: number): void {
    // Update lights
    this.sunLight.position.copy(env.sunDirection).multiplyScalar(115);
    this.sunLight.target.position.set(0, 2, -8);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.color.copy(env.sunColor);
    this.sunLight.intensity = env.sunIntensity;

    this.moonLight.color.copy(env.moonLightColor);
    this.moonLight.intensity = env.moonLightIntensity;

    this.hemiLight.color.copy(env.hemiSkyColor);
    this.hemiLight.groundColor.copy(env.hemiGroundColor);
    this.hemiLight.intensity = env.hemiIntensity;

    // Atmospheric fog & exposure
    this.fog.color.copy(env.fogColor);
    this.fog.density = env.fogDensity;
    this.renderer.toneMappingExposure = env.exposure;
    this.bloomPass.strength = env.bloomStrength;

    // Update world subsystems
    this.skySystem.update(env, elapsed, delta);
    this.terrainSystem.update(env, elapsed);
    this.ecosystemSystem.update(env, elapsed);
    this.atmosphereSystem.update(env, elapsed);
  }

  private animate = (): void => {
    if (this.isDisposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.getElapsedTime();

    // Advance planetary clock when playing
    if (this.isPlaying) {
      if (this.simTimeHours < END_HOUR) {
        this.simTimeHours = Math.min(
          END_HOUR,
          this.simTimeHours + delta * BASE_HOURS_PER_SECOND * this.playbackSpeed
        );
      } else {
        // Linger serenely in The Afterglow (19:00) for 4.5 seconds before looping back to First Light
        this.afterglowHoldTimer += delta;
        if (this.afterglowHoldTimer >= 4.5) {
          this.simTimeHours = START_HOUR;
          this.afterglowHoldTimer = 0;
        }
      }
    }

    // Smooth camera reset animation
    if (this.isResettingCamera) {
      this.resetProgress = Math.min(1, this.resetProgress + delta / 1.15);
      const ease = 1 - Math.pow(1 - this.resetProgress, 3);
      this.camera.position.lerpVectors(this.resetStartPos, HERO_CAMERA_POS, ease);
      this.controls.target.lerpVectors(this.resetStartTarget, HERO_CAMERA_TARGET, ease);
      if (this.resetProgress >= 1) {
        this.isResettingCamera = false;
      }
    } else if (this.isPlaying && !this.isUserInteracting) {
      // Subtle documentary camera breathing drift during playback
      const driftX = Math.sin(elapsed * 0.14) * 0.012;
      const driftY = Math.cos(elapsed * 0.11) * 0.006;
      this.camera.position.x += driftX;
      this.camera.position.y += driftY;
    }

    this.controls.update();

    const env = computeEnvironmentState(this.simTimeHours);
    this.applyEnvironment(env, elapsed, delta);

    // Sync HUD telemetry at ~20Hz to keep React renders light and butter-smooth
    if (elapsed - this.lastUiSyncTime > 0.05) {
      this.lastUiSyncTime = elapsed;
      this.onTelemetryUpdate(env);
    }

    this.composer.render();
  };

  public dispose(): void {
    this.isDisposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.controls.removeEventListener('start', this.handleControlStart);
    this.controls.removeEventListener('end', this.handleControlEnd);
    this.controls.dispose();

    this.skySystem.dispose();
    this.terrainSystem.dispose();
    this.ecosystemSystem.dispose();
    this.atmosphereSystem.dispose();

    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

// ============================================================================
// 10. MODULAR UI COMPONENTS (HUD OVERLAY, TIMELINE CONTROLS, CAMERA CONTROLS)
// ============================================================================

interface HudOverlayProps {
  env: EnvironmentState;
  cinematicMode: boolean;
}

const HudOverlay: React.FC<HudOverlayProps> = ({ env, cinematicMode }) => {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6 transition-all duration-700 ${
        cinematicMode ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Top-Left: Planetary Title */}
      <div className="select-none">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
          <h1 className="text-2xl sm:text-3xl font-light tracking-[0.28em] text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.65)]">
            VEYRA
          </h1>
        </div>
        <p className="mt-1 pl-4 text-xs sm:text-sm font-normal tracking-[0.18em] uppercase text-cyan-200/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.75)]">
          Planet of the Living Light
        </p>
      </div>

      {/* Top-Right: Compact Environmental Telemetry */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="pointer-events-auto self-start sm:self-auto rounded-2xl border border-white/12 bg-slate-950/45 px-4 py-3 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.45)] min-w-[240px] sm:min-w-[270px]"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Planetary Time
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="font-mono text-xl sm:text-2xl font-medium tracking-wider text-white">
                {env.formattedTime}
              </span>
              <span className="text-xs font-medium tracking-wide text-amber-300/95">
                {env.phaseName}
              </span>
            </div>
          </div>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase text-cyan-300">
            Sol Cycle
          </span>
        </div>

        <div className="mt-2.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Atmosphere</span>
            <span className="font-medium text-slate-100 text-right">
              {env.atmosphericCondition}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Sun className="h-3.5 w-3.5 text-amber-300/90" />
              Solar Irradiance
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-200 transition-all duration-150"
                  style={{ width: `${env.lightLevelPct}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[11px] text-amber-200">
                {env.lightLevelPct}%
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300/90" />
              Bioluminescence
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-all duration-150"
                  style={{ width: `${env.bioluminescencePct}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[11px] text-cyan-200">
                {env.bioluminescencePct}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface TimelineControlsProps {
  timeHours: number;
  formattedTime: string;
  phaseName: string;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  cinematicMode: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSelectSpeed: (speed: PlaybackSpeed) => void;
  onScrubTime: (hours: number) => void;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  timeHours,
  formattedTime,
  phaseName,
  isPlaying,
  playbackSpeed,
  cinematicMode,
  onTogglePlay,
  onRestart,
  onSelectSpeed,
  onScrubTime,
}) => {
  const speeds: PlaybackSpeed[] = [1, 4, 8, 16];
  const progressPct = ((timeHours - START_HOUR) / TOTAL_DAY_HOURS) * 100;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`fixed bottom-4 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 sm:bottom-6 transition-all duration-700 ${
        cinematicMode
          ? 'opacity-0 translate-y-6 pointer-events-none'
          : 'opacity-100 translate-y-0 pointer-events-auto'
      }`}
    >
      <div className="rounded-2xl border border-white/14 bg-slate-950/50 px-4 py-3 sm:px-5 sm:py-3.5 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
        {/* Top Row: Playback Controls + Current Phase + Speed Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/35 bg-cyan-400/15 text-cyan-200 transition hover:bg-cyan-400/25 hover:text-white active:scale-95"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
            </button>

            <button
              type="button"
              onClick={onRestart}
              aria-label="Restart day at 05:00"
              title="Restart at 05:00"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-slate-300 transition hover:bg-white/12 hover:text-white active:scale-95"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="ml-1.5 hidden sm:flex items-baseline gap-2">
              <span className="font-mono text-sm font-medium text-white">{formattedTime}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs tracking-wide text-cyan-200/90">{phaseName}</span>
            </div>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
            {speeds.map((spd) => {
              const active = playbackSpeed === spd;
              return (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onSelectSpeed(spd)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-xs transition ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/35 to-amber-500/30 text-white border border-cyan-300/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}x
                </button>
              );
            })}
          </div>
        </div>

        {/* Draggable Day-Night Timeline Slider */}
        <div className="relative mt-3 pt-1 pb-5">
          {/* Custom Track Background */}
          <div className="pointer-events-none relative h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-amber-300 to-cyan-400"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Native Range Input Overlay for Smooth Scrubbing on Mouse & Touch */}
          <input
            type="range"
            min={START_HOUR}
            max={END_HOUR}
            step={0.01}
            value={timeHours}
            aria-label="Planetary time scrubber"
            onChange={(e) => onScrubTime(parseFloat(e.target.value))}
            className="veyra-slider absolute inset-x-0 top-0.5 h-4 w-full cursor-pointer appearance-none bg-transparent"
          />

          {/* Milestone Markers */}
          <div className="relative mt-2 h-4 w-full">
            {TIME_MILESTONES.map((m) => {
              const leftPct = ((m.hour - START_HOUR) / TOTAL_DAY_HOURS) * 100;
              const isNear = Math.abs(timeHours - m.hour) < 0.45;
              const alignClass =
                leftPct < 6
                  ? 'translate-x-0 text-left'
                  : leftPct > 94
                  ? '-translate-x-full text-right'
                  : '-translate-x-1/2 text-center';

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onScrubTime(m.hour)}
                  style={{ left: `${leftPct}%` }}
                  className={`group absolute top-0 ${alignClass} transition`}
                >
                  <span
                    className={`mx-auto mb-0.5 block h-1.5 w-1.5 rounded-full transition ${
                      isNear
                        ? 'bg-amber-300 scale-125 shadow-[0_0_8px_#fcd34d]'
                        : 'bg-white/35 group-hover:bg-cyan-300'
                    }`}
                  />
                  <span
                    className={`block whitespace-nowrap text-[10px] tracking-wide transition ${
                      isNear
                        ? 'font-medium text-white'
                        : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <span className="hidden sm:inline">{m.label}</span>
                    <span className="sm:hidden">{m.shortLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CameraControlsProps {
  cinematicMode: boolean;
  onResetCamera: () => void;
  onToggleCinematic: () => void;
}

const CameraControls: React.FC<CameraControlsProps> = ({
  cinematicMode,
  onResetCamera,
  onToggleCinematic,
}) => {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed bottom-4 right-4 z-30 flex items-center gap-2 sm:bottom-6 sm:right-6"
    >
      {!cinematicMode && (
        <button
          type="button"
          onClick={onResetCamera}
          title="Reset camera framing"
          className="flex items-center gap-2 rounded-xl border border-white/14 bg-slate-950/50 px-3.5 py-2.5 text-xs font-medium tracking-wide text-slate-200 backdrop-blur-xl shadow-lg transition hover:border-cyan-400/40 hover:bg-slate-900/70 hover:text-white active:scale-95"
        >
          <Compass className="h-4 w-4 text-cyan-300" />
          <span className="hidden md:inline">Reset View</span>
        </button>
      )}

      <button
        type="button"
        onClick={onToggleCinematic}
        title={cinematicMode ? 'Exit Cinematic Mode' : 'Enter Cinematic Mode'}
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium tracking-wide backdrop-blur-xl shadow-lg transition active:scale-95 ${
          cinematicMode
            ? 'border-white/15 bg-slate-950/35 text-slate-300/80 hover:bg-slate-950/70 hover:text-white'
            : 'border-white/14 bg-slate-950/50 text-slate-200 hover:border-amber-300/40 hover:bg-slate-900/70 hover:text-white'
        }`}
      >
        {cinematicMode ? (
          <>
            <EyeOff className="h-4 w-4 text-cyan-300" />
            <span>Exit Cinematic</span>
          </>
        ) : (
          <>
            <Eye className="h-4 w-4 text-amber-300" />
            <span className="hidden md:inline">Cinematic</span>
          </>
        )}
      </button>
    </div>
  );
};

// ============================================================================
// 11. MAIN APPLICATION ENTRY COMPONENT
// ============================================================================

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VeyraSceneEngine | null>(null);

  const [envState, setEnvState] = useState<EnvironmentState>(() =>
    computeEnvironmentState(START_HOUR)
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [cinematicMode, setCinematicMode] = useState<boolean>(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new VeyraSceneEngine(container, (updatedEnv) => {
      setEnvState(updatedEnv);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      engineRef.current?.setPlaying(next);
      return next;
    });
  }, []);

  const handleRestart = useCallback(() => {
    setIsPlaying(true);
    engineRef.current?.restartDay();
  }, []);

  const handleSelectSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    engineRef.current?.setPlaybackSpeed(speed);
  }, []);

  const handleScrubTime = useCallback((hours: number) => {
    engineRef.current?.setTimeHours(hours);
  }, []);

  const handleResetCamera = useCallback(() => {
    engineRef.current?.resetCamera();
  }, []);

  const handleToggleCinematic = useCallback(() => {
    setCinematicMode((prev) => !prev);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#040614] select-none font-sans antialiased">
      {/* Custom Slider Thumb Styles */}
      <style>{`
        .veyra-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.85);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .veyra-slider::-webkit-slider-thumb:hover {
          transform: scale(1.18);
          box-shadow: 0 0 18px rgba(251, 191, 36, 0.95);
        }
        .veyra-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.85);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
      `}</style>

      {/* Full-Viewport 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Top HUD: Planetary Title & Real-Time Telemetry */}
      <HudOverlay env={envState} cinematicMode={cinematicMode} />

      {/* Bottom-Center: Interactive Planetary Timeline & Playback Controls */}
      <TimelineControls
        timeHours={envState.timeHours}
        formattedTime={envState.formattedTime}
        phaseName={envState.phaseName}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        cinematicMode={cinematicMode}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onSelectSpeed={handleSelectSpeed}
        onScrubTime={handleScrubTime}
      />

      {/* Bottom-Right: Camera Reset & Cinematic Mode */}
      <CameraControls
        cinematicMode={cinematicMode}
        onResetCamera={handleResetCamera}
        onToggleCinematic={handleToggleCinematic}
      />
    </div>
  );
}

export default App;