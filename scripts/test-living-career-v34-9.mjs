import fs from 'node:fs';

const required = [
  'src/lib/seasonCareerPlan.js',
  'src/components/career/SeasonCareerPlan.jsx',
  'src/pages/CareerHub.jsx',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
}
const hub = fs.readFileSync('src/pages/CareerHub.jsx', 'utf8');
const logic = fs.readFileSync('src/lib/seasonCareerPlan.js', 'utf8');
const component = fs.readFileSync('src/components/career/SeasonCareerPlan.jsx', 'utf8');
const checks = [
  hub.includes('SeasonCareerPlan'),
  hub.includes('buildSeasonCareerPlan'),
  logic.includes('Entrar no Top 500'),
  logic.includes('Construir uma temporada de evolução'),
  logic.includes('Fortalecer a identidade da dupla'),
  logic.includes('Montar uma equipe de alto desempenho'),
  component.includes('Quatro pilares para sua evolução'),
  component.includes('ProgressBar'),
];
if (checks.some((value) => !value)) throw new Error(`Falha estrutural: ${checks.map(Number).join(',')}`);
console.log('LivingCareerV34_9Test: PASS (8/8)');
