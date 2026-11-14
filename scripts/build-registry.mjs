// Collects every apps/*/experiment.json into the data file the lab homepage imports.
// Run it after the experiments have been built so the weight of each one is known.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadExperiments, repoRoot } from './lib/experiments.mjs';

const registryPath = join(repoRoot, 'site', 'src', 'data', 'experiments.generated.json');

const experiments = await loadExperiments();

// Internal build fields stay out of the data the browser receives.
const registry = experiments.map(({ outputDir, folder, output, ...rest }) => rest);

await mkdir(dirname(registryPath), { recursive: true });
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`Experiment registry written: ${registry.length} experiments -> ${registryPath}`);
