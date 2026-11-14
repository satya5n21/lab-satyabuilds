import { ReactNode } from 'react';

export type ExperimentStatus = 'live' | 'prototype' | 'archived' | 'planned';

/** One entry of experiments.generated.json, built from apps/<name>/experiment.json. */
export interface ExperimentManifest {
    id: string;
    number: number;
    order?: number;
    title: string;
    category: string;
    description: string;
    tag: string;
    cta?: string;
    accent: string;
    icon?: string;
    status: ExperimentStatus;
    date?: string;
    route?: string;
    media: string[];
    input: string[];
    weightKB: number | null;
}

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
    number: number;
    status: ExperimentStatus;
    date?: string;
    weightKB: number | null;
    media: string[];
    input: string[];
}
