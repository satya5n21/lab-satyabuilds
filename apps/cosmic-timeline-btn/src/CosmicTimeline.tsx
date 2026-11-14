import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Compass,
  Sparkles,
  Info,
} from 'lucide-react';

// ============================================================================
// 1. COSMIC DATA & ASTROPHYSICS INTERPOLATION ENGINE
// ============================================================================

export interface CosmicStage {
  id: number;
  code: string;
  title: string;
  range: [number, number];
  peak: number;
  ageLabel: string;
  description: string;
  discovery: string;
  palette: {
    primary: string;
    secondary: string;
    core: string;
    accent: string;
  };
}

export interface CosmicMilestone {
  id: string;
  label: string;
  shortLabel: string;
  progress: number;
  age: string;
  stageIndex: number;
}

export const COSMIC_STAGES: CosmicStage[] = [
  {
    id: 1,
    code: 'STAGE 01',
    title: 'THE BIG BANG',
    range: [0.0, 0.1],
    peak: 0.03,
    ageLabel: '0 YEARS',
    description:
      'Space, time, matter, and energy erupt from an unimaginably hot, dense primordial state, expanding faster than light during cosmic inflation.',
    discovery: 'Cosmic Expansion & Inflationary Epoch (10⁻³⁶ s)',
    palette: {
      primary: '#fff7ed',
      secondary: '#fb923c',
      core: '#fde047',
      accent: '#f97316',
    },
  },
  {
    id: 2,
    code: 'STAGE 02',
    title: 'THE PRIMORDIAL UNIVERSE',
    range: [0.1, 0.22],
    peak: 0.16,
    ageLabel: '~380,000 YEARS',
    description:
      'A seething plasma of protons, electrons, and photons cools enough for the first neutral atoms to form, releasing the Cosmic Microwave Background.',
    discovery: 'Recombination & First Light — The CMB Afterglow',
    palette: {
      primary: '#f59e0b',
      secondary: '#0d9488',
      core: '#fcd34d',
      accent: '#38bdf8',
    },
  },
  {
    id: 3,
    code: 'STAGE 03',
    title: 'THE DARK AGES',
    range: [0.22, 0.34],
    peak: 0.28,
    ageLabel: '~50 MILLION YEARS',
    description:
      'Before any stars exist, vast cold clouds of neutral hydrogen drift through darkness as dark matter filaments quietly gather gas by gravity.',
    discovery: '21-cm Hydrogen Line & Primordial Density Halos',
    palette: {
      primary: '#312e81',
      secondary: '#1e1b4b',
      core: '#6366f1',
      accent: '#38bdf8',
    },
  },
  {
    id: 4,
    code: 'STAGE 04',
    title: 'THE FIRST STARS',
    range: [0.34, 0.47],
    peak: 0.4,
    ageLabel: '~200 MILLION YEARS',
    description:
      'Enormous blue-white Population III stars ignite inside dense gas clouds, ending the Dark Ages and forging the first heavy elements in supernovae.',
    discovery: 'Cosmic Dawn & Pair-Instability Supernovae',
    palette: {
      primary: '#38bdf8',
      secondary: '#818cf8',
      core: '#e0f2fe',
      accent: '#c084fc',
    },
  },
  {
    id: 5,
    code: 'STAGE 05',
    title: 'THE FIRST GALAXIES',
    range: [0.47, 0.6],
    peak: 0.54,
    ageLabel: '~1 BILLION YEARS',
    description:
      'Gravity weaves early star clusters and gas into turbulent proto-galaxies, merging together around ravenous young supermassive black holes.',
    discovery: 'JWST High-Redshift Galaxies & Quasar Jets',
    palette: {
      primary: '#a855f7',
      secondary: '#06b6d4',
      core: '#f0abfc',
      accent: '#22d3ee',
    },
  },
  {
    id: 6,
    code: 'STAGE 06',
    title: 'THE AGE OF GALAXIES',
    range: [0.6, 0.74],
    peak: 0.67,
    ageLabel: '~5 BILLION YEARS',
    description:
      'Cosmic Noon fills the universe with grand spiral and elliptical galaxies, brilliant stellar nurseries, and supermassive black holes warping spacetime.',
    discovery: 'Gravitational Lensing & Peak Cosmic Star Formation',
    palette: {
      primary: '#ec4899',
      secondary: '#8b5cf6',
      core: '#fbbf24',
      accent: '#38bdf8',
    },
  },
  {
    id: 7,
    code: 'STAGE 07',
    title: 'FORMATION OF OUR SOLAR SYSTEM',
    range: [0.74, 0.87],
    peak: 0.81,
    ageLabel: '~9.2 BILLION YEARS',
    description:
      'A collapsing molecular cloud ignites our young Sun, while a swirling protoplanetary disk condenses into eight worlds—including a cooling, ocean-bound Earth.',
    discovery: 'Protoplanetary Accretion Disk (4.6 Billion Years Ago)',
    palette: {
      primary: '#fbbf24',
      secondary: '#0284c7',
      core: '#fef08a',
      accent: '#34d399',
    },
  },
  {
    id: 8,
    code: 'STAGE 08',
    title: 'THE MODERN UNIVERSE',
    range: [0.87, 1.0],
    peak: 0.96,
    ageLabel: '13.8 BILLION YEARS',
    description:
      'Our mature Milky Way shines among hundreds of billions of galaxies woven across the cosmic web—a vast, living universe looking back at its own origins.',
    discovery: 'Observable Cosmos • Milky Way Orion Arm (Present Day)',
    palette: {
      primary: '#38bdf8',
      secondary: '#c084fc',
      core: '#fde68a',
      accent: '#f472b6',
    },
  },
];

export const COSMIC_MILESTONES: CosmicMilestone[] = [
  {
    id: 'big-bang',
    label: 'Big Bang',
    shortLabel: 'Big Bang',
    progress: 0.0,
    age: '0 yrs',
    stageIndex: 0,
  },
  {
    id: 'first-light',
    label: 'First Light',
    shortLabel: 'First Light',
    progress: 0.16,
    age: '~380k yrs',
    stageIndex: 1,
  },
  {
    id: 'first-stars',
    label: 'First Stars',
    shortLabel: 'First Stars',
    progress: 0.4,
    age: '~200M yrs',
    stageIndex: 3,
  },
  {
    id: 'galaxies',
    label: 'Galaxies',
    shortLabel: 'Galaxies',
    progress: 0.54,
    age: '~1B yrs',
    stageIndex: 4,
  },
  {
    id: 'black-holes',
    label: 'Black Holes',
    shortLabel: 'Black Holes',
    progress: 0.67,
    age: '~5B yrs',
    stageIndex: 5,
  },
  {
    id: 'solar-system',
    label: 'Solar System',
    shortLabel: 'Solar Sys',
    progress: 0.81,
    age: '~9.2B yrs',
    stageIndex: 6,
  },
  {
    id: 'today',
    label: 'Today',
    shortLabel: 'Today',
    progress: 0.96,
    age: '13.8B yrs',
    stageIndex: 7,
  },
];

/**
 * Computes smooth cross-fading weights [0..1] for each of the 8 stages at progress p in [0..1].
 */
function getStageWeights(p: number): number[] {
  const clamped = Math.max(0, Math.min(1, p));
  const raw = COSMIC_STAGES.map((stage, idx) => {
    const [start, end] = stage.range;
    const fade = 0.048;
    const inStart = idx === 0 ? -0.1 : start - fade;
    const inEnd = idx === 0 ? 0.0 : start + fade;
    const outStart = idx === COSMIC_STAGES.length - 1 ? 1.0 : end - fade;
    const outEnd = idx === COSMIC_STAGES.length - 1 ? 1.1 : end + fade;

    const smooth = (edge0: number, edge1: number, x: number) => {
      if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    const fadeIn = smooth(inStart, inEnd, clamped);
    const fadeOut = 1 - smooth(outStart, outEnd, clamped);
    return Math.max(0, fadeIn * fadeOut);
  });

  const sum = raw.reduce((acc, v) => acc + v, 0) || 1;
  return raw.map((v) => v / sum);
}

/**
 * Formats a continuous scientifically grounded cosmic age readout from normalized progress [0..1].
 */
function formatCosmicAge(p: number): { value: string; suffix: string } {
  const t = Math.max(0, Math.min(1, p));
  if (t < 0.012) {
    return { value: '0', suffix: 'YEARS • SINGULARITY' };
  }
  if (t < 0.08) {
    const years = Math.round(Math.pow(t / 0.08, 2.4) * 10000);
    return {
      value: `~${Math.max(1, years).toLocaleString()}`,
      suffix: 'YEARS',
    };
  }
  if (t < 0.2) {
    // Interpolate smoothly around 380,000 years at t=0.16
    const local = (t - 0.08) / 0.12;
    const kyrs = Math.round(10 + local * 560);
    return {
      value: `~${(kyrs * 1000).toLocaleString()}`,
      suffix: 'YEARS',
    };
  }
  if (t < 0.34) {
    // 1M to 120M years
    const local = (t - 0.2) / 0.14;
    const myrs = Math.round(1 + Math.pow(local, 1.3) * 119);
    return {
      value: `~${myrs}`,
      suffix: 'MILLION YEARS',
    };
  }
  if (t < 0.52) {
    // 120M to 850M years (200M around t=0.40)
    const local = (t - 0.34) / 0.18;
    const myrs = Math.round(120 + Math.pow(local, 1.45) * 730);
    return {
      value: `~${myrs}`,
      suffix: 'MILLION YEARS',
    };
  }
  if (t < 0.945) {
    // 0.85B to 13.5B years (passes ~5B at 0.67 and ~9.2B at 0.81)
    const local = (t - 0.52) / 0.425;
    const byrs = 0.85 + local * 12.65;
    return {
      value: `~${byrs.toFixed(1)}`,
      suffix: 'BILLION YEARS',
    };
  }
  return {
    value: '13.8',
    suffix: 'BILLION YEARS • TODAY',
  };
}

function getActiveStage(p: number): CosmicStage {
  const clamped = Math.max(0, Math.min(1, p));
  for (let i = 0; i < COSMIC_STAGES.length; i++) {
    const [start, end] = COSMIC_STAGES[i].range;
    if (clamped >= start && clamped <= end) {
      return COSMIC_STAGES[i];
    }
  }
  return COSMIC_STAGES[COSMIC_STAGES.length - 1];
}

// ============================================================================
// 2. SYNTHESIZED WEB AUDIO API AMBIENT SPACE SOUNDSCAPE
// ============================================================================

class CosmicSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private shimmerGain: GainNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private fifthOsc: OscillatorNode | null = null;
  private padOsc: OscillatorNode | null = null;
  private shimmerOsc: OscillatorNode | null = null;
  private enabled = false;

  public toggle(): boolean {
    if (!this.enabled) {
      this.enable();
    } else {
      this.disable();
    }
    return this.enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public enable(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.ctx = new AudioCtx();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.droneFilter = this.ctx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.setValueAtTime(140, this.ctx.currentTime);
        this.droneFilter.Q.setValueAtTime(2.2, this.ctx.currentTime);
        this.droneFilter.connect(this.masterGain);

        // Deep cosmic sub-drone (A1 = 55Hz)
        this.subOsc = this.ctx.createOscillator();
        this.subOsc.type = 'sine';
        this.subOsc.frequency.setValueAtTime(55, this.ctx.currentTime);
        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(0.42, this.ctx.currentTime);
        this.subOsc.connect(subGain);
        subGain.connect(this.droneFilter);
        this.subOsc.start();

        // Warm fifth harmonic (E2 = 82.41Hz)
        this.fifthOsc = this.ctx.createOscillator();
        this.fifthOsc.type = 'triangle';
        this.fifthOsc.frequency.setValueAtTime(82.41, this.ctx.currentTime);
        const fifthGain = this.ctx.createGain();
        fifthGain.gain.setValueAtTime(0.22, this.ctx.currentTime);
        this.fifthOsc.connect(fifthGain);
        fifthGain.connect(this.droneFilter);
        this.fifthOsc.start();

        // Ethereal cosmic pad (B2 = 123.47Hz)
        this.padOsc = this.ctx.createOscillator();
        this.padOsc.type = 'sine';
        this.padOsc.frequency.setValueAtTime(123.47, this.ctx.currentTime);
        const padGain = this.ctx.createGain();
        padGain.gain.setValueAtTime(0.14, this.ctx.currentTime);
        this.padOsc.connect(padGain);
        padGain.connect(this.droneFilter);
        this.padOsc.start();

        // High crystalline velocity shimmer
        this.shimmerOsc = this.ctx.createOscillator();
        this.shimmerOsc.type = 'sine';
        this.shimmerOsc.frequency.setValueAtTime(440, this.ctx.currentTime);
        this.shimmerGain = this.ctx.createGain();
        this.shimmerGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        this.shimmerOsc.connect(this.shimmerGain);
        this.shimmerGain.connect(this.masterGain);
        this.shimmerOsc.start();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.enabled = true;
      if (this.masterGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(0.26, now, 0.45);
      }
    } catch {
      this.enabled = false;
    }
  }

  public disable(): void {
    this.enabled = false;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
    }
  }

  /**
   * Modulates cosmic drone timbre smoothly according to timeline progress and orb velocity.
   */
  public update(progress: number, velocity: number): void {
    if (!this.enabled || !this.ctx || !this.droneFilter || !this.shimmerGain) {
      return;
    }
    const now = this.ctx.currentTime;
    // Lower cutoff during the Dark Ages (p ~ 0.28), richer harmonics at Big Bang & Modern Universe
    const darkAgesDip = Math.exp(-Math.pow((progress - 0.28) / 0.1, 2));
    const targetCutoff = 110 + progress * 220 - darkAgesDip * 55;
    this.droneFilter.frequency.setTargetAtTime(
      Math.max(65, targetCutoff),
      now,
      0.12
    );

    if (this.padOsc) {
      const targetPadFreq = 110 + progress * 55;
      this.padOsc.frequency.setTargetAtTime(targetPadFreq, now, 0.2);
    }

    if (this.shimmerOsc) {
      const speed = Math.min(1, Math.abs(velocity) * 18);
      const shimmerFreq = 330 + progress * 440 + speed * 120;
      this.shimmerOsc.frequency.setTargetAtTime(shimmerFreq, now, 0.08);
      this.shimmerGain.gain.setTargetAtTime(speed * 0.045, now, 0.08);
    }
  }

  /**
   * Plays a delicate crystalline harmonic chime when reaching a cosmic milestone.
   */
  public playMilestoneChime(progress: number): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      // Pentatonic cosmic frequencies mapped across the timeline
      const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25];
      const idx = Math.min(
        notes.length - 1,
        Math.floor(progress * notes.length)
      );
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[idx], now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.4);
    } catch {
      // Ignore transient audio scheduling issues
    }
  }

  public dispose(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

// ============================================================================
// 3. DETERMINISTIC PSEUDO-RANDOM & PROCEDURAL COSMIC ENTITIES
// ============================================================================

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface StarParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  hue: number;
  sat: number;
  twinkleSpeed: number;
  twinklePhase: number;
  layer: number;
}

interface DeepGalaxy {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  spinSpeed: number;
  hue: number;
  isSpiral: boolean;
  arms: number;
  stageMin: number;
}

interface PrimordialParticle {
  angle: number;
  radiusNorm: number;
  speed: number;
  size: number;
  hue: number;
  phase: number;
}

// ============================================================================
// 4. AMBIENT DEEP-SPACE STARFIELD BACKDROP COMPONENT
// ============================================================================

interface AmbientSpaceBackgroundProps {
  progress: number;
  reducedMotion: boolean;
}

const AmbientSpaceBackground: React.FC<AmbientSpaceBackgroundProps> = ({
  progress,
  reducedMotion,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (reducedMotion) return;
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      pointerRef.current.targetX = nx;
      pointerRef.current.targetY = ny;
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rand = seededRandom(90210);
    const stars: StarParticle[] = Array.from({ length: 190 }, () => ({
      x: rand(),
      y: rand(),
      size: 0.4 + Math.pow(rand(), 2.4) * 1.9,
      alpha: 0.25 + rand() * 0.75,
      hue: rand() < 0.25 ? 198 : rand() < 0.5 ? 265 : 42,
      sat: rand() < 0.35 ? 65 : 15,
      twinkleSpeed: 0.6 + rand() * 1.8,
      twinklePhase: rand() * Math.PI * 2,
      layer: 0.25 + rand() * 0.75,
    }));

    let animId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    const render = (now: number) => {
      const t = Math.max(0, (now - startTime) * 0.001);
      const p = Math.max(0, Math.min(1, progressRef.current));

      if (width <= 0 || height <= 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      pointerRef.current.x +=
        (pointerRef.current.targetX - pointerRef.current.x) * 0.04;
      pointerRef.current.y +=
        (pointerRef.current.targetY - pointerRef.current.y) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Subtle drifting cosmic nebulae in the deep background
      const px = pointerRef.current.x * 18;
      const py = pointerRef.current.y * 14;

      const neb1 = ctx.createRadialGradient(
        width * 0.22 + px * 0.5,
        height * 0.28 + py * 0.5,
        10,
        width * 0.22 + px * 0.5,
        height * 0.28 + py * 0.5,
        Math.max(width, height) * 0.48
      );
      neb1.addColorStop(0, `rgba(76, 29, 149, ${0.14 + p * 0.06})`);
      neb1.addColorStop(0.55, 'rgba(15, 23, 42, 0.06)');
      neb1.addColorStop(1, 'rgba(3, 4, 10, 0)');
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const neb2 = ctx.createRadialGradient(
        width * 0.78 - px * 0.6,
        height * 0.72 - py * 0.6,
        10,
        width * 0.78 - px * 0.6,
        height * 0.72 - py * 0.6,
        Math.max(width, height) * 0.46
      );
      neb2.addColorStop(0, `rgba(14, 116, 144, ${0.1 + p * 0.08})`);
      neb2.addColorStop(0.5, 'rgba(30, 27, 75, 0.05)');
      neb2.addColorStop(1, 'rgba(3, 4, 10, 0)');
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      // Ambient starfield (gently emerges after the earliest epochs)
      const visibility = 0.35 + Math.min(1, p * 1.4) * 0.65;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const sx =
          ((s.x * width + px * s.layer * 1.4) % width + width) % width;
        const sy =
          ((s.y * height + py * s.layer * 1.4) % height + height) % height;
        const twinkle = reducedMotion
          ? 0.85
          : 0.68 + 0.32 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const alpha = s.alpha * twinkle * visibility;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, 88%, ${alpha.toFixed(3)})`;
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};

// ============================================================================
// 5. COSMIC UNIVERSE + OPTICAL LIQUID-GLASS ORB CAPSULE COMPONENT
// ============================================================================

interface CosmicCapsuleProps {
  targetProgress: number;
  onProgressChange: (newProgress: number, fromUser?: boolean) => void;
  onDragStateChange: (dragging: boolean) => void;
  onMilestoneSnap: (milestone: CosmicMilestone) => void;
  soundEngine: CosmicSoundEngine;
  reducedMotion: boolean;
}

const CosmicCapsule: React.FC<CosmicCapsuleProps> = ({
  targetProgress,
  onProgressChange,
  onDragStateChange,
  onMilestoneSnap,
  soundEngine,
  reducedMotion,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Spring physics state kept in refs for 60fps animation without React re-renders
  const physicsRef = useRef({
    current: targetProgress,
    target: targetProgress,
    velocity: 0,
    isDragging: false,
    orbHover: false,
    lastChimeMilestoneId: 'big-bang',
  });

  useEffect(() => {
    physicsRef.current.target = targetProgress;
  }, [targetProgress]);

  // Pre-generated procedural cosmic datasets for deterministic, rich 60fps rendering
  const cosmicAssets = useMemo(() => {
    const rand = seededRandom(13800000000);

    const primordialParticles: PrimordialParticle[] = Array.from(
      { length: 140 },
      () => ({
        angle: rand() * Math.PI * 2,
        radiusNorm: 0.04 + Math.pow(rand(), 0.7) * 0.96,
        speed: 0.35 + rand() * 1.1,
        size: 1.1 + rand() * 2.8,
        hue: 22 + rand() * 34,
        phase: rand() * Math.PI * 2,
      })
    );

    const cmbCells = Array.from({ length: 85 }, () => ({
      x: rand(),
      y: rand(),
      r: 0.06 + rand() * 0.14,
      warm: rand() > 0.46,
      alpha: 0.16 + rand() * 0.24,
    }));

    const darkClouds = Array.from({ length: 24 }, () => ({
      x: rand(),
      y: rand(),
      rx: 0.1 + rand() * 0.18,
      ry: 0.14 + rand() * 0.24,
      drift: (rand() - 0.5) * 0.02,
      protostar: rand() > 0.58,
      phase: rand() * Math.PI * 2,
    }));

    const firstStars = Array.from({ length: 28 }, () => ({
      x: 0.08 + rand() * 0.84,
      y: 0.14 + rand() * 0.72,
      size: 1.8 + Math.pow(rand(), 1.8) * 3.8,
      hue: 192 + rand() * 38,
      phase: rand() * Math.PI * 2,
      hasSupernova: rand() > 0.74,
      snPeriod: 4.5 + rand() * 4.5,
    }));

    const deepGalaxies: DeepGalaxy[] = Array.from({ length: 22 }, (_, i) => ({
      x: 0.07 + rand() * 0.86,
      y: 0.14 + rand() * 0.72,
      rx: 12 + rand() * 26,
      ry: 6 + rand() * 14,
      angle: rand() * Math.PI,
      spinSpeed: (rand() > 0.5 ? 1 : -1) * (0.15 + rand() * 0.35),
      hue: i % 3 === 0 ? 38 : i % 3 === 1 ? 202 : 282,
      isSpiral: rand() > 0.32,
      arms: rand() > 0.5 ? 2 : 3,
      stageMin: 0.45 + rand() * 0.22,
    }));

    const backgroundStars: StarParticle[] = Array.from({ length: 260 }, () => ({
      x: rand(),
      y: rand(),
      size: 0.5 + Math.pow(rand(), 2.3) * 2.1,
      alpha: 0.3 + rand() * 0.7,
      hue: rand() < 0.3 ? 198 : rand() < 0.6 ? 42 : 278,
      sat: rand() < 0.4 ? 65 : 15,
      twinkleSpeed: 1 + rand() * 2.5,
      twinklePhase: rand() * Math.PI * 2,
      layer: 0.3 + rand() * 0.7,
    }));

    const orbInternalParticles = Array.from({ length: 22 }, () => ({
      angle: rand() * Math.PI * 2,
      dist: 0.15 + rand() * 0.65,
      speed: (rand() > 0.5 ? 1 : -1) * (0.5 + rand() * 1.1),
      size: 0.8 + rand() * 1.7,
      hue: 185 + rand() * 130,
    }));

    return {
      primordialParticles,
      cmbCells,
      darkClouds,
      firstStars,
      deepGalaxies,
      backgroundStars,
      orbInternalParticles,
    };
  }, []);

  /**
   * Converts pointer clientX into normalized timeline progress [0..1] accounting for orb radius padding.
   */
  const clientXToProgress = useCallback((clientX: number): number => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const orbRadius = Math.min(rect.height * 0.36, 54);
    const usableWidth = Math.max(1, rect.width - orbRadius * 2);
    const relX = clientX - rect.left - orbRadius;
    return Math.max(0, Math.min(1, relX / usableWidth));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    physicsRef.current.isDragging = true;
    onDragStateChange(true);
    const p = clientXToProgress(e.clientX);
    onProgressChange(p, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const orbRadius = Math.min(rect.height * 0.36, 54);
      const orbX =
        orbRadius +
        physicsRef.current.current * (rect.width - orbRadius * 2);
      const orbY = rect.height * 0.5;
      const dist = Math.hypot(
        e.clientX - rect.left - orbX,
        e.clientY - rect.top - orbY
      );
      physicsRef.current.orbHover = dist <= orbRadius * 1.15;
    }

    if (!physicsRef.current.isDragging) return;
    const p = clientXToProgress(e.clientX);
    onProgressChange(p, true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!physicsRef.current.isDragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    physicsRef.current.isDragging = false;
    onDragStateChange(false);

    // Gentle magnetic snap to nearby cosmic milestones on release
    const currentTarget = physicsRef.current.target;
    let closest: CosmicMilestone | null = null;
    let minDist = 0.024;
    for (const m of COSMIC_MILESTONES) {
      const d = Math.abs(m.progress - currentTarget);
      if (d < minDist) {
        minDist = d;
        closest = m;
      }
    }
    if (closest) {
      onProgressChange(closest.progress, true);
      onMilestoneSnap(closest);
      soundEngine.playMilestoneChime(closest.progress);
    }
  };

  // Main 60fps Canvas Render Loop (Offscreen Cosmic Scene + Refracted Liquid-Glass Lens Orb)
  useEffect(() => {
    const displayCanvas = displayCanvasRef.current;
    const container = containerRef.current;
    if (!displayCanvas || !container) return;

    const displayCtx = displayCanvas.getContext('2d');
    if (!displayCtx) return;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offCanvas = offscreenCanvasRef.current;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let animId = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(10, rect.width);
      height = Math.max(10, rect.height);

      displayCanvas.width = Math.floor(width * dpr);
      displayCanvas.height = Math.floor(height * dpr);
      displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      offCanvas.width = Math.floor(width * dpr);
      offCanvas.height = Math.floor(height * dpr);
      offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const startTime = performance.now();

    /**
     * Draws a spiral or elliptical galaxy at (gx, gy).
     */
    const drawGalaxy = (
      ctx: CanvasRenderingContext2D,
      gx: number,
      gy: number,
      rx: number,
      ry: number,
      angle: number,
      hue: number,
      isSpiral: boolean,
      arms: number,
      alpha: number,
      spin: number
    ) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(angle);
      ctx.scale(1, ry / Math.max(1, rx));

      // Galactic core glow
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      coreGrad.addColorStop(0, `hsla(44, 100%, 92%, ${alpha * 0.95})`);
      coreGrad.addColorStop(0.25, `hsla(${hue}, 85%, 70%, ${alpha * 0.65})`);
      coreGrad.addColorStop(0.65, `hsla(${hue}, 75%, 48%, ${alpha * 0.22})`);
      coreGrad.addColorStop(1, `hsla(${hue}, 75%, 30%, 0)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();

      if (isSpiral) {
        ctx.lineCap = 'round';
        for (let a = 0; a < arms; a++) {
          const baseOffset = (a * Math.PI * 2) / arms + spin;
          ctx.beginPath();
          for (let step = 0; step <= 26; step++) {
            const frac = step / 26;
            const r = frac * rx * 0.94;
            const theta = baseOffset + frac * 3.1;
            const px = Math.cos(theta) * r;
            const py = Math.sin(theta) * r;
            if (step === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = `hsla(${hue}, 90%, 76%, ${alpha * 0.42})`;
          ctx.lineWidth = Math.max(1.2, rx * 0.11);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    /**
     * Renders the complete 8-stage evolving universe into offCtx.
     */
    const renderUniverseScene = (
      ctx: CanvasRenderingContext2D,
      rawP: number,
      rawT: number,
      orbX: number,
      orbY: number
    ) => {
      const p = Math.max(0, Math.min(1, rawP));
      const t = Math.max(0, rawT);
      const weights = getStageWeights(p);
      const [w1, w2, w3, w4, w5, w6, w7, w8] = weights;
      const motionScale = reducedMotion ? 0.15 : 1;

      // Subtle camera parallax tied to orb horizontal position
      const camX = (0.5 - p) * 28 * motionScale;
      const camY = Math.sin(t * 0.22) * 3 * motionScale;

      // 1. Deep Cosmic Base Fill
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#040611');
      bgGrad.addColorStop(0.5, '#090d24');
      bgGrad.addColorStop(1, '#120826');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Ambient deep-field starlight (fades in after the Dark Ages)
      const starFieldAlpha = Math.max(0, Math.min(1, (p - 0.28) / 0.25));
      if (starFieldAlpha > 0.01) {
        for (let i = 0; i < cosmicAssets.backgroundStars.length; i++) {
          const s = cosmicAssets.backgroundStars[i];
          const sx =
            ((s.x * width + camX * s.layer) % width + width) % width;
          const sy =
            ((s.y * height + camY * s.layer) % height + height) % height;
          const twinkle = reducedMotion
            ? 0.9
            : 0.72 + 0.28 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
          const a = s.alpha * twinkle * starFieldAlpha;
          ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, 90%, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ----------------------------------------------------------------------
      // STAGE 1: THE BIG BANG (0.00 - 0.10)
      // ----------------------------------------------------------------------
      if (w1 > 0.01) {
        ctx.save();
        const cx = width * 0.18 + p * width * 1.4;
        const cy = height * 0.5;
        const localProgress = Math.max(0, Math.min(1, p / 0.1));
        const blastRadius = Math.max(
          2,
          (28 + localProgress * Math.max(width, height) * 0.88) *
            (1 + Math.sin(t * 3) * 0.02 * motionScale)
        );

        // Fiery expansion halo
        const bbGrad = ctx.createRadialGradient(
          cx,
          cy,
          1,
          cx,
          cy,
          blastRadius
        );
        bbGrad.addColorStop(0, `rgba(255, 255, 255, ${w1})`);
        bbGrad.addColorStop(0.16, `rgba(254, 240, 138, ${w1 * 0.96})`);
        bbGrad.addColorStop(0.38, `rgba(251, 146, 60, ${w1 * 0.78})`);
        bbGrad.addColorStop(0.68, `rgba(194, 65, 12, ${w1 * 0.35})`);
        bbGrad.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = bbGrad;
        ctx.fillRect(0, 0, width, height);

        // Expanding inflationary shockwave rings
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          const wavePhase = ((t * 0.45 * motionScale + rIdx * 0.33) % 1);
          const ringR =
            (18 + localProgress * 120) + wavePhase * height * 0.85;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(253, 224, 71, ${
            w1 * (1 - wavePhase) * 0.55
          })`;
          ctx.lineWidth = 2.5 - wavePhase * 1.5;
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // High-energy particle rays bursting outward
        for (let i = 0; i < 42; i++) {
          const rayAngle = (i / 42) * Math.PI * 2 + t * 0.18 * motionScale;
          const innerR = 10 + (i % 4) * 8;
          const outerR =
            innerR + (40 + localProgress * 220) * (0.65 + (i % 5) * 0.12);
          ctx.beginPath();
          ctx.moveTo(
            cx + Math.cos(rayAngle) * innerR,
            cy + Math.sin(rayAngle) * innerR
          );
          ctx.lineTo(
            cx + Math.cos(rayAngle) * outerR,
            cy + Math.sin(rayAngle) * outerR
          );
          ctx.strokeStyle = `rgba(255, 247, 237, ${w1 * 0.38})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 2: THE PRIMORDIAL UNIVERSE & CMB (0.10 - 0.22)
      // ----------------------------------------------------------------------
      if (w2 > 0.01) {
        ctx.save();
        const coolFactor = Math.max(0, Math.min(1, (p - 0.1) / 0.12));

        // Hot plasma wash transitioning into Cosmic Microwave Background glow
        const plasmaGrad = ctx.createLinearGradient(0, 0, width, height);
        plasmaGrad.addColorStop(
          0,
          `rgba(234, 88, 12, ${w2 * (0.55 - coolFactor * 0.25)})`
        );
        plasmaGrad.addColorStop(
          0.5,
          `rgba(217, 119, 6, ${w2 * 0.42})`
        );
        plasmaGrad.addColorStop(
          1,
          `rgba(13, 148, 136, ${w2 * (0.2 + coolFactor * 0.35)})`
        );
        ctx.fillStyle = plasmaGrad;
        ctx.fillRect(0, 0, width, height);

        // Cosmic Microwave Background (CMB) temperature anisotropy patches
        for (let i = 0; i < cosmicAssets.cmbCells.length; i++) {
          const cell = cosmicAssets.cmbCells[i];
          const cx =
            ((cell.x * width + Math.sin(t * 0.2 + i) * 6 * motionScale) %
              width +
              width) %
            width;
          const cy = cell.y * height;
          const rad = cell.r * Math.max(width * 0.45, height);
          const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rad);
          if (cell.warm) {
            g.addColorStop(
              0,
              `rgba(251, 191, 36, ${w2 * cell.alpha * (0.5 + coolFactor * 0.6)})`
            );
            g.addColorStop(1, 'rgba(251, 191, 36, 0)');
          } else {
            g.addColorStop(
              0,
              `rgba(14, 165, 233, ${w2 * cell.alpha * (0.4 + coolFactor * 0.7)})`
            );
            g.addColorStop(1, 'rgba(14, 165, 233, 0)');
          }
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }

        // Energetic primordial nuclei & photon scattering sparks
        const cxCenter = width * 0.5;
        const cyCenter = height * 0.5;
        for (let i = 0; i < cosmicAssets.primordialParticles.length; i++) {
          const pt = cosmicAssets.primordialParticles[i];
          const a = pt.angle + t * pt.speed * 0.35 * motionScale;
          const rx = pt.radiusNorm * width * 0.48;
          const ry = pt.radiusNorm * height * 0.44;
          const px = cxCenter + Math.cos(a) * rx;
          const py = cyCenter + Math.sin(a) * ry;
          ctx.fillStyle = `hsla(${pt.hue}, 95%, 72%, ${
            w2 * (0.75 - coolFactor * 0.3)
          })`;
          ctx.beginPath();
          ctx.arc(px, py, pt.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 3: THE DARK AGES (0.22 - 0.34)
      // ----------------------------------------------------------------------
      if (w3 > 0.01) {
        ctx.save();
        // Deep neutral hydrogen veil
        ctx.fillStyle = `rgba(4, 6, 18, ${w3 * 0.72})`;
        ctx.fillRect(0, 0, width, height);

        const lateDarkAges = Math.max(0, Math.min(1, (p - 0.25) / 0.09));

        for (let i = 0; i < cosmicAssets.darkClouds.length; i++) {
          const cloud = cosmicAssets.darkClouds[i];
          const cx =
            ((cloud.x * width + t * cloud.drift * width * motionScale) %
              width +
              width) %
            width;
          const cy = cloud.y * height;
          const rad = Math.max(cloud.rx * width, cloud.ry * height);
          const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
          cg.addColorStop(0, `rgba(49, 46, 129, ${w3 * 0.34})`);
          cg.addColorStop(0.55, `rgba(30, 27, 75, ${w3 * 0.22})`);
          cg.addColorStop(1, 'rgba(3, 4, 10, 0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();

          // Faint protostellar gravitational collapse embers near the end of the Dark Ages
          if (cloud.protostar && lateDarkAges > 0.1) {
            const pulse =
              0.65 + 0.35 * Math.sin(t * 2.2 + cloud.phase) * motionScale;
            const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
            pg.addColorStop(
              0,
              `rgba(125, 211, 252, ${w3 * lateDarkAges * 0.75 * pulse})`
            );
            pg.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 4: THE FIRST STARS & SUPERNOVAE (0.34 - 0.47)
      // ----------------------------------------------------------------------
      if (w4 > 0.01) {
        ctx.save();
        // Ionized primordial H-II nebulae
        const nebGrad = ctx.createRadialGradient(
          width * 0.42 + camX,
          height * 0.48,
          10,
          width * 0.42 + camX,
          height * 0.48,
          width * 0.55
        );
        nebGrad.addColorStop(0, `rgba(56, 189, 248, ${w4 * 0.24})`);
        nebGrad.addColorStop(0.55, `rgba(99, 102, 241, ${w4 * 0.16})`);
        nebGrad.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = nebGrad;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < cosmicAssets.firstStars.length; i++) {
          const st = cosmicAssets.firstStars[i];
          const sx = st.x * width + camX * 1.1;
          const sy = st.y * height + camY;
          const pulse =
            0.82 + 0.18 * Math.sin(t * 2.6 + st.phase) * motionScale;
          const r = st.size * pulse;

          // Luminous stellar halo
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 9);
          halo.addColorStop(0, `hsla(${st.hue}, 100%, 96%, ${w4 * 0.95})`);
          halo.addColorStop(0.28, `hsla(${st.hue}, 95%, 72%, ${w4 * 0.52})`);
          halo.addColorStop(1, `hsla(${st.hue}, 90%, 50%, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(sx, sy, r * 9, 0, Math.PI * 2);
          ctx.fill();

          // Crisp 4-point diffraction spikes on massive Population III stars
          if (st.size > 3.1) {
            const spikeLen = r * 7.5;
            ctx.strokeStyle = `hsla(${st.hue}, 100%, 92%, ${w4 * 0.65})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - spikeLen, sy);
            ctx.lineTo(sx + spikeLen, sy);
            ctx.moveTo(sx, sy - spikeLen);
            ctx.lineTo(sx, sy + spikeLen);
            ctx.stroke();
          }

          // Supernova explosion shockwaves enriching space with heavy elements
          if (st.hasSupernova && !reducedMotion) {
            const snCycle = ((t + st.phase) % st.snPeriod) / st.snPeriod;
            if (snCycle < 0.55) {
              const snProg = snCycle / 0.55;
              const snR = 6 + snProg * 54;
              ctx.beginPath();
              ctx.strokeStyle = `hsla(${285 - snProg * 95}, 95%, 72%, ${
                w4 * (1 - snProg) * 0.72
              })`;
              ctx.lineWidth = 2.2 * (1 - snProg * 0.6);
              ctx.arc(sx, sy, snR, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 5: THE FIRST GALAXIES & QUASARS (0.47 - 0.60)
      // ----------------------------------------------------------------------
      if (w5 > 0.01) {
        ctx.save();
        // Merging proto-galaxy pair with luminous tidal bridge
        const g1x = width * 0.34 + camX;
        const g1y = height * 0.46;
        const g2x = width * 0.52 + camX;
        const g2y = height * 0.56;

        // Tidal bridge of stars and gas
        const bridgeGrad = ctx.createLinearGradient(g1x, g1y, g2x, g2y);
        bridgeGrad.addColorStop(0, `rgba(192, 132, 252, ${w5 * 0.45})`);
        bridgeGrad.addColorStop(0.5, `rgba(56, 189, 248, ${w5 * 0.35})`);
        bridgeGrad.addColorStop(1, `rgba(244, 114, 182, ${w5 * 0.45})`);
        ctx.strokeStyle = bridgeGrad;
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g1x, g1y);
        ctx.quadraticCurveTo(
          (g1x + g2x) * 0.5,
          (g1y + g2y) * 0.5 - 24,
          g2x,
          g2y
        );
        ctx.stroke();

        drawGalaxy(
          ctx,
          g1x,
          g1y,
          44,
          24,
          -0.35,
          275,
          true,
          2,
          w5 * 0.9,
          t * 0.35 * motionScale
        );
        drawGalaxy(
          ctx,
          g2x,
          g2y,
          36,
          20,
          0.45,
          198,
          true,
          2,
          w5 * 0.85,
          -t * 0.42 * motionScale
        );

        // Early Active Galactic Nucleus / Quasar with twin relativistic jets
        const qx = width * 0.74 + camX;
        const qy = height * 0.44;
        ctx.save();
        ctx.translate(qx, qy);
        ctx.rotate(-0.42);
        const jetGrad = ctx.createLinearGradient(0, -88, 0, 88);
        jetGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
        jetGrad.addColorStop(0.35, `rgba(34, 211, 238, ${w5 * 0.55})`);
        jetGrad.addColorStop(0.5, `rgba(255, 255, 255, ${w5 * 0.95})`);
        jetGrad.addColorStop(0.65, `rgba(192, 132, 252, ${w5 * 0.55})`);
        jetGrad.addColorStop(1, 'rgba(192, 132, 252, 0)');
        ctx.fillStyle = jetGrad;
        ctx.fillRect(-3, -88, 6, 176);

        // Glowing accretion disk
        ctx.fillStyle = `rgba(251, 191, 36, ${w5 * 0.85})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 6: THE AGE OF GALAXIES & GRAVITATIONAL LENSING (0.60 - 0.74)
      // ----------------------------------------------------------------------
      if (w6 > 0.01) {
        ctx.save();
        // Rich deep-field galaxies & magenta/cyan stellar nurseries
        for (let i = 0; i < cosmicAssets.deepGalaxies.length; i++) {
          const g = cosmicAssets.deepGalaxies[i];
          const gx = g.x * width + camX * 1.15;
          const gy = g.y * height + camY;
          drawGalaxy(
            ctx,
            gx,
            gy,
            g.rx,
            g.ry,
            g.angle,
            g.hue,
            g.isSpiral,
            g.arms,
            w6 * 0.78,
            t * g.spinSpeed * motionScale
          );
        }

        // Centerpiece Supermassive Black Hole with Gravitational Lensing Einstein Ring
        const bhX = width * 0.52 + camX * 0.9;
        const bhY = height * 0.5;
        const bhR = Math.min(height * 0.14, 26);

        // Outer gravitationally lensed photon ring & warped accretion halo
        const lensGrad = ctx.createRadialGradient(
          bhX,
          bhY,
          bhR * 0.9,
          bhX,
          bhY,
          bhR * 3.2
        );
        lensGrad.addColorStop(0, `rgba(254, 240, 138, ${w6 * 0.95})`);
        lensGrad.addColorStop(0.22, `rgba(249, 115, 22, ${w6 * 0.75})`);
        lensGrad.addColorStop(0.52, `rgba(168, 85, 247, ${w6 * 0.35})`);
        lensGrad.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = lensGrad;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Upper and lower lensed light arches bending over the event horizon
        ctx.strokeStyle = `rgba(253, 224, 71, ${w6 * 0.85})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(bhX, bhY, bhR * 1.42, bhR * 1.25, -0.14, 0, Math.PI * 2);
        ctx.stroke();

        // Horizontal relativistic accretion disk
        ctx.save();
        ctx.translate(bhX, bhY);
        ctx.rotate(-0.14);
        const diskGrad = ctx.createLinearGradient(-bhR * 3.4, 0, bhR * 3.4, 0);
        diskGrad.addColorStop(0, 'rgba(251, 146, 60, 0)');
        diskGrad.addColorStop(0.25, `rgba(254, 240, 138, ${w6 * 0.95})`);
        diskGrad.addColorStop(0.5, `rgba(255, 255, 255, ${w6})`);
        diskGrad.addColorStop(0.75, `rgba(249, 115, 22, ${w6 * 0.8})`);
        diskGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, bhR * 3.4, bhR * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Pitch-black Event Horizon shadow
        ctx.fillStyle = `rgba(2, 3, 8, ${w6})`;
        ctx.beginPath();
        ctx.arc(bhX, bhY, bhR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 7: FORMATION OF OUR SOLAR SYSTEM (0.74 - 0.87)
      // ----------------------------------------------------------------------
      if (w7 > 0.01) {
        ctx.save();
        const sunX = width * 0.24 + camX * 0.6;
        const sunY = height * 0.5;
        const sunR = Math.min(height * 0.13, 24);
        const earthEvolution = Math.max(0, Math.min(1, (p - 0.74) / 0.13));

        // Protoplanetary dust disk glow
        const diskGlow = ctx.createRadialGradient(
          sunX,
          sunY,
          sunR * 0.8,
          sunX,
          sunY,
          width * 0.72
        );
        diskGlow.addColorStop(
          0,
          `rgba(253, 224, 71, ${w7 * (0.45 - earthEvolution * 0.18)})`
        );
        diskGlow.addColorStop(
          0.35,
          `rgba(217, 119, 6, ${w7 * (0.24 - earthEvolution * 0.12)})`
        );
        diskGlow.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = diskGlow;
        ctx.fillRect(0, 0, width, height);

        // Young Sun corona & core
        const sunCorona = ctx.createRadialGradient(
          sunX,
          sunY,
          sunR * 0.2,
          sunX,
          sunY,
          sunR * 3.6
        );
        sunCorona.addColorStop(0, `rgba(255, 255, 255, ${w7})`);
        sunCorona.addColorStop(0.28, `rgba(253, 224, 71, ${w7 * 0.92})`);
        sunCorona.addColorStop(0.65, `rgba(249, 115, 22, ${w7 * 0.42})`);
        sunCorona.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = sunCorona;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR * 3.6, 0, Math.PI * 2);
        ctx.fill();

        // 8 Planets in elliptical perspective orbits around the Sun
        const maxOrbitX = width * 0.68;
        const planets = [
          { name: 'Mercury', dist: 0.12, r: 2.3, color: '#a8a29e', speed: 1.9, phase: 0.4 },
          { name: 'Venus', dist: 0.19, r: 3.6, color: '#fde68a', speed: 1.45, phase: 2.1 },
          { name: 'Earth', dist: 0.28, r: 4.5, color: '#38bdf8', speed: 1.15, phase: 0.15, isEarth: true },
          { name: 'Mars', dist: 0.37, r: 3.1, color: '#f97316', speed: 0.92, phase: 4.0 },
          { name: 'Jupiter', dist: 0.51, r: 9.2, color: '#fdba74', speed: 0.58, phase: 1.1 },
          { name: 'Saturn', dist: 0.66, r: 7.6, color: '#fde047', speed: 0.44, phase: 3.3, hasRings: true },
          { name: 'Uranus', dist: 0.8, r: 5.2, color: '#67e8f9', speed: 0.32, phase: 5.1 },
          { name: 'Neptune', dist: 0.93, r: 5.0, color: '#60a5fa', speed: 0.24, phase: 2.6 },
        ];

        for (let i = 0; i < planets.length; i++) {
          const pl = planets[i];
          const rx = sunR * 1.4 + pl.dist * maxOrbitX;
          const ry = rx * 0.24;

          // Subtle orbital path
          ctx.beginPath();
          ctx.strokeStyle = `rgba(148, 163, 184, ${w7 * 0.2})`;
          ctx.lineWidth = 1;
          ctx.ellipse(sunX, sunY, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Planet position along the forward arc so all 8 worlds are clearly visible
          const orbitAngle =
            -0.38 +
            (i % 2 === 0 ? 0.18 : -0.14) +
            Math.sin(t * pl.speed * 0.45 * motionScale + pl.phase) * 0.32;
          const px = sunX + Math.cos(orbitAngle) * rx;
          const py = sunY + Math.sin(orbitAngle) * ry;

          if (pl.hasRings) {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(-0.28);
            ctx.strokeStyle = `rgba(254, 240, 138, ${w7 * 0.72})`;
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, pl.r * 2.1, pl.r * 0.65, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          if (pl.isEarth) {
            // Young Earth evolving from molten proto-Earth to blue oceans & atmosphere
            const moltenFactor = 1 - earthEvolution;
            const earthGlow = ctx.createRadialGradient(
              px,
              py,
              pl.r * 0.5,
              px,
              py,
              pl.r * 2.8
            );
            earthGlow.addColorStop(
              0,
              moltenFactor > 0.5
                ? `rgba(251, 146, 60, ${w7 * 0.75})`
                : `rgba(56, 189, 248, ${w7 * 0.75})`
            );
            earthGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
            ctx.fillStyle = earthGlow;
            ctx.beginPath();
            ctx.arc(px, py, pl.r * 2.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle =
              moltenFactor > 0.5
                ? `rgba(249, 115, 22, ${w7})`
                : `rgba(14, 165, 233, ${w7})`;
            ctx.beginPath();
            ctx.arc(px, py, pl.r, 0, Math.PI * 2);
            ctx.fill();

            // Continents / clouds highlight
            ctx.fillStyle =
              moltenFactor > 0.5
                ? `rgba(254, 240, 138, ${w7 * 0.85})`
                : `rgba(52, 211, 153, ${w7 * 0.85})`;
            ctx.beginPath();
            ctx.arc(px - 1.2, py - 0.8, pl.r * 0.45, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.globalAlpha = w7;
            ctx.fillStyle = pl.color;
            ctx.beginPath();
            ctx.arc(px, py, pl.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------------------------
      // STAGE 8: THE MODERN UNIVERSE & MILKY WAY (0.87 - 1.00)
      // ----------------------------------------------------------------------
      if (w8 > 0.01) {
        ctx.save();
        // Cosmic web filaments in deep background
        ctx.strokeStyle = `rgba(129, 140, 248, ${w8 * 0.14})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(width * 0.05, height * 0.2);
        ctx.quadraticCurveTo(width * 0.35, height * 0.45, width * 0.65, height * 0.18);
        ctx.quadraticCurveTo(width * 0.82, height * 0.55, width * 0.96, height * 0.82);
        ctx.stroke();

        // Distant background galaxies framing our Milky Way
        drawGalaxy(ctx, width * 0.14 + camX, height * 0.28, 22, 11, 0.4, 280, true, 2, w8 * 0.65, t * 0.2 * motionScale);
        drawGalaxy(ctx, width * 0.86 + camX, height * 0.26, 26, 14, -0.5, 42, false, 2, w8 * 0.65, 0);
        drawGalaxy(ctx, width * 0.82 + camX, height * 0.76, 20, 10, 0.25, 198, true, 2, w8 * 0.6, -t * 0.25 * motionScale);

        // Panoramic Milky Way Spiral Galaxy
        const mwX = width * 0.5 + camX * 0.75;
        const mwY = height * 0.52;
        const mwRx = Math.min(width * 0.34, 260);
        const mwRy = mwRx * 0.34;

        ctx.save();
        ctx.translate(mwX, mwY);
        ctx.rotate(-0.18);
        ctx.scale(1, mwRy / mwRx);

        // Galactic halo
        const mwHalo = ctx.createRadialGradient(0, 0, 4, 0, 0, mwRx);
        mwHalo.addColorStop(0, `rgba(255, 251, 235, ${w8 * 0.98})`);
        mwHalo.addColorStop(0.16, `rgba(253, 224, 71, ${w8 * 0.82})`);
        mwHalo.addColorStop(0.42, `rgba(56, 189, 248, ${w8 * 0.38})`);
        mwHalo.addColorStop(0.75, `rgba(168, 85, 247, ${w8 * 0.2})`);
        mwHalo.addColorStop(1, 'rgba(3, 4, 10, 0)');
        ctx.fillStyle = mwHalo;
        ctx.beginPath();
        ctx.arc(0, 0, mwRx, 0, Math.PI * 2);
        ctx.fill();

        // Sweeping spiral arms of the Milky Way
        const spin = t * 0.12 * motionScale;
        for (let arm = 0; arm < 4; arm++) {
          const offset = (arm * Math.PI) / 2 + spin;
          ctx.beginPath();
          for (let step = 0; step <= 34; step++) {
            const frac = step / 34;
            const r = 10 + frac * mwRx * 0.88;
            const theta = offset + frac * 3.3;
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (step === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle =
            arm % 2 === 0
              ? `rgba(125, 211, 252, ${w8 * 0.48})`
              : `rgba(216, 180, 254, ${w8 * 0.38})`;
          ctx.lineWidth = mwRx * 0.085;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Subtle marker for our Solar System in the Orion Arm
        const solAngle = 0.65 + spin;
        const solR = mwRx * 0.56;
        const solX = Math.cos(solAngle) * solR;
        const solY = Math.sin(solAngle) * solR;
        ctx.fillStyle = `rgba(253, 224, 71, ${w8})`;
        ctx.beginPath();
        ctx.arc(solX, solY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(125, 211, 252, ${w8 * 0.85})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(solX, solY, 10 + Math.sin(t * 3) * 2 * motionScale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
        ctx.restore();
      }

      // Subtle atmospheric energy connection between the universe and the glass lens
      const aura = ctx.createRadialGradient(orbX, orbY, 8, orbX, orbY, 140);
      aura.addColorStop(0, 'rgba(56, 189, 248, 0.09)');
      aura.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, width, height);
    };

    /**
     * Renders the optical Liquid-Glass Orb lens magnifying and refracting the scene beneath it.
     */
    const renderLiquidGlassOrb = (
      ctx: CanvasRenderingContext2D,
      sourceCanvas: HTMLCanvasElement,
      orbX: number,
      orbY: number,
      orbRadius: number,
      velocity: number,
      p: number,
      t: number
    ) => {
      const stage = getActiveStage(p);
      const motionScale = reducedMotion ? 0 : 1;

      // Subtle elastic velocity stretch along horizontal movement
      const speed = Math.min(0.16, Math.abs(velocity) * 2.2) * motionScale;
      const scaleX = 1 + speed;
      const scaleY = 1 - speed * 0.45;

      ctx.save();
      ctx.translate(orbX, orbY);

      // 1. Ambient outer shadow & soft cosmic halo around the glass sphere
      const outerHalo = ctx.createRadialGradient(
        0,
        2,
        orbRadius * 0.78,
        0,
        2,
        orbRadius * 1.48
      );
      outerHalo.addColorStop(0, 'rgba(2, 4, 12, 0.55)');
      outerHalo.addColorStop(0.55, 'rgba(56, 189, 248, 0.16)');
      outerHalo.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = outerHalo;
      ctx.beginPath();
      ctx.arc(0, 2, orbRadius * 1.48, 0, Math.PI * 2);
      ctx.fill();

      ctx.scale(scaleX, scaleY);

      // 2. Clip to spherical glass lens and draw 1.52x MAGNIFIED cosmic scene from offscreen canvas
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, orbRadius, 0, Math.PI * 2);
      ctx.clip();

      const zoom = 1.52;
      const srcW = (orbRadius * 2 * dpr) / zoom;
      const srcH = (orbRadius * 2 * dpr) / zoom;
      const srcX = Math.max(
        0,
        Math.min(sourceCanvas.width - srcW, orbX * dpr - srcW * 0.5)
      );
      const srcY = Math.max(
        0,
        Math.min(sourceCanvas.height - srcH, orbY * dpr - srcH * 0.5)
      );

      ctx.drawImage(
        sourceCanvas,
        srcX,
        srcY,
        srcW,
        srcH,
        -orbRadius,
        -orbRadius,
        orbRadius * 2,
        orbRadius * 2
      );

      // Subtle chromatic dispersion fringe near inner rim of lens
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22;
      ctx.drawImage(
        sourceCanvas,
        Math.max(0, srcX - 3 * dpr),
        srcY,
        srcW,
        srcH,
        -orbRadius,
        -orbRadius,
        orbRadius * 2,
        orbRadius * 2
      );
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // 3. Illuminated core glow tinted by active cosmic era
      const coreGlow = ctx.createRadialGradient(
        0,
        0,
        2,
        0,
        0,
        orbRadius * 0.92
      );
      coreGlow.addColorStop(0, `${stage.palette.core}33`);
      coreGlow.addColorStop(0.55, `${stage.palette.accent}18`);
      coreGlow.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(-orbRadius, -orbRadius, orbRadius * 2, orbRadius * 2);

      // 4. Glowing micro-particles suspended inside the liquid-glass orb
      for (let i = 0; i < cosmicAssets.orbInternalParticles.length; i++) {
        const pt = cosmicAssets.orbInternalParticles[i];
        const a = pt.angle + t * pt.speed * (reducedMotion ? 0.15 : 1);
        const r = pt.dist * orbRadius * 0.82;
        const px = Math.cos(a) * r - velocity * 26;
        const py = Math.sin(a) * r;
        ctx.fillStyle = `hsla(${pt.hue}, 95%, 82%, 0.72)`;
        ctx.beginPath();
        ctx.arc(px, py, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Spherical glass edge darkening & inner Fresnel reflection
      const innerShadow = ctx.createRadialGradient(
        0,
        0,
        orbRadius * 0.58,
        0,
        0,
        orbRadius
      );
      innerShadow.addColorStop(0, 'rgba(255, 255, 255, 0)');
      innerShadow.addColorStop(0.76, 'rgba(15, 23, 42, 0.18)');
      innerShadow.addColorStop(0.92, 'rgba(125, 211, 252, 0.28)');
      innerShadow.addColorStop(1, 'rgba(255, 255, 255, 0.52)');
      ctx.fillStyle = innerShadow;
      ctx.fillRect(-orbRadius, -orbRadius, orbRadius * 2, orbRadius * 2);

      // 6. Curved top-left primary glass specular reflection crescent
      ctx.save();
      ctx.rotate(-0.55);
      const specGrad = ctx.createLinearGradient(
        0,
        -orbRadius * 0.92,
        0,
        -orbRadius * 0.28
      );
      specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.68)');
      specGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.16)');
      specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.ellipse(
        0,
        -orbRadius * 0.56,
        orbRadius * 0.62,
        orbRadius * 0.26,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      // 7. Bottom-right warm caustic bounce reflection
      const bounceGrad = ctx.createRadialGradient(
        orbRadius * 0.36,
        orbRadius * 0.42,
        1,
        orbRadius * 0.36,
        orbRadius * 0.42,
        orbRadius * 0.48
      );
      bounceGrad.addColorStop(0, `${stage.palette.core}55`);
      bounceGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bounceGrad;
      ctx.beginPath();
      ctx.arc(
        orbRadius * 0.36,
        orbRadius * 0.42,
        orbRadius * 0.48,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.restore(); // End spherical clip

      // 8. Chromatic dispersion glass rim (cyan / violet / gold thin-film refraction)
      const rimGrad = ctx.createLinearGradient(
        -orbRadius,
        -orbRadius,
        orbRadius,
        orbRadius
      );
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
      rimGrad.addColorStop(0.32, 'rgba(103, 232, 249, 0.72)');
      rimGrad.addColorStop(0.68, 'rgba(192, 132, 252, 0.68)');
      rimGrad.addColorStop(1, 'rgba(253, 224, 71, 0.78)');

      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, orbRadius - 0.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    };

    const renderLoop = (now: number) => {
      const t = Math.max(0, (now - startTime) * 0.001);
      const phys = physicsRef.current;

      // Critically-damped spring interpolation toward target progress
      const stiffness = reducedMotion ? 0.32 : 0.16;
      const damping = reducedMotion ? 0.68 : 0.74;
      const force = (phys.target - phys.current) * stiffness;
      phys.velocity = (phys.velocity + force) * damping;
      phys.current += phys.velocity;

      // Prevent spring overshoot beyond [0, 1] bounds
      if (phys.current < 0) {
        phys.current = 0;
        phys.velocity = 0;
      } else if (phys.current > 1) {
        phys.current = 1;
        phys.velocity = 0;
      }

      if (Math.abs(phys.target - phys.current) < 0.0001) {
        phys.current = phys.target;
        phys.velocity = 0;
      }

      soundEngine.update(phys.current, phys.velocity);

      const orbRadius = Math.min(height * 0.36, 54);
      const usableWidth = Math.max(1, width - orbRadius * 2);
      const orbX = orbRadius + phys.current * usableWidth;
      const orbY = height * 0.5;

      // 1. Render living cosmic evolution into offscreen canvas
      renderUniverseScene(offCtx, phys.current, t, orbX, orbY);

      // 2. Copy offscreen cosmic scene into visible capsule canvas
      displayCtx.clearRect(0, 0, width, height);
      displayCtx.drawImage(
        offCanvas,
        0,
        0,
        offCanvas.width,
        offCanvas.height,
        0,
        0,
        width,
        height
      );

      // 3. Subtle inner capsule depth vignette
      const innerVignette = displayCtx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        Math.min(width, height) * 0.25,
        width * 0.5,
        height * 0.5,
        width * 0.56
      );
      innerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      innerVignette.addColorStop(1, 'rgba(2, 4, 12, 0.48)');
      displayCtx.fillStyle = innerVignette;
      displayCtx.fillRect(0, 0, width, height);

      // 4. Render magnified & refracted liquid-glass lens orb on top
      renderLiquidGlassOrb(
        displayCtx,
        offCanvas,
        orbX,
        orbY,
        orbRadius,
        phys.velocity,
        phys.current,
        t
      );

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [cosmicAssets, reducedMotion, soundEngine]);

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Cosmic Timeline Slider — Journey through 13.8 billion years"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(targetProgress * 100)}
      aria-valuetext={`${getActiveStage(targetProgress).title}, ${
        getActiveStage(targetProgress).ageLabel
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-full h-[215px] sm:h-[260px] md:h-[296px] rounded-full select-none touch-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 group"
      style={{
        boxShadow:
          '0 28px 80px -16px rgba(0, 0, 0, 0.88), 0 0 60px -12px rgba(56, 189, 248, 0.16), inset 0 1px 1px rgba(255, 255, 255, 0.22)',
      }}
    >
      {/* Outer liquid-glass capsule bezel & subtle iridescent rim */}
      <div
        aria-hidden="true"
        className="absolute -inset-[2px] rounded-full pointer-events-none opacity-85 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(56,189,248,0.24) 30%, rgba(168,85,247,0.26) 70%, rgba(251,191,36,0.28) 100%)',
        }}
      />

      {/* Capsule interior mask */}
      <div className="relative w-full h-full rounded-full overflow-hidden bg-[#040612] border border-white/15">
        <canvas
          ref={displayCanvasRef}
          className="block w-full h-full"
        />

        {/* Top curved glass reflection sheen across capsule shell */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-10 rounded-full opacity-40"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 100%)',
          }}
        />

        {/* Subtle inner rim shadow for physical capsule depth */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow:
              'inset 0 6px 22px rgba(0, 0, 0, 0.65), inset 0 -4px 16px rgba(56, 189, 248, 0.12)',
          }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// 6. MILESTONE TRACK COMPONENT (ABOVE CAPSULE)
// ============================================================================

interface MilestoneTrackProps {
  visible: boolean;
  progress: number;
  highlightedId: string | null;
  onSelectMilestone: (milestone: CosmicMilestone) => void;
}

const MilestoneTrack: React.FC<MilestoneTrackProps> = ({
  visible,
  progress,
  highlightedId,
  onSelectMilestone,
}) => {
  return (
    <div
      className={`w-full px-6 sm:px-12 mb-3 transition-all duration-500 ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
    >
      <div className="relative h-12 sm:h-14 w-full">
        {COSMIC_MILESTONES.map((m) => {
          const isNear = Math.abs(progress - m.progress) < 0.032;
          const isHighlighted = highlightedId === m.id || isNear;

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMilestone(m)}
              style={{ left: `${m.progress * 100}%` }}
              className="group absolute bottom-0 -translate-x-1/2 flex flex-col items-center focus:outline-none cursor-pointer py-1 px-1.5"
              title={`${m.label} (${m.age})`}
            >
              {/* Milestone label */}
              <span
                className={`whitespace-nowrap text-[10px] sm:text-[11px] tracking-[0.14em] uppercase font-medium transition-all duration-300 ${
                  isHighlighted
                    ? 'text-cyan-200 scale-105 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]'
                    : 'text-slate-400/75 group-hover:text-slate-200'
                }`}
              >
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sm:hidden">{m.shortLabel}</span>
              </span>

              {/* Subtle age sub-caption on active/hover */}
              <span
                className={`hidden md:block text-[9px] tracking-wider transition-opacity duration-300 ${
                  isHighlighted
                    ? 'opacity-90 text-amber-200/90'
                    : 'opacity-0 group-hover:opacity-75 text-slate-400'
                }`}
              >
                {m.age}
              </span>

              {/* Luminous indicator dot & vertical hairline down to capsule */}
              <span
                className={`mt-1 w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  isHighlighted
                    ? 'bg-cyan-300 scale-125 shadow-[0_0_10px_rgba(103,232,249,0.95)]'
                    : 'bg-slate-500/60 group-hover:bg-slate-300'
                }`}
              />
              <span
                className={`w-[1px] h-2 transition-colors duration-300 ${
                  isHighlighted
                    ? 'bg-gradient-to-b from-cyan-300/80 to-transparent'
                    : 'bg-white/10 group-hover:bg-white/30'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// 7. DYNAMIC TIMELINE READOUT COMPONENT (BELOW CAPSULE)
// ============================================================================

interface TimelineInfoProps {
  progress: number;
}

const TimelineInfo: React.FC<TimelineInfoProps> = ({ progress }) => {
  const stage = getActiveStage(progress);
  const formattedAge = formatCosmicAge(progress);

  return (
    <section
      aria-live="polite"
      className="w-full max-w-2xl mx-auto text-center px-4 mt-5 sm:mt-7"
    >
      {/* Era Code & Cosmic Age Counter */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] uppercase bg-white/[0.06] border border-white/10 text-cyan-300/90">
          <Sparkles className="w-3 h-3 text-amber-300" />
          {stage.code}
        </span>

        <span className="text-slate-600">•</span>

        <div className="inline-flex items-baseline gap-1.5 font-mono">
          <span className="text-sm sm:text-base font-semibold tracking-wider text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]">
            {formattedAge.value}
          </span>
          <span className="text-[10px] sm:text-[11px] tracking-[0.18em] uppercase text-slate-400">
            {formattedAge.suffix}
          </span>
        </div>
      </div>

      {/* Cosmic Era Headline */}
      <h2 className="text-xl sm:text-2xl md:text-3xl font-light tracking-[0.18em] uppercase text-white mb-2.5 transition-all duration-300">
        {stage.title}
      </h2>

      {/* Concise Educational Narrative */}
      <p className="text-xs sm:text-sm md:text-[15px] leading-relaxed text-slate-300/90 font-normal max-w-xl mx-auto mb-3">
        {stage.description}
      </p>

      {/* Key Scientific Event / Discovery Badge */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[11px] tracking-wide text-slate-400">
        <Info className="w-3.5 h-3.5 text-purple-300/80 shrink-0" />
        <span>{stage.discovery}</span>
      </div>
    </section>
  );
};

// ============================================================================
// 8. MINIMAL MUSEUM EXHIBIT CONTROL BAR
// ============================================================================

interface ControlBarProps {
  isPlaying: boolean;
  soundEnabled: boolean;
  showMilestones: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onToggleSound: () => void;
  onToggleMilestones: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  isPlaying,
  soundEnabled,
  showMilestones,
  onTogglePlay,
  onReset,
  onToggleSound,
  onToggleMilestones,
}) => {
  const baseBtnClass =
    'inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-full text-[11px] font-medium tracking-[0.18em] uppercase transition-all duration-300 cursor-pointer border focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70';

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-5 sm:mt-6 px-3">
      {/* PLAY / PAUSE */}
      <button
        type="button"
        onClick={onTogglePlay}
        className={`${baseBtnClass} ${
          isPlaying
            ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_24px_-4px_rgba(56,189,248,0.45)]'
            : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/15 text-white'
        }`}
      >
        {isPlaying ? (
          <>
            <Pause className="w-3.5 h-3.5 text-cyan-300" />
            <span>Pause</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 text-cyan-300 fill-cyan-300/30" />
            <span>Play</span>
          </>
        )}
      </button>

      {/* RESET */}
      <button
        type="button"
        onClick={onReset}
        className={`${baseBtnClass} bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-slate-300 hover:text-white`}
      >
        <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
        <span>Reset</span>
      </button>

      {/* SOUND */}
      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={soundEnabled}
        className={`${baseBtnClass} ${
          soundEnabled
            ? 'bg-purple-500/20 border-purple-400/45 text-purple-200 shadow-[0_0_20px_-4px_rgba(168,85,247,0.4)]'
            : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-slate-300 hover:text-white'
        }`}
      >
        {soundEnabled ? (
          <Volume2 className="w-3.5 h-3.5 text-purple-300" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span>Sound</span>
      </button>

      {/* MILESTONES */}
      <button
        type="button"
        onClick={onToggleMilestones}
        aria-pressed={showMilestones}
        className={`${baseBtnClass} ${
          showMilestones
            ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
            : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-slate-300 hover:text-white'
        }`}
      >
        <Compass className="w-3.5 h-3.5 text-amber-300/90" />
        <span>Milestones</span>
      </button>
    </div>
  );
};

// ============================================================================
// 9. MAIN APPLICATION CONTAINER
// ============================================================================

export default function App() {
  const [progress, setProgress] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [showMilestones, setShowMilestones] = useState<boolean>(true);
  const [highlightedMilestoneId, setHighlightedMilestoneId] = useState<
    string | null
  >('big-bang');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const soundEngineRef = useRef<CosmicSoundEngine | null>(null);
  if (!soundEngineRef.current) {
    soundEngineRef.current = new CosmicSoundEngine();
  }

  const lastAutoplayMilestoneRef = useRef<string | null>('big-bang');

  // Detect system reduced-motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Dispose audio context on unmount
  useEffect(() => {
    return () => {
      soundEngineRef.current?.dispose();
    };
  }, []);

  const handleProgressChange = useCallback(
    (nextProgress: number, fromUser = false) => {
      const clamped = Math.max(0, Math.min(1, nextProgress));
      setProgress(clamped);
      if (fromUser) {
        setIsPlaying(false);
      }
    },
    []
  );

  const handleSelectMilestone = useCallback((milestone: CosmicMilestone) => {
    setIsPlaying(false);
    setProgress(milestone.progress);
    setHighlightedMilestoneId(milestone.id);
    soundEngineRef.current?.playMilestoneChime(milestone.progress);
  }, []);

  const handleMilestoneSnap = useCallback((milestone: CosmicMilestone) => {
    setHighlightedMilestoneId(milestone.id);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && progress >= 0.995) {
        setProgress(0);
        lastAutoplayMilestoneRef.current = null;
      }
      return !prev;
    });
  }, [progress]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
    setHighlightedMilestoneId('big-bang');
    lastAutoplayMilestoneRef.current = 'big-bang';
    soundEngineRef.current?.playMilestoneChime(0);
  }, []);

  const handleToggleSound = useCallback(() => {
    if (!soundEngineRef.current) return;
    const enabled = soundEngineRef.current.toggle();
    setSoundEnabled(enabled);
    if (enabled) {
      soundEngineRef.current.playMilestoneChime(progress);
    }
  }, [progress]);

  const handleToggleMilestones = useCallback(() => {
    setShowMilestones((prev) => !prev);
  }, []);

  // Smooth automated journey across 13.8 billion years (~50s full traversal)
  useEffect(() => {
    if (!isPlaying || isDragging) return;

    let lastTime = performance.now();
    let frameId = 0;
    const durationSeconds = 50;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) * 0.001);
      lastTime = now;

      setProgress((prev) => {
        const next = prev + dt / durationSeconds;

        // Briefly highlight milestones as the orb journeys past them
        for (const m of COSMIC_MILESTONES) {
          if (
            Math.abs(next - m.progress) < 0.012 &&
            lastAutoplayMilestoneRef.current !== m.id
          ) {
            lastAutoplayMilestoneRef.current = m.id;
            setHighlightedMilestoneId(m.id);
            soundEngineRef.current?.playMilestoneChime(m.progress);
          }
        }

        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isDragging]);

  // Keyboard navigation (Left/Right arrows to scrub, Space for Play/Pause, Home/R to Reset)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.018;
        handleProgressChange(progress + step, true);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.018;
        handleProgressChange(progress - step, true);
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'Home' || e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleReset();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [progress, handleProgressChange, handleTogglePlay, handleReset]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#03040a] text-slate-100 flex flex-col justify-between py-6 sm:py-9 px-4 sm:px-8">
      {/* Multi-layered deep-space ambient starfield & parallax nebulae */}
      <AmbientSpaceBackground
        progress={progress}
        reducedMotion={reducedMotion}
      />

      {/* Ambient radial vignette for museum exhibit atmosphere */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(8, 13, 34, 0.15) 0%, rgba(20, 9, 40, 0.45) 55%, rgba(3, 4, 10, 0.92) 100%)',
        }}
      />

      {/* TOP: Minimal Exhibit Header */}
      <header className="relative z-10 text-center max-w-2xl mx-auto pt-1">
        <h1 className="text-sm sm:text-base md:text-lg font-medium tracking-[0.34em] uppercase text-white/95 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
          THE COSMIC TIMELINE
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-light tracking-[0.12em] text-slate-400">
          A journey through 13.8 billion years of cosmic evolution.
        </p>
      </header>

      {/* CENTER: Main Attraction — Interactive Liquid-Glass Cosmic Capsule */}
      <main className="relative z-10 w-full max-w-5xl mx-auto my-auto py-4 flex flex-col items-center">
        <MilestoneTrack
          visible={showMilestones}
          progress={progress}
          highlightedId={highlightedMilestoneId}
          onSelectMilestone={handleSelectMilestone}
        />

        <CosmicCapsule
          targetProgress={progress}
          onProgressChange={handleProgressChange}
          onDragStateChange={setIsDragging}
          onMilestoneSnap={handleMilestoneSnap}
          soundEngine={soundEngineRef.current}
          reducedMotion={reducedMotion}
        />

        {/* Subtle interactive prompt beneath capsule */}
        <p className="mt-3 text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-slate-500 select-none">
          Drag the glass lens • Click along the capsule • Use arrow keys
        </p>

        {/* Dynamic Era, Cosmic Age & Educational Description */}
        <TimelineInfo progress={progress} />

        {/* Minimal Exhibit Controls */}
        <ControlBar
          isPlaying={isPlaying}
          soundEnabled={soundEnabled}
          showMilestones={showMilestones}
          onTogglePlay={handleTogglePlay}
          onReset={handleReset}
          onToggleSound={handleToggleSound}
          onToggleMilestones={handleToggleMilestones}
        />
      </main>

      {/* BOTTOM: Subtle Exhibit Footer */}
      <footer className="relative z-10 text-center pb-1">
        <span className="text-[10px] tracking-[0.24em] uppercase text-slate-600">
          Interactive Cosmology Exhibit • 0 — 13.8 Billion Years
        </span>
      </footer>
    </div>
  );
}