// Builds the lab homepage into site/dist as plain static files:
//   index.html (CSS and JS inlined, so the first paint needs no extra requests)
//   assets/    content-hashed logo and thumbnails
//   plus everything in site/public (favicons, _headers, 404.html)
//
// Run after the experiments are built: their sizes are measured for the index.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadExperiments, repoRoot, thumbsDir } from './experiments.mjs';
import { pathToFileURL } from 'node:url';

export const siteDir = join(repoRoot, 'site');
export const distDir = join(siteDir, 'dist');

const hash = (buffer) => createHash('sha1').update(buffer).digest('hex').slice(0, 8);

/** Copies a file into dist/assets under a content-hashed name and returns its URL. */
async function emit(source, folder, name, extension) {
  const buffer = await readFile(source);
  const relative = `assets/${folder ? `${folder}/` : ''}${name}.${hash(buffer)}.${extension}`;
  await mkdir(join(distDir, relative, '..'), { recursive: true });
  await writeFile(join(distDir, relative), buffer);
  return { url: `/${relative}`, bytes: buffer.length };
}

export async function buildHub() {
  const experiments = (await loadExperiments()).filter((experiment) => experiment.status !== 'planned');

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(join(siteDir, 'public'), distDir, { recursive: true });

  const logo = await emit(join(siteDir, 'src', 'assets', 'logo-128.webp'), '', 'logo', 'webp');

  const thumbs = {};
  const missing = [];
  for (const experiment of experiments) {
    if (!experiment.hasThumb) {
      missing.push(experiment.id);
      continue;
    }
    thumbs[experiment.id] = (await emit(join(thumbsDir, `${experiment.id}.webp`), 'thumbs', experiment.id, 'webp')).url;
  }
  if (missing.length > 0) {
    console.warn(`No thumbnail yet for: ${missing.join(', ')}. Run \`npm run capture\`.`);
  }

  const css = (await readFile(join(siteDir, 'src', 'styles.css'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
  const js = (await readFile(join(siteDir, 'src', 'hub.js'), 'utf8')).trim();

  // The query string defeats the module cache so the dev server picks up edits to render.mjs.
  const { renderPage } = await import(`${pathToFileURL(join(siteDir, 'render.mjs')).href}?t=${Date.now()}`);
  const html = renderPage(experiments, { css, js, logo: logo.url, thumbs });
  await writeFile(join(distDir, 'index.html'), html);

  return { html: Buffer.byteLength(html), experiments: experiments.length };
}
