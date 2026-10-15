// Playthrough 5.27-J, Bloco E (itens 18/22) — compromisso assumido ANTES da
// saída continua inscrito, com a mesma dupla, durante e depois da separação;
// nenhum é cancelado (cenário determinístico + carreiras reais).
import { readFileSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';
import { smokeCareers, EXIT_STATUSES } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-preexisting-commitment-preserved-v527j');
try {
  for (const exit of ['lifecycle', 'player-scheduled']) {
    const s = await runExitScenario(`PreKept${exit === 'lifecycle' ? 'L' : 'P'}J`, { exit });
    await check(`${exit}: compromisso anterior segue 'confirmed' com o parceiro original após a separação`, () => {
      assert.ok(s.effectiveSeparationDate, 'a separação não aconteceu');
      assert.equal(s.preexistingKept, true, JSON.stringify(s.commitments));
      for (const c of s.commitments) assert.notEqual(c.status, 'cancelled', `${c.tournamentId} cancelado`);
    });
    await check(`${exit}: roster comprometido resolve o parceiro ORIGINAL depois da separação`, () => {
      for (const c of s.committedPartnerAfter) assert.equal(c.partnerId, s.partnerId, c.tournamentId);
    });
  }
  await check('carreiras reais (smoke 5 seeds): todo compromisso PENDENTE na decisão de saída foi jogado (nenhum cancelado pela saída)', () => {
    const cs = smokeCareers();
    assert.equal(cs.length, 5);
    const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
    let pending = 0;
    for (const r of cs) {
      const played = new Set(r.matches.map((m) => m.tournamentId));
      for (const e of (r.exitEvents || []).filter((x) => x.revertedDay == null)) {
        const decision = e.firstSeenDay;
        // Pendente na decisão: inscrito antes dela (estado não-saída) e terminando depois dela.
        const atDecision = (r.registrations || []).filter((g) => g.partnershipId === e.partnershipId && !EXIT_STATUSES.includes(g.partnershipStatus) && g.day <= decision && g.tournamentEnd && dayOf(r, g.tournamentEnd) >= decision);
        pending += atDecision.length;
        // W.O. (energia/lesão) é desfecho de partida, não cancelamento: só falha se o mesmo
        // compromisso FOI jogado na mesma carreira sem o fix (5.27-I, mesma seed/config).
        const before = JSON.parse(readFileSync(`reports/rebalance-527i/runs/balanced-e-normal-seed00${r.seed}-2y.json`, 'utf8')).result;
        const playedBefore = new Set(before.matches.map((m) => m.tournamentId));
        const missing = atDecision.filter((g) => !played.has(g.tournamentId) && playedBefore.has(g.tournamentId));
        assert.deepEqual(missing.map((g) => g.tournamentId), [], `seed ${r.seed} saída do dia ${decision}`);
      }
    }
    assert.ok(pending > 0, 'nenhum compromisso pendente em saída — cenário não exercitado');
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
