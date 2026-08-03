import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const DIST = path.resolve('dist');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(absolute));
    else if (/\.(js|css)$/.test(entry.name)) {
      const content = await readFile(absolute);
      output.push({ file: path.relative(DIST, absolute).replaceAll('\\', '/'), bytes: (await stat(absolute)).size, gzip: gzipSync(content).length });
    }
  }
  return output;
}

const assets = (await collect(DIST)).sort((a, b) => b.bytes - a.bytes);
const manifest = JSON.parse(await readFile(path.join(DIST, '.vite', 'manifest.json'), 'utf8'));
const entry = Object.values(manifest).find(item => item.isEntry);
const initialFiles = new Set([entry?.file, ...(entry?.css || [])].filter(Boolean));
const initial = assets.filter(asset => initialFiles.has(asset.file));
const total = list => list.reduce((sum, item) => sum + item.bytes, 0);
const totalGzip = list => list.reduce((sum, item) => sum + item.gzip, 0);
const kb = bytes => `${(bytes / 1024).toFixed(2)} kB`;

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  chunks: assets.length,
  initial: { files: initial.map(item => item.file), size: kb(total(initial)), gzip: kb(totalGzip(initial)) },
  allAssets: { size: kb(total(assets)), gzip: kb(totalGzip(assets)) },
  largest: assets.slice(0, 15).map(item => ({ file: item.file, size: kb(item.bytes), gzip: kb(item.gzip) })),
}, null, 2));
