import { useState } from 'react';
import './compare.css';

// Side-by-side comparison. Each result runs in its own iframe so neither one's
// CSS, fixed-position HUD, keyboard shortcuts or WebGL canvas can affect the other.
const panes = [
  { id: 'fable', label: 'Fable 5.2', src: import.meta.env.BASE_URL },
  { id: 'gemini', label: 'Gemini Hydrogen', src: `${import.meta.env.BASE_URL}gemini.html` },
] as const;

type PaneId = (typeof panes)[number]['id'];

const ENLARGED = 90;

const IconExpand = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

const IconShrink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7" />
  </svg>
);

export default function ComparePage() {
  const [enlarged, setEnlarged] = useState<PaneId | null>(null);

  return (
    <div className="cmp">
      {panes.map((p) => {
        const isEnlarged = enlarged === p.id;
        const basis = enlarged === null ? 50 : isEnlarged ? ENLARGED : 100 - ENLARGED;
        return (
          <div key={p.id} className="cmp__pane" style={{ flex: `0 0 ${basis}%` }}>
            <iframe className="cmp__frame" title={p.label} src={p.src} allow="fullscreen" />
            <div className="cmp__tag">
              <span className="cmp__label">{p.label}</span>
              <button
                type="button"
                className="cmp__btn"
                onClick={() => setEnlarged(isEnlarged ? null : p.id)}
                aria-label={isEnlarged ? `Restore ${p.label}` : `Enlarge ${p.label}`}
                title={isEnlarged ? 'Restore equal width' : 'Enlarge'}
              >
                {isEnlarged ? <IconShrink /> : <IconExpand />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
