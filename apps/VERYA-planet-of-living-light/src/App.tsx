import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorldCanvas, type WorldHandle } from './components/WorldCanvas';
import { SimulationClock } from './simulation/clock';
import { CinematicOverlay } from './ui/CinematicOverlay';
import { CompareLink } from './ui/CompareLink';
import { InfoPanel } from './ui/InfoPanel';
import { PhaseCaption } from './ui/PhaseCaption';
import { Timeline } from './ui/Timeline';
import { ViewControls } from './ui/ViewControls';

export default function App() {
  const clock = useMemo(() => new SimulationClock(), []);
  const world = useRef<WorldHandle>(null);
  const [cinematic, setCinematic] = useState(false);
  const [ready, setReady] = useState(false);

  const resetCamera = useCallback(() => world.current?.resetCamera(), []);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const onRange = el instanceof HTMLInputElement && el.type === 'range';
      const onButton = el instanceof HTMLButtonElement;
      switch (e.key) {
        case ' ':
          if (onButton) return;
          e.preventDefault();
          clock.toggle();
          break;
        case 'ArrowLeft':
          if (onRange) return;
          clock.nudge(-0.25);
          break;
        case 'ArrowRight':
          if (onRange) return;
          clock.nudge(0.25);
          break;
        case 'c':
        case 'C':
          setCinematic((v) => !v);
          break;
        case 'r':
        case 'R':
          resetCamera();
          break;
        case 'Escape':
          setCinematic(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock, resetCamera]);

  return (
    <div className={`app${cinematic ? ' is-cinematic' : ''}${ready ? ' is-ready' : ''}`}>
      <WorldCanvas ref={world} clock={clock} cinematic={cinematic} onReady={onReady} />
      <div className="vignette" aria-hidden="true" />

      <div className="hud">
        <header className="brand">
          <h1>VEYRA</h1>
          <p>Planet of the Living Light</p>
        </header>
        <InfoPanel clock={clock} />
        <Timeline clock={clock} />
        <CompareLink />
        <ViewControls onResetCamera={resetCamera} onCinematic={() => setCinematic(true)} />
      </div>

      <PhaseCaption clock={clock} enabled={ready} />
      <CinematicOverlay clock={clock} active={cinematic} onExit={() => setCinematic(false)} />

      <div className="intro" aria-hidden="true">
        <span className="intro__title">VEYRA</span>
        <span className="intro__sub">Planet of the Living Light</span>
      </div>
    </div>
  );
}
