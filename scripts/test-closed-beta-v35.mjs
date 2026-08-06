import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const betaTools = read('src/components/system/BetaTools.jsx');
const feedback = read('src/lib/betaFeedback.js');

const checks = [
  ['versão beta.27', () => assert.equal(pkg.version, '0.9.0-beta.27')],
  ['script fechado', () => assert.equal(pkg.scripts['test:closed-beta-v35'], 'node scripts/test-closed-beta-v35.mjs')],
  ['formulário de relato', () => assert.match(betaTools, /Passos para reproduzir/)],
  ['classificação de gravidade', () => assert.match(betaTools, /Bloqueador — impede jogar/)],
  ['diagnóstico opcional', () => assert.match(betaTools, /includeDiagnostic/)],
  ['relato seguro', () => assert.match(feedback, /padel_legacy_closed_beta_feedback/)],
  ['sanitização de texto', () => assert.match(feedback, /slice\(0, maxLength\)/)],
  ['download dedicado', () => assert.match(feedback, /padel-legacy-feedback-/)],
];

for (const [label, run] of checks) {
  run();
  console.log(`✓ ${label}`);
}
console.log(`ClosedBetaV35Test: PASS (${checks.length}/${checks.length})`);
