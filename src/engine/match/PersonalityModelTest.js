import { createBehaviorProfile, behaviorProfileEquals, AXIS_NAMES } from './PersonalityModel.js';
import { createTeams } from './playerModel.js';

const aggressive = {
  id: 'aggressive-athlete',
  name: 'Atacante',
  personality: 'competitivo',
  play_style: 'Agressivo',
  discipline: 55,
  creativity: 68,
  courage: 82,
};

const defensive = {
  id: 'defensive-athlete',
  name: 'Defensor',
  personality: 'calmo',
  play_style: 'Defensivo',
  discipline: 84,
  creativity: 45,
  courage: 54,
};

export async function runPersonalityModelTest() {
  const aggressiveProfile = createBehaviorProfile(aggressive);
  const aggressiveAgain = createBehaviorProfile(aggressive);
  const defensiveProfile = createBehaviorProfile(defensive);
  const teams = createTeams([aggressive, defensive], [defensive, aggressive]);
  const allPlayers = Object.values(teams).flat();

  const deterministic = behaviorProfileEquals(aggressive, aggressiveAgain);
  const axesComplete = AXIS_NAMES.every((axis) => (
    Number.isFinite(aggressiveProfile.axes[axis])
    && aggressiveProfile.axes[axis] >= 0
    && aggressiveProfile.axes[axis] <= 100
  ));
  const distinctProfiles = (
    aggressiveProfile.tendencies.attack > defensiveProfile.tendencies.attack
    && defensiveProfile.tendencies.defense > aggressiveProfile.tendencies.defense
  );
  const integrated = allPlayers.every((player) => (
    player.behavior?.version === '0.4.0'
    && player.behavior?.archetype?.id
    && player.personality?.aggression !== undefined
  ));
  const savesUntouched = !('save_schema_version' in aggressiveProfile);

  return {
    success: deterministic && axesComplete && distinctProfiles && integrated && savesUntouched,
    version: aggressiveProfile.version,
    deterministic,
    axesComplete,
    distinctProfiles,
    integrated,
    savesUntouched,
    aggressiveArchetype: aggressiveProfile.archetype,
    defensiveArchetype: defensiveProfile.archetype,
    aggressiveTendencies: aggressiveProfile.tendencies,
    defensiveTendencies: defensiveProfile.tendencies,
  };
}

export function setupPersonalityModelTest() {
  if (typeof window === 'undefined') return;
  window.PadelPersonalityModelTest = { run: runPersonalityModelTest };
}
