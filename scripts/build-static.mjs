import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadExperiments, repoRoot } from './lib/experiments.mjs';

const outputDir = join(repoRoot, 'deployment', 'public');
const siteDist = join(repoRoot, 'site', 'dist');

async function copyDirectoryContents(source, destination) {
  const entries = await readdir(source);
  await mkdir(destination, { recursive: true });

  for (const name of entries) {
    await cp(join(source, name), join(destination, name), { recursive: true });
  }
}

// Check every input before clearing the previous deployment output.
// Each experiment is described by its own apps/<name>/experiment.json.
const experiments = (await loadExperiments({ requireBuilt: true })).filter((experiment) => experiment.status !== 'planned');

try {
  await readdir(siteDist);
} catch {
  throw new Error(`Build input is missing or unreadable: ${siteDist}`);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await copyDirectoryContents(siteDist, outputDir);

for (const experiment of experiments) {
  await copyDirectoryContents(experiment.outputDir, join(outputDir, experiment.route));
}

console.log(`Cloudflare static site assembled at ${outputDir} (${experiments.length} experiments)`);
