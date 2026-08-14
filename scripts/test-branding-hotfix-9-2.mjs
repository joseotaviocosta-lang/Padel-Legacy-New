import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const root = process.cwd();
const resolve = (rel) => path.join(root, rel);
const exists = (rel) => fs.existsSync(resolve(rel));
const read = (rel) => fs.readFileSync(resolve(rel));
const text = (rel) => read(rel).toString('utf8');
const hash = (rel) => crypto.createHash('sha256').update(read(rel)).digest('hex');

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

function pngInfo(rel) {
  const buffer = read(rel);
  check(`${rel} não é PNG`, buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType: buffer[25] };
}

function pngAlphaExtrema(rel) {
  const buffer = read(rel);
  let offset = 8;
  let width;
  let height;
  let colorType;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      check(`${rel}: teste espera PNG 8-bit`, data[8] === 8);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  check(`${rel}: teste espera PNG RGBA`, colorType === 6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let min = 255;
  let max = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else throw new Error(`${rel}: filtro PNG não suportado ${filter}`);
      pixels[y * stride + x] = (raw + predictor) & 0xff;
    }
    sourceOffset += stride;
  }
  for (let index = 3; index < pixels.length; index += 4) {
    min = Math.min(min, pixels[index]);
    max = Math.max(max, pixels[index]);
  }
  return { min, max };
}

const master = 'src/assets/brand/app-icon-master.png';
check('master oficial ausente', exists(master));
const masterInfo = pngInfo(master);
check('master oficial precisa ser 1024x1024', masterInfo.width === 1024 && masterInfo.height === 1024);

const iconManifest = JSON.parse(text('src-tauri/icons-src/icon-manifest.json'));
check('manifest não identifica o Hotfix 9.2', iconManifest.hotfix === '9.2');
check('manifest não aponta para o master oficial único', iconManifest.master === '../../src/assets/brand/app-icon-master.png');
check('hash do master não corresponde à proveniência', iconManifest.master_sha256 === hash(master));
check('manifest ainda declara um master alternativo small/default', !('small' in iconManifest) && !('default' in iconManifest));

const generator = text('scripts/generate-branding-hotfix-9-2.py');
check('gerador 9.2 não usa o master canônico', generator.includes('src/assets/brand/app-icon-master.png'));
for (const drawingPrimitive of ['rounded_rectangle(', '.ellipse(', '.polygon(', 'render_symbol']) {
  check(`gerador 9.2 redesenha a arte com ${drawingPrimitive}`, !generator.includes(drawingPrimitive));
}
check('pipeline artístico antigo 9.1 ainda existe', !exists('scripts/generate-branding-hotfix-9-1.py'));

for (const obsolete of [
  'src/assets/brand/logo-app-mark.svg',
  'src/assets/brand/app-icon-small.svg',
  'src/assets/brand/app-icon-small.png',
  'src-tauri/icons-src/app-icon-simplified.png',
]) check(`asset alternativo 9.1 ainda existe: ${obsolete}`, !exists(obsolete));

const brandMark = text('src/components/design-system/BrandMark.jsx');
check('BrandMark não importa diretamente o master oficial', brandMark.includes("app-icon-master.png?url"));
check('BrandMark ainda referencia um logo vetorial alternativo', !brandMark.includes('.svg'));
check('BrandMark deixou de renderizar uma imagem', brandMark.includes('<img'));

const surfaces = [
  'src/components/AppLayout.jsx',
  'src/components/padel/ui.jsx',
  'src/pages/CareerManager.jsx',
  'src/pages/Landing.jsx',
  'src/pages/Settings.jsx',
  'src/components/AuthLayout.jsx',
];
for (const rel of surfaces) check(`${rel} não usa BrandMark`, text(rel).includes('BrandMark'));
check('LoadingScreen ainda renderiza o P antigo', !text('src/components/padel/ui.jsx').includes('>P</span>'));

const activeBranding = [...surfaces, 'src/components/design-system/BrandMark.jsx', 'index.html', 'public/manifest.json', 'src-tauri/tauri.conf.json'].map(text).join('\n');
for (const obsoleteName of ['logo-app-mark', 'app-icon-small', 'app-icon-simplified']) {
  check(`referência ativa ao asset alternativo ${obsoleteName}`, !activeBranding.includes(obsoleteName));
}

for (const size of [16, 24, 32, 48, 64]) {
  const favicon = `public/favicon-${size}.png`;
  const info = pngInfo(favicon);
  check(`${favicon} tem dimensão incorreta`, info.width === size && info.height === size);
  check(`${favicon} não corresponde ao derivado registrado`, iconManifest.derived_sha256[favicon] === hash(favicon));
  check(`index.html não declara favicon ${size}x${size}`, text('index.html').includes(`sizes="${size}x${size}"`));
}
for (const size of [192, 512]) {
  const rel = `public/icon-${size}.png`;
  const info = pngInfo(rel);
  check(`${rel} tem dimensão incorreta`, info.width === size && info.height === size);
  check(`${rel} não corresponde ao derivado registrado`, iconManifest.derived_sha256[rel] === hash(rel));
}

const ico = read('src-tauri/icons/icon.ico');
check('icon.ico inválido', ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1);
const icoCount = ico.readUInt16LE(4);
check(`icon.ico precisa ter 6 frames, encontrou ${icoCount}`, icoCount === 6);
const icoSizes = [];
for (let index = 0; index < icoCount; index += 1) {
  const entry = 6 + index * 16;
  const size = ico.readUInt8(entry) || 256;
  const length = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  const frame = ico.subarray(offset, offset + length);
  icoSizes.push(size);
  check(`frame ${size} do ICO não deriva do mesmo PNG oficial`, frame.equals(read(`src-tauri/icons-src/small-${size}.png`)));
}
check('frames do ICO incorretos', JSON.stringify(icoSizes) === JSON.stringify([16, 24, 32, 48, 64, 256]));

for (const [density, legacySize, adaptiveSize] of [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
]) {
  const base = `src-tauri/gen/android/app/src/main/res/mipmap-${density}`;
  for (const filename of ['ic_launcher.png', 'ic_launcher_round.png']) {
    const info = pngInfo(`${base}/${filename}`);
    check(`Android ${density}/${filename} com dimensão incorreta`, info.width === legacySize && info.height === legacySize);
  }
  for (const filename of ['ic_launcher_foreground.png', 'ic_launcher_background.png']) {
    const info = pngInfo(`${base}/${filename}`);
    check(`Android ${density}/${filename} com dimensão incorreta`, info.width === adaptiveSize && info.height === adaptiveSize);
  }
}
const foregroundAlpha = pngAlphaExtrema('src-tauri/gen/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png');
check('foreground Android não tem transparência real', foregroundAlpha.min === 0 && foregroundAlpha.max === 255);
check('projeto iOS foi criado indevidamente', !exists('src-tauri/gen/ios'));
const iosFiles = fs.readdirSync(resolve('src-tauri/icons/ios')).filter((name) => name.endsWith('.png'));
check('assets iOS preparados estão incompletos', iosFiles.length >= 18);
for (const filename of iosFiles) pngInfo(`src-tauri/icons/ios/${filename}`);

const pkg = JSON.parse(text('package.json'));
check('script test:branding-hotfix-9-2 não registrado', pkg.scripts?.['test:branding-hotfix-9-2'] === 'node scripts/test-branding-hotfix-9-2.mjs');
check('versão do app foi alterada', pkg.version === '0.9.0-rc.1.9');

console.log(`test:branding-hotfix-9-2 OK — ${checks} verificações; um master oficial em todas as superfícies.`);
