import fs from 'node:fs';

const careerHub = fs.readFileSync('src/pages/CareerHub.jsx', 'utf8');
const layout = fs.readFileSync('src/components/AppLayout.jsx', 'utf8');
const header = fs.readFileSync('src/components/career/CareerHeaderContext.jsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  ['Painel Minha Jornada', careerHub.includes('function MyJourneyPanel') && careerHub.includes('Minha jornada')],
  ['Feed da carreira', careerHub.includes('function CareerFeed') && careerHub.includes('Feed da carreira')],
  ['Objetivo dinâmico', careerHub.includes('Entrar no Top 500') && careerHub.includes('Defender a liderança mundial')],
  ['Atalhos diretos', careerHub.includes('to="/communications"') && careerHub.includes('to="/tournaments"')],
  ['Header inteligente', layout.includes('CareerHeaderContext') && header.includes('padel:day-advanced')],
  ['Contextos do header', header.includes('Recuperação') && header.includes('Fadiga alta') && header.includes('Semana de desenvolvimento')],
  ['Versão da entrega', pkg.version === '0.9.0-beta.33'],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) process.exit(1);
console.log(`UXHomeV36_3_1Test: PASS (${checks.length}/${checks.length})`);
