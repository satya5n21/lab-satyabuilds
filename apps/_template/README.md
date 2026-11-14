# Adding an experiment

Folders starting with `_` are ignored by the build, so this template never ships.

1. Copy this folder to `apps/<your-experiment>/` and add your app next to `experiment.json`.
2. Edit `experiment.json`. The build validates it and fails with a clear message if a field is wrong.
3. If the app has a build step (Vite and so on), add it to the root `package.json`: its folder under
   `workspaces`, a `build:<name>` script, and that script in `build:static` before `build:site`.
   Plain HTML apps need none of this: point `output` at the folder holding `index.html`.
4. Run `npm run build`, then `npm run capture` for its thumbnail (see below). The homepage is
   generated from the manifests, and `deployment/public<route>` receives the contents of `output`.

| Field | Meaning |
| --- | --- |
| `id` | Unique kebab-case id. |
| `number` | Unique integer shown as `EXP-00N`. Assign them in order of creation and never reuse one. |
| `order` | Position on the homepage (lower first). Unset entries sort last, newest first. |
| `title`, `category`, `description`, `tag`, `cta` | Card copy. |
| `accent` | Six-digit hex colour for this experiment. |
| `status` | `live`, `prototype`, `archived`, or `planned`. |
| `date` | Date it was created, `YYYY-MM-DD`. |
| `route` | URL path, lowercase with a leading and trailing slash, for example `/pelagic/`. |
| `output` | Built folder inside the app, relative to it: `dist`, `site`. |
| `media` | What it uses: `webgl`, `canvas2d`, `audio`. |
| `input` | How it is controlled: `pointer`, `pointer-lock`, `touch`, `keyboard`. |

## Thumbnails

`npm run build` and then `npm run capture` take a 640x400 still of every shipped experiment into
`site/src/thumbs/<id>.webp` (commit them). The script needs Chrome or Edge installed; set
`BROWSER_PATH` to use a specific one, and `npm run capture -- --only <id>` to redo a single one.
An optional `capture` block in the manifest says how to reach a good frame:

| Field | Meaning |
| --- | --- |
| `waitMs` | Milliseconds to let the page load first (default 3000). |
| `click` | Selectors clicked in order; `text=start` clicks the first button whose text contains "start". |
| `afterClickMs` | Milliseconds to wait after the clicks (default 2500). |
| `hold` | Keys to hold down, as `[{ "key": "w", "ms": 5000 }]`. |
| `hide` | Selectors hidden just before the screenshot (overlays, hints, buttons). |

Experiments that need pointer lock to move cannot be walked through headlessly, so capture
their title screen or the first frame instead.

A `planned` experiment reserves its number without shipping anything: it needs only `id`,
`number`, `title`, `category`, `description`, `tag`, `accent` and `status`. The homepage does not
list planned entries yet; it only shows an open "next slot" tile after the highest number.
