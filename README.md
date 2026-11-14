# Satyabuilds Lab

A small monorepo for independent web experiments.

## Apps

- `site`: the lab homepage, plain static HTML, CSS and a little JavaScript with no framework. It is
  generated from the experiment manifests by `scripts/build-hub.mjs`.
- `cosmic-timeline-btn`: React, TypeScript, Vite, and Tailwind.
- `cosmo-music-visualizer`: React, TypeScript, and Vite.
- `dyson-sphere`: standalone HTML, CSS, and JavaScript.
- `pelagic`: standalone Pelagic calm ocean simulator.
- `production-panic`: React, TypeScript, and Vite.
- `the-stars-remain`: React, TypeScript, Vite, and Three.js.

## Experiment manifests

Every experiment describes itself in `apps/<name>/experiment.json` (title, status, date, route,
build folder, media and input tags). The homepage build validates them and renders the index from
them, and `scripts/build-static.mjs` uses the same manifests to place each build at its route.
See `apps/_template/README.md` for the fields and how to add a new experiment.

Homepage thumbnails are screenshots of the experiments: after `npm run build`, run
`npm run capture` (needs Chrome or Edge installed) and commit the files it writes to
`site/src/thumbs/`.

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

Each command starts its own development server and prints the URL to open.
`dev:site` serves the homepage on port 5175 and rebuilds it when the source or a
manifest changes (reload the page to see it). The app-specific servers are isolated,
so they cannot serve each other's paths; the homepage dev server links through to
the built experiments only if `npm run build` has been run. To test navigation
between all apps on one origin, use `npm run preview`; it builds the combined site
and serves it through Wrangler.

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
