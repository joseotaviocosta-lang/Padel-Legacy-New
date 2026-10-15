// Playthrough 5.27-J, Bloco E (itens 21/22) — o resultado do compromisso
// jogado no limbo é liquidado (prêmio/pontos) e atribuído à dupla
// comprometida; depois da separação o histórico continua apontando a dupla
// antiga (roster da inscrição, nunca a parceria atual).
import { spawnSync } from 'node:child_process';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';
import { limboDecomposition, reloadCareer, smokeCareers } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-settlement-after-exit-preserves-roster-v527j');
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
try {
  await check('carreiras reais: todo torneio jogado no limbo foi liquidado (finalização com pontos/prêmio)', () => {
    let n = 0;
    for (const r of [...smokeCareers(), reloadCareer()]) for (const d of limboDecomposition(r)) {
      if (d.newPartnerDay == null) continue;
      const ids = new Set(r.matches.filter((m) => dayOf(r, m.date) >= d.decisionDay && dayOf(r, m.date) < d.newPartnerDay).map((m) => m.tournamentId));
      for (const id of ids) {
        const t = r.tournaments.find((x) => x.tournamentId === id);
        assert.ok(t, `seed ${r.seed}: ${id} sem liquidação`);
        assert.ok(t.rankPoints >= 0 && t.status, `seed ${r.seed}: ${id} liquidação incompleta`);
        n += 1;
      }
    }
    assert.ok(n > 0, 'nenhum torneio no limbo');
  });
  const s = await runExitScenario('SettleJ', { exit: 'lifecycle' });
  await check('histórico: depois da separação o compromisso resolve a dupla da inscrição', () => {
    assert.ok(s.effectiveSeparationDate);
    for (const c of s.committedPartnerAfter) assert.equal(c.partnerId, s.partnerId);
  });
  await check('5.17: o torneio assumido mantém o parceiro registrado mesmo com a parceria encerrada (settlement/TeamRanking)', () => {
    const t = spawnSync(process.execPath, ['scripts/test-partnership-expiry-with-committed-tournament-v517.mjs'], { encoding: 'utf8', timeout: 20 * 60 * 1000 });
    assert.equal(t.status, 0, (t.stdout || '').split('\n').filter((l) => l.includes('✗') || l.includes('FAIL')).join('\n'));
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
