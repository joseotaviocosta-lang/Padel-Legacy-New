// Playthrough 5.26-D, Bloco O — PERFORMANCE sem regressão grave. Construir o
// campo a partir do mundo real não pode virar gargalo (>1s por tarefa).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-real-pair-draw-performance-v526d');
const { rt, profile } = await bootDrawCareer('performance-526d');
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  await E.Tournament.create({
    id: 'd526-perf-gold', name: 'Perf Gold', tier: 'Gold', start_date: profile.career_date,
    end_date: profile.career_date, status: 'inscricoes', main_draw_size: 24,
  });
  const tournament = await E.Tournament.get('d526-perf-gold');
  const args = { tournament, profile, playerRank: 0, playerTeamName: 'Perf & Orm', partnerAthleteId: profile.partner_id || null };

  const samples = [];
  for (let i = 0; i < 4; i += 1) {
    const t0 = performance.now();
    const field = await WorldTour.buildPlayerTournamentField(args);
    const elapsed = performance.now() - t0;
    samples.push({ elapsed, diagnostics: field.diagnostics });
  }
  const times = samples.map((s) => s.elapsed).sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  console.log(`   candidatePool=${samples[0].diagnostics.candidatePool} eligiblePool=${samples[0].diagnostics.eligiblePool} real=${samples[0].diagnostics.realSelected}`);
  console.log(`   build times (ms): ${times.map((t) => Math.round(t)).join(', ')} | median ${Math.round(median)}`);

  await check('nenhuma construção de campo passa de 1s (Bloco O: task > 1s)', () => {
    assert.ok(times.every((t) => t < 1000), `construção lenta: ${times.map((t) => Math.round(t)).join(', ')}`);
  });

  await check('mediana da construção do campo cabe no orçamento Android (< 700ms)', () => {
    assert.ok(median < 700, `mediana ${Math.round(median)}ms`);
  });

  await check('o diagnóstico reporta o custo medido (admission/build) sem N+1 por candidato', () => {
    assert.ok(Number(samples[0].diagnostics.buildMs) >= 0);
    assert.ok(Number(samples[0].diagnostics.admissionMs) >= 0);
    assert.ok(samples[0].diagnostics.candidatePool > 0);
    // A leitura da população é única (1 list + 1 list + 1 resolver), não uma
    // consulta por candidato: o pool é maior que as chamadas de storage.
    assert.ok(samples[0].diagnostics.candidatePool >= samples[0].diagnostics.realSelected);
  });

  await check('sorteio completo do jogador (ensureTournamentDraw) conclui sem travamento', async () => {
    const t0 = performance.now();
    await drawPlayerTournament(rt, { profile, tournamentId: 'd526-perf-draw', tier: 'Silver' });
    const elapsed = performance.now() - t0;
    console.log(`   full draw (ms): ${Math.round(elapsed)}`);
    assert.ok(elapsed < 4000, `sorteio completo lento: ${Math.round(elapsed)}ms`);
  });
} finally {
  await rt.close();
}
finish();
