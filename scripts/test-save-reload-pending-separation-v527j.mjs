// Playthrough 5.27-J, Blocos J/K (itens 33–37) — save/reload com separação
// pendente. A mesma carreira (Balanced-E, Normal, seed 3, 2 anos) rodou
// contínua (smoke) e com save → reload a cada 7 dias (processo novo a cada
// checkpoint). Hard rule: contínuo == recarregado em inscrições, compromissos,
// data de separação, partidas e parceria seguinte; houve reload antes de
// sorteio, depois de sorteio e entre partidas de um torneio dentro do limbo.
import { readFileSync } from 'node:fs';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { outcomeHash, outcomeOf, canonical } from './lib/v527dJobs.mjs';
import { limboDecomposition, readJson, reloadCareer, report, smokeCareers } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-save-reload-pending-separation-v527j');
const dayOf = (r, date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / 86400000);
try {
  const reloaded = reloadCareer();
  const continuous = smokeCareers().find((r) => r.seed === 3);
  const segments = Number(readFileSync('reports/rebalance-527j/reload-weekly/segments.txt', 'utf8'));
  await check('rodada recarregada: ~104 reloads (a cada 7 dias) e carreira completa', () => {
    assert.ok(segments >= 100, `${segments} segmentos`);
    assert.equal(reloaded.days, 730); assert.ok(reloaded.checkpoints >= 100);
  });
  await check('contínuo == recarregado (outcomeHash idêntico: inscrições, compromissos, separação, partidas, parceria seguinte)', () => {
    assert.ok(continuous, 'seed 3 contínua ausente');
    for (const k of ['registrations', 'exitEvents', 'partners', 'matches', 'renewalDecisions', 'tournaments']) assert.equal(canonical(reloaded[k]), canonical(continuous[k]), k);
    assert.equal(outcomeHash(reloaded), outcomeHash(continuous), JSON.stringify(Object.keys(outcomeOf(reloaded)).filter((k) => canonical(outcomeOf(reloaded)[k]) !== canonical(outcomeOf(continuous)[k]))));
  });
  const limbo = limboDecomposition(reloaded).filter((d) => d.newPartnerDay != null);
  const ckptDays = Array.from({ length: 105 }, (_, i) => i * 7).filter((d) => d > 0 && d < 730);
  await check('houve reload DENTRO do limbo, com a saída já decidida', () => {
    assert.ok(limbo.length >= 1, 'nenhuma saída com limbo nesta carreira');
    assert.ok(limbo.some((d) => ckptDays.some((c) => c > d.decisionDay && c < d.newPartnerDay)));
  });
  // Reload DIÁRIO (processo novo todo dia) nos primeiros 110 dias da mesma carreira,
  // que contêm a 1ª saída com compromisso pendente: cobre os três momentos.
  const daily = readJson('reports/rebalance-527j/reload-daily/normal-003.json');
  const cont110 = readJson('reports/rebalance-527j/cont-110/normal-003.json');
  await check('reload diário (110 dias) == contínuo (110 dias): mesmo outcomeHash', () => {
    assert.ok(Number(readFileSync('reports/rebalance-527j/reload-daily/segments.txt', 'utf8')) >= 100);
    assert.equal(outcomeHash(daily), outcomeHash(cont110));
  });
  // Seed 4 (mesma config): limbo do dia 77 ao 95 com um torneio de 4 partidas (dias 91–94).
  const dailyS4 = readJson('reports/rebalance-527j/reload-daily-s4/normal-004.json');
  const cont100S4 = readJson('reports/rebalance-527j/cont-100-s4/normal-004.json');
  await check('reload diário seed 4 (100 dias) == contínuo (100 dias): mesmo outcomeHash', () => {
    assert.ok(Number(readFileSync('reports/rebalance-527j/reload-daily-s4/segments.txt', 'utf8')) >= 90);
    assert.equal(outcomeHash(dailyS4), outcomeHash(cont100S4));
  });
  await check('reload antes do sorteio, depois do sorteio e entre partidas de um compromisso do limbo (diário)', () => {
    const kinds = new Set();
    for (const [run, d] of [daily, dailyS4].flatMap((x) => limboDecomposition(x).map((y) => [x, y]))) {
      const end = d.newPartnerDay ?? d.scheduledSeparationDay ?? run.days;
      const tids = [...new Set(run.matches.filter((m) => dayOf(run, m.date) >= d.decisionDay && dayOf(run, m.date) <= end).map((m) => m.tournamentId))];
      for (const id of tids) {
        const ds = run.matches.filter((m) => m.tournamentId === id).map((m) => dayOf(run, m.date)).sort((a, b) => a - b);
        // Sorteio do jogador até D-3 da 1ª partida (ensureTournamentDraw); reload todo dia.
        if (ds[0] - 4 >= d.decisionDay) kinds.add('antes-do-sorteio');
        if (ds[0] - 3 >= d.decisionDay || ds[0] - 1 >= d.decisionDay) kinds.add('depois-do-sorteio');
        if (ds.length >= 2 && ds.at(-1) > ds[0]) kinds.add('entre-partidas');
      }
    }
    assert.deepEqual([...kinds].sort(), ['antes-do-sorteio', 'depois-do-sorteio', 'entre-partidas'], [...kinds].join(','));
  });
  await check('reload semanal (2 anos): houve reload dentro de algum limbo', () => {
    assert.ok(limbo.some((d) => ckptDays.some((c) => c >= d.decisionDay && c <= (d.newPartnerDay ?? d.decisionDay))), JSON.stringify(limbo.map((d) => [d.decisionDay, d.newPartnerDay])));
  });
  await check('save-reload-results.json: estado de saída, compromissos e data de separação idênticos', () => {
    const r = report('save-reload-results.json');
    assert.equal(r.continuousEqualsReloaded, true);
    assert.equal(r.reloadReopenedRegistration, false);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
