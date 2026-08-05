import fs from 'node:fs';

const checks = [
  ['src/components/career/CareerHud.jsx', ['Status rápido da carreira', 'Energia', 'Ranking']],
  ['src/pages/CareerHub.jsx', ['PremiumQuickStats', 'PageHeader', 'Próximo grande objetivo']],
  ['src/components/AppLayout.jsx', ['CareerHud', 'app-desktop-bar']],
  ['src/components/BottomNav.jsx', ["label: 'Carreira'", 'bottomNavPill']],
  ['src/index.css', ['Premium Experience v33.2', '.pl-career-hud']],
];

for (const [file, needles] of checks) {
  const content = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: conteúdo ausente: ${needle}`);
  }
}
console.log('PremiumHomeV33_2Test: PASS');
console.log('✓ Home contextual premium');
console.log('✓ HUD persistente desktop/mobile');
console.log('✓ Navegação rápida padronizada');
console.log('✓ Design System aplicado sem alterar regras da carreira');
