import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');
const required = [
  'getContractDecisionState',
  'ENDING_AFTER_COMMITMENTS',
  'encerra_apos_compromisso',
];

const missing = required.filter((token) => !source.includes(token));
if (missing.length) {
  console.error(`partner-decision-state-ui: FAIL missing ${missing.join(', ')}`);
  process.exit(1);
}

console.log('partner-decision-state-ui: PASS');
