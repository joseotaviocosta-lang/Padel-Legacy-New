// Playthrough 5.22-F — HARD GATE: nenhum teste ativo ainda trata a média
// geométrica (sqrt(A*B)) como a AUTORIDADE de TeamRanking.
//
// A média geométrica pode aparecer apenas como valor HISTÓRICO em uma
// comparação explícita (antes -> depois), nunca como expectativa canônica.
// A autoridade vigente é a SOMA (A + B), em `teamRankingFormula.js`.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const scriptsDir = fileURLToPath(new URL('../scripts/', import.meta.url));
const authoritySource = readFileSync(new URL('../src/lib/teamRankingFormula.js', import.meta.url), 'utf8');

// Família que mede TeamRanking / ranking de dupla / parceria.
const FAMILY = /(team-ranking|ranking|partner-overview|procedural-top50|real-vs-procedural|tabs-authority|new-pair-first-event|harness-market-sensitivity)/;
// Comparações históricas explícitas que PODEM citar a geométrica.
const SQRT_ALLOWLIST = new Set([
  'test-team-ranking-sum-formula-v522e.mjs',
  'test-team-ranking-seeding-after-sum-v522e.mjs',
  // Compara explicitamente PP vs geométrica para provar que a soma é a regra.
  'test-procedural-top50-justification-v515.mjs',
]);
const SELF = 'test-team-ranking-no-geometric-authority-v522f.mjs';

const files = readdirSync(scriptsDir)
  .filter((name) => name.endsWith('.mjs') && FAMILY.test(name) && !name.startsWith('measure-') && name !== SELF);

const offenders = [];

for (const name of files) {
  const code = readFileSync(`${scriptsDir}${name}`, 'utf8');
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // 1. sqrt() direto como valor de dupla, fora da allowlist de comparação.
  if (/Math\.sqrt\s*\(/.test(stripped) && !SQRT_ALLOWLIST.has(name)) {
    offenders.push(`${name}: usa Math.sqrt() para valor de dupla`);
  }

  // 2. modelGeometric só é permitido como comparação histórica: o arquivo
  //    precisa também referenciar a autoridade atual (sum/canonical).
  if (/modelGeometric/.test(stripped)
    && !/modelSum|CURRENT_MODEL|computeCanonicalTeamRankingPoints/.test(stripped)) {
    offenders.push(`${name}: usa modelGeometric sem referenciar a autoridade atual`);
  }

  // 3. Padrões de expectativa geométrica direta.
  if (/retained\s*<\s*0\.2/.test(stripped)) offenders.push(`${name}: 'retained < 0.2' (herança geométrica)`);
  if (/(===|==)\s*simpleAverage\s*\(/.test(stripped)) offenders.push(`${name}: compara canonical === simpleAverage`);
  // 4. Esperar 0 de uma dupla com um membro positivo: f(0, X) == 0.
  if (/computeCanonicalTeamRankingPoints\(\s*0\s*,\s*(?!0\s*\))\d+[^)]*\)\s*,\s*0\s*\)/.test(stripped)) {
    offenders.push(`${name}: espera que membro 0 zere a dupla (f(0, X) == 0)`);
  }
}

assert.equal(offenders.length, 0, `testes ainda ancorados na geométrica:\n${offenders.join('\n')}`);

// A autoridade de produção é a soma.
assert.match(authoritySource, /safeA \+ safeB/, 'teamRankingFormula.js não é a soma');
assert.doesNotMatch(authoritySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /Math\.sqrt\s*\(/, 'teamRankingFormula.js ainda usa sqrt');

console.log(`test-team-ranking-no-geometric-authority-v522f: PASS (${files.length} arquivos da família auditados)`);
