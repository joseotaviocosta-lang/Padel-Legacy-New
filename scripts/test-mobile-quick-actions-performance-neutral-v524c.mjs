// Playthrough 5.24-C, Parte J — atalhos puramente navegacionais, custo ~0.
//  - a rail não importa dados, não tem efeitos, timers nem assinaturas;
//  - segue memoizada (não re-renderiza com o shell);
//  - harness da 5.24-B: Home/Ranking/Torneios sem regressão material.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readSource } from './lib/v524cEvidence.mjs';

const rail = readSource('src/components/system/FloatingUtilityRail.jsx');
const code = rail.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
const imports = code.match(/^import .*$/gm) || [];
assert.deepEqual(imports.map((l) => l.match(/from '([^']+)'/)[1]).sort(), [
  '@/components/system/BetaTools', '@/navigation/routes.js', 'lucide-react', 'react', 'react-router-dom',
].sort(), `imports inesperados: ${imports.join(' | ')}`);
for (const forbidden of [/localGame/, /TeamRanking|teamRanking/, /AthleteProfile|Tournament/, /useEffect|useState/, /setInterval|setTimeout/, /addEventListener|subscribe/]) {
  assert.doesNotMatch(code, forbidden, `rail não pode usar ${forbidden}`);
}
assert.match(code, /export default React\.memo\(FloatingUtilityRail\)/);

// Medição: mesmo harness e mesmo cenário (mundo pesado, 360px, CPU 4x).
const before = new URL('../reports/perf-524b/after-heavy-360.json', import.meta.url);
const after = new URL('../reports/perf-524b/after524c-heavy-360.json', import.meta.url);
assert.ok(existsSync(before) && existsSync(after), 'rode: node scripts/perf-mobile-pages-v524b.mjs after524c --heavy');
const b = JSON.parse(readFileSync(before, 'utf8')).pages;
const a = JSON.parse(readFileSync(after, 'utf8')).pages;
for (const id of ['home', 'ranking', 'tournaments']) {
  assert.equal(a[id].writesMedian, 0, `${id}: nenhuma gravação`);
  assert.ok(a[id].teamRankingReadsMedian <= b[id].teamRankingReadsMedian, `${id}: leituras TR ${b[id].teamRankingReadsMedian} → ${a[id].teamRankingReadsMedian}`);
  assert.ok(a[id].queriesMedian <= b[id].queriesMedian, `${id}: queries ${b[id].queriesMedian} → ${a[id].queriesMedian}`);
  // Mesma margem de ruído do orçamento 5.24-B.
  assert.ok(a[id].tUsefulMedian <= b[id].tUsefulMedian * 1.25 + 100, `${id}: ${b[id].tUsefulMedian}ms → ${a[id].tUsefulMedian}ms`);
  console.log(`   ${id}: ${b[id].tUsefulMedian}ms → ${a[id].tUsefulMedian}ms · q ${b[id].queriesMedian} → ${a[id].queriesMedian} · TR ${b[id].teamRankingReadsMedian} → ${a[id].teamRankingReadsMedian}`);
}
console.log('test-mobile-quick-actions-performance-neutral-v524c: PASS');
