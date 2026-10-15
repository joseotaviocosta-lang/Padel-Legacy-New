import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/partnerOffers.js', import.meta.url), 'utf8');
const required = ['rejection_cooldown_until', 'rejected_career_date', 'PARTNER_REJECTION_COOLDOWN_DAYS'];
const missing = required.filter((token) => !source.includes(token));

if (missing.length) {
  console.error(`partner-rejection-cooldown: FAIL missing ${missing.join(', ')}`);
  process.exit(1);
}

console.log('partner-rejection-cooldown: PASS');
