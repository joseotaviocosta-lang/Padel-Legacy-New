export const MATCH_TACTICS = Object.freeze([
  Object.freeze({ id: 'equilibrado', label: 'Equilibrado', icon: 'Scale', desc: 'Risco moderado, consumo normal e decisões variadas.', attackWeight: 1, safeWeight: 1, powerWeight: 1, tacticalWeight: 1, riskModifier: 1, energyModifier: 1 }),
  Object.freeze({ id: 'agressivo', label: 'Agressivo', icon: 'Flame', desc: 'Busca rede e winners, com mais erros e desgaste.', attackWeight: 1.28, safeWeight: .88, powerWeight: 1.08, tacticalWeight: .94, riskModifier: 1.14, energyModifier: 1.08 }),
  Object.freeze({ id: 'defensivo', label: 'Defensivo', icon: 'Shield', desc: 'Prioriza lobs e segurança, preservando energia e cedendo iniciativa.', attackWeight: .8, safeWeight: 1.32, powerWeight: .78, tacticalWeight: 1.08, riskModifier: .82, energyModifier: .9 }),
  Object.freeze({ id: 'potencia', label: 'Potência', icon: 'Hammer', desc: 'Aumenta smashes e golpes fortes; exige potência e mais energia.', attackWeight: 1.12, safeWeight: .82, powerWeight: 1.42, tacticalWeight: .86, riskModifier: 1.2, energyModifier: 1.18 }),
  Object.freeze({ id: 'tatico', label: 'Tático', icon: 'Brain', desc: 'Explora espaços e fraquezas com seleção variada e disciplinada.', attackWeight: .94, safeWeight: 1.08, powerWeight: .9, tacticalWeight: 1.38, riskModifier: .92, energyModifier: .97 }),
]);

export const DEFAULT_TACTIC_ID = 'equilibrado';
export function getMatchTactic(value) {
  const id = typeof value === 'string' ? value : value?.id;
  return MATCH_TACTICS.find(tactic => tactic.id === id) || MATCH_TACTICS[0];
}

export function chooseBotTactic(state, teamId = 'B') {
  const ownSets = teamId === 'A' ? state.setsA : state.setsB;
  const otherSets = teamId === 'A' ? state.setsB : state.setsA;
  const ownGames = teamId === 'A' ? state.gamesA : state.gamesB;
  const otherGames = teamId === 'A' ? state.gamesB : state.gamesA;
  const energy = state.teams[teamId].reduce((sum, player) => sum + player.energy, 0) / state.teams[teamId].length;
  if (energy < 38) return getMatchTactic('defensivo');
  if (ownSets < otherSets || ownGames + 2 < otherGames) return getMatchTactic('agressivo');
  if (ownSets > otherSets && ownGames >= otherGames) return getMatchTactic('defensivo');
  const strength = state.teams[teamId].reduce((sum, player) => sum + Number(player.attributes?.smash || 0), 0) / state.teams[teamId].length;
  if (strength >= 67) return getMatchTactic('potencia');
  return getMatchTactic('tatico');
}
