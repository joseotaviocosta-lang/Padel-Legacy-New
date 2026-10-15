// Playthrough 5.13, Partes R/S/T — Galán/Chingotto (#2) ficaram fora de um
// SEGUNDO Masters no playtest.
//
// O briefing é explícito: não assumir bug. Na ocorrência anterior (5.9) eles
// escolheram Crown, o que era legítimo. Aqui a pergunta é refeita sobre a
// temporada simulada: em CADA semana com Masters, o que a dupla de elite
// tinha disponível, que score cada opção teve, e o que escolheu.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const ELITE_TIERS = ['Masters', 'Elite', 'Crown'];
const live = {};

await runHeadlessWorldSimulation({
  years: 1, label: 'v513-masters', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    const { chooseTournament, evaluateTournamentChoice } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentSelectionAI.js');
    const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000);
    const galan = athletes.find((a) => /gal[aá]n/i.test(a.name || ''));
    const chingotto = athletes.find((a) => /chingotto/i.test(a.name || ''));
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);

    live.pairFound = Boolean(galan && chingotto);
    if (!live.pairFound) return;

    const rank = Math.min(
      athletes.findIndex((a) => a.id === galan.id) + 1,
      athletes.findIndex((a) => a.id === chingotto.id) + 1,
    );
    live.rank = rank;
    live.points = Number(galan.world_ranking_points) || 0;

    // Semanas em que EXISTE um Masters.
    const byStart = new Map();
    for (const t of tournaments) {
      if (!t.start_date) continue;
      if (!byStart.has(t.start_date)) byStart.set(t.start_date, []);
      byStart.get(t.start_date).push(t);
    }
    const mastersWeeks = [...byStart.entries()]
      .filter(([, list]) => list.some((t) => t.tier === 'Masters'))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));

    const representative = {
      id: galan.id, name: galan.name,
      overall_rating: galan.overall_rating, rank, ranking_position: rank,
      careerStrategy: 'balanced', currentRegion: 'global',
    };

    live.weeks = [];
    for (const [start, list] of mastersWeeks) {
      const decision = chooseTournament(list, representative, { strategy: 'balanced', currentRegion: 'global', aiFieldContext: true });
      const scoreById = new Map((decision?.options || []).map((o) => [o.tournament?.id, o.score]));
      const options = list.map((t) => {
        const entry = evaluateTournamentEntry(t, { rank, teamRank: rank });
        const choice = evaluateTournamentChoice(t, { ...representative, teamRank: rank }, { aiFieldContext: true });
        const score = scoreById.get(t.id);
        return {
          tier: t.tier, name: t.name,
          eligible: Boolean(entry.eligible),
          reason: entry.reason || null,
          score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
          prestige: choice.prestige ?? null,
        };
      });
      live.weeks.push({ start, chosen: decision?.tournament?.tier || null, chosenName: decision?.tournament?.name || null, options });
    }
  },
});

if (!live.pairFound) {
  console.log('Galán/Chingotto não presentes nesta seed — nada a auditar.');
  process.exit(0);
}

console.log(`Galán/Chingotto: rank individual #${live.rank}, ${live.points} pts de circuito`);
console.log(`semanas com Masters na temporada: ${live.weeks.length}\n`);
console.log('=== Parte R: cada semana com Masters ===');
for (const w of live.weeks) {
  const opts = w.options.map((o) => `${o.tier}${o.eligible ? '' : '(inelegível)'}=${o.score}`).join(' ');
  console.log(`  ${w.start}: ${opts}`);
  console.log(`      -> escolheu ${w.chosen || 'NENHUM'} (${w.chosenName || '-'})`);
}

const weeksWithEligibleMasters = live.weeks.filter((w) => w.options.some((o) => o.eligible && o.tier === 'Masters'));
const skippedMasters = weeksWithEligibleMasters.filter((w) => w.chosen !== 'Masters');
const skippedForHigher = skippedMasters.filter((w) => ELITE_TIERS.indexOf(w.chosen) > ELITE_TIERS.indexOf('Masters'));
const skippedForLower = skippedMasters.filter((w) => !ELITE_TIERS.includes(w.chosen));
const noChoice = live.weeks.filter((w) => !w.chosen);

console.log(`\nsemanas com Masters ELEGÍVEL: ${weeksWithEligibleMasters.length}`);
console.log(`  não escolheu Masters: ${skippedMasters.length}`);
console.log(`    por tier SUPERIOR (Elite/Crown): ${skippedForHigher.length}`);
console.log(`    por tier INFERIOR: ${skippedForLower.length}`);
console.log(`semanas sem escolher nada: ${noChoice.length}`);

check('Parte R: a amostra tem semanas com Masters elegível', () => {
  assert.ok(weeksWithEligibleMasters.length > 0, 'nenhuma semana com Masters elegível');
});

check('Parte S/30: a dupla NUNCA fica sem torneio numa semana com Masters', () => {
  assert.equal(noChoice.length, 0,
    `${noChoice.length} semanas sem escolha nenhuma: ${noChoice.map((w) => w.start).join(', ')}`);
});

check('Parte S/30: preterir o Masters só acontece por um tier SUPERIOR (legítimo)', () => {
  assert.equal(skippedForLower.length, 0,
    `${skippedForLower.length} semanas em que trocou Masters por tier inferior: ${skippedForLower.map((w) => `${w.start}->${w.chosen}`).join(', ')}`);
});

check('Parte S/28: quando preteriu o Masters, o escolhido tinha score MAIOR', () => {
  for (const w of skippedMasters) {
    const masters = w.options.find((o) => o.eligible && o.tier === 'Masters');
    const chosen = w.options.find((o) => o.tier === w.chosen);
    if (!masters || !chosen || masters.score === null || chosen.score === null) continue;
    assert.ok(chosen.score >= masters.score,
      `${w.start}: escolheu ${w.chosen} (${chosen.score}) com Masters valendo ${masters.score}`);
  }
  console.log(`   [registro] ${skippedForHigher.length} semanas preteriram Masters por Elite/Crown com score maior`);
});

check('Parte T/31: taxa de participação da elite é alta quando há elite elegível', () => {
  const weeksWithElite = live.weeks.filter((w) => w.options.some((o) => o.eligible && ELITE_TIERS.includes(o.tier)));
  const choseElite = weeksWithElite.filter((w) => ELITE_TIERS.includes(w.chosen));
  const rate = weeksWithElite.length ? (choseElite.length / weeksWithElite.length) * 100 : 0;
  console.log(`   [registro] eliteParticipationRate = ${choseElite.length}/${weeksWithElite.length} (${rate.toFixed(0)}%)`);
  assert.ok(rate >= 80, `taxa de ${rate.toFixed(0)}% — a elite está evitando eventos de elite`);
});

check('Parte R: toda opção inelegível tem um motivo declarado', () => {
  for (const w of live.weeks) {
    for (const o of w.options.filter((x) => !x.eligible)) {
      assert.ok(o.reason !== undefined, `${w.start} ${o.tier}: sem motivo de inelegibilidade`);
    }
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-elite-second-masters-choice-v513: PASS');
