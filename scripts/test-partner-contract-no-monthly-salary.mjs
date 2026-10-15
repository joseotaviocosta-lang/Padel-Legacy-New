import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');
const matches = source.match(/Salário mensal/g) || [];

if (matches.length > 0) {
  console.error(`partner-contract-no-monthly-salary: FAIL (${matches.length} occurrence(s) found)`);
  process.exit(1);
}

console.log('partner-contract-no-monthly-salary: PASS');
