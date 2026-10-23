# Satyabuilds Lab

A small monorepo for independent web experiments.

## Apps

- `cosmo-music-visualizer`: React, TypeScript, and Vite.
- `dyson-sphere`: standalone HTML, CSS, and JavaScript.

## Run locally

Run these from the repository root after `npm install`:

```sh
npm run dev:cosmo-music-visualizer
npm run dev:dyson-sphere
```

Each command starts its own development server. Vite prints the URL to open.

## Build and deploy to Cloudflare Workers Static Assets

```sh
npm run build
npm run preview
npm run deploy
```

The combined site is assembled in `deployment/public`. The homepage is at `/`,
the Dyson Sphere app is at `/dyson-sphere/`, and the music visualizer is at
`/cosmo-music-visualizer/`. `wrangler.jsonc` points Cloudflare Wrangler at that
assembled directory.
