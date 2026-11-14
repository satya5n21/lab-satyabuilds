import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};

async function readFrom(root, pathname) {
  const file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
  return { file, body: await readFile(file) };
}

/**
 * Serves a folder over HTTP on 127.0.0.1. Port 0 picks a free one; read it from server.address().
 * Files missing from `root` are looked up in `fallbackRoot` (used to reach built experiments in dev).
 */
export function startStaticServer(root, port = 0, fallbackRoot = null) {
  const server = createServer(async (request, response) => {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    for (const base of [root, fallbackRoot]) {
      if (!base) continue;
      try {
        const { file, body } = await readFrom(base, pathname);
        response.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(body);
        return;
      } catch {
        // try the next root
      }
    }
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
