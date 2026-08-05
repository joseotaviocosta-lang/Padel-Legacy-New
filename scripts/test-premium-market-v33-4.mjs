import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['src/pages/WorldMarket.jsx', ['PageHeader', 'CardGrid', 'StatCard', 'Mercado Mundial', 'Atualização mensal ativa']],
  ['src/pages/Shop.jsx', ['PageHeader', 'CardGrid', 'StatCard', 'Loja de Equipamentos', 'Rotação mensal']],
];

let passed = 0;
for (const [file, tokens] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Arquivo ausente: ${file}`);
  const source = fs.readFileSync(full, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${file}: token ausente: ${token}`);
    passed += 1;
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '0.9.0-beta.8') throw new Error(`Versão inesperada: ${pkg.version}`);
if (!pkg.scripts?.['test:premium-market-v33']) throw new Error('Script de teste ausente.');

console.log(`PremiumMarketV33_4Test: PASS (${passed + 2}/12)`);
