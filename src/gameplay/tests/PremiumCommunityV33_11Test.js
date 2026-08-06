import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const targets = [
  'src/pages/Fans.jsx',
  'src/pages/Community.jsx',
  'src/pages/Social.jsx',
  'src/pages/Encyclopedia.jsx',
  'src/pages/HallOfFame.jsx',
];

const required = [
  ['src/pages/Fans.jsx', ['PageHeader', 'StatCard', 'ProgressBar', 'Sua base de fãs']],
  ['src/pages/Community.jsx', ['PageHeader', 'StatCard', 'Surface', 'Comunidade']],
  ['src/pages/Social.jsx', ['PageHeader', 'StatCard', 'StatusBadge', 'Rede Social']],
  ['src/pages/Encyclopedia.jsx', ['PageHeader', 'StatCard', 'SurfaceHeader', 'Enciclopédia Padel Legacy']],
  ['src/pages/HallOfFame.jsx', ['PageHeader', 'StatCard', 'StatusBadge', 'Hall da Fama']],
];

for (const file of targets) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Arquivo ausente: ${file}`);
  const source = fs.readFileSync(full, 'utf8');
  if (!source.includes("@/components/design-system")) throw new Error(`Design System não aplicado: ${file}`);
  if (source.includes('subtitle=') || source.includes('accent=')) throw new Error(`API antiga de PageHeader encontrada: ${file}`);
}

for (const [file, markers] of required) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${file}: marcador ausente: ${marker}`);
  }
}

console.log('PremiumCommunityV33_11Test: PASS (5/5 páginas premium)');
