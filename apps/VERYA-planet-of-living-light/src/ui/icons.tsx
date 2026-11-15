import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconPlay = () => (
  <svg {...base}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPause = () => (
  <svg {...base}>
    <rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRestart = () => (
  <svg {...base}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4.2 4.6v4.3h4.3" />
  </svg>
);

/** A reticle returning to centre — reset the camera. */
export const IconRecenter = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="6.2" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" />
  </svg>
);

/** Frame corners — cinematic mode. */
export const IconCinema = () => (
  <svg {...base}>
    <path d="M4 9V6a1 1 0 0 1 1-1h3M16 5h3a1 1 0 0 1 1 1v3M20 15v3a1 1 0 0 1-1 1h-3M8 19H5a1 1 0 0 1-1-1v-3" />
    <rect x="8.2" y="9.2" width="7.6" height="5.6" rx="0.8" />
  </svg>
);

export const IconClose = () => (
  <svg {...base} width={14} height={14}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
