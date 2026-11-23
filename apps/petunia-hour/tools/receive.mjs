// One-shot local receiver: the extractor page POSTs its result here and we write flowers-data.js.
import http from 'node:http';
import { writeFileSync } from 'node:fs';
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    writeFileSync(new URL('../site/flowers-data.js', import.meta.url), 'window.PETUNIA_DATA = ' + body + ';\n');
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end('ok');
    console.log('written', body.length); setTimeout(() => process.exit(0), 200);
  });
}).listen(5193, '127.0.0.1');
