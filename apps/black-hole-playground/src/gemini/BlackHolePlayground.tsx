import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  Orbit,
  Gauge,
  Activity,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface SimulationParams {
  gravity: number; // Relative gravitational strength (0.2 - 3.0)
  speed: number; // Simulation speed multiplier (0.2 - 3.0)
  targetParticles: number; // Desired active particle count (50 - 1200)
  showTrails: boolean; // Toggle glowing orbital trails
  autoReplenish: boolean; // Auto-spawn distant stars when particles are absorbed
  isPaused: boolean; // Pause/resume physics
}

interface Telemetry {
  activeParticles: number;
  absorbedCount: number;
  fps: number;
}

interface BackgroundStar {
  nx: number; // Normalized X (0..1)
  ny: number; // Normalized Y (0..1)
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
  rgb: [number, number, number];
}

interface AccretionFilament {
  radiusNorm: number; // Multiplier of event horizon radius (1.28 .. 4.9)
  angle: number;
  arcLength: number;
  thickness: number;
  alpha: number;
  hueBand: 0 | 1 | 2 | 3; // 0: white-cyan, 1: cyan, 2: violet, 3: deep indigo-magenta
  speedFactor: number;
  radialJitter: number;
}

interface AbsorptionFlare {
  angle: number;
  life: number; // 1.0 down to 0.0
  maxLife: number;
  intensity: number;
  isViolet: boolean;
}

interface SpawnRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

interface DragState {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

/**
 * Compact Structure-of-Arrays / Object particle representation with fixed-size
 * Float32Array ring buffers for zero-GC-pressure trail rendering at 60 FPS.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  mass: number;
  colorBucket: 0 | 1 | 2 | 3; // 0: cool indigo, 1: cyan, 2: violet, 3: hot white-cyan
  heat: number; // Smoothed kinetic/proximity glow intensity (0..1)
  baseTint: number; // 0..1 natural spectral variation
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailCount: number;
  age: number;
}

const TRAIL_LENGTH = 18;
const DEFAULT_PARAMS: SimulationParams = {
  gravity: 1.0,
  speed: 1.0,
  targetParticles: 500,
  showTrails: true,
  autoReplenish: true,
  isPaused: false,
};

// Precomputed stroke colors for fast batched trail rendering
const TRAIL_STROKE_RGB: [string, string, string, string] = [
  '129, 140, 248', // 0: Cool Indigo
  '34, 211, 238', // 1: Electric Cyan
  '192, 132, 252', // 2: Luminous Violet
  '224, 249, 255', // 3: Incandescent White-Cyan
];

// ============================================================================
// PROCEDURAL SPRITE & BACKDROP GENERATORS (Zero static image assets)
// ============================================================================

/**
 * Creates a small offscreen radial glow sprite for ultra-fast additive particle drawing.
 */
function createGlowSprite(
  coreColor: string,
  midColor: string,
  outerColor: string,
  size = 48
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, '#ffffff');
  grad.addColorStop(0.16, coreColor);
  grad.addColorStop(0.45, midColor);
  grad.addColorStop(1.0, outerColor);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Renders the deep-space cosmic obsidian & subtle nebula gradient onto an offscreen canvas
 * so per-frame clearing is a single fast GPU-accelerated blit.
 */
function createNebulaBackdrop(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(width));
  c.height = Math.max(1, Math.floor(height));
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  // Deep obsidian void base
  ctx.fillStyle = '#02040b';
  ctx.fillRect(0, 0, c.width, c.height);

  const cx = c.width * 0.5;
  const cy = c.height * 0.5;
  const maxDim = Math.max(c.width, c.height);

  // Subtle upper-left violet nebula veil
  const neb1 = ctx.createRadialGradient(
    c.width * 0.22,
    c.height * 0.25,
    0,
    c.width * 0.22,
    c.height * 0.25,
    maxDim * 0.58
  );
  neb1.addColorStop(0, 'rgba(88, 28, 135, 0.14)');
  neb1.addColorStop(0.5, 'rgba(49, 46, 129, 0.06)');
  neb1.addColorStop(1, 'rgba(2, 4, 11, 0)');
  ctx.fillStyle = neb1;
  ctx.fillRect(0, 0, c.width, c.height);

  // Subtle lower-right deep cyan cosmic haze
  const neb2 = ctx.createRadialGradient(
    c.width * 0.8,
    c.height * 0.76,
    0,
    c.width * 0.8,
    c.height * 0.76,
    maxDim * 0.55
  );
  neb2.addColorStop(0, 'rgba(8, 145, 178, 0.12)');
  neb2.addColorStop(0.48, 'rgba(30, 58, 138, 0.05)');
  neb2.addColorStop(1, 'rgba(2, 4, 11, 0)');
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, c.width, c.height);

  // Faint central gravitational ambient aura
  const centerAura = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.42);
  centerAura.addColorStop(0, 'rgba(56, 189, 248, 0.07)');
  centerAura.addColorStop(0.35, 'rgba(126, 34, 206, 0.05)');
  centerAura.addColorStop(1, 'rgba(2, 4, 11, 0)');
  ctx.fillStyle = centerAura;
  ctx.fillRect(0, 0, c.width, c.height);

  return c;
}

/**
 * Generates a realistic multi-spectral background starfield.
 */
function generateStarfield(count = 420): BackgroundStar[] {
  const palette: Array<{ hex: string; rgb: [number, number, number] }> = [
    { hex: '#e0f2fe', rgb: [224, 242, 254] }, // Blue-white
    { hex: '#bae6fd', rgb: [186, 230, 253] }, // Pale cyan
    { hex: '#f8fafc', rgb: [248, 250, 252] }, // Crisp white
    { hex: '#fef3c7', rgb: [254, 243, 199] }, // Warm starlight
    { hex: '#e9d5ff', rgb: [233, 213, 255] }, // Faint violet
    { hex: '#a5f3fc', rgb: [165, 243, 252] }, // Cyan glint
  ];

  const stars: BackgroundStar[] = [];
  for (let i = 0; i < count; i++) {
    const pick = palette[Math.floor(Math.random() * palette.length)];
    // Bias most stars to tiny pinpoints, with a few brighter stars
    const r = Math.random();
    const size = r > 0.94 ? 1.7 + Math.random() * 1.1 : 0.55 + Math.random() * 1.0;
    stars.push({
      nx: Math.random(),
      ny: Math.random(),
      size,
      baseAlpha: 0.25 + Math.random() * 0.65,
      twinkleSpeed: 0.8 + Math.random() * 2.4,
      twinklePhase: Math.random() * Math.PI * 2,
      color: pick.hex,
      rgb: pick.rgb,
    });
  }
  return stars;
}

/**
 * Generates procedural swirling plasma filaments for the black hole accretion disk.
 */
function generateAccretionFilaments(count = 230): AccretionFilament[] {
  const filaments: AccretionFilament[] = [];
  for (let i = 0; i < count; i++) {
    // Non-uniform radial distribution: denser near the luminous ISCO inner edge
    const u = Math.random();
    const radiusNorm = 1.24 + Math.pow(u, 1.45) * 3.85;

    let hueBand: 0 | 1 | 2 | 3 = 1;
    if (radiusNorm < 1.68) hueBand = 0;
    else if (radiusNorm < 2.45) hueBand = Math.random() < 0.78 ? 1 : 0;
    else if (radiusNorm < 3.65) hueBand = Math.random() < 0.72 ? 2 : 1;
    else hueBand = Math.random() < 0.75 ? 3 : 2;

    filaments.push({
      radiusNorm,
      angle: Math.random() * Math.PI * 2,
      arcLength: 0.16 + Math.random() * 0.62,
      thickness: radiusNorm < 2.0 ? 1.1 + Math.random() * 1.7 : 0.9 + Math.random() * 2.2,
      alpha:
        (radiusNorm < 2.1 ? 0.26 : 0.14) +
        Math.random() * (radiusNorm < 2.2 ? 0.38 : 0.24),
      hueBand,
      speedFactor: 0.88 + Math.random() * 0.24,
      radialJitter: (Math.random() - 0.5) * 0.08,
    });
  }
  return filaments;
}

// ============================================================================
// PHYSICS HELPERS
// ============================================================================

/**
 * Computes effective Schwarzschild radius and gravitational parameter mu = G*M
 * scaled cleanly to viewport dimensions.
 */
function getBlackHoleMetrics(width: number, height: number, gravity: number) {
  const minDim = Math.max(320, Math.min(width, height));
  const baseHorizon = Math.max(24, Math.min(54, minDim * 0.056));
  // Event horizon responds subtly and smoothly to gravitational strength
  const eventHorizonRadius = baseHorizon * (0.76 + 0.24 * Math.pow(gravity, 0.55));
  // Gravitational parameter G*M calibrated for pleasing orbital periods across screen scales
  const mu = gravity * minDim * minDim * 0.165;
  // Softening length smaller than horizon to preserve pure inverse-square outside horizon
  const softeningSq = eventHorizonRadius * eventHorizonRadius * 0.18;
  // Einstein ring lensing radius grows with sqrt(G*M)
  const einsteinRadius = eventHorizonRadius * (1.85 + 0.55 * Math.sqrt(gravity));

  return { eventHorizonRadius, mu, softeningSq, einsteinRadius };
}

/**
 * Creates a single orbiting particle initialized with near-circular / elliptical
 * Keplerian tangential velocity around the black hole.
 */
function createOrbitalParticle(
  cx: number,
  cy: number,
  width: number,
  height: number,
  gravity: number,
  outerSpawnOnly = false
): Particle {
  const { eventHorizonRadius, mu } = getBlackHoleMetrics(width, height, gravity);
  const maxOrbit = Math.hypot(width, height) * 0.52;
  const minOrbit = outerSpawnOnly
    ? Math.max(eventHorizonRadius * 5.2, Math.min(width, height) * 0.36)
    : eventHorizonRadius * 2.45;

  const angle = Math.random() * Math.PI * 2;
  const radius = outerSpawnOnly
    ? minOrbit + Math.random() * Math.max(40, maxOrbit - minOrbit)
    : minOrbit + Math.pow(Math.random(), 0.78) * Math.max(80, maxOrbit - minOrbit);

  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius;

  // Circular orbital speed v = sqrt(GM / r) with natural eccentricity variance
  const vCirc = Math.sqrt(mu / Math.max(radius, eventHorizonRadius));
  const eccentricityFactor = outerSpawnOnly
    ? 0.82 + Math.random() * 0.26
    : 0.76 + Math.random() * 0.38;

  // Counter-clockwise prograde orbital direction matching accretion disk flow
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);

  // Subtle radial component for organic elliptical variation
  const radialBias = (Math.random() - 0.5) * 0.18;
  const vx = (tx * eccentricityFactor + Math.cos(angle) * radialBias) * vCirc;
  const vy = (ty * eccentricityFactor + Math.sin(angle) * radialBias) * vCirc;

  const trailX = new Float32Array(TRAIL_LENGTH);
  const trailY = new Float32Array(TRAIL_LENGTH);
  trailX[0] = x;
  trailY[0] = y;

  return {
    x,
    y,
    vx,
    vy,
    size: 1.5 + Math.random() * 2.1,
    mass: 0.8 + Math.random() * 0.5,
    colorBucket: Math.random() < 0.55 ? 1 : Math.random() < 0.5 ? 0 : 2,
    heat: 0.2,
    baseTint: Math.random(),
    trailX,
    trailY,
    trailHead: 1,
    trailCount: 1,
    age: 0,
  };
}

/**
 * Spawns a particle at a specific screen position with explicit velocity.
 */
function createCustomParticle(
  x: number,
  y: number,
  vx: number,
  vy: number,
  sizeBoost = 0
): Particle {
  const trailX = new Float32Array(TRAIL_LENGTH);
  const trailY = new Float32Array(TRAIL_LENGTH);
  trailX[0] = x;
  trailY[0] = y;

  return {
    x,
    y,
    vx,
    vy,
    size: 1.9 + Math.random() * 1.9 + sizeBoost,
    mass: 1.0,
    colorBucket: 3,
    heat: 0.75,
    baseTint: Math.random(),
    trailX,
    trailY,
    trailHead: 1,
    trailCount: 1,
    age: 0,
  };
}

/**
 * Computes gravitational + subtle near-horizon relativistic acceleration at (x, y).
 */
function computeAcceleration(
  x: number,
  y: number,
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  mu: number,
  softeningSq: number,
  eventHorizonRadius: number
): [number, number] {
  const dx = cx - x;
  const dy = cy - y;
  const r2 = dx * dx + dy * dy;
  const r = Math.sqrt(r2);

  // Pure inverse-square Newtonian gravity
  const invDist3 = 1 / Math.pow(r2 + softeningSq, 1.5);
  let ax = dx * mu * invDist3;
  let ay = dy * mu * invDist3;

  // Subtle relativistic innermost stable orbit (ISCO) drag + prograde frame-dragging
  // Triggers only close to the black hole (< 2.35 Rs) so outer orbits stay crisp and stable
  const iscoRadius = eventHorizonRadius * 2.35;
  if (r < iscoRadius && r > 1) {
    const proximity = 1 - r / iscoRadius;
    // Gentle orbital energy loss (gravitational radiation plunge)
    const drag = proximity * proximity * 1.35;
    ax -= vx * drag;
    ay -= vy * drag;

    // Subtle frame-dragging swirl aligned with counter-clockwise accretion rotation
    const tx = -dy / r;
    const ty = dx / r;
    const swirl = proximity * (mu / Math.max(r2, 100)) * 0.14;
    ax += tx * swirl;
    ay += ty * swirl;
  }

  return [ax, ay];
}

// ============================================================================
// MAIN REACT APPLICATION
// ============================================================================

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interactive UI controls state
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [controlsOpen, setControlsOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [telemetry, setTelemetry] = useState<Telemetry>({
    activeParticles: DEFAULT_PARAMS.targetParticles,
    absorbedCount: 0,
    fps: 60,
  });

  // Mutable simulation engine state stored in ref to avoid React re-render overhead
  const paramsRef = useRef<SimulationParams>(params);
  paramsRef.current = params;

  const engineRef = useRef<{
    width: number;
    height: number;
    dpr: number;
    particles: Particle[];
    stars: BackgroundStar[];
    filaments: AccretionFilament[];
    flares: AbsorptionFlare[];
    ripples: SpawnRipple[];
    absorbedCount: number;
    time: number;
    sprites: HTMLCanvasElement[];
    nebulaCanvas: HTMLCanvasElement | null;
    drag: DragState;
    fpsAccumulator: number;
    fpsFrames: number;
    currentFps: number;
    lastTelemetrySync: number;
  }>({
    width: 1280,
    height: 720,
    dpr: 1,
    particles: [],
    stars: [],
    filaments: [],
    flares: [],
    ripples: [],
    absorbedCount: 0,
    time: 0,
    sprites: [],
    nebulaCanvas: null,
    drag: {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      isDragging: false,
    },
    fpsAccumulator: 0,
    fpsFrames: 0,
    currentFps: 60,
    lastTelemetrySync: 0,
  });

  /**
   * Resets particles to a fresh balanced orbital field and zeroes absorption counter.
   */
  const resetSimulation = useCallback((restoreDefaults = false) => {
    const eng = engineRef.current;
    const nextParams = restoreDefaults
      ? { ...DEFAULT_PARAMS }
      : { ...paramsRef.current, isPaused: false };

    if (restoreDefaults) {
      setParams(nextParams);
      paramsRef.current = nextParams;
    } else if (paramsRef.current.isPaused) {
      setParams((prev) => ({ ...prev, isPaused: false }));
    }

    const cx = eng.width * 0.5;
    const cy = eng.height * 0.5;
    const nextParticles: Particle[] = [];
    for (let i = 0; i < nextParams.targetParticles; i++) {
      nextParticles.push(
        createOrbitalParticle(cx, cy, eng.width, eng.height, nextParams.gravity, false)
      );
    }

    eng.particles = nextParticles;
    eng.flares = [];
    eng.ripples = [];
    eng.absorbedCount = 0;

    setTelemetry((prev) => ({
      ...prev,
      activeParticles: nextParticles.length,
      absorbedCount: 0,
    }));
  }, []);

  /**
   * Toggles Pause / Resume state cleanly.
   */
  const togglePause = useCallback(() => {
    setParams((prev) => ({ ...prev, isPaused: !prev.isPaused }));
  }, []);

  // Spacebar shortcut for Pause / Resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePause]);

  // Synchronize particle count dynamically when user adjusts the Particle Count slider
  useEffect(() => {
    const eng = engineRef.current;
    if (eng.width === 0 || eng.height === 0) return;

    const target = params.targetParticles;
    const current = eng.particles.length;

    if (target > current) {
      const cx = eng.width * 0.5;
      const cy = eng.height * 0.5;
      const toAdd = target - current;
      for (let i = 0; i < toAdd; i++) {
        eng.particles.push(
          createOrbitalParticle(cx, cy, eng.width, eng.height, params.gravity, false)
        );
      }
    } else if (target < current) {
      // Smoothly trim excess particles from the end
      eng.particles.length = target;
    }

    setTelemetry((prev) => ({
      ...prev,
      activeParticles: eng.particles.length,
    }));
  }, [params.targetParticles, params.gravity]);

  // ============================================================================
  // POINTER INTERACTIONS (Click to Spawn Cluster / Drag to Slingshot)
  // ============================================================================

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    canvas.setPointerCapture(e.pointerId);
    engineRef.current.drag = {
      active: true,
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      isDragging: false,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = engineRef.current.drag;
    if (!drag.active || drag.pointerId !== e.pointerId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drag.currentX = x;
    drag.currentY = y;

    const dist = Math.hypot(x - drag.startX, y - drag.startY);
    if (dist > 10) {
      drag.isDragging = true;
    }
  }, []);

  const finishPointerInteraction = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const eng = engineRef.current;
    const drag = eng.drag;
    if (!drag.active || drag.pointerId !== e.pointerId) return;

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const { startX, startY, currentX, currentY, isDragging } = drag;
    drag.active = false;
    drag.pointerId = null;
    drag.isDragging = false;

    const cx = eng.width * 0.5;
    const cy = eng.height * 0.5;
    const { eventHorizonRadius, mu } = getBlackHoleMetrics(
      eng.width,
      eng.height,
      paramsRef.current.gravity
    );

    // Keep total particle cap reasonable even if user clicks many times
    const hardCap = Math.max(1400, paramsRef.current.targetParticles + 250);

    if (isDragging) {
      // Slingshot launch along dragged velocity vector
      const launchScale = 2.35;
      const vx = (currentX - startX) * launchScale;
      const vy = (currentY - startY) * launchScale;

      // Spawn a bright primary star + 4 companion stardust particles
      eng.particles.push(createCustomParticle(startX, startY, vx, vy, 1.0));
      for (let i = 0; i < 4; i++) {
        const jx = (Math.random() - 0.5) * 14;
        const jy = (Math.random() - 0.5) * 14;
        const jvx = vx * (0.94 + Math.random() * 0.12) + (Math.random() - 0.5) * 18;
        const jvy = vy * (0.94 + Math.random() * 0.12) + (Math.random() - 0.5) * 18;
        eng.particles.push(createCustomParticle(startX + jx, startY + jy, jvx, jvy, 0));
      }

      eng.ripples.push({
        x: startX,
        y: startY,
        radius: 6,
        maxRadius: 46,
        life: 1.0,
      });
    } else {
      // Single click: spawn a sparkling 6-star cluster with tangential orbital velocity
      const dx = startX - cx;
      const dy = startY - cy;
      const dist = Math.max(eventHorizonRadius * 1.15, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const vCirc = Math.sqrt(mu / dist);

      // Counter-clockwise orbital tangent
      const tx = -Math.sin(angle);
      const ty = Math.cos(angle);

      const clusterSize = 6;
      for (let i = 0; i < clusterSize; i++) {
        const spreadAngle = (i / clusterSize) * Math.PI * 2 + Math.random() * 0.6;
        const spreadDist = i === 0 ? 0 : 4 + Math.random() * 14;
        const px = startX + Math.cos(spreadAngle) * spreadDist;
        const py = startY + Math.sin(spreadAngle) * spreadDist;

        const speedJitter = 0.9 + Math.random() * 0.22;
        const vx = tx * vCirc * speedJitter + (Math.random() - 0.5) * 22;
        const vy = ty * vCirc * speedJitter + (Math.random() - 0.5) * 22;
        eng.particles.push(createCustomParticle(px, py, vx, vy, i === 0 ? 0.7 : 0));
      }

      eng.ripples.push({
        x: startX,
        y: startY,
        radius: 5,
        maxRadius: 38,
        life: 1.0,
      });
    }

    // Trim oldest excess only if above generous hard cap
    if (eng.particles.length > hardCap) {
      eng.particles.splice(0, eng.particles.length - hardCap);
    }
  }, []);

  // ============================================================================
  // MAIN REAL-TIME SIMULATION & CANVAS RENDERING LOOP
  // ============================================================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const eng = engineRef.current;

    // 1. Pre-render luminous offscreen particle glow sprites (4 spectral tiers)
    eng.sprites = [
      createGlowSprite(
        'rgba(165, 180, 252, 0.95)',
        'rgba(99, 102, 241, 0.42)',
        'rgba(49, 46, 129, 0)'
      ), // 0: Cool Indigo
      createGlowSprite(
        'rgba(103, 232, 249, 0.95)',
        'rgba(34, 211, 238, 0.45)',
        'rgba(8, 145, 178, 0)'
      ), // 1: Electric Cyan
      createGlowSprite(
        'rgba(216, 180, 254, 0.95)',
        'rgba(168, 85, 247, 0.45)',
        'rgba(107, 33, 168, 0)'
      ), // 2: Luminous Violet
      createGlowSprite(
        'rgba(236, 254, 255, 1.0)',
        'rgba(56, 189, 248, 0.58)',
        'rgba(139, 92, 246, 0)'
      ), // 3: Incandescent White-Cyan
    ];

    // 2. Generate procedural background stars and accretion disk filaments
    eng.stars = generateStarfield(430);
    eng.filaments = generateAccretionFilaments(235);

    // 3. Responsive canvas sizing with devicePixelRatio support
    const handleResize = () => {
      const prevWidth = eng.width;
      const prevHeight = eng.height;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      eng.width = w;
      eng.height = h;
      eng.dpr = dpr;
      eng.nebulaCanvas = createNebulaBackdrop(w, h);

      // Re-center existing particles smoothly on viewport resize
      if (eng.particles.length > 0 && prevWidth > 0 && prevHeight > 0) {
        const dx = w * 0.5 - prevWidth * 0.5;
        const dy = h * 0.5 - prevHeight * 0.5;
        for (let i = 0; i < eng.particles.length; i++) {
          const p = eng.particles[i];
          p.x += dx;
          p.y += dy;
          for (let t = 0; t < TRAIL_LENGTH; t++) {
            p.trailX[t] += dx;
            p.trailY[t] += dy;
          }
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // 4. Populate initial balanced orbital starfield
    const initCx = eng.width * 0.5;
    const initCy = eng.height * 0.5;
    eng.particles = [];
    for (let i = 0; i < paramsRef.current.targetParticles; i++) {
      eng.particles.push(
        createOrbitalParticle(
          initCx,
          initCy,
          eng.width,
          eng.height,
          paramsRef.current.gravity,
          false
        )
      );
    }

    // 5. Real-time animation loop
    let rafId = 0;
    let lastTime = performance.now();

    /**
     * Helper to render half of the tilted elliptical accretion disk (back or front)
     */
    const drawAccretionHalf = (
      cx: number,
      cy: number,
      rs: number,
      diskTilt: number,
      diskAspect: number,
      gravityGlow: number,
      isFront: boolean
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(diskTilt);
      ctx.scale(1, diskAspect);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      const filaments = eng.filaments;
      for (let i = 0; i < filaments.length; i++) {
        const f = filaments[i];
        // Normalize angle to [0, 2PI)
        const normAngle = ((f.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const inFront = normAngle >= 0 && normAngle <= Math.PI;
        if (inFront !== isFront) continue;

        const r = rs * (f.radiusNorm + f.radialJitter);
        // Relativistic Doppler beaming: approaching left side glows slightly brighter
        const doppler = 0.8 + 0.34 * Math.max(0, -Math.cos(normAngle));
        const alpha = Math.min(0.85, f.alpha * doppler * gravityGlow);

        let strokeStyle: string;
        if (f.hueBand === 0) {
          strokeStyle = `rgba(224, 249, 255, ${alpha.toFixed(3)})`;
        } else if (f.hueBand === 1) {
          strokeStyle = `rgba(34, 211, 238, ${alpha.toFixed(3)})`;
        } else if (f.hueBand === 2) {
          strokeStyle = `rgba(168, 85, 247, ${alpha.toFixed(3)})`;
        } else {
          strokeStyle = `rgba(99, 102, 241, ${(alpha * 0.85).toFixed(3)})`;
        }

        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = f.thickness * (1 + (gravityGlow - 1) * 0.25);
        ctx.beginPath();
        ctx.arc(0, 0, r, normAngle, normAngle + f.arcLength);
        ctx.stroke();
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);

      const rawDt = Math.min(0.033, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      // FPS measurement
      eng.fpsAccumulator += rawDt;
      eng.fpsFrames += 1;
      if (eng.fpsAccumulator >= 0.4) {
        eng.currentFps = Math.round(eng.fpsFrames / eng.fpsAccumulator);
        eng.fpsAccumulator = 0;
        eng.fpsFrames = 0;
      }

      const p = paramsRef.current;
      const w = eng.width;
      const h = eng.height;
      const cx = w * 0.5;
      const cy = h * 0.5;
      const { eventHorizonRadius, mu, softeningSq, einsteinRadius } = getBlackHoleMetrics(
        w,
        h,
        p.gravity
      );

      // ----------------------------------------------------------------------
      // PHYSICS UPDATE (Velocity Verlet with adaptive substepping)
      // ----------------------------------------------------------------------
      if (!p.isPaused) {
        const simDt = rawDt * p.speed;
        eng.time += simDt;

        // Rotate accretion disk filaments via Keplerian differential rotation (w ~ r^-1.5)
        const baseAngularSpeed = 1.65 * Math.sqrt(p.gravity);
        for (let i = 0; i < eng.filaments.length; i++) {
          const f = eng.filaments[i];
          const keplerOmega = baseAngularSpeed * f.speedFactor / Math.pow(f.radiusNorm, 1.45);
          f.angle += keplerOmega * simDt;
        }

        // Update absorption micro-flares
        for (let i = eng.flares.length - 1; i >= 0; i--) {
          const fl = eng.flares[i];
          fl.life -= rawDt * 2.1;
          if (fl.life <= 0) {
            eng.flares.splice(i, 1);
          }
        }

        // Update click spawn ripples
        for (let i = eng.ripples.length - 1; i >= 0; i--) {
          const rp = eng.ripples[i];
          rp.life -= rawDt * 2.4;
          rp.radius += (rp.maxRadius - rp.radius) * Math.min(1, rawDt * 8);
          if (rp.life <= 0) {
            eng.ripples.splice(i, 1);
          }
        }

        // Adaptive substepping keeps fast near-horizon orbits smooth and accurate
        const substeps = Math.max(3, Math.min(8, Math.ceil(p.speed * 2.8)));
        const subDt = simDt / substeps;
        const escapeDistSq = Math.pow(Math.hypot(w, h) * 1.15, 2);
        const horizonCaptureSq = eventHorizonRadius * eventHorizonRadius * 0.96;
        const characteristicSpeed = Math.sqrt(mu / Math.max(eventHorizonRadius * 2.5, 1));

        const particles = eng.particles;
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          let absorbed = false;
          let escaped = false;

          for (let s = 0; s < substeps; s++) {
            // Velocity Verlet integration
            const [ax1, ay1] = computeAcceleration(
              pt.x,
              pt.y,
              pt.vx,
              pt.vy,
              cx,
              cy,
              mu,
              softeningSq,
              eventHorizonRadius
            );

            const halfDtSq = 0.5 * subDt * subDt;
            pt.x += pt.vx * subDt + ax1 * halfDtSq;
            pt.y += pt.vy * subDt + ay1 * halfDtSq;

            const dx = pt.x - cx;
            const dy = pt.y - cy;
            const distSq = dx * dx + dy * dy;

            // Check Event Horizon crossing
            if (distSq <= horizonCaptureSq) {
              absorbed = true;
              const impactAngle = Math.atan2(dy, dx);
              const speedMag = Math.hypot(pt.vx, pt.vy);
              eng.flares.push({
                angle: impactAngle,
                life: 1.0,
                maxLife: 1.0,
                intensity: Math.min(1.4, 0.65 + speedMag / (characteristicSpeed * 2.2)),
                isViolet: pt.colorBucket === 2 || Math.random() < 0.35,
              });
              // Cap simultaneous flares for crisp visuals
              if (eng.flares.length > 42) eng.flares.shift();
              break;
            }

            if (distSq > escapeDistSq) {
              escaped = true;
              break;
            }

            const [ax2, ay2] = computeAcceleration(
              pt.x,
              pt.y,
              pt.vx,
              pt.vy,
              cx,
              cy,
              mu,
              softeningSq,
              eventHorizonRadius
            );

            pt.vx += 0.5 * (ax1 + ax2) * subDt;
            pt.vy += 0.5 * (ay1 + ay2) * subDt;
          }

          if (absorbed) {
            eng.absorbedCount += 1;
            if (p.autoReplenish && particles.length <= p.targetParticles) {
              // Respawn gracefully at the outer rim
              particles[i] = createOrbitalParticle(cx, cy, w, h, p.gravity, true);
            } else {
              particles.splice(i, 1);
            }
            continue;
          }

          if (escaped) {
            if (p.autoReplenish && particles.length <= p.targetParticles) {
              particles[i] = createOrbitalParticle(cx, cy, w, h, p.gravity, true);
            } else {
              particles.splice(i, 1);
            }
            continue;
          }

          // Update trail ring buffer (once per render frame)
          pt.trailX[pt.trailHead] = pt.x;
          pt.trailY[pt.trailHead] = pt.y;
          pt.trailHead = (pt.trailHead + 1) % TRAIL_LENGTH;
          if (pt.trailCount < TRAIL_LENGTH) pt.trailCount += 1;
          pt.age += simDt;

          // Update dynamic spectral color & luminosity from kinetic speed + proximity
          const speedMag = Math.hypot(pt.vx, pt.vy);
          const distFromCenter = Math.hypot(pt.x - cx, pt.y - cy);
          const speedNorm = Math.min(1, speedMag / (characteristicSpeed * 1.45));
          const proxNorm = Math.max(
            0,
            Math.min(1, 1 - (distFromCenter - eventHorizonRadius) / (eventHorizonRadius * 6.5))
          );
          const targetHeat = Math.min(1, speedNorm * 0.65 + proxNorm * 0.55);
          pt.heat += (targetHeat - pt.heat) * Math.min(1, rawDt * 8);

          if (pt.heat > 0.72) {
            pt.colorBucket = 3; // Incandescent white-cyan at high periapsis speed
          } else if (pt.heat > 0.44) {
            pt.colorBucket = pt.baseTint > 0.34 ? 1 : 2; // Electric cyan / luminous violet
          } else if (pt.heat > 0.24) {
            pt.colorBucket = pt.baseTint > 0.52 ? 1 : 2;
          } else {
            pt.colorBucket = pt.baseTint > 0.35 ? 0 : 2; // Cool outer indigo / subtle violet
          }
        }

        // Gradual auto-replenishment if targetParticles > active and autoReplenish is on
        if (p.autoReplenish && particles.length < p.targetParticles) {
          const spawnBatch = Math.min(3, p.targetParticles - particles.length);
          for (let k = 0; k < spawnBatch; k++) {
            particles.push(createOrbitalParticle(cx, cy, w, h, p.gravity, true));
          }
        }
      }

      // ----------------------------------------------------------------------
      // RENDER PIPELINE
      // ----------------------------------------------------------------------
      ctx.save();
      ctx.scale(eng.dpr, eng.dpr);

      // 1. Deep cosmic obsidian & nebula backdrop
      if (eng.nebulaCanvas) {
        ctx.drawImage(eng.nebulaCanvas, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#02040b';
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Procedurally Gravitationally Lensed Background Starfield
      const einsteinSq = einsteinRadius * einsteinRadius;
      const stars = eng.stars;
      const tNow = eng.time;
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const sx = st.nx * w;
        const sy = st.ny * h;
        const dx = sx - cx;
        const dy = sy - cy;
        const r = Math.hypot(dx, dy);

        // Point-mass Einstein ring deflection: r_img = 0.5 * (r + sqrt(r^2 + 4 * Re^2))
        const rSafe = Math.max(r, 1.5);
        const rLensed = 0.5 * (r + Math.sqrt(r * r + 4 * einsteinSq));
        const ux = dx / rSafe;
        const uy = dy / rSafe;

        const lx = cx + ux * rLensed;
        const ly = cy + uy * rLensed;

        // Subtle starlight twinkling
        const twinkle = 0.72 + 0.28 * Math.sin(tNow * st.twinkleSpeed + st.twinklePhase);
        const alpha = st.baseAlpha * twinkle;

        // Tangential shear stretch for stars deflected close to the Einstein ring
        const shear = rLensed / Math.max(r, eventHorizonRadius * 0.45);
        if (shear > 1.18 && r < einsteinRadius * 2.4) {
          const stretch = Math.min(5.2, 1 + (shear - 1) * 1.45);
          const angle = Math.atan2(uy, ux) + Math.PI * 0.5;
          const boostedAlpha = Math.min(1, alpha * (1 + (stretch - 1) * 0.25));

          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(angle);
          ctx.fillStyle = `rgba(${st.rgb[0]}, ${st.rgb[1]}, ${st.rgb[2]}, ${boostedAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, st.size * stretch, st.size * 0.72, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Faint secondary inverted Einstein image on the opposite side when aligned closely
          const rSecondary = Math.abs(0.5 * (r - Math.sqrt(r * r + 4 * einsteinSq)));
          if (rSecondary > eventHorizonRadius * 1.08 && r < einsteinRadius * 1.15) {
            const lx2 = cx - ux * rSecondary;
            const ly2 = cy - uy * rSecondary;
            ctx.fillStyle = `rgba(${st.rgb[0]}, ${st.rgb[1]}, ${st.rgb[2]}, ${(alpha * 0.42).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(lx2, ly2, st.size * 0.85, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillStyle = `rgba(${st.rgb[0]}, ${st.rgb[1]}, ${st.rgb[2]}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(lx, ly, st.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Black Hole Ambient Gravitational Glow & Lensed Relativistic Halos
      const gravityGlow = 0.78 + 0.32 * Math.sqrt(p.gravity);
      const diskTilt = -0.26; // Elegant relativistic tilt (~ -15 deg)
      const diskAspect = 0.34;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Soft outer violet/cyan gravitational halo
      const outerHalo = ctx.createRadialGradient(
        cx,
        cy,
        eventHorizonRadius * 0.9,
        cx,
        cy,
        eventHorizonRadius * 5.2
      );
      outerHalo.addColorStop(0.0, `rgba(186, 230, 253, ${(0.28 * gravityGlow).toFixed(3)})`);
      outerHalo.addColorStop(0.22, `rgba(34, 211, 238, ${(0.18 * gravityGlow).toFixed(3)})`);
      outerHalo.addColorStop(0.5, `rgba(168, 85, 247, ${(0.11 * gravityGlow).toFixed(3)})`);
      outerHalo.addColorStop(0.8, 'rgba(76, 29, 149, 0.03)');
      outerHalo.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = outerHalo;
      ctx.beginPath();
      ctx.arc(cx, cy, eventHorizonRadius * 5.2, 0, Math.PI * 2);
      ctx.fill();

      // Gravitationally bent upper & lower relativistic light arches (far-side disk light curving over the shadow)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(diskTilt);

      // Upper lensed arch
      const upperArchGrad = ctx.createRadialGradient(
        0,
        -eventHorizonRadius * 0.14,
        eventHorizonRadius * 0.92,
        0,
        -eventHorizonRadius * 0.14,
        eventHorizonRadius * 1.95
      );
      upperArchGrad.addColorStop(0.0, 'rgba(224, 249, 255, 0)');
      upperArchGrad.addColorStop(0.14, `rgba(224, 249, 255, ${(0.52 * gravityGlow).toFixed(3)})`);
      upperArchGrad.addColorStop(0.32, `rgba(34, 211, 238, ${(0.34 * gravityGlow).toFixed(3)})`);
      upperArchGrad.addColorStop(0.62, `rgba(168, 85, 247, ${(0.16 * gravityGlow).toFixed(3)})`);
      upperArchGrad.addColorStop(1.0, 'rgba(168, 85, 247, 0)');

      ctx.fillStyle = upperArchGrad;
      ctx.beginPath();
      ctx.arc(0, -eventHorizonRadius * 0.12, eventHorizonRadius * 1.95, Math.PI, Math.PI * 2);
      ctx.fill();

      // Lower lensed arch (fainter underside image)
      const lowerArchGrad = ctx.createRadialGradient(
        0,
        eventHorizonRadius * 0.12,
        eventHorizonRadius * 0.92,
        0,
        eventHorizonRadius * 0.12,
        eventHorizonRadius * 1.65
      );
      lowerArchGrad.addColorStop(0.0, 'rgba(168, 85, 247, 0)');
      lowerArchGrad.addColorStop(0.18, `rgba(125, 211, 252, ${(0.34 * gravityGlow).toFixed(3)})`);
      lowerArchGrad.addColorStop(0.48, `rgba(168, 85, 247, ${(0.14 * gravityGlow).toFixed(3)})`);
      lowerArchGrad.addColorStop(1.0, 'rgba(168, 85, 247, 0)');

      ctx.fillStyle = lowerArchGrad;
      ctx.beginPath();
      ctx.arc(0, eventHorizonRadius * 0.12, eventHorizonRadius * 1.65, 0, Math.PI);
      ctx.fill();

      // Subtle elliptical accretion disk continuous glow bed
      ctx.save();
      ctx.scale(1, diskAspect);
      const diskBed = ctx.createRadialGradient(
        0,
        0,
        eventHorizonRadius * 1.05,
        0,
        0,
        eventHorizonRadius * 4.8
      );
      diskBed.addColorStop(0.0, `rgba(224, 249, 255, ${(0.45 * gravityGlow).toFixed(3)})`);
      diskBed.addColorStop(0.18, `rgba(34, 211, 238, ${(0.32 * gravityGlow).toFixed(3)})`);
      diskBed.addColorStop(0.45, `rgba(168, 85, 247, ${(0.22 * gravityGlow).toFixed(3)})`);
      diskBed.addColorStop(0.75, `rgba(79, 70, 229, ${(0.09 * gravityGlow).toFixed(3)})`);
      diskBed.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = diskBed;
      ctx.beginPath();
      ctx.arc(0, 0, eventHorizonRadius * 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
      ctx.restore();

      // 4. Back half of rotating Accretion Disk plasma filaments
      drawAccretionHalf(cx, cy, eventHorizonRadius, diskTilt, diskAspect, gravityGlow, false);

      // 5. Pitch-black Event Horizon Singularity Shadow
      ctx.save();
      const shadowGrad = ctx.createRadialGradient(
        cx,
        cy,
        eventHorizonRadius * 0.75,
        cx,
        cy,
        eventHorizonRadius * 1.04
      );
      shadowGrad.addColorStop(0.0, '#000000');
      shadowGrad.addColorStop(0.92, '#010207');
      shadowGrad.addColorStop(1.0, 'rgba(2, 6, 23, 0.88)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, eventHorizonRadius * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 6. Razor-Sharp Photon Sphere / Einstein Ring hugging Event Horizon
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Outer crisp violet-cyan photon bloom
      ctx.strokeStyle = `rgba(168, 85, 247, ${(0.42 * gravityGlow).toFixed(3)})`;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(cx, cy, eventHorizonRadius * 1.045, 0, Math.PI * 2);
      ctx.stroke();

      // Inner razor incandescent cyan-white photon ring
      ctx.strokeStyle = `rgba(224, 249, 255, ${(0.88 * Math.min(1.15, gravityGlow)).toFixed(3)})`;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.arc(cx, cy, eventHorizonRadius * 1.015, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 7. Front half of rotating Accretion Disk crossing before the Event Horizon
      drawAccretionHalf(cx, cy, eventHorizonRadius, diskTilt, diskAspect, gravityGlow, true);

      // 8. Event Horizon Absorption Micro-Flares
      if (eng.flares.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < eng.flares.length; i++) {
          const fl = eng.flares[i];
          const progress = 1 - fl.life;
          const arcSpan = 0.22 + progress * 0.45;
          const flareR = eventHorizonRadius * (1.03 + progress * 0.16);
          const alpha = fl.life * fl.life * 0.9 * fl.intensity;

          // Bright luminous rim arc
          ctx.strokeStyle = fl.isViolet
            ? `rgba(216, 180, 254, ${Math.min(1, alpha).toFixed(3)})`
            : `rgba(165, 243, 252, ${Math.min(1, alpha).toFixed(3)})`;
          ctx.lineWidth = 2.4 + fl.life * 3.0;
          ctx.beginPath();
          ctx.arc(cx, cy, flareR, fl.angle - arcSpan, fl.angle + arcSpan);
          ctx.stroke();

          // Point flash on impact rim
          const fx = cx + Math.cos(fl.angle) * (eventHorizonRadius * 1.03);
          const fy = cy + Math.sin(fl.angle) * (eventHorizonRadius * 1.03);
          const sprite = eng.sprites[fl.isViolet ? 2 : 3];
          const rad = (10 + progress * 16) * fl.intensity;
          ctx.globalAlpha = Math.min(1, fl.life * 0.95);
          ctx.drawImage(sprite, fx - rad, fy - rad, rad * 2, rad * 2);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      // 9. Orbiting Particle Trails (Ultra-fast batched 3-tier tapered rendering)
      const particles = eng.particles;
      if (p.showTrails && particles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 3 opacity/width tiers x 4 color buckets = max 12 stroke calls for 1,200+ particles
        const tiers = [
          { startFrac: 0.0, endFrac: 0.42, alpha: 0.13, width: 0.9 },
          { startFrac: 0.38, endFrac: 0.74, alpha: 0.3, width: 1.35 },
          { startFrac: 0.7, endFrac: 1.0, alpha: 0.58, width: 1.85 },
        ];

        for (let b = 0; b < 4; b++) {
          const rgb = TRAIL_STROKE_RGB[b];
          for (let t = 0; t < tiers.length; t++) {
            const tier = tiers[t];
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${rgb}, ${tier.alpha})`;
            ctx.lineWidth = tier.width;

            for (let i = 0; i < particles.length; i++) {
              const pt = particles[i];
              if (pt.colorBucket !== b || pt.trailCount < 3) continue;

              const len = pt.trailCount;
              const startIdx = Math.floor(tier.startFrac * (len - 1));
              const endIdx = Math.min(len - 1, Math.ceil(tier.endFrac * (len - 1)));
              if (endIdx <= startIdx) continue;

              const oldest =
                pt.trailCount === TRAIL_LENGTH ? pt.trailHead : 0;

              let idx0 = (oldest + startIdx) % TRAIL_LENGTH;
              ctx.moveTo(pt.trailX[idx0], pt.trailY[idx0]);
              for (let k = startIdx + 1; k <= endIdx; k++) {
                idx0 = (oldest + k) % TRAIL_LENGTH;
                ctx.lineTo(pt.trailX[idx0], pt.trailY[idx0]);
              }
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 10. Orbiting Particles (Additive pre-rendered glow sprites)
      if (particles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < particles.length; i++) {
          const pt = particles[i];
          const sprite = eng.sprites[pt.colorBucket];
          const glowRadius = pt.size * (2.6 + pt.heat * 1.9);
          ctx.drawImage(
            sprite,
            pt.x - glowRadius,
            pt.y - glowRadius,
            glowRadius * 2,
            glowRadius * 2
          );
        }
        ctx.restore();
      }

      // 11. Click Spawn Ripples
      if (eng.ripples.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < eng.ripples.length; i++) {
          const rp = eng.ripples[i];
          ctx.strokeStyle = `rgba(34, 211, 238, ${(rp.life * 0.55).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 12. Interactive Slingshot Velocity Vector & Predicted Orbital Trajectory Preview
      const drag = eng.drag;
      if (drag.active && drag.isDragging) {
        const { startX, startY, currentX, currentY } = drag;
        const launchScale = 2.35;
        const vx0 = (currentX - startX) * launchScale;
        const vy0 = (currentY - startY) * launchScale;
        const speedVal = Math.hypot(vx0, vy0);

        ctx.save();

        // Simulate short future orbital path for live predictive trajectory line
        let px = startX;
        let py = startY;
        let pvx = vx0;
        let pvy = vy0;
        const predDt = 0.025;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let step = 0; step < 54; step++) {
          const [ax, ay] = computeAcceleration(
            px,
            py,
            pvx,
            pvy,
            cx,
            cy,
            mu,
            softeningSq,
            eventHorizonRadius
          );
          pvx += ax * predDt;
          pvy += ay * predDt;
          px += pvx * predDt;
          py += pvy * predDt;
          ctx.lineTo(px, py);
          if (Math.hypot(px - cx, py - cy) < eventHorizonRadius) break;
        }
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);

        // Origin glowing node
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(startX, startY, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(startX, startY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Velocity vector line
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        // Vector arrowhead
        const angle = Math.atan2(currentY - startY, currentX - startX);
        const headLen = 10;
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(
          currentX - headLen * Math.cos(angle - Math.PI / 6),
          currentY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          currentX - headLen * Math.cos(angle + Math.PI / 6),
          currentY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        // Scientific velocity HUD tag near pointer
        const label = `v₀ ${(speedVal * 1.4).toFixed(0)} km/s`;
        ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const textWidth = ctx.measureText(label).width;
        const tx = Math.min(w - textWidth - 20, Math.max(14, currentX + 14));
        const ty = Math.max(24, currentY - 12);
        ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx - 6, ty - 13, textWidth + 12, 20, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#67e8f9';
        ctx.fillText(label, tx, ty);

        ctx.restore();
      }

      ctx.restore();

      // ----------------------------------------------------------------------
      // THROTTLED REACT TELEMETRY SYNC (~6-7 Hz)
      // ----------------------------------------------------------------------
      if (now - eng.lastTelemetrySync > 150) {
        eng.lastTelemetrySync = now;
        setTelemetry({
          activeParticles: eng.particles.length,
          absorbedCount: eng.absorbedCount,
          fps: eng.currentFps,
        });
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Derived scientific display mass (scaled to Sagittarius A* ~ 4.30 x 10^6 Solar Masses)
  const solarMassDisplay = (params.gravity * 4.3).toFixed(2);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#02040b] text-slate-100 select-none font-sans">
      {/* Custom precision instrument slider styles */}
      <style>{`
        .cosmic-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
        }
        .cosmic-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #e0f2fe;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.75);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .cosmic-slider::-webkit-slider-thumb:hover {
          transform: scale(1.18);
          box-shadow: 0 0 14px rgba(168, 85, 247, 0.9);
        }
        .cosmic-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #e0f2fe;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 10px rgba(34, 211, 238, 0.75);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
      `}</style>

      {/* FULLSCREEN PROCEDURAL HTML5 CANVAS */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerInteraction}
        onPointerCancel={finishPointerInteraction}
        className="block w-full h-full cursor-crosshair touch-none"
        aria-label="Interactive Black Hole Simulation Canvas"
      />

      {/* TOP-LEFT FLOATING TITLE BADGE & LIVE SCIENTIFIC TELEMETRY */}
      <header className="pointer-events-none fixed top-3 left-3 sm:top-5 sm:left-5 z-20 flex flex-col gap-2.5 max-w-[calc(100vw-5.5rem)]">
        {/* Title Badge */}
        <div className="pointer-events-auto inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-950/65 backdrop-blur-md border border-cyan-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.65)] w-fit">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {!params.isPaused && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                params.isPaused
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]'
              }`}
            />
          </span>
          <div className="flex flex-col">
            <h1 className="text-xs sm:text-sm font-semibold tracking-[0.22em] text-slate-100 leading-none">
              BLACK HOLE PLAYGROUND
            </h1>
            <span className="text-[10px] font-mono tracking-wider text-cyan-300/70 mt-1">
              {params.isPaused ? 'SIMULATION PAUSED' : 'RELATIVISTIC ORBITAL LAB'}
            </span>
          </div>
        </div>

        {/* Scientific Telemetry Strip */}
        <div className="pointer-events-auto grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden bg-cyan-400/15 border border-cyan-400/15 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.55)] w-fit">
          <div className="bg-slate-950/75 px-3 py-1.5 min-w-[76px]">
            <div className="text-[9px] uppercase tracking-widest text-slate-400">Active</div>
            <div className="font-mono text-xs sm:text-sm font-semibold text-cyan-300 tabular-nums">
              {telemetry.activeParticles}
            </div>
          </div>
          <div className="bg-slate-950/75 px-3 py-1.5 min-w-[76px]">
            <div className="text-[9px] uppercase tracking-widest text-slate-400">Absorbed</div>
            <div className="font-mono text-xs sm:text-sm font-semibold text-purple-300 tabular-nums">
              {telemetry.absorbedCount}
            </div>
          </div>
          <div className="bg-slate-950/75 px-3 py-1.5 min-w-[96px]">
            <div className="text-[9px] uppercase tracking-widest text-slate-400">Gravity</div>
            <div className="font-mono text-xs sm:text-sm font-semibold text-slate-100 tabular-nums">
              {solarMassDisplay}
              <span className="text-[10px] text-cyan-300/80 ml-0.5">M₆</span>
            </div>
          </div>
          <div className="bg-slate-950/75 px-3 py-1.5 min-w-[64px]">
            <div className="text-[9px] uppercase tracking-widest text-slate-400">FPS</div>
            <div className="font-mono text-xs sm:text-sm font-semibold text-emerald-300 tabular-nums">
              {telemetry.fps}
            </div>
          </div>
        </div>
      </header>

      {/* TOP-RIGHT COLLAPSIBLE CONTROL DECK */}
      <aside className="fixed top-3 right-3 sm:top-5 sm:right-5 z-30 flex flex-col items-end">
        {!controlsOpen ? (
          <button
            type="button"
            onClick={() => setControlsOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-900/85 backdrop-blur-md border border-cyan-400/25 hover:border-cyan-400/50 text-cyan-200 shadow-[0_8px_32px_rgba(0,0,0,0.65)] transition-all duration-200 cursor-pointer"
            title="Open Simulation Controls"
          >
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline text-xs font-medium tracking-widest uppercase">
              Controls
            </span>
          </button>
        ) : (
          <div className="w-[272px] sm:w-[292px] rounded-2xl bg-slate-950/72 backdrop-blur-xl border border-cyan-400/20 shadow-[0_12px_42px_rgba(0,0,0,0.75)] overflow-hidden transition-all duration-200">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 via-transparent to-purple-500/10">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-200">
                  Control Deck
                </span>
              </div>
              <button
                type="button"
                onClick={() => setControlsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title="Collapse Controls"
                aria-label="Collapse Controls"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Panel Body */}
            <div className="p-4 space-y-4">
              {/* 1. Gravitational Strength Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="gravity-slider"
                    className="flex items-center gap-1.5 text-slate-300 font-medium"
                  >
                    <Orbit className="w-3.5 h-3.5 text-cyan-400" />
                    Gravity Strength
                  </label>
                  <span className="font-mono text-cyan-300 tabular-nums text-[11px]">
                    {params.gravity.toFixed(2)} G₀
                  </span>
                </div>
                <input
                  id="gravity-slider"
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  value={params.gravity}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, gravity: parseFloat(e.target.value) }))
                  }
                  style={{
                    background: `linear-gradient(to right, #22d3ee 0%, #a855f7 ${
                      ((params.gravity - 0.2) / 2.8) * 100
                    }%, rgba(148,163,184,0.22) ${
                      ((params.gravity - 0.2) / 2.8) * 100
                    }%, rgba(148,163,184,0.22) 100%)`,
                  }}
                  className="cosmic-slider w-full"
                />
              </div>

              {/* 2. Particle Speed Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="speed-slider"
                    className="flex items-center gap-1.5 text-slate-300 font-medium"
                  >
                    <Gauge className="w-3.5 h-3.5 text-purple-400" />
                    Particle Speed
                  </label>
                  <span className="font-mono text-purple-300 tabular-nums text-[11px]">
                    {params.speed.toFixed(2)}×
                  </span>
                </div>
                <input
                  id="speed-slider"
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  value={params.speed}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, speed: parseFloat(e.target.value) }))
                  }
                  style={{
                    background: `linear-gradient(to right, #22d3ee 0%, #a855f7 ${
                      ((params.speed - 0.2) / 2.8) * 100
                    }%, rgba(148,163,184,0.22) ${
                      ((params.speed - 0.2) / 2.8) * 100
                    }%, rgba(148,163,184,0.22) 100%)`,
                  }}
                  className="cosmic-slider w-full"
                />
              </div>

              {/* 3. Particle Count Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="count-slider"
                    className="flex items-center gap-1.5 text-slate-300 font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Particle Count
                  </label>
                  <span className="font-mono text-cyan-300 tabular-nums text-[11px]">
                    {params.targetParticles}
                  </span>
                </div>
                <input
                  id="count-slider"
                  type="range"
                  min={50}
                  max={1200}
                  step={10}
                  value={params.targetParticles}
                  onChange={(e) =>
                    setParams((prev) => ({
                      ...prev,
                      targetParticles: parseInt(e.target.value, 10),
                    }))
                  }
                  style={{
                    background: `linear-gradient(to right, #22d3ee 0%, #a855f7 ${
                      ((params.targetParticles - 50) / 1150) * 100
                    }%, rgba(148,163,184,0.22) ${
                      ((params.targetParticles - 50) / 1150) * 100
                    }%, rgba(148,163,184,0.22) 100%)`,
                  }}
                  className="cosmic-slider w-full"
                />
              </div>

              <div className="h-px bg-white/10" />

              {/* 4. Toggle Switches: Particle Trails & Auto-Replenish */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={params.showTrails}
                  onClick={() =>
                    setParams((prev) => ({ ...prev, showTrails: !prev.showTrails }))
                  }
                  className="w-full flex items-center justify-between py-1 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Particle Trails
                  </span>
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      params.showTrails
                        ? 'bg-gradient-to-r from-cyan-500 to-purple-500 shadow-[0_0_10px_rgba(34,211,238,0.45)]'
                        : 'bg-slate-700/80'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
                        params.showTrails ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={params.autoReplenish}
                  onClick={() =>
                    setParams((prev) => ({ ...prev, autoReplenish: !prev.autoReplenish }))
                  }
                  className="w-full flex items-center justify-between py-1 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                    Auto-Replenish
                  </span>
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      params.autoReplenish
                        ? 'bg-gradient-to-r from-cyan-500 to-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.45)]'
                        : 'bg-slate-700/80'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
                        params.autoReplenish ? 'translate-x-4.5' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div className="h-px bg-white/10" />

              {/* 5. Primary Simulation Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={togglePause}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer border ${
                    params.isPaused
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400/50 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                      : 'bg-slate-900/80 hover:bg-slate-800/90 border-white/15 text-slate-200'
                  }`}
                >
                  {params.isPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => resetSimulation(false)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold tracking-wide bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 hover:border-purple-400/55 text-purple-200 transition-all duration-200 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              {/* Subtle Restore Defaults Link */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => resetSimulation(true)}
                  className="text-[10px] font-mono uppercase tracking-widest text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer py-0.5"
                >
                  Restore Default Parameters
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* BOTTOM-LEFT SUBTLE INTERACTION HINT */}
      <div className="pointer-events-none fixed bottom-3 left-3 sm:bottom-5 sm:left-5 z-20">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/55 backdrop-blur-md border border-white/10 text-[11px] text-slate-300/85 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80" />
          <span>
            Click anywhere to spawn stars <span className="text-cyan-400/70 mx-1">•</span> Drag to
            slingshot
            <span className="hidden sm:inline text-slate-400/80">
              <span className="text-cyan-400/70 mx-1">•</span> Space to pause
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}