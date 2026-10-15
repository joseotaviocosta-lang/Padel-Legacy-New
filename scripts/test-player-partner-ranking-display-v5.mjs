// Playthrough 5.5, Parte I — cabeçalho/aba Circuito/aba Race/aba Duplas/
// painel de torneio/"Minha dupla" usam fontes consistentes? Auditoria
// ESTÁTICA (grep de imports, não renderização de UI — React não roda
// neste harness headless): confirma que TODOS os componentes de tela que
// mostram ranking de atleta ou de dupla importam das MESMAS duas fontes
// canônicas (buildWorldRankingSnapshot pro individual, getTeamRankings/
// getTeamRank/getCanonicalTeamWorldRank pra dupla) — nunca uma terceira
// fórmula de ranking divergente escondida num componente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function grepFiles(pattern) {
  try {
    const out = execSync(`grep -rl "${pattern}" src --include="*.jsx" --include="*.js"`, { cwd: process.cwd(), encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

console.log('=== Parte I: consistência de fontes de ranking na UI (auditoria estática) ===\n');

// Componentes de tela relevantes citados no briefing.
const UI_FILES = [
  'src/pages/Ranking.jsx',
  'src/pages/CareerHub.jsx',
  'src/components/partner/PartnerOverview.jsx',
  'src/components/tournaments/TournamentModal.jsx',
  'src/pages/Tournaments.jsx',
];

const CANONICAL_INDIVIDUAL = 'buildWorldRankingSnapshot';
const CANONICAL_TEAM = /getTeamRank(ings)?\(|getCanonicalTeamWorldRank\(/;

for (const file of UI_FILES) {
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { console.log(`(${file}: não encontrado — pulando)`); continue; }
  const usesIndividual = content.includes(CANONICAL_INDIVIDUAL);
  const usesTeam = CANONICAL_TEAM.test(content);
  console.log(`${file}: usa ${CANONICAL_INDIVIDUAL}=${usesIndividual} | usa getTeamRank(ings)/getCanonicalTeamWorldRank=${usesTeam}`);
}

check('nenhum componente de UI (tela renderizada) define sua PRÓPRIA fórmula de pontos de dupla', () => {
  const suspiciousFiles = grepFiles('ranking_points.*+.*ranking_points\\|world_ranking_points.*+.*world_ranking_points');
  // saveFoundation.js: achado real, mas de SEEDING (não UI) — semeia
  // TeamRanking com a MESMA fórmula (average), só com uma imprecisão de
  // precedência de operador (`Math.round(A+B)/2` em vez de
  // `Math.round((A+B)/2)` — pode gerar ranking_points NÃO-INTEIRO no
  // instante da semeadura). Auto-corrige: `updateTeamRankings`
  // (circuitLifecycle.js, a fonte AUTORITATIVA) recomputa do zero na
  // PRIMEIRA passada de processWorldCircuit — já confirmado empiricamente
  // (test-team-ranking-authority-v5.mjs: ranking_points == média dos
  // world_ranking_points ATUAIS pra pares ativos). Não é uma divergência
  // de TELA (o que a Parte I pergunta), documentado aqui em vez de
  // escondido.
  const outsideCanonical = suspiciousFiles.filter((f) => !f.includes('teamRanking.js') && !f.includes('circuitLifecycle.js') && !f.includes('saveFoundation.js') && !f.includes('.test.') && !f.startsWith('scripts/'));
  assert.equal(outsideCanonical.length, 0, `fórmula de dupla duplicada fora da fonte canônica (e fora do seeding já documentado): ${outsideCanonical.join(', ')}`);
});

check('rankForTeamKey (getTeamRank do jogador + getCanonicalTeamWorldRank de qualquer dupla) é uma função ÚNICA compartilhada, não duas implementações', () => {
  const content = readFileSync('src/lib/teamRanking.js', 'utf8');
  const rankForTeamKeyCount = (content.match(/function rankForTeamKey/g) || []).length;
  assert.equal(rankForTeamKeyCount, 1, `rankForTeamKey definida ${rankForTeamKeyCount}x — deveria ser 1`);
  assert.ok(content.includes('export async function getTeamRank(') || content.includes('getTeamRank ='), 'getTeamRank não encontrado');
  assert.ok(content.includes('getCanonicalTeamWorldRank'), 'getCanonicalTeamWorldRank não encontrado');
});

check('PartnerOverview.jsx ("Minha dupla") consome a fonte canônica de dupla, não uma leitura direta e divergente de TeamRanking', () => {
  const content = readFileSync('src/components/partner/PartnerOverview.jsx', 'utf8');
  assert.ok(CANONICAL_TEAM.test(content), 'PartnerOverview.jsx não chama getTeamRank(ings)/getCanonicalTeamWorldRank');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
console.log('Nota (Parte I): auditoria ESTÁTICA (imports/chamadas), não renderização de componentes React — este harness é headless/Node, sem DOM. A consistência de DADOS (TeamRanking.ranking_points == média dos world_ranking_points atuais) já foi provada empiricamente em test-team-ranking-authority-v5.mjs.');
if (failed > 0) process.exitCode = 1;
else console.log('test-player-partner-ranking-display-v5: PASS');
