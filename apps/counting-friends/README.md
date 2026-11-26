# Counting Friends

The follower count of [@satya5n21](https://x.com/satya5n21) on X, written in thousands of
particles on a starry sky. Plain HTML and Canvas 2D, no dependencies and no build step.

## Run

```
npm run dev:counting-friends
```

Opens `site/index.html` on http://127.0.0.1:5193. Add `?count=1234` to the URL to try another number.

## Interaction

| Input | Effect |
| --- | --- |
| Move the mouse over the text | A light breeze ripples the particles near the pointer. |
| Press and drag (or touch and drag) | Strong wind: particles are blown away from the pointer and along the drag, and stay scattered while you hold. |
| Release | The particles drift back into the text. |

## Where the number comes from

Settings live in `site/config.js`.

- `apiUrl` empty (the current state): the page shows `fallbackCount`, which is `1000`.
- `apiUrl` set: the page shows the last count it received in this browser (or `fallbackCount`),
  then asks the endpoint and morphs to the new number. It asks again every `refreshHours` while
  the page stays open. Any failure (network, timeout, bad JSON) keeps the current number.

The X API key must never go in this site, since every file here is public. The endpoint should be a small
server, for example a Cloudflare Worker with a cron trigger at `0 0,12 * * *`, that keeps the
Bearer Token as a secret, calls `GET https://api.x.com/2/users/by/username/satya5n21?user.fields=public_metrics`
twice a day, stores the result, and returns it with CORS allowed for this site. The page accepts
`{ "followers": n }`, `{ "followers_count": n }` or the raw X response
(`data.public_metrics.followers_count`).
