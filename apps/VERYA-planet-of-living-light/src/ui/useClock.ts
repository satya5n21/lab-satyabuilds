import { useSyncExternalStore } from 'react';
import type { ClockSnapshot, SimulationClock } from '../simulation/clock';

/** Subscribe a component to the planetary clock. */
export function useClock(clock: SimulationClock): ClockSnapshot {
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
}
