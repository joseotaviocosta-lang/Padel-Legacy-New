import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['src/pages/Communications.jsx', ['Central de Comunicações', 'markAllCommunicationsRead', 'COMMUNICATION_CATEGORIES']],
  ['src/lib/careerCommunications.js', ['ensureContextualCareerCommunications', 'context_key', 'normalizeCareerMessage']],
  ['src/components/communications/CommunicationBell.jsx', ['Abrir comunicações', '/communications']],
  ['src/App.jsx', ['path="/communications"', 'Communications']],
  ['src/lib/routeModules.js', ["'/communications': 'Communications'"]],
  ['src/navigation/navigationConfig.js', ["to: '/communications'", "label: 'Comunicações'"]],
  ['src/pages/CareerHub.jsx', ['ensureContextualCareerCommunications', "to=\"/communications\""]],
];
let passed = 0;
for (const [file, needles] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Arquivo ausente: ${file}`);
  const text = fs.readFileSync(full, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file}: conteúdo ausente: ${needle}`);
  passed += 1;
}
console.log(`LivingCareerV34_1Test: PASS (${passed}/${checks.length})`);
