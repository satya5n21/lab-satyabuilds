# Adding an experiment

Folders starting with `_` are ignored by the build, so this template never ships.

1. Copy this folder to `apps/<your-experiment>/` and add your app next to `experiment.json`.
2. Edit `experiment.json`. The build validates it and fails with a clear message if a field is wrong.
3. If the app has a build step (Vite and so on), add it to the root `package.json`: its folder under
   `workspaces`, a `build:<name>` script, and that script in `build:static` before `build:site`.
   Plain HTML apps need none of this: point `output` at the folder holding `index.html`.
4. Run `npm run build`. The homepage picks the experiment up from the generated registry, and
   `deployment/public<route>` receives the contents of `output`.

| Field | Meaning |
| --- | --- |
| `id` | Unique kebab-case id. |
| `number` | Unique integer shown as `EXP-00N`. Assign them in order of creation and never reuse one. |
| `order` | Position on the homepage (lower first). Unset entries sort last, newest first. |
| `title`, `category`, `description`, `tag`, `cta` | Card copy. |
| `accent` | Six-digit hex colour for this experiment. |
| `icon` | Key of a known icon (see `site/src/data/projectsData.tsx`); anything else falls back to a flask. |
| `status` | `live`, `prototype`, `archived`, or `planned`. |
| `date` | Date it was created, `YYYY-MM-DD`. |
| `route` | URL path, lowercase with a leading and trailing slash, for example `/pelagic/`. |
| `output` | Built folder inside the app, relative to it: `dist`, `site`. |
| `media` | What it uses: `webgl`, `canvas2d`, `audio`. |
| `input` | How it is controlled: `pointer`, `pointer-lock`, `touch`, `keyboard`. |

A `planned` experiment is a roadmap entry: it needs only `id`, `number`, `title`, `category`,
`description`, `tag`, `accent` and `status`, and nothing is built or shipped for it.
