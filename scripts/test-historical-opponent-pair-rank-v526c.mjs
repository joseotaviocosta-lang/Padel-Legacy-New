// Playthrough 5.26-C, Bloco C — rank HISTÓRICO da dupla adversária.
// A partida grava o retrato do confronto NA DATA em que foi jogada:
// opponent_rank (posição canônica naquele dia), opponent_rank_source,
// opponent_member_ids (roster sorteado, ids canônicos) e team_rank_at_match
// (dupla do jogador pelo roster COMPROMETIDO da inscrição). Mudanças
// posteriores do ranking ou das duplas não reescrevem a partida.
// Fluxo real: inscrição → avanço de dias → sorteio → rodada jogada pelo
// harness (mesma sequência do TournamentModal.jsx). O adversário da rodada é
// trocado por uma dupla canônica do mundo (o catálogo sintético não tem rank).
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';
import { playTournamentRound } from './lib/v526Tournament.mjs';

const { check, finish } = makeSuite('test-historical-opponent-pair-rank-v526c');
const { rt, profile: p0 } = await bootCareer('hist-opp-rank-526c');
try {
  const A = await act.loadActionModules(rt);
  const TR = await rt.load('/src/lib/teamRanking.js');
  const E = rt.localGame.entities;
  const fresh = () => E.PlayerProfile.get(p0.id);
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  const partnerResult = await act.ensurePartner(rt, A, await fresh(), (rows) => rows[0]);
  const partnerAthlete = await E.AthleteProfile.get(partnerResult.partnership.partner_bot_id);

  // Inscrição + avanço até o sorteio bloquear o dia.
  let event = null;
  for (let day = 0; day < 120 && !event; day += 1) {
    const profile = await fresh();
    for (const t of (await act.registrationCandidates(rt, A, profile)).slice(0, 3)) {
      const r = await act.tryRegister(rt, A, profile, t, partnerAthlete);
      if (r.ok) break;
    }
    const adv = await rt.calendar.advanceCareerDays(await fresh(), 1);
    if (adv.blockedBy?.event_type === 'tournament' && adv.blockedBy.metadata?.tournament_run) event = adv.blockedBy;
    else if (adv.blockedBy?.id) await A.calendarSystem.resolveDecision(adv.blockedBy.id, 'skip').catch(() => null);
  }
  await check('pré-condição: torneio sorteado e bloqueando o dia', () => assert.ok(event, 'nenhum torneio sorteado em 120 dias'));

  // Adversário da rodada atual = dupla canônica #~20 do mundo.
  const teams = ((await E.TeamRanking.list('-ranking_points', 5000)) || []).filter((t) => Number(t.ranking_points) > 0);
  const target = teams[19];
  const oppAthletes = await Promise.all([target.player1_id, target.player2_id].map((id) => E.AthleteProfile.get(id)));
  const freshEvent = await E.CalendarEvent.get(event.id);
  const run = JSON.parse(JSON.stringify(freshEvent.metadata.tournament_run));
  const idx = run.matches.findIndex((m) => m.status !== 'completed');
  run.matches[idx].opponent = oppAthletes.map((a) => ({ ...a }));
  await E.CalendarEvent.update(event.id, { metadata: { ...freshEvent.metadata, tournament_run: run } });

  const expectedOpp = await TR.getCanonicalTeamWorldRank([target.player1_id, target.player2_id]);
  const committedTeam = await TR.getTeamRank(await fresh(), partnerAthlete);
  const played = await playTournamentRound(rt, A, { eventId: event.id, seedText: 'hist-opp-rank' });
  await check(`rodada jogada (${played.outcome})`, () => assert.equal(played.outcome, 'played'));
  const matchId = run.matches[idx].id;
  const stored = await E.Match.get(matchId).catch(() => null);

  await check(`partida gravou o rank canônico do dia (#${expectedOpp.rank}) e a origem`, () => {
    assert.ok(stored, 'Match não gravado');
    assert.equal(stored.opponent_rank, expectedOpp.rank);
    assert.equal(stored.opponent_rank_source, 'team-ranking');
  });
  await check('roster adversário gravado com ids canônicos do sorteio', () => {
    assert.deepEqual([...stored.opponent_member_ids].sort(), [target.player1_id, target.player2_id].sort());
  });
  await check('rank da dupla do jogador = roster comprometido na data', () => {
    assert.equal(stored.team_rank_at_match, Number(committedTeam.rank) > 0 ? Number(committedTeam.rank) : null);
  });
  await check('is_upset coerente com a regra única', () => {
    assert.equal(stored.is_upset, TR.isUpsetResult({ won: stored.winner === 'A', teamRank: committedTeam, opponentRank: expectedOpp }));
  });

  // O mundo muda depois da partida: a dupla vira a nº 1 e um membro troca de par.
  const top = teams[0];
  await E.TeamRanking.update(target.id, { ranking_points: Number(top.ranking_points) * 3 });
  const nowRank = await TR.getCanonicalTeamWorldRank([target.player1_id, target.player2_id]);
  await E.AthleteProfile.update(target.player1_id, { ai_partner_id: top.player1_id });
  const after = await E.Match.get(matchId);
  await check(`ranking mudou depois (#${expectedOpp.rank} → #${nowRank.rank}) e a partida NÃO foi reescrita`, () => {
    assert.notEqual(nowRank.rank, expectedOpp.rank);
    assert.equal(after.opponent_rank, expectedOpp.rank);
    assert.deepEqual(after.opponent_member_ids, stored.opponent_member_ids);
    assert.equal(after.team_rank_at_match, stored.team_rank_at_match);
  });
} finally {
  await rt.close();
}
finish();
