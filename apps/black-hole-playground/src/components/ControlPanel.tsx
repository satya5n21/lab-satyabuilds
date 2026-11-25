import { RANGES, type SimParams } from '../sim/config';
import { ChevronIcon, PauseIcon, PlayIcon, ResetIcon } from './Icons';

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint: string;
  onChange: (v: number) => void;
}

function Slider({ id, label, value, min, max, step, display, hint, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as string]: `${pct}%` }}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p className="field-hint">{hint}</p>
    </div>
  );
}

interface Props {
  params: SimParams;
  open: boolean;
  onToggleOpen: () => void;
  onChange: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  onReset: () => void;
}

export function ControlPanel({ params, open, onToggleOpen, onChange, onReset }: Props) {
  return (
    <aside className={`panel ${open ? 'is-open' : ''}`} aria-label="Simulation controls">
      <button className="panel-head" onClick={onToggleOpen} aria-expanded={open}>
        <span>Controls</span>
        <ChevronIcon open={open} />
      </button>

      <div className="panel-body">
        <Slider
          id="strength"
          label="Gravity strength"
          {...RANGES.strength}
          value={params.strength}
          display={`${params.strength.toFixed(2)} M`}
          hint="Mass of the hole. Heavier means a bigger horizon and a wider unstable zone."
          onChange={(v) => onChange('strength', v)}
        />
        <Slider
          id="speed"
          label="Particle speed"
          {...RANGES.speed}
          value={params.speed}
          display={`${params.speed.toFixed(2)}×`}
          hint="How fast simulated time runs."
          onChange={(v) => onChange('speed', v)}
        />
        <Slider
          id="count"
          label="Particles"
          {...RANGES.count}
          value={params.count}
          display={String(params.count)}
          hint="Ambient matter in orbit around the hole."
          onChange={(v) => onChange('count', v)}
        />

        <div className="toggle-row">
          <label htmlFor="trails">
            Particle trails <kbd>T</kbd>
          </label>
          <button
            id="trails"
            role="switch"
            aria-checked={params.trails}
            className={`switch ${params.trails ? 'on' : ''}`}
            onClick={() => onChange('trails', !params.trails)}
          >
            <span />
          </button>
        </div>

        <div className="button-row">
          <button className="btn primary" onClick={() => onChange('paused', !params.paused)}>
            {params.paused ? <PlayIcon /> : <PauseIcon />}
            {params.paused ? 'Resume' : 'Pause'}
            <kbd>Space</kbd>
          </button>
          <button className="btn" onClick={onReset} title="Clear the scene and restore default settings">
            <ResetIcon />
            Reset
            <kbd>R</kbd>
          </button>
        </div>
      </div>
    </aside>
  );
}
