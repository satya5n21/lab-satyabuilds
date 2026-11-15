import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SimulationClock } from '../simulation/clock';
import { World } from '../world/World';

export interface WorldHandle {
  resetCamera: () => void;
}

interface Props {
  clock: SimulationClock;
  cinematic: boolean;
  onReady: () => void;
}

/** Mounts the Three.js world into the page and tears it down cleanly. */
export const WorldCanvas = forwardRef<WorldHandle, Props>(function WorldCanvas({ clock, cinematic, onReady }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let instance: World | null = null;
    try {
      instance = new World(host.current, clock, { onReady: () => ready.current() });
      world.current = instance;
      if (import.meta.env.DEV) Object.assign(window, { __veyra: instance, __veyraClock: clock });
    } catch (e) {
      console.error(e);
      setError('VEYRA needs WebGL 2 to render. Try a recent desktop or mobile browser with hardware acceleration enabled.');
    }
    return () => {
      instance?.dispose();
      world.current = null;
    };
  }, [clock]);

  useEffect(() => {
    world.current?.setCinematic(cinematic);
  }, [cinematic]);

  useImperativeHandle(ref, () => ({ resetCamera: () => world.current?.resetCamera() }), []);

  return (
    <div ref={host} className="world">
      {error && <p className="world__error">{error}</p>}
    </div>
  );
});
