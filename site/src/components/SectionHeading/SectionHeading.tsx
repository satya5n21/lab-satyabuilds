import { ReactNode } from 'react';
import styles from './SectionHeading.module.css';

interface SectionHeadingProps {
    children: ReactNode;
}

export function SectionHeading({ children }: SectionHeadingProps) {
    return <h2 className={styles.sectionHeading}>{children}</h2>;
}