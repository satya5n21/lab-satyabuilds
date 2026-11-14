// Captures a homepage thumbnail for every shipped experiment, from the assembled site.
//
//   npm run build            # thumbnails are taken from deployment/public
//   npm run capture          # all experiments
//   npm run capture -- --only pelagic,dyson
//
// No dependencies: it serves deployment/public itself and drives an installed Chromium browser
// (Edge or Chrome) over the DevTools protocol. Set BROWSER_PATH to use a specific executable.
// Each experiment's manifest may carry a `capture` block describing how to reach a good frame:
//   waitMs        time to let it load before anything else (default 3000)
//   click         selectors (or "text=<button text>") clicked in order
//   afterClickMs  time to wait after the clicks (default 2500)
//   hide          selectors hidden right before the screenshot (overlays, hints)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadExperiments, repoRoot, thumbsDir } from './lib/experiments.mjs';
import { startStaticServer } from './lib/static-server.mjs';

const siteRoot = join(repoRoot, 'deployment', 'public');

const VIEWPORT = { width: 1280, height: 800 };
const OUTPUT_SCALE = 0.5; // 1280x800 viewport -> 640x400 thumbnail
const WEBP_QUALITY = 72;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('No Chrome or Edge found. Install one or set BROWSER_PATH to its executable.');
  return found;
}

/** Minimal DevTools protocol client over the browser-level websocket. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry?.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry?.resolve(message.result);
      } else {
        this.listeners.forEach((listener) => listener(message));
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  waitForEvent(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      const listener = (message) => {
        if (message.method === method && message.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((l) => l !== listener);
          resolve(message.params);
        }
      };
      this.listeners.push(listener);
    });
  }
}

async function launchBrowser() {
  const profileDir = await mkdtemp(join(tmpdir(), 'lab-capture-'));
  const child = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--autoplay-policy=no-user-gesture-required',
      // Headless has no GPU: fall back to software WebGL so the 3D experiments render.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const portFile = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !existsSync(portFile); attempt++) await sleep(100);
  if (!existsSync(portFile)) throw new Error('Browser did not expose its DevTools port.');
  const [port, path] = (await readFile(portFile, 'utf8')).trim().split('\n');

  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to the browser.')), { once: true });
  });

  return {
    cdp: new Cdp(socket),
    async close() {
      socket.close();
      child.kill();
      await sleep(300);
      await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

const clickScript = (selector) => `(() => {
  const selector = ${JSON.stringify(selector)};
  let element;
  if (selector.startsWith('text=')) {
    const wanted = selector.slice(5).toLowerCase();
    element = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((el) => el.textContent.toLowerCase().includes(wanted));
  } else {
    element = document.querySelector(selector);
  }
  if (!element) return false;
  element.click();
  return true;
})()`;

async function captureExperiment(cdp, baseUrl, experiment) {
  const options = experiment.capture ?? {};
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => cdp.send(method, params, sessionId);

  try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });

    const loaded = cdp.waitForEvent('Page.loadEventFired', sessionId, 60000);
    await call('Page.navigate', { url: `${baseUrl}${experiment.route}` });
    await loaded;
    await sleep(options.waitMs ?? 3000);

    for (const selector of options.click ?? []) {
      let clicked = false;
      for (let attempt = 0; attempt < 20 && !clicked; attempt++) {
        ({ result: { value: clicked } } = await call('Runtime.evaluate', { expression: clickScript(selector), returnByValue: true }));
        if (!clicked) await sleep(500);
      }
      if (!clicked) console.warn(`  ! ${experiment.id}: nothing matched "${selector}"`);
      await sleep(400);
    }
    if (options.click?.length) await sleep(options.afterClickMs ?? 2500);

    // Hold keys down for a while, for experiments where the best frame is somewhere you walk to.
    for (const { key, ms } of options.hold ?? []) {
      const code = /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : key;
      const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined;
      const event = { key, code, windowsVirtualKeyCode: keyCode };
      await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
      await sleep(ms);
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    }

    if (options.hide?.length) {
      const css = `${options.hide.join(',')}{display:none !important}`;
      await call('Runtime.evaluate', {
        expression: `document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }))`,
      });
      await sleep(400);
    }

    const { data } = await call('Page.captureScreenshot', {
      format: 'webp',
      quality: WEBP_QUALITY,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height, scale: OUTPUT_SCALE },
    });
    return Buffer.from(data, 'base64');
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

if (!existsSync(join(siteRoot, 'index.html'))) {
  throw new Error('deployment/public is missing. Run `npm run build` first.');
}

const experiments = (await loadExperiments())
  .filter((experiment) => experiment.status !== 'planned')
  .filter((experiment) => !only || only.has(experiment.id) || only.has(experiment.folder));

if (experiments.length === 0) throw new Error('No experiments matched.');

await mkdir(thumbsDir, { recursive: true });
const server = await startStaticServer(siteRoot);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
let failures = 0;

try {
  for (const experiment of experiments) {
    process.stdout.write(`Capturing ${experiment.id} ... `);
    try {
      const image = await captureExperiment(browser.cdp, baseUrl, experiment);
      await writeFile(join(thumbsDir, `${experiment.id}.webp`), image);
      console.log(`${(image.length / 1024).toFixed(1)} KB`);
    } catch (error) {
      failures++;
      console.log(`failed (${error.message})`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures > 0) process.exitCode = 1;
