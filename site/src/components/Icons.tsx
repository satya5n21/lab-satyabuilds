import { SVGProps } from 'react';

export const DysonIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <circle cx="12" cy="12" r="3.2" />
        <ellipse cx="12" cy="12" rx="10" ry="5.2" transform="rotate(-28 12 12)" />
        <path d="M6.2 4.8c2.8 1.1 6.2 4.1 8.3 7.1 2.1 3 3 5.9 2.7 7.4" />
        <circle cx="19.1" cy="7.3" r=".8" fill="currentColor" stroke="none" />
    </svg>
);

export const CosmoIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M4 13v-2M8 17V7M12 20V4M16 16V8M20 13v-2" />
        <circle cx="12" cy="12" r="9.5" opacity=".45" />
    </svg>
);

export const ArrowRightIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
    >
        <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
);