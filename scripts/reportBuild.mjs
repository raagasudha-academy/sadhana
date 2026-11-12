#!/usr/bin/env node
// Reports emitted bundles; no network, credentials, or deployment required.
import { readdir, stat } from 'node:fs/promises';
const base = new URL('../dist/assets/', import.meta.url);
const files = await readdir(base, { withFileTypes: true });
const rows = [];
for (const file of files) {
  if (!file.isFile() || !/\.(js|css)$/.test(file.name)) continue;
  const location = new URL(file.name, base);
  const size = (await stat(location)).size;
  rows.push({ file: file.name, bytes: size, kib: Number((size / 1024).toFixed(1)) });
}
rows.sort((a, b) => b.bytes - a.bytes);
console.log('Sadhana frontend production assets');
for (const row of rows) console.log(`${String(row.kib).padStart(8)} KiB  ${row.file}`);
const js = rows.filter((row) => row.file.endsWith('.js'));
const css = rows.filter((row) => row.file.endsWith('.css'));
console.log(
  `\nJS: ${js.length} chunks, ${(js.reduce((sum, row) => sum + row.bytes, 0) / 1024).toFixed(1)} KiB total`,
);
console.log(
  `CSS: ${css.length} assets, ${(css.reduce((sum, row) => sum + row.bytes, 0) / 1024).toFixed(1)} KiB total`,
);
if (js.length < 2) {
  console.error('Expected multiple JavaScript chunks after lazy-load extraction.');
  process.exitCode = 1;
}
