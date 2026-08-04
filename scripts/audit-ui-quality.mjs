import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.jsonc', '.css', '.scss', '.html', '.md']);
const roots = ['src', 'public', 'base44'].filter(item => fs.existsSync(path.join(root, item)));
const ignoredSegments = new Set(['node_modules', 'dist', '.git', '.agents']);

function collect(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute, output);
    else if (extensions.has(path.extname(entry.name))) output.push(absolute);
  }
  return output;
}

const files = roots.flatMap(item => collect(path.join(root, item)));
const suspicious = [
  { label: 'caractere de substituição', regex: /�/u },
  { label: 'mojibake UTF-8', regex: /Ã[\u0080-\u00BF]|Â[\u0080-\u009F]|â[\u0080-\u00BF]{2}/u },
  { label: 'nome corrompido de Missões', regex: /Miss@aes/iu },
];
const errors = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  source.split(/\r?\n/u).forEach((line, index) => {
    for (const pattern of suspicious) {
      if (pattern.regex.test(line)) errors.push(`${path.relative(root, file)}:${index + 1} — ${pattern.label}`);
    }
  });
}

const navigationSource = fs.readFileSync(path.join(root, 'src/navigation/navigationConfig.js'), 'utf8');
for (const route of ['/game', '/game/training', '/training-center', '/game/missions', '/game/calendar', '/tournaments', '/ranking', '/partners', '/game/inventory', '/game/economy', '/journal', '/press', '/relationships', '/game/stats', '/achievements']) {
  if (!navigationSource.includes(`to: '${route}'`)) errors.push(`Navegação sem o destino obrigatório: ${route}`);
}

const emptyStateRequirements = [
  ['src/pages/Matches.jsx', 'Nenhuma partida registrada'],
  ['src/pages/Press.jsx', 'Sem entrevistas agendadas'],
  ['src/pages/Tournaments.jsx', 'Nenhum torneio'],
  ['src/pages/PartnerHub.jsx', 'Sem histórico'],
  ['src/components/partner/PartnerOverview.jsx', 'Sem parceiro ativo'],
];
for (const [file, expected] of emptyStateRequirements) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes(expected)) errors.push(`${file} não contém o estado vazio esperado: ${expected}`);
}

if (errors.length) {
  console.error(`Auditoria de interface falhou com ${errors.length} ocorrência(s):\n${errors.join('\n')}`);
  process.exit(1);
}

console.log(`Auditoria de interface aprovada: ${files.length} arquivos UTF-8 verificados.`);
