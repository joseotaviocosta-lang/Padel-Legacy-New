// CLOUD-7B2A — compara dois arquivos de checkpoints; ignora apenas timestamps de gravação do envelope (updated_at/updated_date) e career_id.
import fs from 'node:fs';
import { firstDiff } from './lib/cloud7b2aDeterminismKit.mjs';
const [fa, fb] = process.argv.slice(2); const A = JSON.parse(fs.readFileSync(fa)); const B = JSON.parse(fs.readFileSync(fb));
const IGN = /^(career_id|updated_at|player\.updated_date)$/;
for (let d = 0; d < Math.min(A.cps.length, B.cps.length); d += 1) {
  const diff = firstDiff(A.cps[d], B.cps[d]).filter((k) => !IGN.test(k));
  if (diff.length) { console.log(`primeiro dia divergente: ${d}; coleções: ${diff.map((k) => `${k}(${A.cps[d][k]?.n}/${B.cps[d][k]?.n})`).join(', ')}`); process.exit(1); }
}
console.log('sem divergência em', Math.min(A.cps.length, B.cps.length) - 1, 'dias');
