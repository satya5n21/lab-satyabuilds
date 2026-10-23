import { Header } from './components/Header/Header';
import { SectionHeading } from './components/SectionHeading/SectionHeading';
import { ProjectCard } from './components/ProjectCard/ProjectCard';
import { Footer } from './components/Footer/Footer';
import { projectsData } from './data/projectsData';
import styles from './App.module.css';

export default function App() {
    return (
        <main className={styles.shell}>
            <Header
                badgeText="Independent experiments"
                titleLine1="Small ideas."
                titleHighlight="Strange worlds."
                intro="A growing collection of interactive builds, visual experiments, and things made just to see what happens."
            />

            <SectionHeading>Explore the lab</SectionHeading>

            <section className={styles.projects} aria-label="Projects">
                {projectsData.map((project, idx) => (
                    <ProjectCard
                        key={project.id}
                        index={idx + 1}
                        total={projectsData.length}
                        {...project}
                    />
                ))}
            </section>

            <Footer
                leftText="Satyabuilds Lab"
                rightText="Made with curiosity ✦"
            />
        </main>
    );
}