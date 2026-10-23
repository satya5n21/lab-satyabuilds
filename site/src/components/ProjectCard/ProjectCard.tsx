import { CSSProperties } from 'react';
import { ProjectItem } from '../../types/project';
import { ArrowRightIcon } from '../Icons';
import styles from './ProjectCard.module.css';

interface ProjectCardProps extends ProjectItem {
    index: number;
    total: number;
}

type CardCSSProperties = CSSProperties & {
    '--glow'?: string;
};

export function ProjectCard({
    href,
    icon,
    index,
    total,
    category,
    title,
    description,
    tag,
    ctaText = 'Enter',
    glowColor = '#72e8ff',
}: ProjectCardProps) {
    const formattedIndex = `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

    const cardStyle: CardCSSProperties = {
        '--glow': glowColor,
    };

    return (
        <a className={styles.card} href={href} style={cardStyle}>
            <div className={styles.cardTop}>
                <span className={styles.projectIcon} aria-hidden="true">
                    {icon}
                </span>
                <span className={styles.projectIndex}>{formattedIndex}</span>
            </div>

            <div className={styles.cardCopy}>
                <p className={styles.category}>{category}</p>
                <h2 className={styles.title}>{title}</h2>
                <p className={styles.description}>{description}</p>
            </div>

            <div className={styles.cardBottom}>
                <span className={styles.tag}>{tag}</span>
                <span className={styles.launch}>
                    {ctaText} <ArrowRightIcon />
                </span>
            </div>
        </a>
    );
}