import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const PauseIcon = () => (
  <svg {...base}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 5l12 7-12 7z" />
  </svg>
);

export const ResetIcon = () => (
  <svg {...base}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg {...base} style={{ transform: open ? 'rotate(0)' : 'rotate(180deg)', transition: 'transform .25s' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg {...base}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-2.6 3.4M6.2 7.3A14 14 0 0 0 2.5 12c1 2 4.5 6 9.5 6a9.7 9.7 0 0 0 3.2-.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
    <defs>
      <linearGradient id="mk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5ee7ff" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="13" fill="none" stroke="url(#mk)" strokeWidth="1.5" opacity=".9" />
    <ellipse cx="16" cy="16" rx="13" ry="4.5" fill="none" stroke="url(#mk)" strokeWidth="1" opacity=".55" transform="rotate(-24 16 16)" />
    <circle cx="16" cy="16" r="5" fill="#000" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
  </svg>
);
