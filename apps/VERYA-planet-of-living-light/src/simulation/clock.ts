/**
 * The planetary clock. It owns simulated time only — visual animation
 * (wind, twinkle, creatures) runs on its own real-time clock inside the world.
 */

export const DAY_START = 5;
export const DAY_END = 19;
/** Real seconds a full 05:00 → 19:00 day takes at 1× speed. */
export const DAY_SECONDS_AT_1X = 126;
export const SPEEDS = [1, 4, 8, 16] as const;
export type Speed = (typeof SPEEDS)[number];

export interface ClockSnapshot {
  readonly time: number;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly scrubbing: boolean;
  readonly ended: boolean;
}

const clampTime = (t: number) => Math.min(DAY_END, Math.max(DAY_START, t));

export class SimulationClock {
  private time = DAY_START;
  private playing = true;
  private speed: Speed = 1;
  private scrubbing = false;
  private resumeAfterScrub = false;
  private readonly listeners = new Set<() => void>();
  private snapshot: ClockSnapshot = this.makeSnapshot();

  /** Current simulated hour (5 … 19). */
  get now(): number {
    return this.time;
  }

  get isPlaying(): boolean {
    return this.playing && !this.scrubbing;
  }

  /** Advance simulated time by a real-time delta (seconds). */
  tick(dt: number): void {
    if (!this.playing || this.scrubbing) return;
    const hoursPerSecond = (DAY_END - DAY_START) / DAY_SECONDS_AT_1X;
    let next = this.time + dt * hoursPerSecond * this.speed;
    // Loop: once night falls, wrap straight back to first light.
    if (next >= DAY_END) next = DAY_START + ((next - DAY_START) % (DAY_END - DAY_START));
    this.time = next;
    this.emit();
  }

  play = (): void => {
    if (this.time >= DAY_END - 1e-4) this.time = DAY_START;
    this.playing = true;
    this.emit();
  };

  pause = (): void => {
    this.playing = false;
    this.emit();
  };

  toggle = (): void => {
    if (this.playing) this.pause();
    else this.play();
  };

  restart = (): void => {
    this.time = DAY_START;
    this.playing = true;
    this.emit();
  };

  setSpeed = (speed: Speed): void => {
    this.speed = speed;
    this.emit();
  };

  seek = (time: number): void => {
    this.time = clampTime(time);
    this.emit();
  };

  nudge = (hours: number): void => {
    this.seek(this.time + hours);
  };

  beginScrub = (): void => {
    if (this.scrubbing) return;
    this.scrubbing = true;
    this.resumeAfterScrub = this.playing;
    this.emit();
  };

  endScrub = (): void => {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    this.playing = this.resumeAfterScrub;
    this.emit();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ClockSnapshot => this.snapshot;

  private makeSnapshot(): ClockSnapshot {
    return {
      time: this.time,
      playing: this.playing,
      speed: this.speed,
      scrubbing: this.scrubbing,
      ended: this.time >= DAY_END - 1e-4,
    };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((l) => l());
  }
}

export function formatTime(hours: number): string {
  const totalMinutes = Math.floor(hours * 60 + 1e-6);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
