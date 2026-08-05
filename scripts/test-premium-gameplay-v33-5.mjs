import fs from 'node:fs';

const checks = [
  ['src/components/matches/SimulationModal.jsx', ['Prontidão para competir', 'StatusBadge', 'ProgressBar', 'Partida treino']],
  ['src/components/matches/LiveMatch.jsx', ['data-live-match', 'PlaybackControls', 'Fim', 'rounded-2xl']],
  ['src/pages/CalendarPage.jsx', ['Avanço inteligente', 'Próximo torneio', 'StatCard', 'StatusBadge']],
];

let passed = 0;
for (const [file, needles] of checks) {
  const content = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`${file}: conteúdo ausente: ${needle}`);
    passed += 1;
  }
}
console.log(`PremiumGameplayV33_5Test: PASS (${passed}/${checks.reduce((sum, item) => sum + item[1].length, 0)})`);
