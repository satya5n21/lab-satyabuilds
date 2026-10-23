import styles from './Header.module.css';
import logoUrl from '../../../logo.png';

interface HeaderProps {
    badgeText: string;
    titleLine1: string;
    titleHighlight: string;
    intro: string;
}

export function Header({ badgeText, titleLine1, titleHighlight, intro }: HeaderProps) {
    return (
        <header>
            <div className={styles.topline}>
                <img className={styles.logo} src={logoUrl} alt="Satyabuilds Lab logo" />
                <span className={styles.signal} aria-hidden="true" />
                {badgeText}
            </div>
            <h1 className={styles.title}>
                {titleLine1}
                <br />
                <span className={styles.highlight}>{titleHighlight}</span>
            </h1>
            <p className={styles.intro}>{intro}</p>
        </header>
    );
}
