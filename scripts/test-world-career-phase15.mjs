import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  deriveAthleteCareerState,
  evolveAthleteCareerMonth,
  seededChance,
  seededHash,
  seededInteger,
} from '../src/game-core/livingCircuitRules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.find((arg) => arg.startsWith('--suite='))?.split('=')[1] || 'all';
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * ratio))] || 0;
const isoMonth = (startYear, offset) => `${startYear + Math.floor(offset / 12)}-${String((offset % 12) + 1).padStart(2, '0')}-01`;

function athleteFixture(world, index, year = 2026) {
  const age = 17 + (seededHash(`${world}:${index}:age`) % 22);
  const overall = 52 + (seededHash(`${world}:${index}:ovr`) % 39);
  return {
    id: `w${world}-a${index}`, name: `Atleta ${world}-${index}`, age,
    birth_date: `${year - age}-${String(1 + index % 12).padStart(2, '0')}-15`,
    peak_age: 26 + (seededHash(`${world}:${index}:peak`) % 7),
    overall, overall_rating: overall, potential: Math.min(96, overall + 3 + (seededHash(`${world}:${index}:pot`) % 15)),
    ranking_position: index + 1, best_ranking_position: index + 1,
    attributes: { serve: overall, forehand: overall, backhand: overall, volley: overall, smash: overall, speed: overall },
    recent_results: [], form: 60, growth_rate: 0.7 + (index % 9) / 10, decline_rate: 0.6 + (index % 7) / 10,
  };
}

function simulateWorld(worldIndex, seasons = 10, population = 180) {
  let athletes = Array.from({ length: population }, (_, index) => athleteFixture(worldIndex, index));
  let retired = 0;
  let generated = 0;
  const topTenNames = new Set();
  const numberOnes = new Set();
  const peakAges = [];
  const retirementAges = [];
  let stories = 0;
  for (let month = 0; month < seasons * 12; month += 1) {
    const date = isoMonth(2026, month);
    const yearBoundary = month > 0 && month % 12 === 0;
    athletes = athletes.map((athlete) => {
      if (athlete.retired) return athlete;
      const evolution = evolveAthleteCareerMonth(athlete, date, { isYearBoundary: yearBoundary });
      const next = { ...athlete, ...evolution.patch };
      if (evolution.state.stage === 'prime' && !next.peak_recorded) { next.peak_recorded = true; peakAges.push(evolution.state.age); }
      if (yearBoundary && evolution.state.stage === 'veteran' && seededChance(`${next.id}:${date}:retire`, Math.min(55, 9 + Math.max(0, evolution.state.age - 35) * 7))) {
        next.retired = true; next.career_status = 'aposentado'; retired += 1; retirementAges.push(evolution.state.age); stories += 1;
      }
      return next;
    });
    if (generated < retired && seededChance(`${worldIndex}:${date}:replacement`, 90)) {
      athletes.push(athleteFixture(`${worldIndex}g${month}`, 0, Number(date.slice(0, 4))));
      generated += 1;
    }
    if (yearBoundary) {
      const active = athletes.filter((athlete) => !athlete.retired);
      const ranked = active.sort((a, b) => (Number(b.overall_rating) + Number(b.form) / 12 + (seededHash(`${date}:${b.id}`) % 30) / 10) - (Number(a.overall_rating) + Number(a.form) / 12 + (seededHash(`${date}:${a.id}`) % 30) / 10));
      ranked.forEach((athlete, index) => { athlete.ranking_position = index + 1; athlete.best_ranking_position = Math.min(athlete.best_ranking_position || 9999, index + 1); });
      ranked.slice(0, 10).forEach((athlete) => topTenNames.add(athlete.id));
      if (ranked[0]) numberOnes.add(ranked[0].id);
      stories += Math.min(6, ranked.filter((athlete) => athlete.ranking_position <= 100 && (athlete.best_ranking_position || 9999) === athlete.ranking_position).length);
    }
  }
  const active = athletes.filter((athlete) => !athlete.retired).sort((a, b) => a.ranking_position - b.ranking_position);
  return {
    initial: population, retired, generated, final: active.length,
    averageTop100Age: average(active.slice(0, 100).map((athlete) => deriveAthleteCareerState(athlete, `${2025 + seasons}-12-31`).age)),
    averageTop10Age: average(active.slice(0, 10).map((athlete) => deriveAthleteCareerState(athlete, `${2025 + seasons}-12-31`).age)),
    numberOneAge: active[0] ? deriveAthleteCareerState(active[0], `${2025 + seasons}-12-31`).age : 0,
    distinctTop10: topTenNames.size, distinctNumberOnes: numberOnes.size,
    averagePeakAge: average(peakAges), averageRetirementAge: average(retirementAges), storiesPerSeason: stories / seasons,
  };
}

function simulatePlayerPartnership(careerIndex, seasons = 3) {
  let paired = true;
  let chemistry = 45 + (seededHash(`${careerIndex}:chem`) % 44);
  let contractMonths = 2;
  let partnershipMonths = 0;
  let freeMonths = 0;
  let renewals = 0;
  let endings = 0;
  let partnerDepartures = 0;
  let proposals = 0;
  let pairedProposals = 0;
  const durations = [];
  for (let month = 0; month < seasons * 12; month += 1) {
    if (seededChance(`${careerIndex}:${month}:offer`, paired ? 9 : 22)) { proposals += 1; if (paired) pairedProposals += 1; }
    if (!paired) {
      freeMonths += 1;
      if (seededChance(`${careerIndex}:${month}:find`, 58)) { paired = true; chemistry = 45 + (seededHash(`${careerIndex}:${month}:newchem`) % 44); contractMonths = 4 + (seededHash(`${careerIndex}:${month}:duration`) % 9); partnershipMonths = 0; }
      continue;
    }
    partnershipMonths += 1;
    contractMonths -= 1;
    if (contractMonths <= 0) {
      const stable = chemistry >= 65;
      if (seededChance(`${careerIndex}:${month}:renew`, stable ? 78 : 42)) { renewals += 1; contractMonths = 6 + (seededHash(`${careerIndex}:${month}:renewduration`) % 7); }
      else { paired = false; endings += 1; if (seededChance(`${careerIndex}:${month}:departure`, stable ? 6 : 28)) partnerDepartures += 1; durations.push(partnershipMonths); }
    }
  }
  if (paired && partnershipMonths) durations.push(partnershipMonths);
  return { renewals, endings, partnerDepartures, proposals, pairedProposals, freeMonths, durations };
}

const young = athleteFixture('fixture', 450); young.age = 18; young.birth_date = '2008-01-01'; young.overall_rating = 65; young.overall = 65; young.potential = 90; young.ranking_position = 450;
const veteran = { ...athleteFixture('fixture', 8), age: 35, birth_date: '1991-01-01', overall: 88, overall_rating: 88, potential: 90, ranking_position: 8 };
let progressed = young;
for (let month = 0; month < 60; month += 1) progressed = { ...progressed, ...evolveAthleteCareerMonth(progressed, isoMonth(2026, month), { isYearBoundary: month > 0 && month % 12 === 0 }).patch };
assert.ok(progressed.overall_rating > young.overall_rating, 'jovem promessa deve poder evoluir');
const veteranMonth = evolveAthleteCareerMonth(veteran, '2026-02-01');
assert.ok(veteranMonth.patch.overall_rating >= 87, 'veterano elite não pode cair instantaneamente');
assert.equal(evolveAthleteCareerMonth({ ...progressed, last_career_evolution_month: '2030-12' }, '2030-12-15').changed, false, 'mesmo mês é idempotente');

const shortRuns = Array.from({ length: 100 }, (_, index) => simulatePlayerPartnership(index, 3));
const allDurations = shortRuns.flatMap((run) => run.durations);
const short = {
  careers: 100, seasons: 3,
  averagePartners: average(shortRuns.map((run) => run.endings + 1)),
  averagePartnershipMonths: average(allDurations), renewals: shortRuns.reduce((sum, run) => sum + run.renewals, 0),
  endings: shortRuns.reduce((sum, run) => sum + run.endings, 0), partnerDepartures: shortRuns.reduce((sum, run) => sum + run.partnerDepartures, 0),
  proposalsPerSeason: shortRuns.reduce((sum, run) => sum + run.proposals, 0) / 300,
  pairedProposals: shortRuns.reduce((sum, run) => sum + run.pairedProposals, 0), averageFreeAgentDays: average(shortRuns.map((run) => run.freeMonths * 30)),
  underThreeMonthsPct: allDurations.filter((value) => value < 3).length / Math.max(1, allDurations.length) * 100,
  overOneSeasonPct: allDurations.filter((value) => value > 12).length / Math.max(1, allDurations.length) * 100,
};
assert.ok(short.proposalsPerSeason >= 0.5 && short.proposalsPerSeason <= 4.5);

const worldStarted = performance.now();
const fullSimulation = mode === 'all' || mode === 'progression';
const worldCount = fullSimulation ? 100 : 10;
const worlds = Array.from({ length: worldCount }, (_, index) => simulateWorld(index, 10));
const worldElapsed = performance.now() - worldStarted;
const long = {
  worlds: worldCount, seasons: 10,
  populationInitial: average(worlds.map((run) => run.initial)), populationRetired: average(worlds.map((run) => run.retired)), populationGenerated: average(worlds.map((run) => run.generated)), populationFinal: average(worlds.map((run) => run.final)),
  averageTop100Age: average(worlds.map((run) => run.averageTop100Age)), averageTop10Age: average(worlds.map((run) => run.averageTop10Age)), averageNumberOneAge: average(worlds.map((run) => run.numberOneAge)),
  distinctTop10: average(worlds.map((run) => run.distinctTop10)), distinctNumberOnes: average(worlds.map((run) => run.distinctNumberOnes)),
  averagePeakAge: average(worlds.map((run) => run.averagePeakAge)), averageRetirementAge: average(worlds.map((run) => run.averageRetirementAge)),
  worldStoriesPerSeason: average(worlds.map((run) => run.storiesPerSeason)), elapsedMs: worldElapsed,
};
assert.ok(long.averagePeakAge >= 24 && long.averagePeakAge <= 32);
assert.ok(long.averageRetirementAge >= 34 && long.averageRetirementAge <= 43);

const heavy = Array.from({ length: 1000 }, (_, index) => athleteFixture('perf', index));
const perfStarted = performance.now();
heavy.forEach((athlete) => evolveAthleteCareerMonth(athlete, '2027-01-01', { isYearBoundary: true }));
const performance1000AthletesMs = performance.now() - perfStarted;
assert.ok(performance1000AthletesMs < 250, `1000 atletas devem ficar abaixo de 250ms; real=${performance1000AthletesMs.toFixed(1)}ms`);

const report = { generatedAt: new Date().toISOString(), mode, fixtures: { youngOverallAfter5Years: progressed.overall_rating, veteranOneMonthOverall: veteranMonth.patch.overall_rating }, partnership100x3: short, world100x10: long, performance1000AthletesMs, partnershipDurationP90Months: percentile(allDurations, 0.9) };
if (fullSimulation) {
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports/fase15-simulation.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`WorldCareerPhase15 (${mode}): PASS`);
console.log(JSON.stringify(report, null, 2));
