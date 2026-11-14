// Dev loop for the lab homepage: builds it, serves site/dist, and rebuilds when the source,
// the thumbnails or any experiment manifest changes. Reload the page to see the result.
import { watch } from 'node:fs';
import { join } from 'node:path';
import { appsDir, repoRoot } from './lib/experiments.mjs';
import { buildHub, distDir, siteDir } from './lib/hub.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const PORT = 5175;

async function rebuild(reason) {
  try {
    const { html } = await buildHub();
    console.log(`[hub] built (${reason}), index.html ${(html / 1024).toFixed(1)} KB`);
  } catch (error) {
    console.error(`[hub] build failed: ${error.message}`);
  }
}

await rebuild('start');

// Experiments are not rebuilt here; links to them resolve if `npm run build` has been run before.
const server = await startStaticServer(distDir, PORT, join(repoRoot, 'deployment', 'public'));
console.log(`[hub] http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`);

let timer;
const schedule = (reason) => {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(reason), 150);
};

// Everything the page is made of, except the generated output.
watch(join(siteDir, 'src'), { recursive: true }, (_, file) => schedule(file ?? 'src'));
watch(join(siteDir, 'public'), { recursive: true }, (_, file) => schedule(file ?? 'public'));
watch(join(siteDir, 'render.mjs'), () => schedule('render.mjs'));
watch(appsDir, { recursive: true }, (_, file) => {
  if (file?.endsWith('experiment.json')) schedule(file);
});
