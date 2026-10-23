import styles from './Header.module.css';
import logoUrl from '../../../logo.png';
import { GithubIcon, ExternalLinkNEIcon } from '../Icons';

/** ← Edit this one value to update the GitHub link everywhere */
const GITHUB_PROFILE_URL = 'https://github.com/satya5n21';

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

                <a
                    href={GITHUB_PROFILE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.githubLink}
                    aria-label="GitHub profile (opens in new tab)"
                >
                    <GithubIcon className={styles.githubIcon} />
                    <span className={styles.githubLabel}>GitHub</span>
                    <ExternalLinkNEIcon className={styles.githubArrow} />
                </a>
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
