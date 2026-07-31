import { DecisionEngine } from './DecisionEngine.js';
import { RallyMemory } from './RallyMemory.js';
import { createDecisionContext } from './DecisionContext.js';
import { createTeams } from './playerModel.js';
import { createRandom } from './random.js';

const attacker = {
  id: 'context-attacker',
  name: 'Atacante Contextual',
  play_style: 'Agressivo',
  forehand: 78,
  smash: 88,
  volley: 80,
  strategy: 72,
  courage: 86,
  discipline: 55,
  creativity: 75,
  emotional_control: 76,
};

const defender = {
  id: 'context-defender',
  name: 'Defensor Contextual',
  play_style: 'Defensivo',
  defense: 88,
  bandeja: 82,
  backhand: 80,
  strategy: 84,
  discipline: 88,
  courage: 56,
  emotional_control: 88,
};

function weightOf(candidates, shot) {
  return candidates.find((candidate) => candidate.value === shot)?.weight || 0;
}

export async function runContextualDecisionTest() {
  const teams = createTeams([attacker, defender], [defender, attacker]);
  const engine = new DecisionEngine();
  const memory = new RallyMemory();
  const player = teams.A[0];
  player.position.zone = 'net';
  teams.B.forEach((opponent) => { opponent.position.zone = 'net'; });

  const safeContext = createDecisionContext({
    player,
    teams,
    activeTeam: 'A',
    pressure: 72,
    match: { pointsA: 2, pointsB: 3, breakPoint: true, inTiebreak: false },
    memory,
  });
  const freeContext = createDecisionContext({
    player,
    teams,
    activeTeam: 'A',
    pressure: 40,
    match: { pointsA: 3, pointsB: 0, breakPoint: false, inTiebreak: false },
    memory,
  });

  const safeCandidates = engine.evaluate({ player, pressure: 72, tactic: { id: 'equilibrado' }, context: safeContext });
  const freeCandidates = engine.evaluate({ player, pressure: 40, tactic: { id: 'agressivo' }, context: freeContext });
  const contextualRisk = weightOf(freeCandidates, 'smash') > weightOf(safeCandidates, 'smash');

  memory.record({ team: 'B', shot: 'volley' });
  memory.record({ team: 'B', shot: 'smash' });
  memory.record({ team: 'B', shot: 'volley' });
  const netContext = createDecisionContext({
    player,
    teams,
    activeTeam: 'A',
    pressure: 55,
    match: { pointsA: 1, pointsB: 1 },
    memory,
  });
  const netCandidates = engine.evaluate({ player, pressure: 55, tactic: { id: 'tatico' }, context: netContext });
  const adaptsToNet = weightOf(netCandidates, 'lob') > weightOf(freeCandidates, 'lob');

  const randomA = createRandom('contextual-test');
  const randomB = createRandom('contextual-test');
  const decisionA = engine.chooseDetailed({ player, pressure: 55, tactic: { id: 'tatico' }, random: randomA, context: netContext });
  const decisionB = engine.chooseDetailed({ player, pressure: 55, tactic: { id: 'tatico' }, random: randomB, context: netContext });
  const deterministic = JSON.stringify(decisionA) === JSON.stringify(decisionB);
  const explainable = Array.isArray(decisionA.reasons) && Array.isArray(decisionA.candidates) && decisionA.candidates.length === 7;

  return {
    success: contextualRisk && adaptsToNet && deterministic && explainable,
    version: '0.4.0-alpha.2',
    contextualRisk,
    adaptsToNet,
    deterministic,
    explainable,
    selectedShot: decisionA.shot,
    reasons: decisionA.reasons,
    safeSmashWeight: Number(weightOf(safeCandidates, 'smash').toFixed(2)),
    freeSmashWeight: Number(weightOf(freeCandidates, 'smash').toFixed(2)),
    baseLobWeight: Number(weightOf(freeCandidates, 'lob').toFixed(2)),
    adaptiveLobWeight: Number(weightOf(netCandidates, 'lob').toFixed(2)),
  };
}

export function setupContextualDecisionTest() {
  if (typeof window === 'undefined') return;
  window.PadelContextualDecisionTest = { run: runContextualDecisionTest };
}
