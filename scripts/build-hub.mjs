// Builds the lab homepage into site/dist (see scripts/lib/hub.mjs). Run it after the experiments
// are built: their sizes are measured for the index.
import { buildHub, distDir } from './lib/hub.mjs';

const { html, experiments } = await buildHub();
console.log(`Lab homepage built: ${experiments} experiments, index.html ${(html / 1024).toFixed(1)} KB -> ${distDir}`);
