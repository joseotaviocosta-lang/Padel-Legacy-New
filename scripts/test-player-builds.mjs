import assert from 'node:assert/strict';
import { buildInitialProfile, calculateInitialProfileBudget, COURT_SIDE_OPTIONS, DOMINANT_HANDS, INITIAL_PROFILE_BUDGET, PLAY_STYLE_OPTIONS, validatePlayerBuildProfile } from '../src/lib/initialCareerProfiles.js';
import { generateFictionalAthletes } from '../src/players/athleteGenerator.js';
import { evaluatePartnerCompatibility } from '../src/players/teamCompatibility.js';
import { DecisionEngine } from '../src/engine/match/DecisionEngine.js';
import { normalizePlayer } from '../src/engine/match/playerModel.js';
import { createBalanceAthlete, simulateBalancedMatch } from '../src/engine/match/BalanceSimulator.js';
import { migrateCareer } from '../src/careers/CareerMigration.js';

const allBuilds = DOMINANT_HANDS.flatMap(hand => COURT_SIDE_OPTIONS.flatMap(side => PLAY_STYLE_OPTIONS.map(style => buildInitialProfile({ handedness: hand.id, preferredSide: side.id, playStyle: style.id }))));
assert.equal(allBuilds.length, 42);
assert.equal(new Set(allBuilds.map(build => build.id)).size, 42);
for (const build of allBuilds) {
  assert(validatePlayerBuildProfile(build).valid, `${build.id}: ${validatePlayerBuildProfile(build).errors.join(', ')}`);
  assert.equal(calculateInitialProfileBudget(build), INITIAL_PROFILE_BUDGET);
  assert(build.strengths.length >= 3 && build.weaknesses.length >= 1);
}

for (const handedness of ['right', 'left']) for (const preferredSide of ['direita', 'esquerda', 'versatil']) for (const playStyle of PLAY_STYLE_OPTIONS.map(style => style.id)) {
  assert.doesNotThrow(() => buildInitialProfile({ handedness, preferredSide, playStyle }), `${handedness}/${preferredSide}/${playStyle} must be allowed`);
}
const leftHandRightFinisher = buildInitialProfile({ handedness: 'left', preferredSide: 'direita', playStyle: 'finalizador' });
assert.equal(leftHandRightFinisher.archetype_label, 'Finalizador canhoto de direita');
assert.equal(calculateInitialProfileBudget(leftHandRightFinisher), INITIAL_PROFILE_BUDGET);
assert(leftHandRightFinisher.attributes.smash > leftHandRightFinisher.attributes.defense);

const bots = generateFictionalAthletes({ count: 1000, seed: 'player-build-diversity' });
assert(new Set(bots.map(bot => bot.play_style)).size === PLAY_STYLE_OPTIONS.length);
assert(bots.some(bot => bot.handedness === 'left' && bot.preferred_side === 'right' && ['ofensivo', 'finalizador'].includes(bot.play_style)));
assert(bots.some(bot => bot.preferred_side === 'left' && bot.play_style === 'defensivo'));
assert(bots.every(bot => bot.tactical_role && bot.archetype_id));

const complementary = evaluatePartnerCompatibility(
  { ...leftHandRightFinisher, overall_rating: 55 },
  { name: 'Controlador de esquerda', preferred_side: 'left', handedness: 'right', tactical_role: 'controlador', play_style: 'controle', overall_rating: 55 },
);
const duplicate = evaluatePartnerCompatibility(
  { ...leftHandRightFinisher, overall_rating: 55 },
  { name: 'Outro finalizador', preferred_side: 'left', handedness: 'right', tactical_role: 'finalizador', play_style: 'finalizador', overall_rating: 55 },
);
assert(complementary.total > duplicate.total);
assert(duplicate.warnings.some(message => message.includes('finalizadores')));

const engine = new DecisionEngine();
const raw = build => ({ id: build.id, sport_name: build.archetype_label, ...build.attributes, ...build, court_side: build.preferred_side, energy: 100 });
const offensivePlayer = normalizePlayer(raw(buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'ofensivo' })), 'A', 1);
const controlPlayer = normalizePlayer(raw(buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'controle' })), 'A', 1);
const defensivePlayer = normalizePlayer(raw(buildInitialProfile({ handedness: 'right', preferredSide: 'esquerda', playStyle: 'defensivo' })), 'A', 0);
offensivePlayer.position.zone = 'net'; controlPlayer.position.zone = 'net'; defensivePlayer.position.zone = 'back';
const weights = player => Object.fromEntries(engine.evaluate({ player, pressure: 45, tactic: { id: 'equilibrado' } }).map(row => [row.value, row.weight]));
assert(weights(offensivePlayer).smash > weights(controlPlayer).smash, 'offensive style must attempt more smashes');
assert(weights(controlPlayer).bandeja > weights(offensivePlayer).bandeja, 'controller must prioritize construction');
assert(weights(defensivePlayer).lob > weights(controlPlayer).lob, 'defender must prioritize safe lobs');

const legacy = {
  save_schema_version: 10, player: { id: 'legacy-player', sport_name: 'Legado', court_side: 'direita', play_style: 'agressivo', serve: 42, smash: 57, defense: 31 },
  metadata: {}, entities: {}, tutorial: { version: 3, status: 'in_progress', completedStepIds: ['career-created'], completedSteps: ['career-created'] },
};
const migrated = migrateCareer(legacy).data;
assert.equal(migrated.player.play_style, 'ofensivo');
assert.equal(migrated.player.handedness, 'right');
assert.equal(migrated.player.smash, 57, 'migration must preserve developed attributes');
assert.deepEqual(migrateCareer(migrated).data, migrated, 'migration must be idempotent');

function balanceAthlete(build, id) { return { ...createBalanceAthlete(id, build.archetype_label, 11, build.play_style, build.preferred_side === 'esquerda' ? 'left' : 'right'), ...build.attributes, ...build, court_side: build.preferred_side }; }
const scenarios = [
  ['direita-controle', { handedness: 'right', preferredSide: 'direita', playStyle: 'controle' }],
  ['direita-defensivo', { handedness: 'right', preferredSide: 'direita', playStyle: 'defensivo' }],
  ['direita-ofensivo-destro', { handedness: 'right', preferredSide: 'direita', playStyle: 'ofensivo' }],
  ['direita-ofensivo-canhoto', { handedness: 'left', preferredSide: 'direita', playStyle: 'ofensivo' }],
  ['esquerda-finalizador', { handedness: 'right', preferredSide: 'esquerda', playStyle: 'finalizador' }],
  ['esquerda-controle', { handedness: 'right', preferredSide: 'esquerda', playStyle: 'controle' }],
  ['esquerda-defensivo', { handedness: 'right', preferredSide: 'esquerda', playStyle: 'defensivo' }],
  ['versatil-equilibrado', { handedness: 'right', preferredSide: 'versatil', playStyle: 'equilibrado' }],
];
const baseline = buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'equilibrado' });
const reports = [];
for (const [id, options] of scenarios) {
  const build = buildInitialProfile(options);
  const side = build.preferred_side === 'esquerda' ? 'left' : 'right';
  const partnerSide = side === 'right' ? 'left' : 'right';
  const candidateTeam = [balanceAthlete(build, `${id}:player`), createBalanceAthlete(`${id}:partner`, 'Parceiro padrão', 11, 'Equilibrado', partnerSide)];
  const baselineTeam = [balanceAthlete(baseline, `${id}:baseline`), createBalanceAthlete(`${id}:opponent`, 'Oponente padrão', 11, 'Equilibrado', 'left')];
  let wins = 0; let winners = 0; let errors = 0; const matches = 160;
  for (let index = 0; index < matches; index += 1) {
    const swap = index % 2 === 1;
    const state = simulateBalancedMatch({ teamA: swap ? baselineTeam : candidateTeam, teamB: swap ? candidateTeam : baselineTeam, seed: `independent:${id}:${index * 7919}` });
    const candidateWon = swap ? state.winner === 'B' : state.winner === 'A';
    if (candidateWon) wins += 1;
    winners += Object.values(state.stats.players).reduce((sum, row) => sum + Number(row.winners || 0), 0);
    errors += Object.values(state.stats.players).reduce((sum, row) => sum + Number(row.unforcedErrors || 0), 0);
  }
  const decisionPlayer = normalizePlayer(raw(build), 'A', side === 'right' ? 1 : 0);
  decisionPlayer.position.zone = 'net'; const netWeights = weights(decisionPlayer);
  decisionPlayer.position.zone = 'back'; const backWeights = weights(decisionPlayer);
  reports.push({ id, winRate: Math.round(wins / matches * 1000) / 10, attackIntent: Math.round((netWeights.smash + netWeights.volley) * 10) / 10, constructionIntent: Math.round((backWeights.lob + backWeights.chiquita + backWeights.bandeja) * 10) / 10, safeIntent: Math.round((backWeights.lob + backWeights.backhand) * 10) / 10, winners: Math.round(winners / matches * 10) / 10, errors: Math.round(errors / matches * 10) / 10 });
}
assert(reports.every(report => report.winRate >= 20 && report.winRate <= 80), JSON.stringify(reports));
const byId = Object.fromEntries(reports.map(report => [report.id, report]));
assert(byId['direita-ofensivo-destro'].attackIntent > byId['direita-controle'].attackIntent);
assert(byId['direita-controle'].constructionIntent > byId['direita-ofensivo-destro'].constructionIntent);
assert(byId['direita-defensivo'].safeIntent > byId['direita-ofensivo-destro'].safeIntent);
console.log(JSON.stringify({ success: true, builds: allBuilds.length, budget: INITIAL_PROFILE_BUDGET, complementaryCompatibility: complementary.total, duplicateRoleCompatibility: duplicate.total, simulations: reports }, null, 2));
