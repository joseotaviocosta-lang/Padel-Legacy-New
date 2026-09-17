import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  buildCanonicalTournamentBracket, bracketFactsFromHistory, finalizeTournamentFromBracket,
  buildPlayerTournamentBracket, applyPlayerMatchToCanonicalBracket, deriveTournamentFactsFromFullBracket,
} from '../src/gameplay/worldTour/tournamentSettlement.js';
import { getVisibleTournamentBracketState, isTournamentCompletedAt } from '../src/lib/tournamentBracketView.js';
import { getStaffSlots } from '../src/lib/staffCatalog.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}

// ── Helper ──

function fillerFactory(count) {
  return Array.from({ length: count }, (_, i) => ({ name: `Filler${i + 1}`, strength: 30 + i * 2 }));
}

function drawPlayerBracket(tournamentId = 'pt43') {
  return buildPlayerTournamentBracket({
    tournamentId,
    date: '2026-01-29',
    playerTeamName: 'Jogador & Parceiro',
    mainOpponents: [{ name: 'Opp R16' }, { name: 'Opp QF' }, { name: 'Opp SF' }, { name: 'Opp Final' }],
    fillerFactory: (count) => fillerFactory(count),
  });
}

console.log('\n=== Playthrough 4.3 — Regression Suite ===\n');

check('0. Diagnóstico 4.3 usa bootstrap real Vite + coordinator', () => {
  const source = fs.readFileSync('scripts/diag-world-tour-production-window.mjs', 'utf8');
  assert(source.includes("createServer({ server: { middlewareMode: true }"), 'diagnóstico deve usar Vite SSR');
  assert(source.includes('ensureWorldSeed2025'), 'diagnóstico deve usar o seed real');
  assert(source.includes('ensureFutureTournaments'), 'diagnóstico deve usar a geração real da temporada');
  assert(source.includes('advanceCareerDayOnce'), 'diagnóstico deve usar o coordinator oficial');
  assert(!source.includes('WINDOW_TOURNAMENTS'), 'diagnóstico não pode manter torneios sintéticos');
});

check('0b. Diagnóstico real executa sem erro de alias ou bootstrap', () => {
  const result = spawnSync(process.execPath, ['scripts/diag-world-tour-production-window.mjs'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout.slice(-4000));
  assert(result.stdout.includes('Londres Challenge tier real:'), 'diagnóstico deve imprimir o tier real de Londres');
  assert(result.stdout.includes('TOTAL DA JANELA:'), 'diagnóstico deve imprimir o Race total real');
  assert(result.stdout.includes('WorldEvents entregues ao Jornal'), 'diagnóstico deve ler WorldEvents reais');
  assert(result.stdout.includes('STATUS Dubai Masters Open'), 'diagnóstico deve auditar Dubai nos checkpoints');
  assert(result.stdout.includes('STATUS Sydney Masters Open'), 'diagnóstico deve auditar Sydney nos checkpoints');
  assert(!result.stdout.includes('final=inscricoes | cancelled=true'), 'torneio cancelado vencido não pode permanecer em inscricoes');
  assert(result.stdout.includes('REPORT 2026-02-03 | pending=6 | resolved=6 | errors=[]'), 'deve provar o lote real processado sem erro');
});

// ── 1. Treino não gera notícia competitiva ──

check('1. PressArticle de treino deve ter article_type treino', () => {
  const source = fs.readFileSync('src/game-core/matchLifecycle.js', 'utf8');
  assert(source.includes("article_type: 'treino'"), 'matchLifecycle.js deve marcar article_type como treino');
});

check('1b. Press.jsx exclui artigos de treino', () => {
  const source = fs.readFileSync('src/pages/Press.jsx', 'utf8');
  assert(source.includes("'treino'"), 'Press.jsx deve filtrar artigos com article_type treino');
});

// ── 2. Staff não excede cap ──

check('2. getStaffSlots retorna valor correto por career_level', () => {
  assert.equal(getStaffSlots(1), 2);
  assert.equal(getStaffSlots(4), 2);
  assert.equal(getStaffSlots(5), 3);
  assert.equal(getStaffSlots(10), 4);
  assert.equal(getStaffSlots(15), 5);
  assert.equal(getStaffSlots(50), 9);
});

check('2b. Staff.jsx usa getStaffSlots, não profile.staff_slots', () => {
  const source = fs.readFileSync('src/pages/Staff.jsx', 'utf8');
  assert(source.includes('getStaffSlots'), 'Staff.jsx deve importar/usar getStaffSlots');
  assert(!source.includes('profile.staff_slots'), 'Staff.jsx não deve ler profile.staff_slots');
  assert(!source.includes('profile.max_staff_slots'), 'Staff.jsx não deve ler profile.max_staff_slots');
});

check('2c. economy.js valida cap no domínio (hireStaff)', () => {
  const source = fs.readFileSync('src/lib/economy.js', 'utf8');
  assert(source.includes('normalized.length >= slots'), 'hireStaff deve validar limite');
  assert(source.includes('getStaffSlots'), 'hireStaff deve usar getStaffSlots');
});

// ── 3/4/5. Múltiplos eventos simultâneos — todos resolvidos com chave ──

check('3. Torneios AI-only paralelos todos produzem campeão', () => {
  const tournaments = ['doha', 'madrid', 'cape-town', 'new-york', 'london-ai'].map((id) =>
    buildCanonicalTournamentBracket({
      tournamentId: id,
      date: '2026-01-29',
      participants: Array.from({ length: 8 }, (_, i) => ({ name: `${id}-Dupla${i + 1}`, strength: 100 - i * 5 })),
    })
  );
  assert.equal(tournaments.length, 5);
  tournaments.forEach((bracket, i) => {
    assert(bracket.champion, `torneio ${i} deve ter campeão`);
    assert(bracket.runner_up, `torneio ${i} deve ter vice`);
    assert.equal(bracket.bracket_history.length, 3, `torneio ${i} deve ter 3 rodadas`);
    assert(bracket.placements.length >= 8, `torneio ${i} deve ter colocações`);
  });
});

check('4. Todos possuem chave com bracket_history', () => {
  const bracket = buildCanonicalTournamentBracket({
    tournamentId: 'ai-only-test',
    date: '2026-01-29',
    participants: Array.from({ length: 16 }, (_, i) => ({ name: `Team${i}`, strength: 100 - i })),
  });
  assert(Array.isArray(bracket.bracket_history), 'bracket_history deve ser array');
  assert.equal(bracket.bracket_history.length, 4, '16 participantes → 4 rodadas');
  assert(bracket.bracket_history.every(r => r.matches.length > 0), 'toda rodada tem partidas');
});

check('5. Todos os participantes recebem colocação', () => {
  const bracket = buildCanonicalTournamentBracket({
    tournamentId: 'placement-test',
    participants: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, strength: 80 - i * 5 })),
  });
  assert.equal(bracket.placements.length, 8);
  assert.equal(bracket.placements[0].finish, 'champion');
  assert.equal(bracket.placements[1].finish, 'runner_up');
});

// ── 6. Race distribui pontos — verificação indireta

check('6. WorldTourLifecycle marca bracket_schema_version: 2 para AI-only', () => {
  const source = fs.readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
  // Verifica que bracket_schema_version: 2 aparece entre tournamentUpdates.push e o próximo settlement.patch
  const lastIdx = source.lastIndexOf('tournamentUpdates.push({');
  assert(lastIdx >= 0, 'deve ter tournamentUpdates.push');
  const block = source.slice(lastIdx, lastIdx + 200);
  assert(block.includes('bracket_schema_version: 2'), 'tournamentUpdates deve incluir bracket_schema_version: 2');
});

// ── 7. WorldEvent criado para resultado de torneio

check('7. WorldTourLifecycle cria WorldEvent com event_type tournament_result', () => {
  const source = fs.readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
  assert(source.includes("event_type: 'tournament_result'"), 'deve criar WorldEvent tournament_result');
  assert(source.includes('WorldEvent.bulkCreate'), 'deve usar bulkCreate para news');
});

// ── 8. Jornal consome eventos AI-only

check('8. Journal lê torneios com champion para resultados do circuito', () => {
  const source = fs.readFileSync('src/lib/journal.js', 'utf8');
  assert(source.includes('t.champion'), 'journal deve filtrar por t.champion');
  assert(source.includes("scope: 'circuit'"), 'deve ter scope circuit para resultados do circuito');
});

// ── 9. Jogador permanece na chave após settlement ──

check('9. Jogador permanece na chave draw_size 16 após eliminação nas quartas', () => {
  const rounds = drawPlayerBracket('player-bracket-16');
  // R16: vitória
  let acc = applyPlayerMatchToCanonicalBracket(rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp R16', won: true, score: '6-3 6-2', date: '2026-01-29',
  }).rounds;
  // QF: derrota
  acc = applyPlayerMatchToCanonicalBracket(acc, {
    roundIndex: 1, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp QF', won: false, score: '4-6 3-6', date: '2026-01-30',
  }).rounds;

  // Jogador no R16
  assert.equal(acc[0].matches[0].team_a, 'Jogador & Parceiro', 'jogador aparece em R16 team_a');
  assert.equal(acc[0].matches[0].winner, 'Jogador & Parceiro', 'jogador vence R16');
  // Jogador nas QF
  assert.equal(acc[1].matches[0].team_a, 'Jogador & Parceiro', 'jogador aparece nas QF');
  assert.equal(acc[1].matches[0].winner, 'Opp QF', 'algoz vence nas QF');
  assert.equal(acc[1].matches[0].score, '4-6 3-6', 'placar real registrado');
  // Jogador NÃO na SF
  assert.notEqual(acc[2].matches[0].team_a, 'Jogador & Parceiro', 'jogador não está na SF');
  assert.notEqual(acc[2].matches[0].team_b, 'Jogador & Parceiro', 'jogador não está na SF (team_b)');
  // Algoz continua
  assert.equal(acc[2].matches[0].team_a, 'Opp QF', 'algoz avança para SF');
  // Chave completa
  assert(acc.every(r => r.matches.every(m => m.winner)), 'toda a chave está completa');
  // Settlement
  const facts = deriveTournamentFactsFromFullBracket(acc);
  assert(facts.champion, 'chave produz campeão');
  assert.equal(facts.placements.length, 16, 'todos os 16 participantes têm colocação');
});

// ── 10. Jogador permanece no histórico após reload (idempotência) ──

check('10. Aplicar mesmo resultado duas vezes é idempotente', () => {
  const rounds = drawPlayerBracket('reload-test');
  const first = applyPlayerMatchToCanonicalBracket(rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp R16', won: true, score: '6-3 6-4',
  });
  const second = applyPlayerMatchToCanonicalBracket(first.rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp R16', won: true, score: '6-3 6-4',
  });
  assert.equal(second.idempotent, true, 'reaplicação deve ser no-op');
  assert.deepEqual(second.rounds, first.rounds, 'bracket idêntico após reload');
});

// ── 11. bracket schema v2 não é sobrescrito ──

check('11. TournamentModal não sobrescreve bracket_schema_version 2 com legado', () => {
  const source = fs.readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
  assert(source.includes('preserveCanonicalBracket'), 'TournamentModal deve ter guard preserveCanonicalBracket');
  const count = (source.match(/preserveCanonicalBracket/g) || []).length;
  assert(count >= 4, `deve ter pelo menos 4 referências a preserveCanonicalBracket (found ${count})`);
});

// ── 12. tournament_run e Tournament apontam para o mesmo evento ──

check('12. createDrawnRun e tournament_run usam mesmo tournament.id', () => {
  const drawSource = fs.readFileSync('src/lib/tournamentDraw.js', 'utf8');
  assert(drawSource.includes('tournament.id'), 'tournamentDraw usa tournament.id');
  assert(drawSource.includes('bracket_schema_version: 2'), 'tournamentDraw marca bracket_schema_version: 2');
});

// ── 13. Race agrega eventos simultâneos ──

check('13. resolveCompletedWorldTourEvents processa múltiplas semanas', () => {
  const source = fs.readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
  assert(source.includes('tournamentsByWeek'), 'deve agrupar torneios por semana');
  assert(source.includes('for (const [weekKey, weekTournaments]'), 'deve iterar por semanas');
  assert(source.includes('athletePoints'), 'deve acumular pontos por atleta');
});

// ── 14. UI de torneio encerrado nunca mostra "chave ainda não sorteada" se bracket v2 existe ──

check('14. UI mostra chave se bracket_history existe e torneio está completo', () => {
  const tournament = {
    id: 'completed-ai',
    status: 'finalizado',
    champion: 'Dupla A & Dupla B',
    runner_up: 'Dupla C & Dupla D',
    bracket_schema_version: 2,
    bracket_history: buildCanonicalTournamentBracket({
      tournamentId: 'completed-ai',
      participants: Array.from({ length: 8 }, (_, i) => ({ name: `Team${i}`, strength: 90 - i * 5 })),
    }).bracket_history,
    start_date: '2026-01-29',
  };
  const state = getVisibleTournamentBracketState(tournament, '2026-02-05');
  assert.equal(state.drawn, true, 'deve mostrar chave sorteada');
  assert.equal(state.completed, true, 'deve mostrar como completo');
  assert.equal(state.rounds.length, 3, 'deve ter 3 rodadas');
  assert(state.champion, 'deve mostrar campeão');
});

check('14b. UI mostra campeão mesmo sem bracket_history (AI-only legado)', () => {
  const tournament = {
    id: 'completed-no-bracket',
    status: 'finalizado',
    champion: 'Champion Team',
    runner_up: 'Runner Up Team',
    bracket_history: [],
    start_date: '2026-01-29',
  };
  const state = getVisibleTournamentBracketState(tournament, '2026-02-05');
  assert.equal(state.drawn, false, 'sem bracket_history → drawn false');
  assert.equal(state.champion, 'Champion Team', 'campeão deve vir do campo do tournament');
});

// ── 15. Treino não entra no pipeline de elimination/news tournament ──

check('15. buildCompactMatchRecord marca practice como não oficial', () => {
  const source = fs.readFileSync('src/game-core/matchFinalization.js', 'utf8');
  assert(source.includes('is_official: false'), 'practice match deve ser is_official: false');
  assert(source.includes('is_tournament: false'), 'practice match deve ser is_tournament: false');
  assert(source.includes("competition_type: 'practice'"), 'competition_type deve ser practice');
});

check('15b. isOfficialTournamentMatch rejeita tipos de treino', () => {
  const source = fs.readFileSync('src/lib/postMatchInterview.js', 'utf8');
  assert(source.includes("'practice'"), 'NON_OFFICIAL_MATCH_TYPES deve incluir practice');
  assert(source.includes("'training'"), 'NON_OFFICIAL_MATCH_TYPES deve incluir training');
  assert(source.includes("'treino'"), 'NON_OFFICIAL_MATCH_TYPES deve incluir treino');
  assert(source.includes("'simulada'"), 'NON_OFFICIAL_MATCH_TYPES deve incluir simulada');
});

// ── Extras: guards de integridade ──

check('Extra: finalizeTournamentFromBracket é idempotente', () => {
  const bracket = buildCanonicalTournamentBracket({
    tournamentId: 'idem-test',
    participants: Array.from({ length: 8 }, (_, i) => ({ name: `T${i}`, strength: 80 - i })),
  });
  const tournament = { id: 'idem-test', name: 'Idem Test', tier: 'Bronze' };
  const first = finalizeTournamentFromBracket({ tournament, bracket });
  const second = finalizeTournamentFromBracket({ tournament: { ...tournament, ...first.patch }, bracket });
  assert.equal(second.idempotent, true, 'segunda settlement deve ser no-op');
});

check('Extra: journal.js ordena campeões por tier', () => {
  const source = fs.readFileSync('src/lib/journal.js', 'utf8');
  assert(source.includes('TIER_PRIORITY'), 'journal deve ter mapa de prioridade por tier');
});

// ── Resultado ──

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
console.log('test-playthrough-4-3-production-reconciliation: PASS');
