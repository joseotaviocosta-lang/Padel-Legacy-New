import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const root = process.cwd();
const resolve = (rel) => path.join(root, rel);
const exists = (rel) => fs.existsSync(resolve(rel));
const read = (rel) => fs.readFileSync(resolve(rel));
const text = (rel) => read(rel).toString('utf8');

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(rel) {
  const buffer = read(rel);
  check(`${rel} não é PNG`, buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  check(`${rel}: teste espera PNG RGBA 8-bit`, bitDepth === 8 && colorType === 6);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[inputOffset + x];
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upperLeft);
      else throw new Error(`${rel}: filtro PNG não suportado ${filter}`);
      pixels[y * stride + x] = decoded & 0xff;
    }
    inputOffset += stride;
  }
  return { width, height, pixels };
}

function components(image, predicate) {
  const { width, height, pixels } = image;
  const visited = new Uint8Array(width * height);
  const areas = [];
  const matches = (index) => predicate(pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2], pixels[index * 4 + 3]);
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || !matches(start)) continue;
    let area = 0;
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      area += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x + 1 < width) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y + 1 < height) neighbors.push(current + width);
      for (const next of neighbors) {
        if (!visited[next] && matches(next)) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
    areas.push(area);
  }
  return areas;
}

function inspectSmallIcon(rel, size, expectedHoles) {
  const image = decodePng(rel);
  check(`${rel}: dimensão incorreta`, image.width === size && image.height === size);
  const limeAreas = components(image, (r, g, b, a) => a > 150 && g > r + 18 && g > 130 && b < 100);
  const isolatedLime = limeAreas.filter((area) => area < size * size * 0.08);
  check(`${rel}: menos de ${expectedHoles} furos verdes isolados detectados (${isolatedLime.length})`, isolatedLime.length >= expectedHoles);
  const darkPixels = components(image, (r, g, b, a) => a > 180 && r < 60 && g < 70 && b < 80).reduce((sum, area) => sum + area, 0);
  check(`${rel}: silhueta preta da raquete ausente`, darkPixels > size * size * 0.12);
  const yellowPixels = components(image, (r, g, b, a) => a > 180 && r > 180 && g > 170 && b < 90).reduce((sum, area) => sum + area, 0);
  check(`${rel}: bola amarela ausente`, yellowPixels > 0);
}

for (const rel of [
  'src/assets/brand/logo-app-mark.svg',
  'src/assets/brand/app-icon-small.svg',
  'src/assets/brand/app-icon-small.png',
]) check(`asset novo ausente: ${rel}`, exists(rel));

const appMark = text('src/assets/brand/logo-app-mark.svg');
check('logo-app-mark.svg não declara a identidade raquete + bola', appMark.includes('data-brand-symbol="padel-racket-ball"'));
check('logo-app-mark.svg não preserva 10 furos explícitos', appMark.includes('data-racket-holes="10"'));
const smallMaster = text('src/assets/brand/app-icon-small.svg');
check('app-icon-small.svg não preserva 9 furos explícitos', smallMaster.includes('data-racket-holes="9"'));

const brandMark = text('src/components/design-system/BrandMark.jsx');
check('BrandMark não usa o novo logo-app-mark.svg', brandMark.includes('logo-app-mark.svg?url'));
check('BrandMark ainda usa o antigo logo-mark.svg', !brandMark.includes('logo-mark.svg'));
check('BrandMark tenta usar o master detalhado de 1024px', !brandMark.includes('app-icon-master'));

const surfaces = [
  'src/components/AppLayout.jsx',
  'src/components/padel/ui.jsx',
  'src/pages/CareerManager.jsx',
  'src/pages/Landing.jsx',
  'src/pages/Settings.jsx',
  'src/components/AuthLayout.jsx',
];
for (const rel of surfaces) check(`${rel} deixou de renderizar BrandMark`, text(rel).includes('BrandMark'));
check('LoadingScreen ainda renderiza o P antigo', !text('src/components/padel/ui.jsx').includes('>P</span>'));

inspectSmallIcon('src-tauri/icons-src/small-16.png', 16, 4);
inspectSmallIcon('src-tauri/icons-src/small-24.png', 24, 6);
inspectSmallIcon('src-tauri/icons-src/small-32.png', 32, 9);

check('favicon-16 não vem do frame small-16', read('public/favicon-16.png').equals(read('src-tauri/icons-src/small-16.png')));
check('favicon-32 não vem do frame small-32', read('public/favicon-32.png').equals(read('src-tauri/icons-src/small-32.png')));
check('favicon.png de compatibilidade não vem do frame small-32', read('public/favicon.png').equals(read('src-tauri/icons-src/small-32.png')));
const indexHtml = text('index.html');
check('index.html não declara favicon 16x16', indexHtml.includes('sizes="16x16"') && indexHtml.includes('/favicon-16.png'));
check('index.html não declara favicon 32x32', indexHtml.includes('sizes="32x32"') && indexHtml.includes('/favicon-32.png'));

const ico = read('src-tauri/icons/icon.ico');
const icoCount = ico.readUInt16LE(4);
const icoFrames = new Map();
for (let index = 0; index < icoCount; index += 1) {
  const offset = 6 + index * 16;
  const size = ico.readUInt8(offset) || 256;
  const byteLength = ico.readUInt32LE(offset + 8);
  const dataOffset = ico.readUInt32LE(offset + 12);
  icoFrames.set(size, ico.subarray(dataOffset, dataOffset + byteLength));
}
for (const size of [16, 24, 32, 48, 64, 256]) check(`icon.ico sem frame ${size}x${size}`, icoFrames.has(size));
for (const size of [16, 24, 32]) check(`frame ${size} do ICO não usa o small manual`, icoFrames.get(size).equals(read(`src-tauri/icons-src/small-${size}.png`)));

const iconManifest = JSON.parse(text('src-tauri/icons-src/icon-manifest.json'));
check('manifest não mantém o master detalhado como default', iconManifest.default.includes('app-icon-master.png'));
check('manifest não documenta o master small', iconManifest.small.includes('app-icon-small.png'));
const patchScript = text('scripts/patch-icon-small-frames.mjs');
check('pipeline small ainda referencia o asset morfológico antigo', !patchScript.includes('app-icon-simplified'));
check('pipeline small não declara 4/6/9 furos explícitos', patchScript.includes('4/6/9'));

const tauriConfig = JSON.parse(text('src-tauri/tauri.conf.json'));
check('Tauri não aponta para icon.ico', tauriConfig.bundle.icon.includes('icons/icon.ico'));

const androidForeground = decodePng('src-tauri/gen/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png');
const transparentAreas = components(androidForeground, (_r, _g, _b, a) => a < 16);
const androidHoleAreas = transparentAreas.filter((area) => area < androidForeground.width * androidForeground.height * 0.02);
check(`adaptive Android não preserva furos transparentes (${androidHoleAreas.length})`, androidHoleAreas.length >= 9);
check('background adaptive Android não foi atualizado', exists('src-tauri/gen/android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png'));

inspectSmallIcon('src-tauri/icons/ios/AppIcon-20x20@1x.png', 20, 9);
check('projeto iOS foi criado indevidamente', !exists('src-tauri/gen/ios'));

const packageJson = JSON.parse(text('package.json'));
check('versão do app foi alterada', packageJson.version === '0.9.0-rc.1.9');
check('dependência Pillow/PIL foi adicionada ao app', !JSON.stringify(packageJson).toLowerCase().includes('pillow'));
check('script test:branding-hotfix-9-1 não registrado', packageJson.scripts?.['test:branding-hotfix-9-1'] === 'node scripts/test-branding-hotfix-9-1.mjs');

console.log(`test:branding-hotfix-9-1 OK — ${checks} verificações; 4/6/9 furos preservados em 16/24/32px.`);
