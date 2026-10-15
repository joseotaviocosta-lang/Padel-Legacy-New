// Playthrough 5.12 — simulação obrigatória: 3 seeds de calibração + 3
// held-out, cada uma com carreira nova, parceiro materializado e uma
// temporada de mundo vivo. Mede OVR, rank, Race, Circuito, TeamRanking,
// contrato e química, e prova idempotência de recarga/materialização.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const CALIBRATION = ['c1', 'c2', 'c3'];
const HELDOUT = ['h1', 'h2', 'h3'];

async function runSeed(label) {
  const captured = { label };
  await runHeadlessWorldSimulation({
    years: 1, label: `v512-${label}`, trackWeeklyDraws: false, includeRankingResults: true,
    onBeforeClose: async ({ localGame, profile, vite, processWorldCircuit, date }) => {
      const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
      const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
      const { materializePartnerAthlete } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');
      const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
      const { teamKey, computeCanonicalTeamRankingPoints, getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

      const pool = BOTS_BY_DIFFICULTY.amador || BOTS_BY_DIFFICULTY.iniciante || [];
      const bot = pool[Math.abs(label.charCodeAt(1) || 1) % Math.max(1, pool.length)] || pool[0];

      const populationBefore = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
      const contract = await formPartnerContract(profile, bot, { durationDays: 90, prizeSplit: 50, monthlySalary: 500 });
      const populationAfter = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
      const athleteId = contract.partnership.partner_bot_id;
      let athlete = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];

      // Joga um torneio real com esse parceiro.
      // O torneio precisa ser RECENTE em relação ao fim da simulação: a
      // janela rolante do Circuito tem 364 dias, então um torneio do início
      // de 2026 finalizado ao fim da temporada nasce já expirado e o
      // resultado é podado na passada seguinte (comportamento correto de
      // `isResultExpired`, não um defeito).
      const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
      const recent = tournaments.filter((t) => t.start_date && t.start_date <= date);
      const tournament = recent[recent.length - 1] || tournaments[0];
      // O resultado é datado pelo `career_date` do JOGADOR, não pela data do
      // torneio. O harness avança o mundo mas não a carreira, então sem
      // alinhar isso o resultado nasce ~1 ano no passado e a janela rolante
      // o descarta na passada seguinte do circuito.
      await localGame.entities.PlayerProfile.update(profile.id, { career_date: date });
      const fresh = await localGame.entities.PlayerProfile.get(profile.id);
      const partnerPointsAtWrite = Number(athlete.world_ranking_points) || 0;
      const run = await finalizeTournamentRun({ profile: fresh, tournament, partner: athlete, roundsWon: 2, totalRounds: 3 });
      athlete = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];

      // Parte O/P, critério 12 — os pontos de Circuito do parceiro são
      // recalculados pela janela rolante no ciclo do circuito, não escritos
      // direto pela finalização. Sem esta passada o parceiro fica com
      // `world_ranking_points = 0` mesmo tendo resultado registrado, e o
      // teste não provaria nada sobre o Circuito.
      const circuitDate = (() => {
        const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7);
        return d.toISOString().slice(0, 10);
      })();
      await processWorldCircuit(await localGame.entities.PlayerProfile.get(profile.id), date, circuitDate).catch(() => null);
      const athleteAfterCircuit = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];
      athlete = athleteAfterCircuit || athlete;

      const key = teamKey(profile.id, athleteId);
      const teamRow = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];
      const results = await localGame.entities.AthleteRankingResult.filter({ athlete_id: athleteId }).catch(() => []);

      // Idempotência: materializar de novo e reler.
      const again = await materializePartnerAthlete(bot, { careerDate: '2026-09-01' });
      const populationFinal = (await localGame.entities.AthleteProfile.list(null, 5000)).length;
      const reread = (await localGame.entities.AthleteProfile.filter({ id: athleteId }, null, 1))[0];

      Object.assign(captured, {
        botOvr: Number(bot.overall_rating),
        athleteId,
        createdOne: populationAfter - populationBefore,
        ovr: Number(athlete.overall_rating),
        potential: Number(athlete.potential),
        age: Number(athlete.age),
        circuit: Number(athlete.world_ranking_points) || 0,
        race: Number(athlete.race_points) || 0,
        results: results.length,
        teamPoints: Number(teamRow?.ranking_points) || 0,
        // A linha da dupla é gravada NA FINALIZAÇÃO, com os pontos que o
        // parceiro tinha naquele instante — não depois da passada do
        // circuito. Comparar com o valor pós-circuito mediria staleness, não
        // a fórmula.
        teamExpected: computeCanonicalTeamRankingPoints(
          Number(run.updatedProfile.rank_points) || 0, partnerPointsAtWrite,
        ),
        teamIfRecomputedNow: computeCanonicalTeamRankingPoints(
          Number(run.updatedProfile.rank_points) || 0, Number(athlete.world_ranking_points) || 0,
        ),
        contractEnd: contract.partnership.contract_end_date,
        salary: Number(contract.partnership.monthly_salary),
        chemistry: Number(contract.partnership.chemistry),
        rematerializedSameId: again?.id === athleteId,
        populationStable: populationFinal === populationAfter,
        rereadOvr: Number(reread.overall_rating),
        teamRank: (await getTeamRank(await localGame.entities.PlayerProfile.get(profile.id), athlete)).rank,
      });
    },
  });
  return captured;
}

const results = [];
for (const label of [...CALIBRATION, ...HELDOUT]) {
  const r = await runSeed(label);
  results.push(r);
  console.log(`[${label}] OVR ${r.botOvr}->${r.ovr} pot=${r.potential} idade=${r.age} | circuito=${r.circuit} race=${r.race} resultados=${r.results} | dupla=${r.teamPoints} (esperado ${r.teamExpected}) rank=#${r.teamRank} | química=${r.chemistry}`);
}

const calib = results.filter((r) => CALIBRATION.includes(r.label));
const held = results.filter((r) => HELDOUT.includes(r.label));

check('3 seeds de calibração + 3 held-out rodaram', () => {
  assert.equal(calib.length, 3);
  assert.equal(held.length, 3);
});

check('Critério 1-2: em toda seed o parceiro é um AthleteProfile com id persistente', () => {
  for (const r of results) {
    assert.ok(r.athleteId, `${r.label}: sem id`);
    assert.equal(r.createdOne, 1, `${r.label}: criou ${r.createdOne} atletas`);
  }
});

check('Critério 4: o OVR nunca é inflado na materialização', () => {
  for (const r of results) {
    assert.equal(r.ovr, r.botOvr, `${r.label}: OVR ${r.botOvr} -> ${r.ovr}`);
  }
});

check('Critério 3: recarga preserva identidade e OVR', () => {
  for (const r of results) {
    assert.equal(r.rereadOvr, r.ovr, `${r.label}: OVR mudou na releitura`);
    assert.ok(r.rematerializedSameId, `${r.label}: rematerialização devolveu outro id`);
    assert.ok(r.populationStable, `${r.label}: população cresceu na rematerialização`);
  }
});

check('Critério 11-12: Race e Circuito funcionam para o parceiro', () => {
  for (const r of results) {
    assert.ok(Number.isFinite(r.race) && r.race > 0, `${r.label}: race=${r.race}`);
    assert.ok(r.results >= 1, `${r.label}: ${r.results} resultados de torneio`);
    // Depois da passada do circuito, a janela rolante precisa ter
    // convertido o resultado do torneio em pontos de Circuito.
    assert.ok(r.circuit > 0,
      `${r.label}: parceiro com resultado registrado mas circuito=${r.circuit}`);
  }
});

check('Critério 13: TeamRanking canônico (soma) funciona sem exceção para o par do jogador', () => {
  // Antes desta continuação a linha só era escrita na finalização, então a
  // referência correta era o valor DAQUELE instante (`teamExpected`). Com a
  // reprojeção pelo circuito, a linha passa a acompanhar os pontos ATUAIS
  // dos dois membros — a referência certa agora é `teamIfRecomputedNow`.
  for (const r of results) {
    assert.equal(r.teamPoints, r.teamIfRecomputedNow,
      `${r.label}: ${r.teamPoints} != ${r.teamIfRecomputedNow}`);
  }
});

check('Parte A (corrigido): a dupla do jogador NÃO fica defasada após o circuito', () => {
  // Antes desta continuação, a linha do par do JOGADOR só era escrita na
  // finalização de torneio: o segundo laço de circuitLifecycle reprojetava
  // apenas pares cujos DOIS membros eram AthleteProfile, e o jogador é um
  // PlayerProfile. Medido então: 6/6 seeds defasadas. Agora a resolução de
  // membro conhece os dois tipos e a dupla acompanha o circuito.
  const stale = results.filter((r) => r.teamPoints !== r.teamIfRecomputedNow);
  console.log(`   [registro] seeds com dupla defasada após o circuito: ${stale.length}/${results.length}`);
  for (const r of stale) {
    console.log(`     ${r.label}: gravado ${r.teamPoints} | recalculado agora seria ${r.teamIfRecomputedNow}`);
  }
  assert.equal(stale.length, 0, `${stale.length}/${results.length} seeds ainda defasadas`);
});

check('Critério 8-9: contrato e química presentes em toda seed', () => {
  for (const r of results) {
    assert.ok(r.contractEnd, `${r.label}: sem fim de contrato`);
    assert.equal(r.salary, 500, `${r.label}: salário=${r.salary}`);
    assert.ok(r.chemistry > 0, `${r.label}: química=${r.chemistry}`);
  }
});

check('Critério 5: potencial coerente (>= OVR) em toda seed', () => {
  for (const r of results) {
    assert.ok(r.potential >= r.ovr, `${r.label}: potencial ${r.potential} < OVR ${r.ovr}`);
  }
});

check('held-out reproduz a calibração (mesmas invariantes)', () => {
  const invariant = (r) => [r.createdOne, r.ovr === r.botOvr ? 1 : 0, r.teamPoints === r.teamExpected ? 1 : 0,
    r.rematerializedSameId ? 1 : 0, r.results >= 1 ? 1 : 0].join(':');
  const calibSet = new Set(calib.map(invariant));
  for (const r of held) {
    assert.ok(calibSet.has(invariant(r)), `${r.label}: invariantes ${invariant(r)} fora do observado`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-partner-athlete-idempotency-v512: PASS');
