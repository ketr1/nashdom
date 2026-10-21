import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
for (const file of ['lib/api.mjs','lib/db.mjs','api/index.mjs','public/app.js','public/theme.js','public/sw.js','server.mjs']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
for (const icon of manifest.icons) if (!existsSync('public/' + icon.src.replace(/^\//, ''))) throw new Error('Missing icon');
JSON.parse(readFileSync('vercel.json', 'utf8'));
console.log('Build checks passed.');
