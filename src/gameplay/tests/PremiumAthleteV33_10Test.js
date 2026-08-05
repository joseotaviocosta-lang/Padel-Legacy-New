import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [
  ['src/pages/CharacterEditor.jsx', ['Aparência e personalidade', 'PageHeader', 'CharacterPreview']],
  ['src/pages/Inventory.jsx', ['Bônus total', 'SurfaceHeader', 'EmptyState']],
  ['src/pages/CareerStats.jsx', ['Estatísticas da carreira', 'PremiumStatCard', 'Experiência']],
  ['src/pages/Clubs.jsx', ['Clubes do circuito', 'Clube líder', 'StatusBadge']],
  ['src/pages/ClubDetail.jsx', ['Estrutura esportiva', 'Associados', 'PageHeader']],
];

let passed = 0;
for (const [relative, needles] of checks) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${relative}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${relative} não contém: ${needle}`);
    passed += 1;
  }
}

console.log(`PremiumAthleteV33_10Test: PASS (${passed}/${checks.reduce((sum, item) => sum + item[1].length, 0)})`);
