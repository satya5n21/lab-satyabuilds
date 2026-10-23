import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(repoRoot, 'deployment', 'public');

async function copyDirectoryContents(source, destination) {
  const entries = await readdir(source);
  await mkdir(destination, { recursive: true });

  for (const name of entries) {
    await cp(join(source, name), join(destination, name), { recursive: true });
  }
}

const sources = [
  join(repoRoot, 'site', 'dist'),
  join(repoRoot, 'apps', 'dyson-sphere', 'site'),
  join(repoRoot, 'apps', 'cosmo-music-visualizer', 'dist'),
];

// Check every input before clearing the previous deployment output.
for (const source of sources) {
  try {
    await readdir(source);
  } catch {
    throw new Error(`Build input is missing or unreadable: ${source}`);
  }
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await copyDirectoryContents(sources[0], outputDir);
await copyDirectoryContents(sources[1], join(outputDir, 'dyson-sphere'));
await copyDirectoryContents(sources[2], join(outputDir, 'cosmo-music-visualizer'));

console.log(`Cloudflare static site assembled at ${outputDir}`);
