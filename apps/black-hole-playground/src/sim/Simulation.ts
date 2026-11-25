import type { HudStats } from './config';

/**
 * Simplified relativistic gravity.
 *
 * Particles feel the Paczynski-Wiita pseudo-Newtonian force
 *
 *     a = GM / (r - rs)^2,   rs = 2GM / c^2
 *
 * which reproduces the key strong-field behaviour of a Schwarzschild black hole with plain
 * Newtonian machinery: the force diverges at the horizon radius rs, circular orbits become
 * unstable inside 3 rs (the ISCO), and anything that crosses rs is gone for good.
 * Orbits are integrated with an adaptive kick-drift-kick leapfrog (symplectic, so bound
 * orbits keep their energy), with smaller steps the closer a particle is to the horizon.
 *
 * Positions are in CSS pixels. All lengths and speeds scale with `s` (viewport scale) so the
 * scene looks the same on any screen size.
 */

export const CAPACITY = 3600;
export const MAX_STARS = 140;
export const MAX_USER_DUST = 800;

export const STATE_FREE = 0;
export const STATE_AMBIENT = 1;
export const STATE_USER = 2;
export const STATE_DYING = 3;

export const KIND_DUST = 0;
export const KIND_STAR = 1;
export const STAR_TONES = 5;

const REF_RS = 31; //horizon radius (px) at strength 1 on a 900px viewport
const REF_C = 520; // speed of light (px/s) on a 900px viewport
const DUST_DRAG = 0.012; // faint viscosity: lets the disk slowly spiral in
const MAX_FLARES = 40;

export interface Flare {
  angle: number;
  life: number;
}

export interface Prediction {
  pts: Float32Array;
  n: number;
  swallowed: boolean;
}

function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class Simulation {
  readonly x = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly vx = new Float32Array(CAPACITY);
  readonly vy = new Float32Array(CAPACITY);
  /** Position at the end of the previous update, for trail segments. */
  readonly px = new Float32Array(CAPACITY);
  readonly py = new Float32Array(CAPACITY);
  readonly size = new Float32Array(CAPACITY);
  readonly alpha = new Float32Array(CAPACITY);
  readonly state = new Uint8Array(CAPACITY);
  readonly kind = new Uint8Array(CAPACITY);
  readonly tone = new Uint8Array(CAPACITY);
  private readonly seq = new Uint32Array(CAPACITY);

  w = 1;
  h = 1;
  cx = 0.5;
  cy = 0.5;
  /** Viewport scale. */
  s = 1;

  strength = 1;
  rs = REF_RS;
  c = REF_C;
  GM = (REF_RS * REF_C * REF_C) / 2;
  /** Innermost stable circular orbit, 3 rs (a little margin added for spawning). */
  rInner = 3.15 * REF_RS;
  rOuter = 400;
  private killR2 = 1e9;

  simTime = 0;
  swallowed = 0;
  flares: Flare[] = [];

  private ambient = 0;
  private stars = 0;
  private userDust = 0;
  private seqCounter = 0;
  private freeHint = 0;
  private killCursor = 0;
  private readonly out = new Float64Array(4);
  private readonly pathBuf = new Float32Array(2 * 260);

  configure(w: number, h: number): void {
    const oldCx = this.cx;
    const oldCy = this.cy;
    this.w = w;
    this.h = h;
    this.cx = w / 2;
    this.cy = h / 2;
    this.s = Math.min(1.5, Math.max(0.55, Math.min(w, h) / 900));
    this.recompute();
    // keep everything where it was relative to the black hole
    const dx = this.cx - oldCx;
    const dy = this.cy - oldCy;
    if (dx !== 0 || dy !== 0) {
      for (let i = 0; i < CAPACITY; i++) {
        if (this.state[i] === STATE_FREE) continue;
        this.x[i] += dx;
        this.y[i] += dy;
        this.px[i] += dx;
        this.py[i] += dy;
      }
    }
  }

  setStrength(strength: number): void {
    if (strength === this.strength) return;
    this.strength = strength;
    this.recompute();
  }

  private recompute(): void {
    this.rs = REF_RS * this.strength * this.s;
    this.c = REF_C * this.s;
    this.GM = (this.rs * this.c * this.c) / 2;
    this.rInner = 3.15 * this.rs;
    this.rOuter = Math.max(this.rInner * 1.5, 0.47 * Math.min(this.w, this.h));
    const kill = Math.hypot(this.w, this.h) * 0.62;
    this.killR2 = kill * kill;
  }

  /** Speed of a circular orbit at radius r under the pseudo-Newtonian potential. */
  circularSpeed(r: number): number {
    const d = Math.max(r - this.rs, this.rs * 0.05);
    return Math.sqrt(this.GM * r) / d;
  }

  /**
   * Advances one particle by dt. Returns true if it crossed the event horizon.
   * Result is written into `out` as x, y, vx, vy.
   */
  private advance(
    x: number,
    y: number,
    vx: number,
    vy: number,
    dt: number,
    drag: number,
    out: Float64Array,
  ): boolean {
    const { cx, cy, rs, GM, c } = this;
    const capture = rs * 1.03;
    const vMax = c * 1.2;
    let px = x - cx;
    let py = y - cy;
    let t = dt;
    let steps = 0;
    while (t > 1e-7) {
      let r = Math.sqrt(px * px + py * py);
      if (r < capture) return true;
      const sp = Math.sqrt(vx * vx + vy * vy);
      let h = (0.1 * (r - rs)) / (sp + 0.08 * c);
      if (h > t) h = t;
      if (++steps > 48) {
        if (r - rs < rs * 0.5) return true;
        h = t;
      }
      let d = r - rs;
      let a = GM / (d * d);
      vx -= ((a * px) / r) * h * 0.5;
      vy -= ((a * py) / r) * h * 0.5;
      px += vx * h;
      py += vy * h;
      r = Math.sqrt(px * px + py * py);
      if (r < 1e-6) return true;
      d = Math.max(r - rs, rs * 0.02);
      a = GM / (d * d);
      vx -= ((a * px) / r) * h * 0.5;
      vy -= ((a * py) / r) * h * 0.5;
      if (drag > 0) {
        const f = Math.exp(-drag * h);
        vx *= f;
        vy *= f;
      }
      const v2 = vx * vx + vy * vy;
      if (v2 > vMax * vMax) {
        const k = vMax / Math.sqrt(v2);
        vx *= k;
        vy *= k;
      }
      t -= h;
    }
    out[0] = px + cx;
    out[1] = py + cy;
    out[2] = vx;
    out[3] = vy;
    return false;
  }

  update(dt: number): void {
    this.simTime += dt;
    const { x, y, vx, vy, px, py, alpha, state, kind, out } = this;
    const fadeIn = dt * 2.2;
    const fadeOut = dt * 3.5;
    for (let i = 0; i < CAPACITY; i++) {
      const st = state[i];
      if (st === STATE_FREE) continue;
      px[i] = x[i];
      py[i] = y[i];
      const drag = kind[i] === KIND_DUST ? DUST_DRAG : 0;
      if (this.advance(x[i], y[i], vx[i], vy[i], dt, drag, out)) {
        this.absorb(i);
        continue;
      }
      x[i] = out[0];
      y[i] = out[1];
      vx[i] = out[2];
      vy[i] = out[3];
      const dx = x[i] - this.cx;
      const dy = y[i] - this.cy;
      if (dx * dx + dy * dy > this.killR2) {
        this.release(i);
        continue;
      }
      if (st === STATE_DYING) {
        alpha[i] -= fadeOut;
        if (alpha[i] <= 0) this.release(i);
      } else if (alpha[i] < 1) {
        alpha[i] = Math.min(1, alpha[i] + fadeIn);
      }
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      this.flares[i].life -= dt * 1.7;
      if (this.flares[i].life <= 0) this.flares.splice(i, 1);
    }
  }

  /**
   * Keeps the number of ambient particles at `target`. New ones fade in and surplus ones fade out,
   * unless `instant` (used while paused, when fading would never advance).
   */
  syncPopulation(target: number, instant: boolean): void {
    const diff = target - this.ambient;
    if (diff > 0) {
      let n = instant ? diff : Math.min(diff, 40);
      while (n-- > 0) {
        const i = this.alloc();
        if (i < 0) break;
        this.spawnAmbient(i, instant);
      }
    } else if (diff < 0) {
      let n = instant ? -diff : Math.min(-diff, 40);
      for (let k = 0; k < CAPACITY && n > 0; k++) {
        const i = (this.killCursor + k) % CAPACITY;
        if (this.state[i] !== STATE_AMBIENT) continue;
        this.ambient--;
        n--;
        if (instant) {
          this.state[i] = STATE_FREE;
        } else {
          this.state[i] = STATE_DYING;
        }
        this.killCursor = i + 1;
      }
    }
  }

  reset(target: number): void {
    this.state.fill(STATE_FREE);
    this.ambient = 0;
    this.stars = 0;
    this.userDust = 0;
    this.swallowed = 0;
    this.simTime = 0;
    this.flares.length = 0;
    this.syncPopulation(target, true);
  }

  private alloc(): number {
    for (let k = 0; k < CAPACITY; k++) {
      const i = (this.freeHint + k) % CAPACITY;
      if (this.state[i] === STATE_FREE) {
        this.freeHint = i + 1;
        return i;
      }
    }
    return -1;
  }

  private release(i: number): void {
    const st = this.state[i];
    if (st === STATE_AMBIENT) this.ambient--;
    else if (st === STATE_USER) {
      if (this.kind[i] === KIND_STAR) this.stars--;
      else this.userDust--;
    }
    this.state[i] = STATE_FREE;
  }

  private absorb(i: number): void {
    this.swallowed++;
    if (this.flares.length < MAX_FLARES) {
      this.flares.push({ angle: Math.atan2(this.y[i] - this.cy, this.x[i] - this.cx), life: 1 });
    }
    this.release(i);
  }

  private place(i: number, x: number, y: number, vx: number, vy: number): void {
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.seq[i] = ++this.seqCounter;
  }

  private spawnAmbient(i: number, instant: boolean): void {
    const { rInner, rOuter } = this;
    const u = Math.random();
    const mode = Math.random();
    let r: number;
    let f: number;
    let radialOnly = false;
    if (mode < 0.7) {
      // the disk: near-circular orbits, denser toward the centre
      r = rInner + (rOuter - rInner) * Math.pow(u, 1.7);
      f = 0.94 + Math.random() * 0.1;
    } else if (mode < 0.95) {
      // eccentric orbits: the low ones plunge, the others swing close and back out
      r = rInner + (rOuter - rInner) * (0.35 + 0.65 * u);
      f = 0.55 + Math.random() * 0.42;
    } else {
      // infall from the outskirts on a loose heading
      r = rOuter * (0.8 + 0.3 * u);
      f = 0.1 + Math.random() * 0.4;
      radialOnly = true;
    }
    const phi = Math.random() * Math.PI * 2;
    const ux = Math.cos(phi);
    const uy = Math.sin(phi);
    const v = this.circularSpeed(r) * f;
    let vx: number;
    let vy: number;
    if (radialOnly) {
      const head = Math.random() * Math.PI * 2;
      vx = Math.cos(head) * v;
      vy = Math.sin(head) * v;
    } else {
      // tangential, clockwise on screen
      vx = -uy * v;
      vy = ux * v;
    }
    this.place(i, this.cx + ux * r, this.cy + uy * r, vx, vy);
    this.size[i] = 0.65 + Math.pow(Math.random(), 2) * 1.5;
    this.alpha[i] = instant ? 1 : 0;
    this.state[i] = STATE_AMBIENT;
    this.kind[i] = KIND_DUST;
    this.tone[i] = 0;
    this.ambient++;
  }

  /** Kills the `n` oldest user-spawned particles of a kind so new ones fit under the cap. */
  private evictOldest(kind: number, n: number): void {
    for (let j = 0; j < n; j++) {
      let best = -1;
      let bestSeq = Infinity;
      for (let i = 0; i < CAPACITY; i++) {
        if (this.state[i] === STATE_USER && this.kind[i] === kind && this.seq[i] < bestSeq) {
          bestSeq = this.seq[i];
          best = i;
        }
      }
      if (best < 0) return;
      this.release(best);
    }
  }

  /**
   * Drops a star and a small cloud of dust at (x, y). Without `launch` it starts on a
   * roughly circular orbit (varied, so some spiral in and some swing wide).
   * Returns false if the point is inside the horizon.
   */
  spawnAt(x: number, y: number, launch?: { vx: number; vy: number }): boolean {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const r = Math.hypot(dx, dy);
    if (r < this.rs * 1.4) return false;

    let bvx: number;
    let bvy: number;
    if (launch) {
      bvx = launch.vx;
      bvy = launch.vy;
    } else {
      const vc = this.circularSpeed(r);
      const f = 0.62 + Math.random() * 0.4;
      const ux = dx / r;
      const uy = dy / r;
      const radial = (Math.random() - 0.5) * 0.12 * vc;
      bvx = -uy * vc * f + ux * radial;
      bvy = ux * vc * f + uy * radial;
    }
    const bsp = Math.hypot(bvx, bvy);

    if (this.stars >= MAX_STARS) this.evictOldest(KIND_STAR, 1);
    const si = this.alloc();
    if (si >= 0) {
      this.place(si, x, y, bvx, bvy);
      this.size[si] = 2.4 + Math.random() * 1.8;
      this.alpha[si] = 1;
      this.state[si] = STATE_USER;
      this.kind[si] = KIND_STAR;
      this.tone[si] = Math.floor(Math.random() * STAR_TONES);
      this.stars++;
    }

    const burst = 14;
    if (this.userDust + burst > MAX_USER_DUST) {
      this.evictOldest(KIND_DUST, this.userDust + burst - MAX_USER_DUST);
    }
    const jitter = Math.max(10, bsp * 0.07);
    for (let k = 0; k < burst; k++) {
      const i = this.alloc();
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 16 * this.s;
      this.place(
        i,
        x + Math.cos(a) * d,
        y + Math.sin(a) * d,
        bvx + randn() * jitter,
        bvy + randn() * jitter,
      );
      this.size[i] = 0.8 + Math.random() * 1.0;
      this.alpha[i] = 1;
      this.state[i] = STATE_USER;
      this.kind[i] = KIND_DUST;
      this.tone[i] = 0;
      this.userDust++;
    }
    return true;
  }

  /** Where a body launched from (x, y) with the given velocity would go (no drag). */
  predict(x: number, y: number, vx: number, vy: number): Prediction {
    const out = this.out;
    const buf = this.pathBuf;
    let n = 0;
    let swallowed = false;
    let cx = x;
    let cy = y;
    let cvx = vx;
    let cvy = vy;
    const steps = buf.length / 2;
    for (let k = 0; k < steps; k++) {
      if (this.advance(cx, cy, cvx, cvy, 1 / 40, 0, out)) {
        swallowed = true;
        break;
      }
      cx = out[0];
      cy = out[1];
      cvx = out[2];
      cvy = out[3];
      buf[n * 2] = cx;
      buf[n * 2 + 1] = cy;
      n++;
      const ex = cx - this.cx;
      const ey = cy - this.cy;
      if (ex * ex + ey * ey > this.killR2) break;
    }
    return { pts: buf, n, swallowed };
  }

  computeStats(): Omit<HudStats, 'fps'> {
    let alive = 0;
    let bound = 0;
    let stars = 0;
    const { x, y, vx, vy, state, kind, cx, cy, rs, GM } = this;
    for (let i = 0; i < CAPACITY; i++) {
      if (state[i] === STATE_FREE || state[i] === STATE_DYING) continue;
      alive++;
      if (kind[i] === KIND_STAR) stars++;
      const dx = x[i] - cx;
      const dy = y[i] - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const energy = 0.5 * (vx[i] * vx[i] + vy[i] * vy[i]) - GM / Math.max(r - rs, rs * 0.02);
      if (energy < 0) bound++;
    }
    return { alive, bound, escaping: alive - bound, swallowed: this.swallowed, stars };
  }
}
