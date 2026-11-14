# Satyabuilds Lab

A small monorepo for independent web experiments.

## Apps

- `site`: React, TypeScript, and Vite lab homepage. It lists experiments from a generated registry.
- `cosmic-timeline-btn`: React, TypeScript, Vite, and Tailwind.
- `cosmo-music-visualizer`: React, TypeScript, and Vite.
- `dyson-sphere`: standalone HTML, CSS, and JavaScript.
- `pelagic`: standalone Pelagic calm ocean simulator.
- `production-panic`: React, TypeScript, and Vite.
- `the-stars-remain`: React, TypeScript, Vite, and Three.js.

## Experiment manifests

Every experiment describes itself in `apps/<name>/experiment.json` (title, status, date, route,
build folder, media and input tags). `npm run registry` validates them and writes the data the
homepage imports; `scripts/build-static.mjs` uses the same manifests to place each build at its
route. See `apps/_template/README.md` for the fields and how to add a new experiment.

## Run locally

Run these from the repository root after `npm install`:

```sh
npm run dev:site
npm run dev:cosmic-timeline-btn
npm run dev:cosmo-music-visualizer
npm run dev:dyson-sphere
npm run dev:pelagic
npm run dev:production-panic
npm run dev:the-stars-remain
```

Each command starts its own development server. Vite prints the URL to open.
These app-specific servers are isolated, so the homepage dev server cannot
serve the other apps' paths. To test navigation between all apps on one
origin, use `npm run preview`; it builds the combined site and serves it through
Wrangler.

## Build and deploy to Cloudflare Workers Static Assets

```sh
npm run build
npm run preview
npm run deploy
```

The combined site is assembled in `deployment/public`. The homepage is at `/`,
the Dyson Sphere app is at `/dyson-sphere/`, and the music visualizer is at
`/cosmo-music-visualizer/`. Pelagic is at `/pelagic/`, and Production Panic is
at `/production-panic/`. The Stars Remain is at `/the-stars-remain/`, and the Cosmic Timeline is at
`/cosmic-timeline-btn/`.
`wrangler.jsonc` points Cloudflare Wrangler at that assembled directory.

For Cloudflare Workers Builds, set the project root to the repository root,
the **Build command** to `npm run build`, and the **Deploy command** to
`npx wrangler deploy`. The build command must run first because
`deployment/public` is generated and is intentionally not committed. The
`npm run deploy` script is an alternative Deploy command; it runs the build
before Wrangler itself.
