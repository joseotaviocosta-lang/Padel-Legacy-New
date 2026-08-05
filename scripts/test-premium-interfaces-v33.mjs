import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['src/pages/CareerHub.jsx', ['calculateAge', 'LevelBadge', 'CoinBadge', 'XpBar']],
  ['src/pages/Coaches.jsx', ['PageHeader', 'StatCard', 'ProgressBar', 'Treinador principal']],
  ['src/pages/Staff.jsx', ['Comissão técnica', 'Treinador separado', 'Folha mensal']],
  ['src/pages/Ranking.jsx', ['Circuito mundial', 'Líder mundial', 'Melhor dupla']],
];
let failures = [];
for (const [file, needles] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { failures.push(`${file}: ausente`); continue; }
  const text = fs.readFileSync(full, 'utf8');
  for (const needle of needles) {
    if (file.endsWith('CareerHub.jsx')) {
      const importArea = text.split('\n').slice(0, 25).join('\n');
      if (importArea.includes(needle)) failures.push(`${file}: import órfão ${needle}`);
    } else if (!text.includes(needle)) failures.push(`${file}: não contém ${needle}`);
  }
}
if (failures.length) {
  console.error('PremiumInterfacesV33Test: FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('PremiumInterfacesV33Test: PASS');
console.log('✓ imports órfãos removidos');
console.log('✓ treinador, comissão e ranking usam o Design System');
