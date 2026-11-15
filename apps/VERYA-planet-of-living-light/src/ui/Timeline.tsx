import { useCallback, type CSSProperties } from 'react';
import { DAY_END, DAY_START, SPEEDS, formatTime, type SimulationClock } from '../simulation/clock';
import { SUNSET, phaseAt } from '../simulation/environment';
import { IconPause, IconPlay, IconRestart } from './icons';
import { useClock } from './useClock';

const MARKERS = [
  { time: 7, label: 'Sunrise', short: 'Rise', tone: 'warm', align: 'center' },
  { time: 12, label: 'Noon', short: 'Noon', tone: 'cool', align: 'center' },
  { time: 17.5, label: 'Golden hour', short: 'Gold', tone: 'warm', align: 'end' },
  { time: SUNSET, label: 'Sunset', short: 'Set', tone: 'cool', align: 'start' },
] as const;

const fraction = (time: number) => (time - DAY_START) / (DAY_END - DAY_START);

/** Position along the track, matching where the native range thumb sits. */
const trackPosition = (time: number): CSSProperties => {
  const f = fraction(time);
  return { left: `calc(${f * 100}% + ${(0.5 - f).toFixed(4)} * var(--thumb))` };
};

export function Timeline({ clock }: { clock: SimulationClock }) {
  const snap = useClock(clock);
  const phase = phaseAt(snap.time);

  const beginScrub = useCallback(() => {
    clock.beginScrub();
    const end = () => {
      clock.endScrub();
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, [clock]);

  const playLabel = snap.playing ? 'Pause' : snap.ended ? 'Replay the day' : 'Play';

  return (
    <section className="timeline glass" aria-label="Planetary timeline">
      <div className="timeline__top">
        <div className="transport">
          <button type="button" className="icon-btn" onClick={clock.restart} aria-label="Restart from first light" title="Restart">
            <IconRestart />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--primary"
            onClick={clock.toggle}
            aria-label={playLabel}
            title={`${playLabel} (Space)`}
          >
            {snap.playing ? <IconPause /> : <IconPlay />}
          </button>
        </div>

        <div className="readout" aria-live="off">
          <span className="readout__time">{formatTime(snap.time)}</span>
          <span className="readout__phase">
            <i>{phase.numeral}</i>
            {phase.name}
          </span>
        </div>

        <div className="speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`speed${snap.speed === speed ? ' is-active' : ''}`}
              aria-pressed={snap.speed === speed}
              onClick={() => clock.setSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      </div>

      <div className="track">
        <div className="track__rail">
          <div className="track__fill" style={{ width: `calc(${fraction(snap.time) * 100}% + ${(0.5 - fraction(snap.time)).toFixed(4)} * var(--thumb))` }} />
        </div>
        {MARKERS.map((m) => (
          <span key={m.label} className={`track__tick track__tick--${m.tone}`} style={trackPosition(m.time)} />
        ))}
        <input
          className="track__input"
          type="range"
          min={DAY_START}
          max={DAY_END}
          step={0.005}
          value={snap.time}
          aria-label="Planetary time"
          aria-valuetext={`${formatTime(snap.time)}, ${phase.name}`}
          onChange={(e) => clock.seek(Number(e.target.value))}
          onPointerDown={beginScrub}
        />
      </div>

      <div className="track__labels">
        <span className="track__end">05:00</span>
        {MARKERS.map((m) => (
          <button
            key={m.label}
            type="button"
            className={`track__label track__label--${m.align} track__label--${m.tone}`}
            style={trackPosition(m.time)}
            onClick={() => clock.seek(m.time)}
            title={`Jump to ${m.label.toLowerCase()} · ${formatTime(m.time)}`}
          >
            <span className="label-full">{m.label}</span>
            <span className="label-short">{m.short}</span>
          </button>
        ))}
        <span className="track__end track__end--right">19:00</span>
      </div>
    </section>
  );
}
