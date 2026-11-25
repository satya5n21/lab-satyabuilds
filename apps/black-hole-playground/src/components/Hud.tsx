import { REFERENCE_MASS_MSUN_MILLIONS, RS_KM_PER_MSUN, type HudStats } from '../sim/config';

interface Props {
  stats: HudStats | null;
  strength: number;
  paused: boolean;
}

function fmtMkm(strength: number): string {
  const km = REFERENCE_MASS_MSUN_MILLIONS * 1e6 * strength * RS_KM_PER_MSUN;
  return `${(km / 1e6).toFixed(1)} M km`;
}

export function Hud({ stats, strength, paused }: Props) {
  const rows: [string, string][] = [
    ['Mass', `${(REFERENCE_MASS_MSUN_MILLIONS * strength).toFixed(2)}×10⁶ M☉`],
    ['Horizon Rs', fmtMkm(strength)],
    ['ISCO', fmtMkm(strength * 3)],
    ['Particles', stats ? String(stats.alive) : '–'],
    ['Bound', stats ? String(stats.bound) : '–'],
    ['Escaping', stats ? String(stats.escaping) : '–'],
    ['Swallowed', stats ? stats.swallowed.toLocaleString() : '–'],
  ];
  return (
    <section className="hud" aria-label="Simulation readout">
      <div className="hud-title">
        <span className={`dot ${paused ? 'paused' : ''}`} />
        {paused ? 'Paused' : 'Live'}
        <span className="fps">{stats ? `${stats.fps} fps` : ''}</span>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
