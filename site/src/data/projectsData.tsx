import { ProjectItem } from '../types/project';
import { DysonIcon, CosmoIcon } from '../components/Icons';

export const projectsData: ProjectItem[] = [
    {
        id: 'dyson',
        href: '/dyson-sphere/',
        category: 'Cosmic engineering',
        title: 'Dyson Sphere Explorer',
        description: 'Step into a speculative megastructure and explore a world built around a star.',
        tag: 'Interactive experience',
        ctaText: 'Enter',
        glowColor: '#67f4ce',
        icon: <DysonIcon />,
    },
    {
        id: 'cosmo',
        href: '/cosmo-music-visualizer/',
        category: 'Sound into color',
        title: 'Cosmo Music Visualizer',
        description: 'Turn a track into a living cosmic scene with an audio-reactive visualizer.',
        tag: 'Audio reactive',
        ctaText: 'Launch',
        glowColor: '#9b80ff',
        icon: <CosmoIcon />,
    },
];