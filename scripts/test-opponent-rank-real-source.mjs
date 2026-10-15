// Playthrough 5.0, Parte I/X — o ranking do adversário exibido na reunião
// pré-jogo nunca pode vir de seed/slot/posição de chave — só da fonte
// canônica real (getCanonicalTeamWorldRank, por IDs de atleta). Sem
// ranking real: "Sem ranking", nunca um número fabricado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Guards estruturais — a UI de adversário precisa continuar usando a fonte
// canônica (getCanonicalTeamWorldRank), nunca o campo de seed sintético
// (opponentRank/match.opponentRank) pra exibir "#N".
const tournamentModalSrc = read('src/components/tournaments/TournamentModal.jsx');
gate('TournamentModal.jsx usa getCanonicalTeamWorldRank para o ranking do adversário', tournamentModalSrc.includes('getCanonicalTeamWorldRank'));
gate('TournamentModal.jsx mostra "Sem ranking" quando não há fonte real (nunca um número fabricado)', tournamentModalSrc.includes('Sem ranking'));

const teamRankingSrc = read('src/lib/teamRanking.js');
gate('getCanonicalTeamWorldRank é identificado só por IDs de atleta (nunca nome/seed/slot)', /identificada só por IDs de atleta/.test(teamRankingSrc) || teamRankingSrc.includes('nunca nome, seed, slot'));

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getCanonicalTeamWorldRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { buildOpponentAnalysis } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');

  // Sem TeamRanking real para os IDs -> unranked, nunca um número.
  const unranked = await getCanonicalTeamWorldRank(['bot-a', 'bot-b']);
  gate('adversário sem TeamRanking real -> unranked:true, rank:0 (nunca fabricado)', unranked.unranked === true && unranked.rank === 0);

  // buildOpponentAnalysis (pura) precisa refletir o worldRank canônico
  // passado — nunca inventar um valor quando worldRank é null/unranked.
  const analysisUnranked = buildOpponentAnalysis([{ name: 'X' }, { name: 'Y' }], { worldRank: null });
  gate('buildOpponentAnalysis sem worldRank canônico não fabrica ranking (a menos que os próprios membros tragam ranking_position/world_rank real)', analysisUnranked.ranking === null);

  const analysisRanked = buildOpponentAnalysis([{ name: 'X' }, { name: 'Y' }], { worldRank: 47 });
  gate('buildOpponentAnalysis com worldRank canônico real usa esse valor', analysisRanked.ranking === 47);

  console.log(`\n=== ${gates} gates, todos PASS ===`);
  console.log('test-opponent-rank-real-source: PASS');
} finally {
  await vite.close();
}
