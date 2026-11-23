# Petunia Hour

A bed of petunias at golden-hour sunset. Plain HTML + Canvas 2D, no dependencies and no build step.

## Run

```
npm run dev:petunia-hour
```

Opens `site/index.html` on http://127.0.0.1:5191.

## Interaction

| Input | Effect |
| --- | --- |
| Move over the flowers | Petals near the pointer lean away; faster movement pushes harder. |
| Click / tap a flower | A shockwave flares nearby petals, the clicked flower loses 1-2 petals that drift off on the wind, and pollen puffs out. The petals grow back after 5-10 s. |
| Press and drag | A wider, stronger brush. |
| Wind slider | Calm to strong. Gusts travel across the bed from right to left on their own. |
| Sunset slider | Moves the sun lower: longer, redder light and deeper shade. |

## How it is built

- `site/flowers-data.js` holds the flower layout: 344 flowers (position, size, colour) read from the reference photo,
  a coarse colour grid for what shows between flowers, and leaf positions. The photo itself is not shipped.
- Each flower is five spring-driven petals (angle, velocity, stiffness, damping). Wind and the pointer both push
  petals as torques, so everything settles back on its own.
- Wind is a travelling noise field. Lighting is a grade, dappled leaf shadow, sun rays, rim light on petals that face the
  sun, bloom and a vignette, all composited on one canvas.
- Quality drops automatically (rim light, then bloom/shadow, then pixel ratio) if frames run slow.

## Regenerating the layout

`tools/extract.html` reads `tools/reference.webp`, classifies flower colours, finds flower centres and draws an
overlay for checking. Serve this folder (`npx vite apps/petunia-hour`), open `/tools/extract.html`, and use
`tools/receive.mjs` to write `site/flowers-data.js` from the page's `window.OUT`.
