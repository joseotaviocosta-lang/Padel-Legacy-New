import fs from 'node:fs';

const checks = [
  ['src/pages/Training.jsx', ['PageHeader', 'PremiumStatCard', 'Recuperação e suporte', 'Atividades de treino']],
  ['src/pages/PlayerProfile.jsx', ['PageHeader', 'PremiumProgressBar', 'Resumo competitivo', 'Força esportiva atual']],
  ['src/pages/Missions.jsx', ['PageHeader', 'PremiumStatCard', 'Tutorial concluído', 'sticky top-2']],
];

let passed = 0;
for (const [file, markers] of checks) {
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${file}: marcador ausente: ${marker}`);
    passed += 1;
  }
  if (!source.includes('<Page>') || !source.includes('</Page>')) throw new Error(`${file}: estrutura Page incompleta`);
}
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (pkg.version !== '0.9.0-beta.11') throw new Error(`Versão inesperada: ${pkg.version}`);
console.log(`PremiumDevelopmentV33_7Test: PASS (${passed}/12)`);
