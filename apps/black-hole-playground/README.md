# Black Hole Playground

A real-time gravitational sandbox built with React, TypeScript, Vite and HTML Canvas 2D. No
backend, no external services; it builds to plain static files.

Served at `/black-hole-playground/` on the lab domain. From the repository root:

```sh
npm run dev:black-hole-playground
npm run build:black-hole-playground
```

## How to use it

| Input | Effect |
| --- | --- |
| Click | Drop a star (plus a little dust) on a roughly circular orbit |
| Drag and release | Launch a star in that direction; a dotted path previews the orbit |
| Gravity strength | Mass of the hole: horizon, unstable zone and orbital speeds all change |
| Particle speed | Simulation time scale |
| Particles | Number of ambient particles (50 to 2000) |
| Trails | Fading light trails on or off (`T`) |
| Pause / Resume | `Space` |
| Reset | `R`: clears the scene and restores the default settings |
| `H` | Hide the interface |

## The model

Particles move under the Paczynski-Wiita pseudo-Newtonian force, `a = GM / (r - rs)^2` with
`rs = 2GM / c^2`. It is plain Newtonian code that still reproduces the strong-field essentials of a
Schwarzschild black hole:

- the force diverges at the horizon radius `rs`, and anything crossing it is swallowed;
- circular orbits are stable only outside `3 rs` (the ISCO), so raising the mass sweeps the inner
  disk into the hole and lowering it leaves orbiting matter behind;
- orbital speed at radius `r` is `sqrt(GM r) / (r - rs)`.

Integration is an adaptive kick-drift-kick leapfrog (symplectic, so orbits keep their energy), with
sub-steps that shrink near the horizon. Dust feels a faint drag so the disk slowly spirals inward;
ambient particles that fall in or escape are replaced to keep the chosen count. The HUD classifies
each particle as bound or escaping from its specific orbital energy.

Rendering is layered on one canvas: a baked nebula, a lensed starfield, the accretion disk (streaks
orbiting at the local Keplerian rate, brighter on the approaching side), a fade-buffer for trails,
sprite-batched particles (redshifted and tidally stretched near the hole), then the horizon shadow
and photon ring. Background stars use the point-mass lens equation, so they smear into arcs and a
ring near the hole and show a faint mirror image on the far side.
