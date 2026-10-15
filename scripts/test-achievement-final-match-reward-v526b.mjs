// Playthrough 5.26-B — moedas de conquista da ÚLTIMA partida do torneio não
// podem ser apagadas pelo commit da finalização (TournamentModal →
// incrementMissionProgress com `playerPatch` absoluto).
// Invariante: fechamento = abertura + conquistas + prêmio do torneio.
import { makeSuite, bootCareer, reloadCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';

const { check, finish } = makeSuite('test-achievement-final-match-reward-v526b');
let { rt, storage, careerId, profile: p0 } = await bootCareer('achievement-final-526b');
try {
  let A = await act.loadActionModules(rt);
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  const pr = await act.ensurePartner(rt, A, await rt.localGame.entities.PlayerProfile.get(p0.id), (rows) => rows[0]);
  const partner = await rt.localGame.entities.AthleteProfile.get(pr.partnership.partner_bot_id || pr.partnership.athlete_b_id);
  const tournaments = (await rt.localGame.entities.Tournament.list('start_date', 400)).filter((t) => ['Bronze', 'Silver', 'Gold'].includes(t.tier));
  let tIndex = 0;
  const nextTournament = () => tournaments[tIndex++];
  const fresh = () => rt.localGame.entities.PlayerProfile.get(p0.id);
  const setCoins = async (coins) => rt.localGame.entities.PlayerProfile.update(p0.id, { coins });
  // Crédito de conquista como o achievementEngine faz (5.24-E): lê o perfil
  // fresco e grava saldo + recompensa.
  const creditAchievement = async (amount) => { const p = await fresh(); await rt.localGame.entities.PlayerProfile.update(p0.id, { coins: (Number(p.coins) || 0) + amount }); };

  /** Fluxo do modal na última partida: prepara (perfil SEM a conquista) →
   *  conquista credita → commit via incrementMissionProgress. */
  const finalMatchFlow = async ({ roundsWon, totalRounds, achievements, withIncrements = true }) => {
    const tournament = nextTournament();
    await setCoins(1000);
    const base = await fresh();
    const completion = await A.tournamentLifecycle.prepareTournamentFinalization({ profile: base, tournament, partner, roundsWon, totalRounds, runId: `${tournament.id}:t`, bracketHistory: null, run: null });
    for (const amount of achievements) await creditAchievement(amount);
    await rt.padel.incrementMissionProgress(p0.id, ['play_matches'], 1, base.career_date, {
      triggerEventId: `match-${tournament.id}`, batchWrites: true, additionalOperations: completion.operations,
      playerPatch: completion.playerPatch, playerIncrements: withIncrements ? completion.playerIncrements : undefined,
    });
    const closing = Number((await fresh()).coins);
    return { opening: 1000, prize: Number(completion.rewards.coins) || 0, achievements: achievements.reduce((a, b) => a + b, 0), closing };
  };

  await check('reprodução do bug: commit SEM increments apaga a conquista', async () => {
    const r = await finalMatchFlow({ roundsWon: 0, totalRounds: 4, achievements: [500], withIncrements: false });
    assert.equal(r.closing, r.opening + r.prize, 'esperava o comportamento antigo (conquista apagada)');
  });
  await check('conquista na derrota final: fechamento = abertura + conquista + prêmio', async () => {
    const r = await finalMatchFlow({ roundsWon: 1, totalRounds: 4, achievements: [500] });
    assert.equal(r.closing, r.opening + r.achievements + r.prize, JSON.stringify(r));
  });
  await check('conquista no título (final vencida)', async () => {
    const r = await finalMatchFlow({ roundsWon: 4, totalRounds: 4, achievements: [1000] });
    assert.equal(r.closing, r.opening + r.achievements + r.prize, JSON.stringify(r));
    assert.ok(r.prize > 0);
  });
  await check('múltiplas conquistas na última partida', async () => {
    const r = await finalMatchFlow({ roundsWon: 2, totalRounds: 4, achievements: [300, 700, 1500] });
    assert.equal(r.closing, r.opening + r.achievements + r.prize, JSON.stringify(r));
  });
  await check('conquista no primeiro/meio do torneio (commit sem finalização) preservada', async () => {
    await setCoins(1000);
    await creditAchievement(250);
    await rt.padel.incrementMissionProgress(p0.id, ['play_matches'], 1, (await fresh()).career_date, { triggerEventId: 'mid-match', batchWrites: true, additionalOperations: [], playerPatch: null });
    assert.equal(Number((await fresh()).coins), 1250);
  });
  await check('abandono (finalizeTournamentRun) com conquista creditada antes: preservada', async () => {
    const tournament = nextTournament();
    await setCoins(1000);
    const base = await fresh();
    await creditAchievement(400);
    const done = await A.tournamentLifecycle.finalizeTournamentRun({ profile: base, tournament, partner, roundsWon: 1, totalRounds: 4, runId: `${tournament.id}:w`, bracketHistory: null, run: null });
    assert.equal(Number((await fresh()).coins), 1000 + 400 + (Number(done.rewards.coins) || 0));
  });
  // Moedas sobrevivem save/reload/restart.
  const expected = Number((await fresh()).coins);
  rt = await reloadCareer(rt, storage, careerId);
  A = await act.loadActionModules(rt);
  await check('moedas sobrevivem destroy runtime → reload → reread', async () => {
    assert.equal(Number((await rt.localGame.entities.PlayerProfile.get(p0.id)).coins), expected);
  });
  rt = await reloadCareer(rt, storage, careerId);
  await check('e sobrevivem um segundo restart', async () => {
    assert.equal(Number((await rt.localGame.entities.PlayerProfile.get(p0.id)).coins), expected);
  });
} finally {
  await rt.close();
}
finish();
