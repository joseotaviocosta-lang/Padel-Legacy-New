import { getMedicalModifiers } from './MedicalCenterManager.js';
// Import relativo (não `@/...`): scripts/test-injury-balance-v21.mjs importa
// este módulo diretamente em Node puro, sem resolver o alias Vite.
import { getDifficultyModifier } from '../difficulty/difficultyConfig.js';
import { normalizeFatigue } from '../../game-core/physicalStats.js';
// Também relativo — mesmo motivo do comentário acima (Node puro, sem alias Vite).
import { fnv1aHash } from '../../lib/hashUtils.js';
const ROUND_LOAD = {
  qualifying: 12,
  first_round: 14,
  round_of_32: 15,
  round_of_16: 16,
  quarterfinal: 18,
  semifinal: 21,
  final: 24,
};

const SEVERITIES = [
  { key: 'leve', label: 'Leve', minDays: 2, maxDays: 4, weight: 72 },
  { key: 'moderada', label: 'Moderada', minDays: 5, maxDays: 9, weight: 24 },
  { key: 'grave', label: 'Grave', minDays: 10, maxDays: 20, weight: 4 },
];

const INJURY_TYPES = {
  leve: ['Sobrecarga muscular', 'Dor lombar', 'Inflamação no antebraço'],
  moderada: ['Inflamação no ombro', 'Entorse no tornozelo', 'Distensão na panturrilha'],
  grave: ['Ruptura muscular', 'Lesão ligamentar no joelho', 'Lesão grave no ombro'],
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function hash(text) {
  return fnv1aHash(String(text)) / 4294967295;
}
function roundKey(label = '') {
  const value = String(label).toLowerCase();
  if (value.includes('qual')) return 'qualifying';
  if (value.includes('final') && !value.includes('semi')) return 'final';
  if (value.includes('semi')) return 'semifinal';
  if (value.includes('quart')) return 'quarterfinal';
  if (value.includes('oitav')) return 'round_of_16';
  if (value.includes('32')) return 'round_of_32';
  return 'first_round';
}
export function getTravelLoad(profile, tournament) {
  const previous = profile?.current_region || profile?.last_tournament_region || null;
  const next = tournament?.region || tournament?.continent || tournament?.country || null;
  if (!previous || !next || previous === next) return { energy: 0, fatigue: 0, label: 'Sem viagem longa' };
  const intercontinental = String(previous).toLowerCase() !== String(next).toLowerCase();
  return intercontinental ? { energy: 8, fatigue: 10, label: 'Viagem internacional' } : { energy: 4, fatigue: 5, label: 'Deslocamento regional' };
}
export function calculateTournamentMatchLoad({ profile, tournament, roundLabel, matchesThisWeek = 0 }) {
  const key = roundKey(roundLabel);
  const base = ROUND_LOAD[key] || 14;
  const consecutive = Math.max(0, Number(matchesThisWeek) || 0) * 2.5;
  const age = Number(profile?.age) || 22;
  const ageLoad = Math.max(0, age - 30) * 0.25;
  const conditionProtection = Math.max(0, (Number(profile?.condition) || 70) - 60) * 0.06;
  const energyCost = Math.round(clamp(base + consecutive + ageLoad - conditionProtection, 8, 32));
  return { key, energyCost, fatigueGain: Math.round(energyCost * 0.9 * getDifficultyModifier(profile, 'fatigueGainMultiplier')), consecutiveLoad: consecutive };
}
export function calculateInjuryRisk(profile, load, won = false) {
  const energyAfter = clamp(profile?.energy, 0, 100);
  const fatigue = clamp(profile?.fatigue ?? (100 - energyAfter), 0, 100);
  const condition = clamp(profile?.condition ?? 70, 0, 100);
  const base = 0.0015;
  const lowEnergy = energyAfter >= 35 ? 0 : (35 - energyAfter) * 0.00032;
  const highFatigue = fatigue <= 55 ? 0 : fatigue <= 75
    ? (fatigue - 55) * 0.00022
    : 0.0044 + (fatigue - 75) * 0.00055;
  const loadRisk = Math.max(0, Number(load?.energyCost || 0) - 18) * 0.00025;
  const conditionProtection = Math.max(0, condition - 65) * 0.00008;
  const extraRound = won ? 0.0002 : 0;
  const medical = getMedicalModifiers(profile);
  const relapse = Number(profile?.early_return_relapse_risk || 0);
  return clamp((base + lowEnergy + highFatigue + loadRisk + extraRound - conditionProtection) * (1 - medical.injuryReduction) * getDifficultyModifier(profile, 'injuryRiskMultiplier') + relapse, 0.0005, 0.08);
}
function chooseSeverity(seed, risk) {
  const adjusted = risk > 0.05 ? [58, 34, 8] : risk > 0.025 ? [66, 29, 5] : SEVERITIES.map(x => x.weight);
  const roll = hash(`${seed}:severity`) * adjusted.reduce((a,b)=>a+b,0);
  let acc=0;
  return SEVERITIES.find((item,i)=>{ acc+=adjusted[i]; return roll<=acc; }) || SEVERITIES[0];
}
export function rollTournamentInjury({ profile, tournament, roundLabel, load, won, date }) {
  const risk = calculateInjuryRisk(profile, load, won);
  const seed = `${profile?.id}:${tournament?.id}:${roundLabel}:${date}:${profile?.matches_played || 0}`;
  if (hash(`${seed}:injury`) >= risk) return { injured: false, risk };
  const severity = chooseSeverity(seed, risk);
  const days = Math.round(severity.minDays + (severity.maxDays - severity.minDays) * hash(`${seed}:days`));
  const types = INJURY_TYPES[severity.key];
  const type = types[Math.floor(hash(`${seed}:type`) * types.length) % types.length];
  return { injured: true, risk, type, severity: severity.key, severityLabel: severity.label, days };
}
export function buildPhysicalPatch({ profile, tournament, roundLabel, won, matchesThisWeek = 0, date }) {
  const load = calculateTournamentMatchLoad({ profile, tournament, roundLabel, matchesThisWeek });
  const travel = matchesThisWeek === 0 ? getTravelLoad(profile, tournament) : { energy: 0, fatigue: 0, label: 'Viagem já contabilizada' };
  const energy = clamp((Number(profile?.energy) || 100) - load.energyCost - travel.energy, 0, 100);
  const fatigue = normalizeFatigue((Number(profile?.fatigue) || 0) + load.fatigueGain + travel.fatigue);
  const injury = rollTournamentInjury({ profile: { ...profile, energy, fatigue }, tournament, roundLabel, load, won, date });
  const history = [...(Array.isArray(profile?.physical_history) ? profile.physical_history : []), {
    date, tournament_id: tournament?.id, tournament: tournament?.name, round: roundLabel,
    energy_before: Number(profile?.energy) || 100, energy_after: energy, fatigue_after: fatigue,
    injury: injury.injured ? injury.type : null,
  }].slice(-50);
  const patch = { energy, fatigue, matches_this_week: matchesThisWeek + 1, last_tournament_region: tournament?.region || tournament?.continent || tournament?.country || null, physical_history: history };
  if (injury.injured) Object.assign(patch, {
    injury_status: 'lesionado', injury_type: injury.type, injury_severity: injury.severity,
    injury_days_remaining: injury.days, injured_until: null, energy: Math.min(energy, 25),
  });
  return { patch, load, travel, injury };
}
export function getCoachPhysicalRecommendation(profile, tournament, roundLabel = 'Primeira rodada') {
  const load = calculateTournamentMatchLoad({ profile, tournament, roundLabel, matchesThisWeek: profile?.matches_this_week || 0 });
  const travel = getTravelLoad(profile, tournament);
  const projectedEnergy = clamp((Number(profile?.energy) || 100) - load.energyCost - travel.energy, 0, 100);
  const projectedFatigue = normalizeFatigue((Number(profile?.fatigue) || 0) + load.fatigueGain + travel.fatigue);
  const risk = calculateInjuryRisk({ ...profile, energy: projectedEnergy, fatigue: projectedFatigue }, load, true);
  let level='Apto', advice='Condição adequada para competir.';
  if (profile?.injury_status === 'lesionado') { level='Indisponível'; advice='O departamento médico não recomenda competir lesionado.'; }
  else if (projectedEnergy < 20 || risk >= 0.18) { level='Risco extremo'; advice='Recomendação: abandonar ou descansar antes da próxima rodada.'; }
  else if (projectedEnergy < 35 || risk >= 0.10) { level='Risco alto'; advice='A sequência pode comprometer as próximas semanas.'; }
  else if (projectedEnergy < 50 || risk >= 0.05) { level='Atenção'; advice='Competir é possível, mas a recuperação será importante.'; }
  return { level, advice, projectedEnergy, projectedFatigue, injuryRisk: risk, load, travel, canPlay: level !== 'Indisponível' };
}
export function calculateDailyRecovery(profile, { restDay = true } = {}) {
  const medical = getMedicalModifiers(profile);
  const multiplier = (1 + medical.recoveryBonus) * getDifficultyModifier(profile, 'recoveryMultiplier');
  if (profile?.injury_status === 'lesionado') return { energyGain: Math.round(8 * multiplier), fatigueReduction: Math.round(10 * multiplier), injuryDayReduction: medical.recoveryBonus >= 0.3 ? 2 : 1 };
  const condition = Number(profile?.condition) || 70;
  const gain = restDay ? 10 + Math.floor(condition / 25) : 5;
  return { energyGain: Math.round(gain * multiplier), fatigueReduction: Math.round((restDay ? 12 : 6) * multiplier), injuryDayReduction: 0 };
}
