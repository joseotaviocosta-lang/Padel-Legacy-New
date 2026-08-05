import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['PartnerHub usa PageHeader premium', 'src/pages/PartnerHub.jsx', 'breadcrumb={[\'Carreira\', \'Dupla e relações\']}'],
  ['PartnerHub exibe indicadores da parceria', 'src/pages/PartnerHub.jsx', 'label="Entrosamento"'],
  ['PartnerHub exibe propostas', 'src/pages/PartnerHub.jsx', 'label="Propostas"'],
  ['Economia usa PageHeader premium', 'src/pages/Economy.jsx', 'title="Economia e patrimônio"'],
  ['Economia exibe saldo', 'src/pages/Economy.jsx', 'label="Saldo"'],
  ['Economia separa patrocínios e equipe', 'src/pages/Economy.jsx', 'label="Patrocínios/mês"'],
  ['Versão beta.12', 'package.json', '0.9.0-beta.12'],
];
let passed = 0;
for (const [name, file, needle] of checks) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (!content.includes(needle)) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${name}`);
    passed += 1;
  }
}
if (!process.exitCode) console.log(`PremiumRelationsV33_8Test: PASS (${passed}/${checks.length})`);
