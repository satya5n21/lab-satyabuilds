import { CAPACITY, KIND_DUST, KIND_STAR, STAR_TONES, STATE_FREE, type Simulation } from './Simulation';

const HEAT_BUCKETS = 18;
const BG_STARS = 520;
const STREAKS = 240;
const TRAIL_FADE_RATE = 4.2; // per second of simulation time
const TRAIL_MIN_FADE = 0.045;

const STAR_RGB = [
  [255, 255, 255],
  [170, 226, 255],
  [200, 184, 255],
  [255, 226, 176],
  [255, 170, 206],
] as const;
const BG_STAR_COLORS = ['#ffffff', '#bfe9ff', '#d4c4ff', '#ffe9c4', '#9fe8ff'];

// inner edge to outer edge of the accretion disk: white-gold, amber, magenta, violet, cyan
const DISK_PALETTE = [
  [255, 246, 226],
  [255, 176, 112],
  [255, 96, 176],
  [156, 98, 255],
  [96, 196, 255],
] as const;

export interface AimState {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  path: Float32Array;
  n: number;
  swallowed: boolean;
}

interface RenderOptions {
  trails: boolean;
  paused: boolean;
  /** Simulation time step this frame (0 when paused). */
  simDt: number;
  /** Wall-clock seconds. */
  now: number;
  /** Wall-clock seconds since the previous frame. */
  dt: number;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

function heatHsl(bucket: number): { h: number; s: number; l: number } {
  const t = bucket / (HEAT_BUCKETS - 1);
  const k = Math.min(1, t / 0.7);
  const eased = k * k * (3 - 2 * k);
  return {
    h: 268 - 88 * eased,
    s: 95 - 65 * Math.max(0, (t - 0.7) / 0.3),
    l: 56 + 34 * t,
  };
}

function makeHeatSprite(bucket: number): HTMLCanvasElement {
  const size = 32;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d')!;
  const { h, s, l } = heatHsl(bucket);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `hsla(${h},${s}%,96%,1)`);
  grad.addColorStop(0.22, `hsla(${h},${s}%,${l}%,0.9)`);
  grad.addColorStop(0.55, `hsla(${h},${s}%,${l}%,0.22)`);
  grad.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function makeStarSprite(tone: number): HTMLCanvasElement {
  const size = 64;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d')!;
  const [r, gr, b] = STAR_RGB[tone];
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.1, `rgba(${r},${gr},${b},0.95)`);
  grad.addColorStop(0.3, `rgba(${r},${gr},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // diffraction spikes
  g.globalCompositeOperation = 'lighter';
  for (const [x0, y0, x1, y1] of [
    [2, 32, 62, 32],
    [32, 2, 32, 62],
  ]) {
    const sp = g.createLinearGradient(x0, y0, x1, y1);
    sp.addColorStop(0, `rgba(${r},${gr},${b},0)`);
    sp.addColorStop(0.5, `rgba(${r},${gr},${b},0.55)`);
    sp.addColorStop(1, `rgba(${r},${gr},${b},0)`);
    g.strokeStyle = sp;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  return c;
}

function diskColor(q: number): readonly [number, number, number] {
  const f = Math.min(0.9999, Math.max(0, q)) * (DISK_PALETTE.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  const a = DISK_PALETTE[i];
  const b = DISK_PALETTE[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly trail = makeCanvas(1, 1);
  private tctx = this.trail.getContext('2d')!;
  private nebula = makeCanvas(1, 1);

  private w = 1;
  private h = 1;
  private dpr = 1;

  private readonly heatSprites = Array.from({ length: HEAT_BUCKETS }, (_, b) => makeHeatSprite(b));
  private readonly heatStroke = Array.from({ length: HEAT_BUCKETS }, (_, b) => {
    const { h, s, l } = heatHsl(b);
    return `hsla(${h},${s}%,${l}%,0.5)`;
  });
  private readonly starSprites = Array.from({ length: STAR_TONES }, (_, t) => makeStarSprite(t));
  private readonly flareSprite = makeHeatSprite(HEAT_BUCKETS - 1);

  private readonly bucket = new Uint8Array(CAPACITY);
  private readonly alive = new Int32Array(CAPACITY);
  private aliveCount = 0;
  private fadeAcc = 0;

  // background starfield
  private readonly bgX = new Float32Array(BG_STARS);
  private readonly bgY = new Float32Array(BG_STARS);
  private readonly bgBase = new Float32Array(BG_STARS);
  private readonly bgSize = new Float32Array(BG_STARS);
  private readonly bgTone = new Uint8Array(BG_STARS);
  private readonly bgPhase = new Float32Array(BG_STARS);
  private readonly bgTwinkle = new Float32Array(BG_STARS);

  // disk streaks
  private readonly stU = new Float32Array(STREAKS);
  private readonly stA0 = new Float32Array(STREAKS);
  private readonly stLen = new Float32Array(STREAKS);
  private readonly stWidth = new Float32Array(STREAKS);
  private readonly stPhase = new Float32Array(STREAKS);
  private readonly stSpd = new Float32Array(STREAKS);

  ripples: { x: number; y: number; t: number }[] = [];
  aim: AimState | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    const rnd = mulberry32(0x5eed);
    for (let i = 0; i < STREAKS; i++) {
      this.stU[i] = Math.pow(rnd(), 1.5);
      this.stA0[i] = rnd() * Math.PI * 2;
      this.stLen[i] = 0.05 + rnd() * 0.3;
      this.stWidth[i] = 0.5 + rnd() * rnd() * 2.6;
      this.stPhase[i] = rnd() * 100;
      this.stSpd[i] = 0.92 + rnd() * 0.16;
    }
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.trail.width = this.canvas.width;
    this.trail.height = this.canvas.height;
    this.tctx = this.trail.getContext('2d')!;
    this.buildNebula();
    this.scatterStars();
  }

  clearTrails(): void {
    this.tctx.setTransform(1, 0, 0, 1, 0, 0);
    this.tctx.clearRect(0, 0, this.trail.width, this.trail.height);
    this.fadeAcc = 0;
  }

  private scatterStars(): void {
    const rnd = mulberry32(0xc0ffee);
    for (let i = 0; i < BG_STARS; i++) {
      this.bgX[i] = rnd() * this.w;
      this.bgY[i] = rnd() * this.h;
      const m = rnd();
      this.bgBase[i] = 0.22 + m * m * 0.78;
      this.bgSize[i] = 0.7 + m * m * m * 1.9;
      const roll = rnd();
      this.bgTone[i] = roll < 0.55 ? 0 : roll < 0.75 ? 1 : roll < 0.88 ? 2 : roll < 0.95 ? 3 : 4;
      this.bgPhase[i] = rnd() * 100;
      this.bgTwinkle[i] = 0.6 + rnd() * 2.2;
    }
  }

  private buildNebula(): void {
    const scale = 0.5;
    const w = Math.max(2, Math.floor(this.w * scale));
    const h = Math.max(2, Math.floor(this.h * scale));
    this.nebula = makeCanvas(w, h);
    const g = this.nebula.getContext('2d')!;
    const rnd = mulberry32(0xb1ac);
    const base = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    base.addColorStop(0, '#0a0820');
    base.addColorStop(0.55, '#050612');
    base.addColorStop(1, '#020309');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);

    g.globalCompositeOperation = 'lighter';
    const tints = [
      [120, 70, 255],
      [40, 190, 255],
      [200, 60, 210],
      [90, 90, 255],
    ];
    const span = Math.max(w, h);
    for (let i = 0; i < 9; i++) {
      const [r, gr, b] = tints[Math.floor(rnd() * tints.length)];
      const x = rnd() * w;
      const y = rnd() * h;
      const rad = span * (0.18 + rnd() * 0.36);
      const a = 0.035 + rnd() * 0.07;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI);
      g.scale(1, 0.35 + rnd() * 0.5);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${a})`);
      grad.addColorStop(0.5, `rgba(${r},${gr},${b},${a * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      g.fillStyle = grad;
      g.fillRect(-rad, -rad, rad * 2, rad * 2);
      g.restore();
    }
    // a faint haze of unresolved distant stars
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(200,210,255,${0.05 + rnd() * 0.16})`;
      g.fillRect(rnd() * w, rnd() * h, 1, 1);
    }
  }

  addRipple(x: number, y: number): void {
    if (this.ripples.length < 12) this.ripples.push({ x, y, t: 0 });
  }

  render(sim: Simulation, o: RenderOptions): void {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.nebula, 0, 0, w, h);

    this.drawBackgroundStars(sim, o.now);
    this.drawDisk(sim);
    this.collectParticles(sim);
    if (o.trails) {
      this.updateTrails(sim, o.simDt, o.paused);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.trail, 0, 0, w, h);
    }
    this.drawParticles(sim, o.now);
    this.drawFlares(sim);
    this.drawHorizon(sim, o.now);
    this.drawOverlays(o.dt);
  }

  // ---------------------------------------------------------------- background

  /**
   * Stars behind the hole are bent by a point-mass lens: a source at angular offset b from the hole
   * appears at (b + sqrt(b^2 + 4 thetaE^2)) / 2 and as a faint mirror image on the far side. Stars
   * crossing the Einstein radius stretch into arcs, and those directly behind form a ring.
   */
  private drawBackgroundStars(sim: Simulation, now: number): void {
    const ctx = this.ctx;
    const w = this.w;
    const { cx, cy, rs } = sim;
    const thetaE = 1.9 * rs;
    const thetaE4 = 4 * thetaE * thetaE;
    const drift = 5 * sim.simTime;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < BG_STARS; i++) {
      let x = this.bgX[i] - drift;
      x = ((x % w) + w) % w;
      const y = this.bgY[i];
      const dx = x - cx;
      const dy = y - cy;
      const b = Math.max(1e-3, Math.hypot(dx, dy));
      const root = Math.sqrt(b * b + thetaE4);
      const thetaPlus = (b + root) / 2;
      const u = b / thetaE;
      const amp = (u * u + 2) / (2 * u * Math.sqrt(u * u + 4));
      const muPlus = amp + 0.5;
      const muMinus = Math.max(0, amp - 0.5);
      const tw = 0.78 + 0.22 * Math.sin(now * this.bgTwinkle[i] + this.bgPhase[i]);
      const base = this.bgBase[i] * tw;
      ctx.fillStyle = BG_STAR_COLORS[this.bgTone[i]];
      const ux = dx / b;
      const uy = dy / b;
      this.drawLensedStar(cx + ux * thetaPlus, cy + uy * thetaPlus, this.bgSize[i], base, muPlus, ux, uy, rs);
      if (muMinus > 0.03 && b < thetaE * 4) {
        const thetaMinus = (b - root) / 2; // negative: other side of the hole
        this.drawLensedStar(cx + ux * thetaMinus, cy + uy * thetaMinus, this.bgSize[i], base, muMinus, ux, uy, rs);
      }
    }
  }

  private drawLensedStar(
    x: number,
    y: number,
    size: number,
    base: number,
    mu: number,
    ux: number,
    uy: number,
    rs: number,
  ): void {
    const ctx = this.ctx;
    const dx = x - (this.w / 2);
    const dy = y - (this.h / 2);
    if (dx * dx + dy * dy < rs * rs) return; // hidden behind the shadow
    const a = Math.min(1, base * Math.min(3.2, 0.35 + mu * 0.65));
    ctx.globalAlpha = a;
    if (mu > 1.5) {
      // magnified images are stretched along the tangent
      const stretch = Math.min(9, 1 + (mu - 1) * 1.6);
      const sz = size * Math.min(2, Math.sqrt(mu));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 0.5 * stretch, sz * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const sz = size * Math.min(1.8, Math.sqrt(Math.max(mu, 0.4)));
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
  }

  // ---------------------------------------------------------------- accretion disk

  private drawDisk(sim: Simulation): void {
    const ctx = this.ctx;
    const { cx, cy, rs, s } = sim;
    const rIn = 1.5 * rs;
    const rOut = Math.min(6.4 * rs, 0.47 * Math.min(this.w, this.h));
    if (rOut < rIn * 1.4) return;
    const rEdge = rOut * 1.25;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1;

    // soft body of the disk: hot at the inside, cooling outward
    const body = ctx.createRadialGradient(cx, cy, rs * 0.9, cx, cy, rEdge);
    const span = rEdge - rs * 0.9;
    const at = (r: number) => Math.min(1, Math.max(0, (r - rs * 0.9) / span));
    body.addColorStop(0, 'rgba(255,236,200,0.50)');
    body.addColorStop(at(rs * 1.5), 'rgba(255,150,92,0.34)');
    body.addColorStop(at(rs * 2.4), 'rgba(255,72,170,0.20)');
    body.addColorStop(at(rs * 3.8), 'rgba(140,76,255,0.14)');
    body.addColorStop(at(rOut), 'rgba(70,170,255,0.05)');
    body.addColorStop(1, 'rgba(60,110,255,0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, rEdge, 0, Math.PI * 2);
    ctx.fill();

    // turbulent streaks orbiting at the local Keplerian rate (pseudo-Newtonian)
    ctx.lineCap = 'round';
    const t = sim.simTime;
    for (let i = 0; i < STREAKS; i++) {
      const q = this.stU[i];
      const r = rIn + (rOut - rIn) * q;
      const d = r - rs;
      const omega = Math.min(9, Math.sqrt(sim.GM * r) / (d * r)) * this.stSpd[i];
      const ang = this.stA0[i] + omega * t;
      const doppler = 0.62 - 0.5 * Math.cos(ang); // the approaching limb (left) is brighter
      const flick = 0.75 + 0.25 * Math.sin(t * 2.2 + this.stPhase[i]);
      const a = (0.12 + 0.4 * (1 - q * 0.75)) * doppler * flick;
      const [cr, cg, cb] = diskColor(q);
      ctx.strokeStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${a.toFixed(3)})`;
      ctx.lineWidth = this.stWidth[i] * Math.max(0.7, s);
      ctx.beginPath();
      ctx.arc(cx, cy, r, ang, ang + this.stLen[i] * (1.3 - q));
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- particles

  private collectParticles(sim: Simulation): void {
    const { vx, vy, state } = sim;
    const invHeat = 1 / (0.62 * sim.c);
    let n = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (state[i] === STATE_FREE) continue;
      const t = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) * invHeat;
      this.bucket[i] = t >= 1 ? HEAT_BUCKETS - 1 : (t * HEAT_BUCKETS) | 0;
      this.alive[n++] = i;
    }
    this.aliveCount = n;
  }

  private updateTrails(sim: Simulation, simDt: number, paused: boolean): void {
    if (paused || simDt <= 0) return;
    const t = this.tctx;
    t.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Fade in lumps: tiny per-frame fades round away to nothing in 8-bit alpha and leave ghosts.
    this.fadeAcc += 1 - Math.exp(-TRAIL_FADE_RATE * simDt);
    if (this.fadeAcc >= TRAIL_MIN_FADE) {
      t.globalCompositeOperation = 'destination-out';
      t.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeAcc).toFixed(3)})`;
      t.fillRect(0, 0, this.w, this.h);
      this.fadeAcc = 0;
    }

    t.globalCompositeOperation = 'lighter';
    t.lineCap = 'round';
    const { x, y, px, py, alpha, kind, tone } = sim;
    const { alive, aliveCount, bucket } = this;

    t.lineWidth = 1.15 * Math.max(0.8, sim.s);
    for (let b = 0; b < HEAT_BUCKETS; b++) {
      t.strokeStyle = this.heatStroke[b];
      t.beginPath();
      let any = false;
      for (let k = 0; k < aliveCount; k++) {
        const i = alive[k];
        if (kind[i] !== KIND_DUST || bucket[i] !== b || alpha[i] < 0.3) continue;
        const dx = x[i] - px[i];
        const dy = y[i] - py[i];
        if (dx * dx + dy * dy > 3600) continue;
        t.moveTo(px[i], py[i]);
        t.lineTo(x[i], y[i]);
        any = true;
      }
      if (any) t.stroke();
    }

    t.lineWidth = 2.1 * Math.max(0.8, sim.s);
    for (let tn = 0; tn < STAR_TONES; tn++) {
      const [r, g, b] = STAR_RGB[tn];
      t.strokeStyle = `rgba(${r},${g},${b},0.55)`;
      t.beginPath();
      let any = false;
      for (let k = 0; k < aliveCount; k++) {
        const i = alive[k];
        if (kind[i] !== KIND_STAR || tone[i] !== tn) continue;
        const dx = x[i] - px[i];
        const dy = y[i] - py[i];
        if (dx * dx + dy * dy > 3600) continue;
        t.moveTo(px[i], py[i]);
        t.lineTo(x[i], y[i]);
        any = true;
      }
      if (any) t.stroke();
    }
  }

  private drawParticles(sim: Simulation, now: number): void {
    const ctx = this.ctx;
    const { x, y, vx, vy, alpha, kind, tone, size } = sim;
    const { cx, cy, rs } = sim;
    const ps = Math.max(0.75, sim.s);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < this.aliveCount; k++) {
      const i = this.alive[k];
      const dx = x[i] - cx;
      const dy = y[i] - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r <= rs) continue;
      // gravitational redshift: light from near the horizon dims to nothing
      const dim = Math.min(1, Math.sqrt(1 - rs / r) * 1.7);
      if (kind[i] === KIND_DUST) {
        const sz = size[i] * 5.4 * ps;
        ctx.globalAlpha = alpha[i] * dim * 0.95;
        ctx.drawImage(this.heatSprites[this.bucket[i]], x[i] - sz / 2, y[i] - sz / 2, sz, sz);
      } else {
        const pulse = 0.88 + 0.12 * Math.sin(now * 3.1 + i);
        const sz = size[i] * 8 * ps;
        ctx.globalAlpha = alpha[i] * dim * pulse;
        const sprite = this.starSprites[tone[i]];
        // tidal stretching along the direction of motion near the hole
        const tide = Math.max(0, Math.min(1, (7 * rs - r) / (5 * rs)));
        if (tide > 0.02) {
          const lw = sz * (1 + 3.2 * tide);
          const lh = sz * (1 - 0.5 * tide);
          ctx.save();
          ctx.translate(x[i], y[i]);
          ctx.rotate(Math.atan2(vy[i], vx[i]));
          ctx.drawImage(sprite, -lw / 2, -lh / 2, lw, lh);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, x[i] - sz / 2, y[i] - sz / 2, sz, sz);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Brief bright flashes where matter crosses the horizon. */
  private drawFlares(sim: Simulation): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of sim.flares) {
      const grow = 1 - f.life;
      const sz = (10 + grow * 34) * Math.max(0.8, sim.s);
      const r = sim.rs * 1.08;
      ctx.globalAlpha = f.life * 0.85;
      ctx.drawImage(
        this.flareSprite,
        sim.cx + Math.cos(f.angle) * r - sz / 2,
        sim.cy + Math.sin(f.angle) * r - sz / 2,
        sz,
        sz,
      );
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- event horizon

  private drawHorizon(sim: Simulation, now: number): void {
    const ctx = this.ctx;
    const { cx, cy, rs } = sim;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // the shadow: fully black inside the horizon, falling off outward
    const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, rs * 1.6);
    const edge = 1 / 1.6;
    shade.addColorStop(0, 'rgba(0,0,0,1)');
    shade.addColorStop(edge, 'rgba(0,0,0,1)');
    shade.addColorStop(edge + (1 - edge) * 0.45, 'rgba(0,0,0,0.5)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, cy, rs * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // photon ring: lensed light skimming the horizon, brighter on the approaching side
    ctx.globalCompositeOperation = 'lighter';
    const shimmer = 0.92 + 0.08 * Math.sin(now * 1.7);
    const makeRing = (hot: string, cool: string): CanvasGradient | string => {
      if (typeof ctx.createConicGradient !== 'function') return hot;
      const g = ctx.createConicGradient(Math.PI, cx, cy);
      g.addColorStop(0, hot);
      g.addColorStop(0.5, cool);
      g.addColorStop(1, hot);
      return g;
    };
    ctx.lineWidth = Math.max(5, rs * 0.3);
    ctx.strokeStyle = makeRing('rgba(255,160,100,0.20)', 'rgba(150,90,255,0.07)');
    ctx.beginPath();
    ctx.arc(cx, cy, rs * 1.08, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = shimmer;
    ctx.lineWidth = Math.max(1.5, rs * 0.05);
    ctx.strokeStyle = makeRing('rgba(255,244,224,1)', 'rgba(255,170,120,0.45)');
    ctx.beginPath();
    ctx.arc(cx, cy, rs * 1.04, 0, Math.PI * 2);
    ctx.stroke();

    // the secondary lensed image of the disk, a thin cool ring at the Einstein radius
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = makeRing('rgba(120,220,255,0.35)', 'rgba(150,120,255,0.1)');
    ctx.beginPath();
    ctx.arc(cx, cy, rs * 1.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- feedback overlays

  private drawOverlays(dt: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt / 0.7;
      if (r.t >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - r.t, 3);
      ctx.globalAlpha = (1 - r.t) * 0.7;
      ctx.strokeStyle = '#7ff0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 4 + e * 38, 0, Math.PI * 2);
      ctx.stroke();
    }

    const aim = this.aim;
    if (aim) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(127,240,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(aim.sx, aim.sy);
      ctx.lineTo(aim.ex, aim.ey);
      ctx.stroke();
      ctx.setLineDash([]);

      const ang = Math.atan2(aim.ey - aim.sy, aim.ex - aim.sx);
      ctx.beginPath();
      ctx.moveTo(aim.ex, aim.ey);
      ctx.lineTo(aim.ex - Math.cos(ang - 0.45) * 11, aim.ey - Math.sin(ang - 0.45) * 11);
      ctx.moveTo(aim.ex, aim.ey);
      ctx.lineTo(aim.ex - Math.cos(ang + 0.45) * 11, aim.ey - Math.sin(ang + 0.45) * 11);
      ctx.stroke();

      ctx.fillStyle = '#9fb4ff';
      for (let k = 2; k < aim.n; k += 3) {
        ctx.globalAlpha = 0.75 * (1 - k / (aim.n + 12));
        ctx.beginPath();
        ctx.arc(aim.path[k * 2], aim.path[k * 2 + 1], 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      if (aim.swallowed && aim.n > 0) {
        const ex = aim.path[(aim.n - 1) * 2];
        const ey = aim.path[(aim.n - 1) * 2 + 1];
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ff9a6b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#7ff0ff';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(aim.sx, aim.sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
