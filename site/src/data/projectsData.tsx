import { ProjectItem } from '../types/project';
import {
    CosmoIcon,
    DysonIcon,
    PelagicIcon,
    ProductionPanicIcon,
} from '../components/Icons';

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
    {
        id: 'pelagic',
        href: '/pelagic/',
        category: 'Ocean atmosphere',
        title: 'Pelagic',
        description: 'Drift into a calm ocean simulation shaped by light, water, and gentle motion.',
        tag: 'Calm simulation',
        ctaText: 'Explore',
        glowColor: '#56c2d6',
        icon: <PelagicIcon />,
    },
    {
        id: 'production-panic',
        href: '/production-panic/',
        category: 'Incident response',
        title: 'Production Panic',
        description: 'Stabilize a production incident by reading system signals and choosing your response.',
        tag: 'SRE simulation',
        ctaText: 'Respond',
        glowColor: '#ff826d',
        icon: <ProductionPanicIcon />,
    },
];
