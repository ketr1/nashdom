import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { handleApi } from './lib/api.mjs';

if (!process.env.DATABASE_URL) process.env.LOCAL_DB = '1';
if (!process.env.SETUP_KEY) {
  process.env.SETUP_KEY = randomBytes(24).toString('hex');
  console.log('Ключ первого входа (только для локального запуска):', process.env.SETUP_KEY);
}
const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: req, duplex: 'half' }) });
      const response = await handleApi(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Наш дом → http://localhost:${process.env.PORT || 5173}`));
