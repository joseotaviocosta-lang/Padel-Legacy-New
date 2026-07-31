import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/gameplay/adapters',
  'src/gameplay/repositories',
  'src/gameplay/services',
  'src/gameplay/config',
  'src/gameplay/tests',
  'docs/ARCHITECTURE.md',
  'docs/PROJECT-CANONICAL.md',
];

const errors = [];
for (const item of required) {
  if (!fs.existsSync(path.join(root, item))) errors.push(`Ausente: ${item}`);
}
if (fs.existsSync(path.join(root, 'hotfix'))) errors.push('A pasta hotfix obsoleta ainda existe.');

const forbiddenImports = [
  '@/gameplay/PlayerAdapter.js',
  '@/gameplay/EntityAdapter.js',
  '@/gameplay/runtime.js',
  './gameplay/GameplayIntegrationTest.js',
  './gameplay/Sprint2IntegrationTest.js',
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx)$/.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const value of forbiddenImports) {
        if (text.includes(value)) errors.push(`Import legado em ${path.relative(root, full)}: ${value}`);
      }
    }
  }
}
walk(path.join(root, 'src'));

if (errors.length) {
  console.error('Falha na validação arquitetural:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Arquitetura Sprint 2.5 validada.');
