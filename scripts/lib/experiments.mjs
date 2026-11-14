import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const appsDir = join(repoRoot, 'apps');

export const STATUSES = ['live', 'prototype', 'archived', 'planned'];

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROUTE_PATTERN = /^\/[a-z0-9-]+\/$/;

const BASE_STRINGS = ['id', 'title', 'category', 'description', 'tag'];
const SHIPPED_STRINGS = ['cta', 'date', 'route', 'output'];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function directorySize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? await directorySize(full) : (await stat(full)).size;
  }
  return total;
}

function validate(manifest, file) {
  const errors = [];
  const fail = (message) => errors.push(`${file}: ${message}`);
  const planned = manifest.status === 'planned';

  if (!STATUSES.includes(manifest.status)) {
    fail(`"status" must be one of ${STATUSES.join(', ')}`);
  }
  for (const key of planned ? BASE_STRINGS : [...BASE_STRINGS, ...SHIPPED_STRINGS]) {
    if (typeof manifest[key] !== 'string' || manifest[key].trim() === '') {
      fail(`"${key}" must be a non-empty string`);
    }
  }
  if (typeof manifest.id === 'string' && !ID_PATTERN.test(manifest.id)) {
    fail('"id" must be lowercase kebab-case');
  }
  if (!Number.isInteger(manifest.number) || manifest.number < 1) {
    fail('"number" must be a positive integer');
  }
  if (!HEX_PATTERN.test(manifest.accent ?? '')) {
    fail('"accent" must be a 6-digit hex colour like #67f4ce');
  }
  if (!planned) {
    if (!DATE_PATTERN.test(manifest.date ?? '')) fail('"date" must be YYYY-MM-DD');
    if (!ROUTE_PATTERN.test(manifest.route ?? '')) {
      fail('"route" must look like /my-experiment/ (lowercase, one segment, leading and trailing slash)');
    }
    const output = manifest.output ?? '';
    if (output.split(/[\\/]/).includes('..') || /^([a-zA-Z]:|[\\/])/.test(output)) {
      fail('"output" must be a relative folder inside the app (for example "dist" or "site")');
    }
  }
  for (const key of ['media', 'input']) {
    if (manifest[key] !== undefined && !(Array.isArray(manifest[key]) && manifest[key].every((v) => typeof v === 'string'))) {
      fail(`"${key}" must be an array of strings`);
    }
  }
  return errors;
}

/**
 * Reads every apps/<name>/experiment.json (folders starting with "_" are skipped),
 * validates them, and returns them sorted for display.
 *
 * With `requireBuilt`, every shipped experiment must have its output folder on disk
 * (used when assembling the deployment). Otherwise `weightKB` is null when it is missing.
 */
export async function loadExperiments({ requireBuilt = false } = {}) {
  const errors = [];
  const experiments = [];

  for (const entry of await readdir(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const appDir = join(appsDir, entry.name);
    const file = `apps/${entry.name}/experiment.json`;
    const manifestPath = join(appDir, 'experiment.json');
    if (!(await exists(manifestPath))) continue;

    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(`${file}: invalid JSON (${error.message})`);
      continue;
    }

    const problems = validate(manifest, file);
    errors.push(...problems);
    if (problems.length > 0) continue;

    const shipped = manifest.status !== 'planned';
    let weightKB = null;
    let outputDir = null;

    if (shipped) {
      outputDir = resolve(appDir, manifest.output);
      if (outputDir !== appDir && !outputDir.startsWith(appDir + sep)) {
        errors.push(`${file}: "output" resolves outside the app folder`);
        continue;
      }
      if (await exists(outputDir)) {
        weightKB = Math.round((await directorySize(outputDir)) / 1024);
      } else if (requireBuilt) {
        errors.push(`${file}: output folder "${manifest.output}" does not exist. Did the app build?`);
        continue;
      }
    }

    experiments.push({ ...manifest, media: manifest.media ?? [], input: manifest.input ?? [], weightKB, outputDir, folder: entry.name });
  }

  const seen = { id: new Map(), number: new Map(), route: new Map() };
  for (const experiment of experiments) {
    for (const key of ['id', 'number', 'route']) {
      const value = experiment[key];
      if (value === undefined) continue;
      if (seen[key].has(value)) {
        errors.push(`apps/${experiment.folder}/experiment.json: duplicate ${key} "${value}" (also used by apps/${seen[key].get(value)})`);
      } else {
        seen[key].set(value, experiment.folder);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid experiment manifests:\n  - ${errors.join('\n  - ')}`);
  }

  // Curated order first (lower comes first, unset goes last), then newest first.
  experiments.sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000) || (b.date ?? '').localeCompare(a.date ?? '') || a.number - b.number,
  );

  return experiments;
}
