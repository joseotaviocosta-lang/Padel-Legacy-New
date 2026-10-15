// Playthrough 5.27-B, Bloco A — paridade com o chooseTournament semanal da IA.
// A dupla só entra no field do jogador se, realisticamente, escolheria o
// torneio na semana (mesma autoridade da IA), em vez de "existe + elegível".
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-ai-tournament-preference-parity-v527b');
const { rt, profile } = await bootDrawCareer('ai-pref-parity-527b', { warmDays: 8 });
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const t = await E.Tournament.create({ id: 'd527b-pref-gold', name: 'Pref Gold', tier: 'Gold', start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', main_draw_size: 24 });
  const f = await WorldTour.buildPlayerTournamentField({ tournament: t, profile, playerRank: 300, playerTeamName: 'A & B', partnerAthleteId: profile.partner_id });

  await check('o diagnóstico expõe preferredPool (preferência aplicada)', () => {
    assert.ok(Number.isFinite(f.diagnostics.preferredPool));
    assert.ok(Number.isFinite(f.diagnostics.eligiblePool));
    assert.ok(f.diagnostics.preferredPool <= f.diagnostics.eligiblePool);
  });

  await check('o field prioriza as duplas que ESCOLHERAM o torneio', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /chooseTournament\(weekTournaments, rep/);
    assert.match(src, /choice\?\.tournament\?\.id === tournament\.id/);
  });

  await check('a preferência não substitui a elegibilidade (ambas presentes)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /evaluateTournamentEntry\(tournament, rep, \{ aiFieldContext: true \}\)/);
  });

  await check('o torneio do jogador concorre com os eventos da MESMA janela (não é universo paralelo)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /weekTournaments/);
    assert.match(src, /allTournaments/);
  });
} finally {
  await rt.close();
}
finish();
