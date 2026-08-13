// Redesign Checkpoint — Polish 2.1, hotfix do ícone do Windows
// (docs/REDESIGN_POLISH_2_1.md). Valida a cadeia MASTER → PNGs → ICO
// estruturalmente (sem decodificar pixels — isso exigiria um decoder PNG
// completo). O bug real encontrado nesta fase (o .exe embutia um ícone
// diferente do icon.ico em disco, por causa de um cache do Cargo nunca
// invalidado) NÃO é detectável por este teste — ele só existe depois de
// `cargo build`, e este script não compila Rust. A verificação do recurso
// realmente embutido no .exe é manual (documentada em
// docs/REDESIGN_POLISH_2_1.md, seção do hotfix do ícone) até que exista uma
// forma confiável de parsear o recurso PE em Node sem reintroduzir a mesma
// classe de falso-positivo que o .NET System.Drawing já causou no Hotfix 1.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath));
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

// ── Master SVG existe e não tem os problemas que já quebraram o gerador ────
check('src/assets/brand/logo-mark.svg (master do ícone) ausente', exists('src/assets/brand/logo-mark.svg'));
const masterSvg = read('src/assets/brand/logo-mark.svg').toString('utf8');
const svgComments = masterSvg.match(/<!--([\s\S]*?)-->/g) || [];
const hasDoubleHyphenInComment = svgComments.some((comment) => comment.slice(4, -3).includes('--'));
check('master SVG contém hífen duplo dentro de comentário (já quebrou o gerador de ícones do Tauri: XML não permite -- dentro de <!-- -->)', !hasDoubleHyphenInComment);
check('master SVG contém caracteres não-ASCII (já corrompeu o data-URI do Vite em produção)', /^[\x00-\x7F]*$/.test(masterSvg));

// ── tauri.conf.json aponta para os assets corretos ──────────────────────────
const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json').toString('utf8'));
const iconList = tauriConf.bundle?.icon || [];
check('tauri.conf.json não lista icons/icon.ico (fonte do ícone do .exe no Windows)', iconList.includes('icons/icon.ico'));
for (const rel of iconList) {
  check(`tauri.conf.json referencia ${rel}, que não existe em src-tauri/`, exists(`src-tauri/${rel}`));
}

// ── icon.ico — estrutura do diretório ICO (formato binário, RFC de fato) ───
const ico = read('src-tauri/icons/icon.ico');
check('icon.ico não é um ICO válido (header ausente)', ico.length >= 6 && ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1);
const frameCount = ico.readUInt16LE(4);
check('icon.ico não possui nenhum frame', frameCount > 0);

const frames = [];
for (let i = 0; i < frameCount; i += 1) {
  const entryOffset = 6 + i * 16;
  const rawW = ico.readUInt8(entryOffset);
  const rawH = ico.readUInt8(entryOffset + 1);
  const w = rawW || 256;
  const h = rawH || 256;
  const size = ico.readUInt32LE(entryOffset + 8);
  const imgOffset = ico.readUInt32LE(entryOffset + 12);
  const frame = ico.subarray(imgOffset, imgOffset + size);
  const isPng = frame.length >= 8 && frame.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ihdrW = isPng ? frame.readUInt32BE(16) : null;
  const ihdrH = isPng ? frame.readUInt32BE(20) : null;
  frames.push({ w, h, size, isPng, ihdrW, ihdrH });
}

check(`icon.ico tem menos de 5 tamanhos (encontrados: ${frames.map((f) => `${f.w}x${f.h}`).join(', ')}) — Windows precisa de vários para Desktop/Explorer/Menu Iniciar/taskbar em DPIs diferentes`, frames.length >= 5);
for (const frame of frames) {
  check(`frame ${frame.w}x${frame.h} do icon.ico não é PNG válido`, frame.isPng);
  check(`frame ${frame.w}x${frame.h} do icon.ico: dimensão do IHDR (${frame.ihdrW}x${frame.ihdrH}) não bate com o diretório do ICO`, frame.ihdrW === frame.w && frame.ihdrH === frame.h);
  // Heurística de "frame vazio": um quadrado 100% de uma única cor sólida
  // comprime para poucos bytes de zlib; um símbolo real (bordas, curvas,
  // duas cores) sempre produz uma imagem PNG sensivelmente maior. Não decodifica
  // pixels, mas pega o caso mais grave (frame em branco/cor chapada).
  const minBytesPerPixel = 0.15;
  check(`frame ${frame.w}x${frame.h} do icon.ico parece vazio/cor sólida (${frame.size} bytes para ${frame.w}x${frame.h}px)`, frame.size >= frame.w * frame.h * minBytesPerPixel * 0.02 || frame.size >= 200);
}

const sizesFound = new Set(frames.map((f) => f.w));
for (const expected of [16, 32, 48, 64, 256]) {
  check(`icon.ico não contém o tamanho ${expected}x${expected} (recomendado pelo Windows Shell)`, sizesFound.has(expected));
}

console.log(`test:app-icon-pipeline OK — ${checks} verificações. Frames encontrados: ${frames.map((f) => `${f.w}x${f.h}`).join(', ')}.`);
console.log('Lembrete: este teste NÃO substitui a verificação manual do recurso embutido no .exe (ver docs/REDESIGN_POLISH_2_1.md) — só valida os arquivos-fonte em disco.');
