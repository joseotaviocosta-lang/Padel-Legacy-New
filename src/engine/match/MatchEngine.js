import { createRandom } from './random.js';
import { createTeams } from './playerModel.js';
import { RallyEngine } from './RallyEngine.js';
import { MomentumEngine } from './MomentumEngine.js';
import { FatigueEngine } from './FatigueEngine.js';
import { CommentaryEngine } from './CommentaryEngine.js';
import { createStatistics } from './StatisticsEngine.js';

export const MATCH_TACTICS = [
  { id: 'equilibrado', label: 'Equilibrado', icon: 'Scale', desc: 'Neutro e seguro' },
  { id: 'agressivo', label: 'Agressivo', icon: 'Flame', desc: 'Mais riscos, mais pressão' },
  { id: 'defensivo', label: 'Defensivo', icon: 'Shield', desc: 'Consistência e paciência' },
  { id: 'potencia', label: 'Potência', icon: 'Hammer', desc: 'Busca o smash e a definição' },
  { id: 'tatico', label: 'Tático', icon: 'Brain', desc: 'Variações para explorar espaços' },
];

const pointDisplay = (points) => ['0', '15', '30', '40'][Math.min(points, 3)] || '40';

export function createMatch(teamA, teamB, options = {}) {
  const teams = createTeams(teamA, teamB);
  const seed = options.seed ?? `${Date.now()}-${teamA?.[0]?.id || 'A'}-${teamB?.[0]?.id || 'B'}`;
  return {
    engineVersion: '0.3.0-a', seed, randomState: 0, teams,
    teamANames: teams.A.map((p) => p.name), teamBNames: teams.B.map((p) => p.name),
    setsA: 0, setsB: 0, currentSet: 1, gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0,
    servingTeam: 'A', inTiebreak: false, superTiebreak: false, finished: false, winner: null,
    setScores: [], narration: [], stats: createStatistics(teams), pointNumber: 0,
  };
}

function cloneState(prev) {
  return {
    ...prev,
    teams: {
      A: prev.teams.A.map((p) => ({ ...p, attributes: { ...p.attributes }, personality: { ...p.personality }, position: { ...p.position } })),
      B: prev.teams.B.map((p) => ({ ...p, attributes: { ...p.attributes }, personality: { ...p.personality }, position: { ...p.position } })),
    },
    narration: [...prev.narration], setScores: [...prev.setScores],
    stats: JSON.parse(JSON.stringify(prev.stats)),
  };
}

function snapshot(s) {
  return { setsA: s.setsA, setsB: s.setsB, gamesA: s.gamesA, gamesB: s.gamesB, pointsA: s.pointsA, pointsB: s.pointsB, inTiebreak: s.inTiebreak, superTiebreak: s.superTiebreak };
}

export function playPoint(prev, tactic = MATCH_TACTICS[0]) {
  if (prev.finished) return prev;
  const state = cloneState(prev);
  const random = createRandom(`${state.seed}:${state.pointNumber}`);
  const rally = new RallyEngine();
  const momentum = new MomentumEngine();
  const fatigue = new FatigueEngine();
  const commentary = new CommentaryEngine();
  const result = rally.play({ teams: state.teams, servingTeam: state.servingTeam, tactic, random, stats: state.stats });
  state.pointNumber += 1;
  momentum.update(state.teams, result.winner, result.winner === 'A' ? 'B' : 'A', { breakPoint: isBreakPoint(state, result.winner) });
  const msg = commentary.point({ ...result, random });
  awardPoint(state, result.winner, msg, result, fatigue);
  return state;
}

function isBreakPoint(state, winner) {
  return state.pointsA >= 3 || state.pointsB >= 3 || (winner === 'A' ? state.pointsB : state.pointsA) >= 3;
}

function awardPoint(state, winner, msg, detail, fatigue) {
  if (state.inTiebreak) {
    if (winner === 'A') state.pointsA += 1; else state.pointsB += 1;
    const target = state.superTiebreak ? 10 : 7;
    if ((state.pointsA >= target || state.pointsB >= target) && Math.abs(state.pointsA - state.pointsB) >= 2) {
      const setWinner = state.pointsA > state.pointsB ? 'A' : 'B';
      if (!state.superTiebreak) { state.gamesA = setWinner === 'A' ? 7 : 6; state.gamesB = setWinner === 'B' ? 7 : 6; }
      else { state.gamesA = state.pointsA; state.gamesB = state.pointsB; }
      state.narration.push({ type: 'tiebreak_end', msg: `${msg} Tiebreak ${state.pointsA}-${state.pointsB}.`, scorer: winner, rallyLength: detail.rallyLength, ...snapshot(state) });
      finishSet(state, setWinner);
    } else state.narration.push({ type: 'point', msg, scorer: winner, rallyLength: detail.rallyLength, ...snapshot(state) });
    return;
  }

  if (winner === 'A') state.pointsA += 1; else state.pointsB += 1;
  const aGame = state.pointsA >= 4 && state.pointsA - state.pointsB >= 2;
  const bGame = state.pointsB >= 4 && state.pointsB - state.pointsA >= 2;
  if (aGame || bGame) {
    const gameWinner = aGame ? 'A' : 'B';
    if (aGame) state.gamesA += 1; else state.gamesB += 1;
    state.pointsA = 0; state.pointsB = 0;
    state.servingTeam = state.servingTeam === 'A' ? 'B' : 'A';
    fatigue.recoverBetweenGames(state.teams);
    state.narration.push({ type: 'game', msg: `${msg} Game para ${gameWinner === 'A' ? state.teamANames[0] : state.teamBNames[0]}.`, scorer: gameWinner, rallyLength: detail.rallyLength, ...snapshot(state) });
    checkSet(state);
  } else state.narration.push({ type: 'point', msg, scorer: winner, rallyLength: detail.rallyLength, ...snapshot(state) });
}

function checkSet(state) {
  if (state.gamesA >= 6 && state.gamesA - state.gamesB >= 2) return finishSet(state, 'A');
  if (state.gamesB >= 6 && state.gamesB - state.gamesA >= 2) return finishSet(state, 'B');
  if (state.gamesA === 6 && state.gamesB === 6) {
    state.inTiebreak = true; state.pointsA = 0; state.pointsB = 0;
    state.narration.push({ type: 'tiebreak_start', msg: '6-6. Vamos ao tiebreak!', ...snapshot(state) });
  }
}

function finishSet(state, winner) {
  state.inTiebreak = false; state.pointsA = 0; state.pointsB = 0;
  if (winner === 'A') state.setsA += 1; else state.setsB += 1;
  state.setScores.push({ gamesA: state.gamesA, gamesB: state.gamesB, winner });
  state.narration.push({ type: 'set', msg: `Set ${state.currentSet}: ${state.gamesA}-${state.gamesB}.`, scorer: winner, ...snapshot(state) });
  if (state.setsA === 2 || state.setsB === 2) {
    state.finished = true; state.winner = state.setsA > state.setsB ? 'A' : 'B';
    state.narration.push({ type: 'match', msg: `Fim de jogo! ${state.winner === 'A' ? state.teamANames.join(' & ') : state.teamBNames.join(' & ')} vencem por ${state.setsA}-${state.setsB}.`, scorer: state.winner, ...snapshot(state) });
    return;
  }
  state.currentSet += 1; state.gamesA = 0; state.gamesB = 0;
  if (state.setsA === 1 && state.setsB === 1) {
    state.superTiebreak = true; state.inTiebreak = true;
    state.narration.push({ type: 'tiebreak_start', msg: 'Terceiro set: super tiebreak até 10.', ...snapshot(state) });
  }
}

export function formatPoints(state) {
  if (state.inTiebreak) return { a: String(state.pointsA), b: String(state.pointsB) };
  if (state.pointsA >= 3 && state.pointsB >= 3) {
    if (state.pointsA === state.pointsB) return { a: '40', b: '40' };
    return state.pointsA > state.pointsB ? { a: 'AD', b: '40' } : { a: '40', b: 'AD' };
  }
  return { a: pointDisplay(state.pointsA), b: pointDisplay(state.pointsB) };
}

export const getSetScoreString = (state) => state.setScores.map((s) => `${s.gamesA}-${s.gamesB}`).join(', ');
