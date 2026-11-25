import { useEffect, useRef } from 'react';
import type { HudStats, SimParams } from '../sim/config';
import { Renderer } from '../sim/Renderer';
import { Simulation } from '../sim/Simulation';

interface Props {
  params: SimParams;
  resetToken: number;
  onStats: (stats: HudStats) => void;
  onSpawn: () => void;
}

/** Launch speed (px/s) per pixel dragged, before viewport scaling. */
const LAUNCH_GAIN = 2.4;
const DRAG_THRESHOLD = 9;

interface Engine {
  sim: Simulation;
  renderer: Renderer;
}

export function SimCanvas({ params, resetToken, onStats, onSpawn }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onSpawnRef = useRef(onSpawn);
  onSpawnRef.current = onSpawn;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const sim = new Simulation();
    const renderer = new Renderer(canvas);
    engineRef.current = { sim, renderer };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sim.configure(rect.width, rect.height);
      renderer.resize(rect.width, rect.height, dpr);
    };
    resize();
    sim.setStrength(paramsRef.current.strength);
    sim.reset(paramsRef.current.count);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // ---- pointer: click to drop a star, drag to launch one
    const aim = { active: false, dragging: false, id: -1, sx: 0, sy: 0 };
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const launchVelocity = (ex: number, ey: number) => {
      let vx = (ex - aim.sx) * LAUNCH_GAIN * sim.s;
      let vy = (ey - aim.sy) * LAUNCH_GAIN * sim.s;
      const vmax = sim.c * 0.9;
      const v = Math.hypot(vx, vy);
      if (v > vmax) {
        vx *= vmax / v;
        vy *= vmax / v;
      }
      return { vx, vy };
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const p = local(e);
      aim.active = true;
      aim.dragging = false;
      aim.id = e.pointerId;
      aim.sx = p.x;
      aim.sy = p.y;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!aim.active || e.pointerId !== aim.id) return;
      const p = local(e);
      if (!aim.dragging && Math.hypot(p.x - aim.sx, p.y - aim.sy) > DRAG_THRESHOLD) aim.dragging = true;
      if (!aim.dragging) return;
      const { vx, vy } = launchVelocity(p.x, p.y);
      const { pts, n, swallowed } = sim.predict(aim.sx, aim.sy, vx, vy);
      renderer.aim = { sx: aim.sx, sy: aim.sy, ex: p.x, ey: p.y, path: pts, n, swallowed };
    };
    const finish = (e: PointerEvent, commit: boolean) => {
      if (!aim.active || e.pointerId !== aim.id) return;
      const p = local(e);
      aim.active = false;
      renderer.aim = null;
      if (!commit) return;
      const ok = aim.dragging ? sim.spawnAt(aim.sx, aim.sy, launchVelocity(p.x, p.y)) : sim.spawnAt(p.x, p.y);
      renderer.addRipple(aim.dragging ? aim.sx : p.x, aim.dragging ? aim.sy : p.y);
      if (ok) onSpawnRef.current();
    };
    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aim.active) {
        aim.active = false;
        renderer.aim = null;
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    // ---- frame loop
    let raf = 0;
    let last = performance.now();
    let statsAt = last;
    let frames = 0;
    let trailsWereOn = paramsRef.current.trails;
    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
      last = nowMs;
      const p = paramsRef.current;

      sim.setStrength(p.strength);
      sim.syncPopulation(p.count, p.paused);
      const simDt = p.paused ? 0 : dt * p.speed;
      if (simDt > 0) sim.update(simDt);

      if (!p.trails && trailsWereOn) renderer.clearTrails();
      trailsWereOn = p.trails;
      renderer.render(sim, { trails: p.trails, paused: p.paused, simDt, now: nowMs / 1000, dt });

      frames++;
      if (nowMs - statsAt >= 400) {
        const fps = Math.round((frames * 1000) / (nowMs - statsAt));
        onStatsRef.current({ fps, ...sim.computeStats() });
        frames = 0;
        statsAt = nowMs;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.sim.setStrength(paramsRef.current.strength);
    engine.sim.reset(paramsRef.current.count);
    engine.renderer.clearTrails();
  }, [resetToken]);

  return (
    <canvas
      ref={canvasRef}
      className="scene"
      aria-label="Black hole simulation. Click to spawn stars, drag to launch them."
    />
  );
}
