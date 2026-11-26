// Settings for Counting Friends.
//
// While `apiUrl` is empty the page shows `fallbackCount`. Once a follower endpoint exists, put
// its URL here. Never put the X API key or Bearer Token in this file: it is public. The endpoint
// should be a small server (for example a Cloudflare Worker on a cron trigger) that keeps the
// key secret, calls X twice a day, and returns the stored count as JSON.
//
// Accepted response shapes (the first number found wins):
//   { "followers": 1234 }
//   { "followers_count": 1234 }
//   { "data": { "public_metrics": { "followers_count": 1234 } } }   <- raw X API v2 user lookup
window.COUNTING_FRIENDS = {
  handle: 'satya5n21',
  label: 'friends',
  // Show the label line under the number. Set to false to show only the handle and the number.
  showLabel: true,
  // Pixels between particle centres in the big number. Higher means fewer, more spread-out
  // particles. Phones use 75% of this, and very large numbers widen it to stay smooth.
  particleSpacing: 6,
  fallbackCount: 1000,
  apiUrl: '',
  // How often an open page asks the endpoint again. The endpoint itself decides how often X is called.
  refreshHours: 12,
  requestTimeoutMs: 8000,
};
