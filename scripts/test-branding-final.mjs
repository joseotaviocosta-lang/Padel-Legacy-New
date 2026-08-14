// Fase 9 — Branding Final (docs/BRANDING_FINAL.md). Novo app icon oficial
// (raquete + bola sobre fundo verde-limão, fornecido pelo usuário) propagado
// para Windows/Android/iOS/favicon. Hotfix 9.1 também migra o BrandMark
// vetorial in-app para a mesma identidade de raquete + bola.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));
const sizeOf = (relPath) => fs.statSync(path.join(root, relPath)).size;

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

function pngDims(relPath) {
  const buf = fs.readFileSync(path.join(root, relPath));
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ── MASTER APP ICON ─────────────────────────────────────────────────────────

check('master app icon (src/assets/brand/app-icon-master.png) ausente', exists('src/assets/brand/app-icon-master.png'));
const masterDims = pngDims('src/assets/brand/app-icon-master.png');
check('master app icon não é um PNG válido', masterDims !== null);
check('master app icon não é 1024x1024', masterDims && masterDims.w === 1024 && masterDims.h === 1024);
check('master app icon não é uma imagem grande o bastante para conter detalhe real (arquivo suspeito de estar vazio/corrompido)', sizeOf('src/assets/brand/app-icon-master.png') > 50_000);

check('fontes de geração do ícone (icons-src) ausentes', exists('src-tauri/icons-src/icon-manifest.json'));
const manifest = JSON.parse(read('src-tauri/icons-src/icon-manifest.json'));
check('manifest do ícone não aponta para o master novo', manifest.default.includes('app-icon-master.png'));
check('manifest do ícone perdeu android_bg/android_fg (adaptive icon)', typeof manifest.android_bg === 'string' && typeof manifest.android_fg === 'string');
check('script patch-icon-small-frames.mjs (correção de legibilidade em 16/24/32px) ausente', exists('scripts/patch-icon-small-frames.mjs'));
check('master manual para tamanhos pequenos (app-icon-small.svg) ausente', exists('src/assets/brand/app-icon-small.svg'));
check('raster do master manual para tamanhos pequenos (app-icon-small.png) ausente', exists('src/assets/brand/app-icon-small.png'));

// ── WINDOWS / TAURI ──────────────────────────────────────────────────────────

const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'));
const bundleIcons = tauriConf.bundle?.icon || [];
for (const icon of ['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.ico']) {
  check(`tauri.conf.json parou de referenciar ${icon}`, bundleIcons.includes(icon));
  check(`${icon} não existe em disco`, exists(`src-tauri/${icon}`));
}
check('icon.ico não existe', exists('src-tauri/icons/icon.ico'));
const ico = fs.readFileSync(path.join(root, 'src-tauri/icons/icon.ico'));
const icoCount = ico.readUInt16LE(4);
check('icon.ico tem menos de 5 frames (esperado >=5: 16/24/32/48/64/256)', icoCount >= 5);
const icoSizes = [];
for (let i = 0; i < icoCount; i += 1) {
  const off = 6 + i * 16;
  const w = ico.readUInt8(off) || 256;
  icoSizes.push(w);
}
for (const s of [16, 32, 48, 256]) {
  check(`icon.ico não tem frame ${s}x${s}`, icoSizes.includes(s));
}

// ── ANDROID ──────────────────────────────────────────────────────────────────

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const expectedLegacySize = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const d of densities) {
  const base = `src-tauri/gen/android/app/src/main/res/mipmap-${d}`;
  check(`Android ${d}: ic_launcher_foreground.png ausente (adaptive icon)`, exists(`${base}/ic_launcher_foreground.png`));
  check(`Android ${d}: ic_launcher_background.png ausente (adaptive icon)`, exists(`${base}/ic_launcher_background.png`));
  check(`Android ${d}: ic_launcher.png ausente (fallback legado)`, exists(`${base}/ic_launcher.png`));
  check(`Android ${d}: ic_launcher_round.png ausente (fallback legado)`, exists(`${base}/ic_launcher_round.png`));
  const legacyDims = pngDims(`${base}/ic_launcher.png`);
  check(`Android ${d}: ic_launcher.png com dimensão errada (esperado ${expectedLegacySize[d]}x${expectedLegacySize[d]}, achou ${legacyDims && legacyDims.w}x${legacyDims && legacyDims.h})`, legacyDims && legacyDims.w === expectedLegacySize[d] && legacyDims.h === expectedLegacySize[d]);
}
const adaptiveXml = read('src-tauri/gen/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
check('adaptive-icon XML perdeu a referência ao foreground', adaptiveXml.includes('@mipmap/ic_launcher_foreground'));
check('adaptive-icon XML perdeu a referência ao background em mipmap (voltou a apontar para @color, órfão desde a Fase 9)', adaptiveXml.includes('@mipmap/ic_launcher_background'));

// ── iOS (preparação, sem inventar projeto) ───────────────────────────────────

check('não deveria existir src-tauri/gen/ios ainda (projeto iOS não foi inicializado nesta fase)', !exists('src-tauri/gen/ios'));
check('assets iOS preparados (src-tauri/icons/ios) ausentes', exists('src-tauri/icons/ios'));
const iosFiles = fs.readdirSync(path.join(root, 'src-tauri/icons/ios')).filter((f) => f.endsWith('.png'));
check(`assets iOS incompletos (esperado >=15 PNGs, achou ${iosFiles.length})`, iosFiles.length >= 15);
check('ícone de App Store (1024) ausente entre os assets iOS preparados', iosFiles.some((f) => f.includes('512@2x') || f.includes('1024')));

// ── FAVICON ──────────────────────────────────────────────────────────────────

check('favicon.png (novo branding) ausente de public/', exists('public/favicon.png'));
check('favicon.svg antigo (branding anterior) não foi aposentado', !exists('public/favicon.svg'));
const indexHtml = read('index.html');
check('index.html não referencia mais favicon.svg (deveria ter sido trocado por favicon.png)', !indexHtml.includes('favicon.svg'));
check('index.html não referencia favicon.png', indexHtml.includes('favicon.png'));
const manifestJson = JSON.parse(read('public/manifest.json'));
check('manifest.json (PWA) ainda referencia favicon.svg', !JSON.stringify(manifestJson).includes('favicon.svg'));
check('manifest.json (PWA) perdeu os ícones novos (192/512)', manifestJson.icons.some((i) => i.sizes === '192x192') && manifestJson.icons.some((i) => i.sizes === '512x512'));

// ── BRAND MARK (in-app, migrado no Hotfix 9.1) ───────────────────────────────

check('novo logo-app-mark.svg para UI interna ausente', exists('src/assets/brand/logo-app-mark.svg'));
const brandMark = read('src/components/design-system/BrandMark.jsx');
check('BrandMark.jsx não referencia logo-app-mark.svg', brandMark.includes('logo-app-mark.svg'));
check('BrandMark ainda referencia o antigo logo-mark.svg', !brandMark.includes('logo-mark.svg'));
check('BrandMark usa indevidamente o master detalhado de 1024px', !brandMark.includes('app-icon-master'));

// ── ASSETS ANTIGOS / PLACEHOLDERS ────────────────────────────────────────────

for (const brandFile of ['src/assets/brand/logo-app-mark.svg', 'index.html', 'src/components/design-system/BrandMark.jsx', 'public/manifest.json']) {
  check(`${brandFile} ainda referencia um asset hospedado em base44.com`, !read(brandFile).includes('base44.com'));
}

// ── VERSÃO NÃO ALTERADA INDEVIDAMENTE ────────────────────────────────────────

const pkg = JSON.parse(read('package.json'));
check(`versão do package.json foi alterada nesta fase de branding (era 0.9.0-rc.1.9, está ${pkg.version})`, pkg.version === '0.9.0-rc.1.9');
check(`versão do tauri.conf.json foi alterada nesta fase de branding (era 0.9.0, está ${tauriConf.version})`, tauriConf.version === '0.9.0');

check('script registrado', pkg.scripts?.['test:branding-final'] === 'node scripts/test-branding-final.mjs');

console.log(`test:branding-final OK — ${checks} verificações.`);
