import fs from 'node:fs';
import assert from 'node:assert/strict';
const season = fs.readFileSync(new URL('../src/game-core/seasonLifecycle.js', import.meta.url), 'utf8');
const team = fs.readFileSync(new URL('../src/lib/teamRanking.js', import.meta.url), 'utf8');

// Fase 4 (ranking rolling de 52 semanas), item 1: o corte fixo de 20% no
// encerramento de temporada foi removido — investigação não encontrou
// nenhum registro de intenção de design (commit "v36" sem mensagem
// descritiva, nenhum comentário, nenhuma menção além de "funciona e é
// idempotente" em docs/BETA_READINESS_PHASE10.md §15). Este teste deixou
// de checar a PRESENÇA do carryover e passou a checar a AUSÊNCIA dele, mais
// a presença do mecanismo que o substituiu (janela rolling via
// AthleteRankingResult). Mesmo nome de arquivo/script por compatibilidade —
// scripts/rc-qa-suite-v36.mjs, scripts/test-beta-candidate.mjs e
// scripts/test-beta-rc-v36.mjs já referenciam test:ranking-carryover-v32.
assert(!season.includes('previousRankPoints * 0.80'), 'corte de 20% não deveria mais existir em finalizeSeason');
assert(!season.includes("ranking_carryover_rate: 0.80"), 'ranking_carryover_rate não deveria mais ser gravado em finalizeSeason');
assert(!team.includes('export async function applyTeamRankingSeasonCarryover'), 'applyTeamRankingSeasonCarryover deveria ter sido removida de teamRanking.js');
assert(season.includes("from './rankingWindow.js'"), 'finalizeSeason deveria usar o mesmo mecanismo de janela rolling que o resto do jogo');
assert(season.includes('computeRollingPoints'), 'bônus de temporada deveria virar um resultado datado na janela rolling, não um acumulador direto');

console.log('RankingSeasonCarryoverV32Test: PASS (Fase 4 — carryover removido, janela rolling confirmada)');
