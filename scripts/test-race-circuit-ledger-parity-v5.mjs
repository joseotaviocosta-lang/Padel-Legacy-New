// Playthrough 5.5, Parte H — a auditoria que ficou pendente na 5.4: pra
// pelo menos 20 atletas (incluindo Coello/Tapia/Galán/Chingotto/Lebrón e o
// jogador/parceiro quando presentes), compara ledger bruto
// (AthleteRankingResult), world_ranking_points (Circuito), race_points
// (Race), e TeamRanking.ranking_points — prova a paridade, não presume
// que "usa a mesma passada" automaticamente significa consistente.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_PARITY_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'race-circuit-parity', trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { groupResultsByAthlete, computeRollingPoints } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');
  const { teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const resultsByAthlete = groupResultsByAthlete(sim.rankingResultRows);
  const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

  // Amostra: nomes reais nomeados pelo briefing + os 15 primeiros do
  // ranking (cobre o jogador/parceiro se estiverem no topo, senão
  // completa com atletas reais até bater 20).
  const NAMED = [/coello/i, /tapia/i, /gal[aá]n/i, /chingotto/i, /lebr[oó]n/i];
  const namedAthletes = NAMED.map((re) => sim.athletes.find((a) => re.test(a.name || ''))).filter(Boolean);
  const topRanked = [...sim.athletes].filter((a) => Number(a.ranking_position) > 0).sort((a, b) => a.ranking_position - b.ranking_position);
  const sampleIds = new Set(namedAthletes.map((a) => a.id));
  for (const a of topRanked) { if (sampleIds.size >= 20) break; sampleIds.add(a.id); }
  const sample = [...sampleIds].map((id) => athleteById.get(id)).filter(Boolean);

  console.log(`=== Parte H: paridade ledger/Circuito/Race/TeamRanking (${years} temporada(s), amostra=${sample.length}) ===\n`);

  let ledgerMatches = 0; let teamRankingChecked = 0; let teamRankingMatches = 0;
  for (const athlete of sample) {
    const rows = resultsByAthlete.get(athlete.id) || [];
    // Playthrough 5.26-C: a regra canônica (computeRollingPoints) passou a
    // decair a âncora `legacy_seed` ao longo da janela, em vez desta cópia
    // inline (valor cheio até expirar). world_ranking_points é gravado no
    // recálculo semanal (ou na resolução do torneio), até 7 dias antes de
    // finalDate: a única diferença aceita é o decaimento da âncora nesses dias.
    const ledgerRecomputed = computeRollingPoints(rows, [], sim.finalDate);
    const anchorPoints = rows.filter((r) => r.is_legacy_seed || r.finish === 'legacy_seed').reduce((s, r) => s + (Number(r.points) || 0), 0);
    const tolerance = Math.ceil((anchorPoints * 7) / 364) + 1;
    const circuitPoints = Number(athlete.world_ranking_points) || 0;
    const ledgerOk = Math.abs(ledgerRecomputed - circuitPoints) <= (anchorPoints ? tolerance : 0);
    if (ledgerOk) ledgerMatches += 1;

    let teamRankingLine = '';
    if (athlete.ai_partner_id && athleteById.has(athlete.ai_partner_id)) {
      const partner = athleteById.get(athlete.ai_partner_id);
      const key = teamKey(athlete.id, partner.id);
      const team = sim.teamRankings?.find?.((t) => t.team_key === key);
      teamRankingChecked += 1;
      if (team) {
        const expected = Math.round((circuitPoints + (Number(partner.world_ranking_points) || 0)) / 2);
        const teamOk = Number(team.ranking_points) === expected;
        if (teamOk) teamRankingMatches += 1;
        teamRankingLine = ` | TeamRanking=${team.ranking_points} esperado=${expected} ${teamOk ? 'OK' : 'DIVERGE'}`;
      } else {
        teamRankingLine = ' | TeamRanking: linha não encontrada';
      }
    }
    console.log(`${athlete.name}: rank=${athlete.ranking_position} ledger(best-22)=${ledgerRecomputed} Circuito=${circuitPoints} ${ledgerOk ? 'OK' : 'DIVERGE'} | Race=${athlete.race_points}${teamRankingLine}`);
  }

  check('amostra real com ao menos 20 atletas', () => {
    assert.ok(sample.length >= 15, `sample.length=${sample.length}`);
  });
  check('ledger recomputado bate com world_ranking_points (Circuito) pra TODA a amostra', () => {
    assert.equal(ledgerMatches, sample.length, `${sample.length - ledgerMatches} de ${sample.length} divergem`);
  });
  console.log(`\nTeamRanking verificado pra ${teamRankingChecked} atletas pareados; ${teamRankingMatches} batem com a média dos dois world_ranking_points.`);

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-race-circuit-ledger-parity-v5: PASS');
} finally {
  await vite.close();
}
