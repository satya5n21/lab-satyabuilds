import { useEffect, useRef, useState } from 'react';

type PaneId = 'claude' | 'gemini';

const base = import.meta.env.BASE_URL;

const PANES: { id: PaneId; title: string; sub: string; src: string }[] = [
  { id: 'claude', title: 'Claude', sub: 'This build', src: base },
  { id: 'gemini', title: 'Gemini Neon', sub: 'Same prompt', src: `${base}gemini.html` },
];

const icon = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const Enlarge = () => (
  <svg {...icon}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const Shrink = () => (
  <svg {...icon}>
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
  </svg>
);

const Back = () => (
  <svg {...icon}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export default function Compare() {
  const [enlarged, setEnlarged] = useState<PaneId | null>(null);
  const [focused, setFocused] = useState<PaneId | null>(null);
  const frames = useRef<Record<PaneId, HTMLIFrameElement | null>>({ claude: null, gemini: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlarged(null);
    };
    // Clicking into an iframe blurs this window; see which frame took focus.
    const onBlur = () =>
      window.setTimeout(() => {
        const active = document.activeElement;
        setFocused(PANES.find((p) => frames.current[p.id] === active)?.id ?? null);
      }, 0);
    const onFocus = () => setFocused(null);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <div className="cmp">
      <header className="cmp-bar">
        <a className="cmp-back" href={base}>
          <Back />
          Back
        </a>
        <h1>Black Hole Playground · side by side</h1>
        <p>Both versions are live. Click into either one to play with it.</p>
      </header>

      <main className="cmp-stage">
        {PANES.map((pane) => {
          const isBig = enlarged === pane.id;
          return (
            <section
              key={pane.id}
              className={`cmp-pane ${pane.id} ${isBig ? 'is-enlarged' : ''} ${focused === pane.id ? 'is-focused' : ''}`}
              aria-label={`${pane.title} version`}
            >
              <div className="cmp-pane-head">
                <span className="cmp-badge" />
                <strong>{pane.title}</strong>
                <span className="cmp-sub">{pane.sub}</span>
                <button
                  className="cmp-enlarge"
                  onClick={() => setEnlarged(isBig ? null : pane.id)}
                  aria-pressed={isBig}
                  title={isBig ? 'Back to side by side (Esc)' : `Enlarge ${pane.title}`}
                >
                  {isBig ? <Shrink /> : <Enlarge />}
                  {isBig ? 'Restore' : 'Enlarge'}
                </button>
              </div>
              <iframe
                ref={(el) => {
                  frames.current[pane.id] = el;
                }}
                src={pane.src}
                title={`${pane.title} black hole playground`}
              />
            </section>
          );
        })}
      </main>
    </div>
  );
}
