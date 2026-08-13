// Redesign Checkpoint — Polish 2.1, hotfix do ícone do Windows
// (docs/REDESIGN_POLISH_2_1.md). NÃO é parte da suíte `npm test` (depende
// de um .exe já compilado por `npm run app:build`) — rode manualmente
// depois de cada app:build para confirmar que o ícone realmente embutido
// no executável bate, byte a byte, com src-tauri/icons/icon.ico.
//
// Causa raiz que este script existe para nunca mais passar despercebida:
// um cache do Cargo (`target/release/build/padel-legacy-*`) ficou preso a
// uma versão antiga do ícone por várias rodadas de `npm run app:build`
// (Hotfix 1 → Polish 2 → M1 → M1.1 → M2), mesmo com icon.ico correto em
// disco o tempo todo. `icon.ico existe e está correto` NUNCA prova que o
// .exe usa esse arquivo — só rodar isto depois do build prova.
//
// Uso: node scripts/verify-exe-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const icoPath = path.join(root, 'src-tauri/icons/icon.ico');
const exePath = path.join(root, 'src-tauri/target/release/padel-legacy.exe');

if (!fs.existsSync(exePath)) {
  console.error(`padel-legacy.exe não encontrado em ${exePath} — rode "npm run app:build" primeiro.`);
  process.exit(1);
}

const ico = fs.readFileSync(icoPath);
const exe = fs.readFileSync(exePath);

const count = ico.readUInt16LE(4);
let allMatch = true;
for (let i = 0; i < count; i += 1) {
  const entryOffset = 6 + i * 16;
  const rawW = ico.readUInt8(entryOffset);
  const rawH = ico.readUInt8(entryOffset + 1);
  const w = rawW || 256;
  const h = rawH || 256;
  const size = ico.readUInt32LE(entryOffset + 8);
  const imgOffset = ico.readUInt32LE(entryOffset + 12);
  const frame = ico.subarray(imgOffset, imgOffset + size);
  const foundAt = exe.indexOf(frame);
  const ok = foundAt !== -1;
  allMatch = allMatch && ok;
  console.log(`frame ${w}x${h} (${size} bytes): ${ok ? `OK — encontrado no .exe em ${foundAt}` : 'AUSENTE do .exe — recurso embutido não bate com icon.ico'}`);
}

if (!allMatch) {
  console.error('\nFALHA: o .exe compilado não embute o icon.ico atual. Rode:');
  console.error('  cd src-tauri && cargo clean -p padel-legacy --release && cd ..');
  console.error('  npm run app:build');
  console.error('e execute este script de novo.');
  process.exit(1);
}

console.log('\nOK — todos os frames do icon.ico aparecem byte a byte no .exe compilado.');
