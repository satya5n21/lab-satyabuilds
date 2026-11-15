import { useEffect, useState } from 'react';
import { formatTime, type SimulationClock } from '../simulation/clock';
import { phaseAt } from '../simulation/environment';
import { IconClose } from './icons';
import { useClock } from './useClock';

/** Letterbox bars, a whisper of a caption and an exit control that appears when the pointer moves. */
export function CinematicOverlay({ clock, active, onExit }: { clock: SimulationClock; active: boolean; onExit: () => void }) {
  const { time } = useClock(clock);
  const [awake, setAwake] = useState(true);

  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => setAwake(false), 3200);
    setAwake(true);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), 2600);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [active]);

  return (
    <div className={`cinema${active ? ' is-active' : ''}${awake ? ' is-awake' : ''}`}>
      <div className="cinema__bar cinema__bar--top" />
      <div className="cinema__bar cinema__bar--bottom" />
      <div className="cinema__caption" aria-hidden="true">
        {formatTime(time)} <i /> {phaseAt(time).name}
      </div>
      <button type="button" className="cinema__exit glass" onClick={onExit} tabIndex={active ? 0 : -1} aria-hidden={!active}>
        <IconClose />
        Exit cinematic
        <kbd>Esc</kbd>
      </button>
    </div>
  );
}
