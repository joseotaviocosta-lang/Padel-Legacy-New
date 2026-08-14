// Compatibility utility for Branding Hotfix 9.2.
// Every ICO frame is a technical downscale of app-icon-master.png generated
// by generate-branding-hotfix-9-2.py. No size-specific artwork is accepted.
//
// Uso: node scripts/patch-icon-small-frames.mjs
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const icoPath = path.join(root, 'src-tauri/icons/icon.ico');
const png32Path = path.join(root, 'src-tauri/icons/32x32.png');
const overridesDir = path.join(root, 'src-tauri/icons-src');
const overrides = {
  16: 'small-16.png',
  24: 'small-24.png',
  32: 'small-32.png',
  48: 'small-48.png',
  64: 'small-64.png',
  256: 'small-256.png',
};

const ico = fs.readFileSync(icoPath);
const count = ico.readUInt16LE(4);
const entries = [];
for (let i = 0; i < count; i += 1) {
  const off = 6 + i * 16;
  const rawW = ico.readUInt8(off);
  const rawH = ico.readUInt8(off + 1);
  entries.push({
    w: rawW || 256,
    h: rawH || 256,
    colors: ico.readUInt8(off + 2),
    reserved: ico.readUInt8(off + 3),
    planes: ico.readUInt16LE(off + 4),
    bitcount: ico.readUInt16LE(off + 6),
    size: ico.readUInt32LE(off + 8),
    offset: ico.readUInt32LE(off + 12),
    data: null,
  });
}

for (const entry of entries) {
  entry.data = ico.subarray(entry.offset, entry.offset + entry.size);
}

let patched = 0;
for (const entry of entries) {
  const overrideFile = overrides[entry.w];
  if (!overrideFile || entry.w !== entry.h) continue;
  const overridePath = path.join(overridesDir, overrideFile);
  if (!fs.existsSync(overridePath)) throw new Error(`Override ausente: ${overridePath}`);
  const pngBytes = fs.readFileSync(overridePath);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngBytes.subarray(0, 8).equals(pngSig)) throw new Error(`${overridePath} não é um PNG válido`);
  entry.data = pngBytes;
  entry.size = pngBytes.length;
  patched += 1;
}

if (patched !== Object.keys(overrides).length) {
  throw new Error(`Esperava substituir ${Object.keys(overrides).length} frames, substituiu ${patched}. icon.ico não tem os tamanhos esperados?`);
}

// Reconstruir o arquivo: header + N entradas de diretório (16 bytes cada) + blobs concatenados,
// recalculando offsets porque os tamanhos dos frames trocados mudaram.
const headerSize = 6 + entries.length * 16;
let cursor = headerSize;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);

const dirBuffers = [];
for (const entry of entries) {
  const dir = Buffer.alloc(16);
  dir.writeUInt8(entry.w === 256 ? 0 : entry.w, 0);
  dir.writeUInt8(entry.h === 256 ? 0 : entry.h, 1);
  dir.writeUInt8(entry.colors, 2);
  dir.writeUInt8(entry.reserved, 3);
  dir.writeUInt16LE(entry.planes, 4);
  dir.writeUInt16LE(entry.bitcount, 6);
  dir.writeUInt32LE(entry.data.length, 8);
  dir.writeUInt32LE(cursor, 12);
  cursor += entry.data.length;
  dirBuffers.push(dir);
}

const out = Buffer.concat([header, ...dirBuffers, ...entries.map((e) => e.data)]);
fs.writeFileSync(icoPath, out);
console.log(`icon.ico reescrito — ${patched} frames oficiais substituídos, ${entries.length} frames no total, ${out.length} bytes.`);

fs.copyFileSync(path.join(overridesDir, overrides[32]), png32Path);
console.log('32x32.png standalone atualizado por downscale do master oficial.');
