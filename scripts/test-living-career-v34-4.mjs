import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['src/lib/careerAssistant.js', ['buildCareerAssistantInsights', 'assistantGreeting']],
  ['src/components/career/CareerAssistant.jsx', ['Assistente da carreira', 'buildCareerAssistantInsights']],
  ['src/components/career/SmartAgenda.jsx', ['Agenda inteligente', 'Próximos 7 dias']],
  ['src/components/AppLayout.jsx', ['<CareerAssistant />']],
  ['src/pages/CareerHub.jsx', ['<SmartAgenda']],
];

const failures = [];
for (const [file, tokens] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) { failures.push(`${file}: ausente`); continue; }
  const content = fs.readFileSync(full, 'utf8');
  for (const token of tokens) if (!content.includes(token)) failures.push(`${file}: faltando ${token}`);
}

if (failures.length) {
  console.error('LivingCareerV34_4Test: FAIL');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('LivingCareerV34_4Test: PASS (5/5)');
