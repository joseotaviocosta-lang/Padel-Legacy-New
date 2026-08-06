import fs from 'node:fs';

const required = [
  'src/lib/dailyCareerBriefing.js',
  'src/components/career/DailyCareerBriefing.jsx',
  'src/pages/CareerHub.jsx',
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}

const lib = fs.readFileSync('src/lib/dailyCareerBriefing.js', 'utf8');
const component = fs.readFileSync('src/components/career/DailyCareerBriefing.jsx', 'utf8');
const hub = fs.readFileSync('src/pages/CareerHub.jsx', 'utf8');

const checks = [
  ['briefing contextual', lib.includes('buildDailyCareerBriefing')],
  ['condição física', lib.includes("id: 'fatigue'") && lib.includes("id: 'energy'")],
  ['torneio próximo', lib.includes("id: 'tournament'")],
  ['mensagens pendentes', lib.includes("id: 'communications'")],
  ['dupla e forma recente', lib.includes("id: 'partner'") && lib.includes("id: 'form'")],
  ['componente visual', component.includes('Briefing do dia') && component.includes('StatusBadge')],
  ['integração na Home', hub.includes('DailyCareerBriefing') && hub.includes('dailyBriefing')],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) throw new Error(`Falhas: ${failed.map(([name]) => name).join(', ')}`);
console.log(`LivingCareerV34_6Test: PASS (${checks.length}/${checks.length})`);
