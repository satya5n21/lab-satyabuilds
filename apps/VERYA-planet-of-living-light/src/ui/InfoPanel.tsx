import { formatTime, type SimulationClock } from '../simulation/clock';
import { readoutAt } from '../simulation/environment';
import { useClock } from './useClock';

/** Small environmental read-out, derived from the same model that drives the world. */
export function InfoPanel({ clock }: { clock: SimulationClock }) {
  const { time } = useClock(clock);
  const r = readoutAt(time);
  const light = Math.round(r.light * 100);
  const bio = Math.round(r.bio * 100);

  return (
    <aside className="info glass" aria-label="Environment">
      <dl>
        <div className="info__row">
          <dt>Planetary time</dt>
          <dd className="info__time">{formatTime(time)}</dd>
        </div>
        <div className="info__row">
          <dt>Atmosphere</dt>
          <dd>{r.atmosphere}</dd>
        </div>
        <div className="info__row">
          <dt>Light level</dt>
          <dd>
            <span className="meter meter--amber" aria-hidden="true">
              <span style={{ width: `${light}%` }} />
            </span>
            <span className="info__num">{light}%</span>
          </dd>
        </div>
        <div className="info__row">
          <dt>Bioluminescence</dt>
          <dd>
            <span className="meter meter--cyan" aria-hidden="true">
              <span style={{ width: `${bio}%` }} />
            </span>
            <span className="info__num info__num--wide">{r.bioStatus}</span>
          </dd>
        </div>
      </dl>
    </aside>
  );
}
