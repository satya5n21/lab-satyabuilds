import { useCallback, useEffect, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { CompareIcon, EyeOffIcon, Mark } from './components/Icons';
import { Hud } from './components/Hud';
import { SimCanvas } from './components/SimCanvas';
import { DEFAULT_PARAMS, type HudStats, type SimParams } from './sim/config';

/** True when shown inside the compare page, which already offers the way back. */
const embedded = window.self !== window.top;

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [stats, setStats] = useState<HudStats | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 720);
  const [uiHidden, setUiHidden] = useState(false);
  const [hasSpawned, setHasSpawned] = useState(false);

  const change = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    setResetToken((t) => t + 1);
  }, []);

  const handleSpawn = useCallback(() => setHasSpawned(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // let a focused button handle its own Space/Enter
      if (e.key === ' ' && el && el.tagName === 'BUTTON') return;
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setParams((p) => ({ ...p, paused: !p.paused }));
          break;
        case 'r':
          reset();
          break;
        case 't':
          setParams((p) => ({ ...p, trails: !p.trails }));
          break;
        case 'h':
          setUiHidden((v) => !v);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reset]);

  return (
    <div className={`app ${uiHidden ? 'ui-hidden' : ''} ${embedded ? '' : 'has-compare'}`}>
      <SimCanvas params={params} resetToken={resetToken} onStats={setStats} onSpawn={handleSpawn} />
      <div className="vignette" aria-hidden />

      <header className="brand">
        <Mark />
        <div>
          <h1>Black Hole Playground</h1>
          <p>Gravitational sandbox · pseudo-Newtonian dynamics</p>
        </div>
      </header>

      <Hud stats={stats} strength={params.strength} paused={params.paused} />

      <ControlPanel
        params={params}
        open={panelOpen}
        onToggleOpen={() => setPanelOpen((v) => !v)}
        onChange={change}
        onReset={reset}
      />

      {!embedded && (
        <a className="compare-btn" href={`${import.meta.env.BASE_URL}compare.html`} aria-describedby="compare-tip">
          <CompareIcon />
          <span id="compare-tip" role="tooltip" className="compare-tip">
            Compare it with Gemini Neon result
          </span>
          <span className="sr-only">Compare it with Gemini Neon result</span>
        </a>
      )}

      <button
        className="ui-toggle"
        onClick={() => setUiHidden((v) => !v)}
        title="Toggle interface (H)"
        aria-label="Toggle interface"
      >
        <EyeOffIcon />
      </button>

      <p className={`hint ${hasSpawned ? 'gone' : ''}`}>
        Click to drop a star <span>·</span> drag to launch one <span>·</span> <kbd>Space</kbd> pauses
      </p>
    </div>
  );
}
