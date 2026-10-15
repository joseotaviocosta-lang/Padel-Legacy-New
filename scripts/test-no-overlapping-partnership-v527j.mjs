// Playthrough 5.27-J, Blocos G/H (itens 26–30) — nunca duas parcerias ativas;
// formar outra dupla no limbo não reescreve o compromisso antigo; o ex-parceiro
// continua no mundo; a nova dupla não colide com a agenda do compromisso antigo.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';
import { reloadCareer, smokeCareers, limboDecomposition } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-no-overlapping-partnership-v527j');
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
try {
  const s = await runExitScenario('OverlapJ', { exit: 'lifecycle', newPartnerDuringLimbo: true });
  await check('nova dupla formada no limbo: sempre exatamente 1 parceria ativa', () => {
    assert.ok(s.overlap, 'cenário de sobreposição não executado');
    assert.equal(s.overlap.activeCount, 1, JSON.stringify(s.overlap));
  });
  await check('o compromisso antigo continua com o parceiro original (nova dupla não sobrescreve)', () => {
    for (const c of s.committedPartnerAfter) assert.equal(c.partnerId, s.partnerId, c.tournamentId);
    assert.equal(s.preexistingKept, true);
  });
  await check('carreiras reais: a nova dupla só joga depois da última partida do limbo (sem colisão de agenda)', () => {
    for (const r of [...smokeCareers(), reloadCareer()]) for (const d of limboDecomposition(r)) {
      if (d.newPartnerDay == null) continue;
      const lastLimbo = r.matches.filter((m) => dayOf(r, m.date) >= d.decisionDay && dayOf(r, m.date) < d.newPartnerDay).map((m) => m.date).sort().at(-1);
      const firstNew = r.matches.filter((m) => dayOf(r, m.date) >= d.newPartnerDay).map((m) => m.date).sort()[0];
      if (lastLimbo && firstNew) assert.ok(firstNew > lastLimbo, `seed ${r.seed}: ${firstNew} ≤ ${lastLimbo}`);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
