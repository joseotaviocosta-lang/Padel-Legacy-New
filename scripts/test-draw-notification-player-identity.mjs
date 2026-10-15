// Playthrough 4.9, Parte F/P — invariante de identidade: a dupla exibida
// na notificação de sorteio só pode vir de um match GENUINAMENTE marcado
// como do jogador (player_match:true, escrito só por
// buildPlayerTournamentBracket, atrás de uma inscrição real) cruzado com o
// tournament_run (única fonte dos IDs reais do adversário). Nunca a
// primeira dupla da chave, nunca o primeiro match encontrado, nunca um
// fallback textual.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getPlayerOpeningMatchFromCanonicalBracket } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const makeRun = (opponentMembers) => ({
    version: 2, matches: [{ id: 'run-match-0', opponent: opponentMembers, date: '2026-04-01' }],
  });

  // Caso 1 — chave inteiramente AI-only (nenhum player_match): sem run,
  // deve retornar null, mesmo que existam vários matches na rodada 0.
  {
    const tournament = {
      bracket_history: [{ round: 'Rodada de 16', date: '2026-04-01', matches: [
        { match_id: 'm0', team_a: 'Franco López & Pablo López', team_b: 'Equipe X', winner: null },
        { match_id: 'm1', team_a: 'Equipe Y', team_b: 'Equipe Z', winner: null },
      ] }],
    };
    const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament, run: null });
    assert.equal(opening, null, 'sem run e sem player_match, nunca pode fabricar uma dupla a partir de matches[0]');
  }

  // Caso 2 — run existe (prova de inscrição), mas por alguma falha
  // hipotética nenhum match está marcado player_match:true: ainda assim
  // null — a marcação explícita é obrigatória, run sozinho não basta.
  {
    const tournament = {
      bracket_history: [{ round: 'Rodada de 16', date: '2026-04-01', matches: [
        { match_id: 'm0', team_a: 'Franco López & Pablo López', team_b: 'Equipe X', winner: null },
      ] }],
    };
    const run = makeRun([{ id: 'opp-1', name: 'Equipe X' }]);
    const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament, run });
    assert.equal(opening, null, 'sem nenhum match player_match:true, mesmo com run presente, não pode fabricar');
  }

  // Caso 3 — caminho genuíno: run presente + player_match:true no round 0 —
  // agora sim, a dupla/adversário são resolvidos, com IDs reais do
  // adversário vindos do run (nunca do texto da chave). O nome do
  // adversário no run precisa bater com team_b — exatamente como
  // buildPlayerTournamentBracket/createTournamentRun sempre gravam na
  // produção (mesmo texto, "Nome & Nome").
  {
    const tournament = {
      bracket_history: [{ round: 'Rodada de 16', date: '2026-04-01', matches: [
        { match_id: 'm0', team_a: 'Jogador Real & Parceiro Real', team_b: 'Adversário & Real', winner: null, player_match: true },
      ] }],
    };
    const run = makeRun([{ id: 'opp-real-1', name: 'Adversário' }, { id: 'opp-real-2', name: 'Real' }]);
    const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament, run });
    assert.ok(opening, 'com run + player_match:true, a função precisa resolver a dupla real');
    assert.equal(opening.playerTeam, 'Jogador Real & Parceiro Real');
    assert.equal(opening.opponentTeam, 'Adversário & Real');
    assert.deepEqual(opening.opponentMemberIds, ['opp-real-1', 'opp-real-2']);
  }

  // Caso 4 — bracket_history vazio/ausente: null, nunca um objeto parcial.
  {
    const run = makeRun([{ id: 'x', name: 'X' }]);
    assert.equal(getPlayerOpeningMatchFromCanonicalBracket({ tournament: { bracket_history: [] }, run }), null);
    assert.equal(getPlayerOpeningMatchFromCanonicalBracket({ tournament: null, run }), null);
  }

  console.log('test-draw-notification-player-identity: PASS');
} finally {
  await vite.close();
}
