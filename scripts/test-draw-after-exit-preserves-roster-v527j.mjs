// Playthrough 5.27-J, Bloco E (itens 19/20) — sorteio e partidas do
// compromisso que acontecem DEPOIS da saída usam a dupla comprometida: no ciclo
// real (carreiras do smoke e da rodada com save/reload), as partidas jogadas no
// limbo têm o parceiro antigo, campo real e nenhum fallback sintético; a
// troca de dupla não reescreve sorteios já feitos (5.26-D).
import { spawnSync } from 'node:child_process';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { limboDecomposition, reloadCareer, smokeCareers } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-draw-after-exit-preserves-roster-v527j');
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
try {
  const careers = [...smokeCareers(), reloadCareer()];
  let limboMatches = 0;
  await check('partidas no limbo (decisão → separação) jogadas com o parceiro ANTIGO', () => {
    for (const r of careers) for (const d of limboDecomposition(r)) {
      if (d.newPartnerDay == null) continue;
      // Parceiro da dupla que decidiu sair = o da última troca até a decisão; as partidas
      // dele ANTES da decisão (mesma parceria) são a referência; sem elas, a 1ª do limbo.
      const joined = r.partners.filter((p) => p.day <= d.decisionDay).at(-1);
      const samePartnership = r.matches.filter((m) => dayOf(r, m.date) >= (joined?.day ?? 0) && dayOf(r, m.date) < d.decisionDay);
      const limbo = r.matches.filter((m) => dayOf(r, m.date) >= d.decisionDay && dayOf(r, m.date) < d.newPartnerDay);
      limboMatches += limbo.length;
      const ref = (samePartnership.at(-1) || limbo[0])?.partnerOvr;
      const next = r.matches.find((m) => dayOf(r, m.date) >= d.newPartnerDay)?.partnerOvr;
      for (const m of limbo) assert.ok(Math.abs((m.partnerOvr ?? 0) - (ref ?? m.partnerOvr)) <= 3, `seed ${r.seed} ${m.date}: parceiro ${m.partnerOvr} × da dupla que saiu ${ref} (${joined?.partnerId}); próximo ${next}`);
    }
    assert.ok(limboMatches > 0, 'nenhuma partida no limbo — cenário não exercitado');
  });
  await check('sorteios do limbo: campo real, 0 fallback sintético', () => {
    for (const r of careers) for (const m of r.matches) assert.equal(m.drawFallbackCount || 0, 0, `seed ${r.seed} ${m.tournamentId}`);
  });
  await check('5.26-D: trocar/encerrar parceria depois do sorteio não reescreve o draw comprometido', () => {
    const t = spawnSync(process.execPath, ['scripts/test-partnership-change-does-not-rewrite-draw-v526d.mjs'], { encoding: 'utf8', timeout: 20 * 60 * 1000 });
    assert.equal(t.status, 0, (t.stdout || '').split('\n').filter((l) => l.startsWith('✗')).join('\n'));
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
