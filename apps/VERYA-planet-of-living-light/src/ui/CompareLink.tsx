/** Small "compare" pill, bottom-left. Hidden when this page is embedded (e.g. inside /compare). */
const embedded = typeof window !== 'undefined' && window.self !== window.top;

export function CompareLink() {
  if (embedded) return null;
  return (
    <a className="compare-link glass" href={`${import.meta.env.BASE_URL}?compare`} aria-label="Compare with Gemini Hydrogen">
      <span className="compare-link__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M12 5v14" />
        </svg>
      </span>
      <span className="compare-link__text">Compare with Gemini Hydrogen</span>
    </a>
  );
}
