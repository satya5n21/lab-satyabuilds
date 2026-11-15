import { useEffect, useRef, useState } from 'react';
import type { SimulationClock } from '../simulation/clock';
import { phaseAt, type Phase } from '../simulation/environment';

/** A brief documentary-style title card whenever the day enters a new chapter. */
export function PhaseCaption({ clock, enabled }: { clock: SimulationClock; enabled: boolean }) {
  const [phase, setPhase] = useState<Phase>(() => phaseAt(clock.now));
  const [visible, setVisible] = useState(false);
  const current = useRef(phase.index);
  const timer = useRef<number>();

  useEffect(() => {
    const show = (next: Phase) => {
      setPhase(next);
      setVisible(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setVisible(false), 3600);
    };
    // Opening card
    const opening = window.setTimeout(() => show(phaseAt(clock.now)), 1400);
    const unsubscribe = clock.subscribe(() => {
      const next = phaseAt(clock.now);
      if (next.index === current.current) return;
      current.current = next.index;
      if (clock.getSnapshot().scrubbing) return;
      show(next);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(opening);
      window.clearTimeout(timer.current);
    };
  }, [clock]);

  return (
    <div className={`caption${visible && enabled ? ' is-visible' : ''}`} aria-hidden="true">
      <span className="caption__numeral">{phase.numeral}</span>
      <span className="caption__name">{phase.name}</span>
    </div>
  );
}
