import styles from './Footer.module.css';

interface FooterProps {
    leftText: string;
    rightText: string;
}

export function Footer({ leftText, rightText }: FooterProps) {
    return (
        <footer className={styles.footer}>
            <span>{leftText}</span>
            <span>{rightText}</span>
        </footer>
    );
}