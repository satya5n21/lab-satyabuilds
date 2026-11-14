// Renders the lab homepage as one static HTML document. Pure: no file or network access.
const GITHUB_URL = 'https://github.com/satya5n21';
const SITE_NAME = 'Satyabuilds Lab';
const SITE_DESCRIPTION = 'A growing collection of interactive experiments, simulations and visual builds.';

const MEDIA_LABELS = { webgl: 'WebGL', audio: 'Audio', canvas2d: 'Canvas 2D', interface: 'Interface' };

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const pad = (number) => String(number).padStart(3, '0');
const padCount = (number) => String(number).padStart(2, '0');

function formatDate(date) {
  if (!date) return '—';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatSize(kb) {
  if (kb == null) return '—';
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

const mediaOf = (experiment) => (experiment.media.length > 0 ? experiment.media : ['interface']);

function renderThumb(experiment, assets, position) {
  const thumb = assets.thumbs[experiment.id];
  if (!thumb) {
    return `<div class="exp-thumb exp-thumb--empty">No preview yet</div>`;
  }
  // The first two thumbnails are above the fold on most screens; everything else waits.
  const loading = position < 2 ? 'eager' : 'lazy';
  const priority = position === 0 ? ' fetchpriority="high"' : '';
  return `<div class="exp-thumb"><img src="${thumb}" width="640" height="400" alt="" loading="${loading}"${priority} decoding="async"></div>`;
}

function renderExperiment(experiment, assets, position) {
  const media = mediaOf(experiment)
    .map((key) => MEDIA_LABELS[key] ?? key)
    .join(' · ');
  const sizeTitle = 'Size of the files hosted on this site';

  return `
      <li class="exp" data-id="${escapeHtml(experiment.id)}" data-order="${position}" data-date="${escapeHtml(experiment.date ?? '')}" data-weight="${experiment.weightKB ?? 0}" data-media="${mediaOf(experiment).join(' ')}" style="--accent:${escapeHtml(experiment.accent)}">
        <a class="exp-link" href="${escapeHtml(experiment.route)}">
          ${renderThumb(experiment, assets, position)}
          <span class="exp-id">EXP-${pad(experiment.number)}</span>
          <span class="exp-status" data-status="${escapeHtml(experiment.status)}">${escapeHtml(experiment.status)}</span>
          <div class="exp-body">
            <p class="exp-cat">${escapeHtml(experiment.category)}</p>
            <h2 class="exp-title">${escapeHtml(experiment.title)}</h2>
            <p class="exp-desc">${escapeHtml(experiment.description)}</p>
          </div>
          <p class="exp-meta">
            <span class="exp-media">${escapeHtml(media)}</span>
            <span class="exp-size" title="${sizeTitle}">${formatSize(experiment.weightKB)}</span>
            <time class="exp-date" datetime="${escapeHtml(experiment.date ?? '')}">${formatDate(experiment.date)}</time>
            <span class="exp-go">${escapeHtml(experiment.cta ?? 'Open')}</span>
          </p>
        </a>
      </li>`;
}

function renderFilters(experiments) {
  const present = new Set(experiments.flatMap(mediaOf));
  const order = ['webgl', 'canvas2d', 'audio', 'interface'].filter((key) => present.has(key));
  const buttons = order.map((key) => `<button class="chip" type="button" data-filter="${key}" aria-pressed="false">${MEDIA_LABELS[key]}</button>`);
  return `<button class="chip" type="button" data-filter="all" aria-pressed="true">All</button>${buttons.join('')}`;
}

/**
 * @param experiments  validated manifests, in display order (planned ones are not listed)
 * @param assets       { css, js, logo, thumbs: { [id]: url } }
 */
export function renderPage(experiments, assets) {
  const shipped = experiments.filter((experiment) => experiment.status !== 'planned');
  const nextNumber = Math.max(0, ...experiments.map((experiment) => experiment.number)) + 1;
  const withMedia = (key) => shipped.filter((experiment) => experiment.media.includes(key)).length;
  const latest = shipped.map((experiment) => experiment.date ?? '').sort().at(-1);

  const stats = [
    [padCount(shipped.length), 'experiments'],
    [padCount(withMedia('webgl')), 'WebGL'],
    [padCount(withMedia('audio')), 'with sound'],
    [formatDate(latest), 'latest'],
  ]
    .map(([value, label]) => `<li><b>${escapeHtml(value)}</b>${label}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0a0b0d">
<title>${SITE_NAME}</title>
<meta name="description" content="${SITE_DESCRIPTION} By Satyajit.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${SITE_NAME}">
<meta property="og:description" content="${SITE_DESCRIPTION}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script>try{var v=localStorage.getItem('lab-view');document.documentElement.dataset.view=v==='grid'||v==='list'?v:innerWidth<700?'list':'grid'}catch(e){document.documentElement.dataset.view=innerWidth<700?'list':'grid'}</script>
<style>${assets.css}</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <a class="brand" href="/"><img src="${assets.logo}" width="30" height="25" alt="">Satyabuilds Lab</a>
    <a class="ext" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" aria-label="GitHub profile (opens in a new tab)">GitHub ↗</a>
  </div>
</div>
<header class="wrap mast">
  <h1>Index of experiments</h1>
  <p class="lede">Interactive builds, simulations and visual studies. Each one is a self-contained page: open it, poke at it, close it. New ones are added as they are finished.</p>
  <ul class="stats">${stats}</ul>
</header>
<main class="wrap" id="main">
  <div class="controls" id="controls" hidden>
    <div class="group" role="group" aria-label="Filter by medium">
      <span class="group-label">Medium</span>${renderFilters(shipped)}
    </div>
    <div class="group" role="group" aria-label="Sort">
      <span class="group-label">Sort</span>
      <button class="chip" type="button" data-sort="curated" aria-pressed="true">Curated</button>
      <button class="chip" type="button" data-sort="newest" aria-pressed="false">Newest</button>
      <button class="chip" type="button" data-sort="lightest" aria-pressed="false">Lightest</button>
    </div>
    <div class="group" role="group" aria-label="View">
      <span class="group-label">View</span>
      <button class="chip" type="button" data-view="grid" aria-pressed="true">Grid</button>
      <button class="chip" type="button" data-view="list" aria-pressed="false">Index</button>
    </div>
    <p class="count" id="count" aria-live="polite">Showing ${shipped.length} of ${shipped.length}</p>
  </div>
  <ul class="index" id="index" data-featured="on">${shipped.map((experiment, position) => renderExperiment(experiment, assets, position)).join('')}
      <li class="exp exp-next"><div><span class="mono">EXP-${pad(nextNumber)}</span><p>Next slot is open. New experiments land here as they are built.</p></div></li>
  </ul>
</main>
<footer class="wrap foot">
  <span>${SITE_NAME} · ${shipped.length} experiments</span>
  <p>Sizes are the files hosted on this site. Some experiments also load libraries from a public CDN.</p>
</footer>
<script>${assets.js}</script>
</body>
</html>
`;
}
