import { ReactNode } from 'react';

export interface ProjectItem {
    id: string;
    href: string;
    category: string;
    title: string;
    description: string;
    tag: string;
    ctaText: string;
    glowColor: `#${string}`;
    icon: ReactNode;
}