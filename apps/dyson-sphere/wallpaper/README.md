# Dyson Sphere - Wallpaper Engine build

A live, interactive wallpaper version of the Dyson Sphere Explorer for
[Wallpaper Engine](https://www.wallpaperengine.io/). It is separate from the website build in
`../site/` and is not deployed with the lab (only `site/` is published).

## Install

1. Open Wallpaper Engine, then **Create Wallpaper**, and choose `index.html` from this folder
   (or **Open Wallpaper from File** and pick `project.json`).
   Alternatively copy this whole folder to
   `...\steamapps\common\wallpaper_engine\projects\myprojects\dyson-sphere\`
   and it shows up under *Installed*.
2. Select it, then tweak the options in the right-hand **Properties** panel.

## Interaction

| Input | Effect |
| --- | --- |
| Click and drag on the desktop | Orbit the camera (with momentum on release) |
| Scroll wheel | Zoom |
| Double click | Reset camera |
| Let go | Auto rotate resumes after the configured delay |

Wallpaper Engine only forwards mouse input when the pointer is over an empty desktop area
(not over icons, windows or the taskbar). Keyboard input is not delivered to wallpapers.
If dragging does nothing, enable **Show input debug overlay** in the Properties panel (or open the
page with `?debug`). It counts the pointer, mouse, wheel, click and key events that actually reach
the page. If every counter stays at 0 while you click the desktop, Wallpaper Engine is not
forwarding input to the wallpaper (see its settings for desktop mouse interaction); if the
counters move but the view does not, the problem is in the page.

## Properties (project.json)

Interaction, auto rotate (speed and resume delay), camera distance, architecture (swarm or
shell), collector count, orbital radius, star intensity, collector motion and speed, orbit
lines, vignette, render quality (0.75x to 2x) and frame rate cap (30 / 60 / match display).

Wallpaper Engine's `setPaused` callback suspends rendering completely while a fullscreen app
or game covers the desktop.

## Testing in a browser

```
npx vite apps/dyson-sphere/wallpaper --host 127.0.0.1 --port 5190
```

(The `dyson-wallpaper` entry in `.claude/launch.json` runs the same command.)

Properties can be simulated from the devtools console, for example:

```js
wallpaperPropertyListener.applyUserProperties({ mode: { value: 'shell' }, fps: { value: '30' } });
wallpaperPropertyListener.setPaused(true);
```

## Differences from the site version

- No intro card, HUD, telemetry or buttons; controlled through Wallpaper Engine properties.
- Three.js r128 is bundled as `three.min.js` (no CDN, works offline).
- Always uses the desktop render profile and ignores the OS reduce-motion flag.
- Fits portrait displays by pulling the camera back.
