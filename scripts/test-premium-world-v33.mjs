import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/pages/WorldHub.jsx',
  'src/pages/Journal.jsx',
  'src/pages/Press.jsx',
];

const checks = [];
function check(label, condition) {
  checks.push({ label, condition: Boolean(condition) });
  if (!condition) throw new Error(`Falha: ${label}`);
}

for (const file of required) {
  check(`${file} existe`, fs.existsSync(path.join(root, file)));
}

const world = fs.readFileSync(path.join(root, 'src/pages/WorldHub.jsx'), 'utf8');
const journal = fs.readFileSync(path.join(root, 'src/pages/Journal.jsx'), 'utf8');
const press = fs.readFileSync(path.join(root, 'src/pages/Press.jsx'), 'utf8');

check('WorldHub usa o Design System', world.includes("@/components/design-system"));
check('WorldHub mantém as quatro áreas do Universo Vivo', ['Hoje', 'Circuito', 'Mercado', 'História'].every(label => world.includes(label)));
check('WorldHub mantém boletim e linha do tempo', world.includes('Resumo semanal do mundo') && world.includes('Linha do tempo mundial'));
check('Jornal usa PageHeader premium', journal.includes('<PageHeader') && journal.includes('Jornal do Circuito'));
check('Jornal preserva campeões, duplas, rivalidades e resultados', ['Campeões recentes', 'Top duplas', 'Rivalidades', 'Resultados recentes'].every(label => journal.includes(label)));
check('Imprensa usa cards semânticos', press.includes('<StatCard') && press.includes('Apego dos fãs'));
check('Imprensa mantém entrevistas contextuais', press.includes('getPendingInterviews') && press.includes('Sem entrevistas agendadas'));

console.log(`PremiumWorldV33_6Test: PASS (${checks.length}/${checks.length})`);
