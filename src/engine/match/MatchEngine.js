import { createRandom, hashSeed } from './random.js';
import { createTeams } from './playerModel.js';
import { RallyEngine } from './RallyEngine.js';
import { MomentumEngine } from './MomentumEngine.js';
import { FatigueEngine } from './FatigueEngine.js';
import { CommentaryEngine } from './CommentaryEngine.js';
import { createStatistics, buildStatisticsSummary } from './StatisticsEngine.js';
import { buildMatchAnalysis } from './MatchAnalysis.js';
import { appendLiveCoachEventToReplay, appendPointToReplay, appendTacticChangeToReplay, createReplay } from '../../gameplay/replay/ReplayRecorder.js';
import { MATCH_TACTICS, chooseBotTactic, getMatchTactic } from './MatchTactics.js';
import { CoachCommunicationManager, LiveCoachObserver, LiveTacticalAdjustmentManager, OpponentAdaptationTracker, buildLiveCoachReport, createLiveCoachState } from '../live-coach/index.js';

export { MATCH_TACTICS };

const pointDisplay = (points) => ['0', '15', '30', '40'][Math.min(points, 3)] || '40';
export const TEAM_IDS = Object.freeze({ A: 'A', B: 'B' });
export function getOpponentTeamId(teamId) {
  if (teamId === TEAM_IDS.A) return TEAM_IDS.B;
  if (teamId === TEAM_IDS.B) return TEAM_IDS.A;
  throw new Error(`Equipe inválida: ${teamId}`);
}
export function getTieBreakServingTeam(firstServingTeamId, totalPointsPlayed) {
  if (totalPointsPlayed === 0) return firstServingTeamId;
  const serviceBlock = Math.floor((totalPointsPlayed - 1) / 2);
  return serviceBlock % 2 === 0 ? getOpponentTeamId(firstServingTeamId) : firstServingTeamId;
}
export function getTieBreakServerPlayerIndex(firstServingTeamId, totalPointsPlayed, initialIndices = { A: 0, B: 0 }) {
  const teamId = getTieBreakServingTeam(firstServingTeamId, totalPointsPlayed);
  const block = totalPointsPlayed === 0 ? 0 : Math.floor((totalPointsPlayed - 1) / 2) + 1;
  const occurrence = teamId === firstServingTeamId ? Math.floor(block / 2) : Math.floor((block - 1) / 2);
  return (Number(initialIndices[teamId]) + Math.max(0, occurrence)) % 2;
}

export function createMatch(teamA, teamB, options = {}) {
  const teams = createTeams(teamA, teamB);
  const seed = options.seed ?? `${Date.now()}-${teamA?.[0]?.id || 'A'}-${teamB?.[0]?.id || 'B'}`;
  const state = {
    engineVersion: '0.4.0-alpha.7', seed, randomState: hashSeed(seed) || 1, teams,
    teamANames: teams.A.map((p) => p.name), teamBNames: teams.B.map((p) => p.name),
    setsA: 0, setsB: 0, currentSet: 1, gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0,
    servingTeam: 'A', inTiebreak: false, superTiebreak: false, finished: false, winner: null,
    setScores: [], narration: [], stats: createStatistics(teams), analysis: null, pointNumber: 0,
    replayEnabled: Boolean(options.replayEnabled), replay: null,
    activeTactics: { A: getMatchTactic(options.initialTacticId), B: getMatchTactic('equilibrado') }, tacticsTimeline: [],
    pointEvents: [], serverPlayerIndices: { A: 0, B: 0 }, tiebreakFirstServingTeam: null, tiebreakFirstServerPlayerIndices: null, tiebreakPointsPlayed: 0,
    liveCoach:createLiveCoachState({coach:options.coach||null,settings:options.liveCoachSettings,initialPlan:getMatchTactic(options.initialTacticId)}), aiCoach:{lastAdjustmentPoint:-99,adjustments:0},
  };
  if (state.replayEnabled) state.replay = createReplay(state);
  return state;
}

function cloneState(prev) {
  return {
    ...prev,
    teams: {
      A: prev.teams.A.map((p) => ({ ...p, attributes: { ...p.attributes }, personality: { ...p.personality }, position: { ...p.position } })),
      B: prev.teams.B.map((p) => ({ ...p, attributes: { ...p.attributes }, personality: { ...p.personality }, position: { ...p.position } })),
    },
    narration: [...prev.narration], setScores: [...prev.setScores],
    pointEvents: [...(prev.pointEvents || [])],
    serverPlayerIndices: { ...(prev.serverPlayerIndices || { A: 0, B: 0 }) },
    tiebreakFirstServerPlayerIndices: prev.tiebreakFirstServerPlayerIndices ? { ...prev.tiebreakFirstServerPlayerIndices } : null,
    stats: JSON.parse(JSON.stringify(prev.stats)),
    replay: prev.replay ? JSON.parse(JSON.stringify(prev.replay)) : null,
    activeTactics: { ...prev.activeTactics }, tacticsTimeline: [...(prev.tacticsTimeline || [])],
    liveCoach: prev.liveCoach ? JSON.parse(JSON.stringify(prev.liveCoach)) : null, aiCoach: {...(prev.aiCoach||{})},
  };
}

function snapshot(s) {
  return { setsA: s.setsA, setsB: s.setsB, gamesA: s.gamesA, gamesB: s.gamesB, pointsA: s.pointsA, pointsB: s.pointsB, inTiebreak: s.inTiebreak, superTiebreak: s.superTiebreak };
}

export function applyMatchTactic(prev, tacticValue, teamId = 'A') {
  if (prev.finished || !['A', 'B'].includes(teamId)) return prev;
  const tactic = getMatchTactic(tacticValue);
  if (prev.activeTactics?.[teamId]?.id === tactic.id) return prev;
  const state = cloneState(prev);
  state.activeTactics[teamId] = tactic;
  const change = { type: 'tactic_changed', teamId, tacticId: tactic.id, effectiveFromPoint: state.pointNumber + 1 };
  state.tacticsTimeline.push(change);
  if (state.replay) appendTacticChangeToReplay(state.replay, change);
  return state;
}

export function decideLiveCoachSuggestion(prev, decision='ignore', components=[]) {
  const suggestion=prev.liveCoach?.pendingSuggestion;if(!suggestion||prev.finished)return prev;const state=cloneState(prev);const record={type:'player_tactical_decision',suggestionId:suggestion.id,decision,components,effectiveFromPoint:state.pointNumber+1};state.liveCoach.decisions.push(record);state.liveCoach.pendingSuggestion=null;if(state.replay)appendLiveCoachEventToReplay(state.replay,record);
  const applied=new LiveTacticalAdjustmentManager().apply({currentPlan:state.activeTactics.A,suggestion,decision,components,pointNumber:state.pointNumber,setNumber:state.currentSet,gameNumber:state.gamesA+state.gamesB});if(applied.adjustment){state.activeTactics.A=applied.plan;state.liveCoach.adjustments.push(applied.adjustment);const change={type:'tactic_changed',teamId:'A',tacticId:applied.plan.id,effectiveFromPoint:state.pointNumber+1,source:'coach_suggestion'};state.tacticsTimeline.push(change);if(state.replay){appendLiveCoachEventToReplay(state.replay,applied.adjustment);appendTacticChangeToReplay(state.replay,change);}}return state;
}

export function askLiveMatchPartner(prev) { const suggestion=prev.liveCoach?.pendingSuggestion;if(!suggestion)return prev;const state=cloneState(prev);const feedback=new CoachCommunicationManager().partnerFeedback({partner:state.teams.A[1],suggestion});state.liveCoach.partnerFeedback=[...(state.liveCoach.partnerFeedback||[]),feedback];if(state.replay)appendLiveCoachEventToReplay(state.replay,feedback);return state; }

export function playPoint(prev, tactic) {
  if (prev.finished) return prev;
  let state = cloneState(prev);
  if (tactic) state.activeTactics.A = getMatchTactic(tactic);
  const proposedBotTactic = chooseBotTactic(state, 'B');
  const botTactic = OpponentAdaptationTracker.shouldAdjust(state,2) ? proposedBotTactic : state.activeTactics.B;
  if (state.activeTactics.B?.id !== botTactic.id) { const previousBotTactic=state.activeTactics.B;state = applyMatchTactic(state, botTactic, 'B');state.aiCoach=OpponentAdaptationTracker.record(state,botTactic.id);const detected=OpponentAdaptationTracker.detect(previousBotTactic,botTactic,state.pointNumber);if(detected){state.liveCoach.observations.push(detected);if(state.replay)appendLiveCoachEventToReplay(state.replay,detected);} }
  const random = createRandom(state.seed, state.randomState);
  const rally = new RallyEngine();
  const momentum = new MomentumEngine();
  const fatigue = new FatigueEngine();
  const commentary = new CommentaryEngine();
  const servingTeam = state.inTiebreak
    ? getTieBreakServingTeam(state.tiebreakFirstServingTeam || state.servingTeam, state.tiebreakPointsPlayed)
    : state.servingTeam;
  const serverPlayerIndex = state.inTiebreak
    ? getTieBreakServerPlayerIndex(state.tiebreakFirstServingTeam || state.servingTeam, state.tiebreakPointsPlayed, state.tiebreakFirstServerPlayerIndices || state.serverPlayerIndices)
    : state.serverPlayerIndices[servingTeam];
  const serverPlayerId = state.teams[servingTeam][serverPlayerIndex]?.id;
  const scoreBefore = snapshot(state);
  const pointContext = createPointContext(state);
  const result = rally.play({ teams: state.teams, servingTeam, serverPlayerId, tactics: state.activeTactics, random, stats: state.stats, match: pointContext });
  if (!['A', 'B'].includes(result?.winnerTeamId || result?.winner)) throw new Error('Ponto encerrado sem winnerTeamId válido.');
  result.winnerTeamId = result.winnerTeamId || result.winner;
  result.loserTeamId = getOpponentTeamId(result.winnerTeamId);
  result.servingTeamId = servingTeam;
  result.serverPlayerId = serverPlayerId;
  state.randomState = random.state();
  state.pointNumber += 1;
  momentum.update(state.teams, result.winnerTeamId, result.loserTeamId, { breakPoint: isBreakPoint(state, result.winnerTeamId) });
  const narrative = commentary.describe({ ...result, random, stats: state.stats, match: pointContext });
  awardPoint(state, result.winnerTeamId, narrative.message, { ...result, narrative }, fatigue);
  if (scoreBefore.inTiebreak) state.tiebreakPointsPlayed += 1;
  state.pointEvents.push({ type: 'point_completed', pointNumber: state.pointNumber, servingTeamId: servingTeam, serverPlayerId, winnerTeamId: result.winnerTeamId, loserTeamId: result.loserTeamId, reason: result.result, finalShotPlayerId: result.finisher?.id || null, scoreBefore, scoreAfter: snapshot(state), rngStateAfter: state.randomState });
  if (state.replayEnabled && state.replay) appendPointToReplay(state.replay, prev, state, result);
  const safeWindow=scoreBefore.gamesA!==state.gamesA||scoreBefore.gamesB!==state.gamesB||scoreBefore.setsA!==state.setsA||scoreBefore.setsB!==state.setsB;
  const previousSuggestionCount=state.liveCoach.suggestions.length;state.liveCoach=new LiveCoachObserver().observe(state.liveCoach,{pointNumber:state.pointNumber,result,teams:state.teams,scoreBefore,scoreAfter:snapshot(state),setNumber:state.currentSet,gameNumber:state.gamesA+state.gamesB,finished:state.finished},{safeWindow});if(state.liveCoach.suggestions.length>previousSuggestionCount&&state.replay){appendLiveCoachEventToReplay(state.replay,state.liveCoach.observations.at(-1));appendLiveCoachEventToReplay(state.replay,state.liveCoach.suggestions.at(-1));}
  if(state.liveCoach.pendingSuggestion&&state.liveCoach.settings.allowMinorAutoAdjustments){const allowed=Object.keys(state.liveCoach.pendingSuggestion.suggestedAdjustment?.components||{}).filter(key=>['riskModifier','energyModifier','safeWeight'].includes(key)).slice(0,1);if(allowed.length)state=decideLiveCoachSuggestion(state,'auto',allowed);}
  if(state.finished)state.liveCoachReport=buildLiveCoachReport(state);
  return state;
}

function createPointContext(state) {
  const breakPoint = state.pointsA >= 3 || state.pointsB >= 3;
  return {
    pointsA: state.pointsA,
    pointsB: state.pointsB,
    gamesA: state.gamesA,
    gamesB: state.gamesB,
    setsA: state.setsA,
    setsB: state.setsB,
    inTiebreak: state.inTiebreak,
    superTiebreak: state.superTiebreak,
    breakPoint,
    importantPoint: Boolean(state.inTiebreak || breakPoint),
  };
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
      state.narration.push({ type: 'tiebreak_end', msg: `${msg} Tiebreak ${state.pointsA}-${state.pointsB}.`, scorer: winner, rallyLength: detail.rallyLength, decisionTrace: detail.decisionTrace || [], narrative: detail.narrative || null, ...snapshot(state) });
      finishSet(state, setWinner);
    } else state.narration.push({ type: 'point', msg, scorer: winner, rallyLength: detail.rallyLength, decisionTrace: detail.decisionTrace || [], narrative: detail.narrative || null, ...snapshot(state) });
    return;
  }

  if (winner === 'A') state.pointsA += 1; else state.pointsB += 1;
  const aGame = state.pointsA >= 4 && state.pointsA - state.pointsB >= 2;
  const bGame = state.pointsB >= 4 && state.pointsB - state.pointsA >= 2;
  if (aGame || bGame) {
    const gameWinner = aGame ? 'A' : 'B';
    if (aGame) state.gamesA += 1; else state.gamesB += 1;
    state.pointsA = 0; state.pointsB = 0;
    state.serverPlayerIndices[state.servingTeam] = (state.serverPlayerIndices[state.servingTeam] + 1) % state.teams[state.servingTeam].length;
    state.servingTeam = getOpponentTeamId(state.servingTeam);
    fatigue.recoverBetweenGames(state.teams);
    state.narration.push({ type: 'game', msg: `${msg} Game para ${gameWinner === 'A' ? state.teamANames[0] : state.teamBNames[0]}.`, scorer: gameWinner, rallyLength: detail.rallyLength, decisionTrace: detail.decisionTrace || [], narrative: detail.narrative || null, ...snapshot(state) });
    checkSet(state);
  } else state.narration.push({ type: 'point', msg, scorer: winner, rallyLength: detail.rallyLength, decisionTrace: detail.decisionTrace || [], narrative: detail.narrative || null, ...snapshot(state) });
}

function checkSet(state) {
  if (state.gamesA >= 6 && state.gamesA - state.gamesB >= 2) return finishSet(state, 'A');
  if (state.gamesB >= 6 && state.gamesB - state.gamesA >= 2) return finishSet(state, 'B');
  if (state.gamesA === 6 && state.gamesB === 6) {
    state.inTiebreak = true; state.pointsA = 0; state.pointsB = 0;
    state.tiebreakFirstServingTeam = state.servingTeam; state.tiebreakFirstServerPlayerIndices = { ...state.serverPlayerIndices }; state.tiebreakPointsPlayed = 0;
    state.narration.push({ type: 'tiebreak_start', msg: '6-6. Vamos ao tiebreak!', ...snapshot(state) });
  }
}

function finishSet(state, winner) {
  state.inTiebreak = false; state.pointsA = 0; state.pointsB = 0;
  state.tiebreakFirstServingTeam = null; state.tiebreakFirstServerPlayerIndices = null; state.tiebreakPointsPlayed = 0;
  if (winner === 'A') state.setsA += 1; else state.setsB += 1;
  state.setScores.push({ gamesA: state.gamesA, gamesB: state.gamesB, winner });
  state.narration.push({ type: 'set', msg: `Set ${state.currentSet}: ${state.gamesA}-${state.gamesB}.`, scorer: winner, ...snapshot(state) });
  if (state.setsA === 2 || state.setsB === 2) {
    state.finished = true; state.winner = state.setsA > state.setsB ? 'A' : 'B';
    state.stats = buildStatisticsSummary(state.stats);
    state.narration.push({ type: 'match', msg: `Fim de jogo! ${state.winner === 'A' ? state.teamANames.join(' & ') : state.teamBNames.join(' & ')} vencem por ${state.setsA}-${state.setsB}.`, scorer: state.winner, ...snapshot(state) });
    state.analysis = buildMatchAnalysis(state);
    return;
  }
  state.currentSet += 1; state.gamesA = 0; state.gamesB = 0;
  if (state.setsA === 1 && state.setsB === 1) {
    state.superTiebreak = true; state.inTiebreak = true;
    state.tiebreakFirstServingTeam = state.servingTeam; state.tiebreakFirstServerPlayerIndices = { ...state.serverPlayerIndices }; state.tiebreakPointsPlayed = 0;
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

export function validateCompletedMatch(state) {
  const errors = [];
  if (!state?.finished) errors.push('Partida não concluída.');
  if (!['A', 'B'].includes(state?.winner)) errors.push('Vencedor da partida inválido.');
  if (state?.winner === 'A' && state.setsA <= state.setsB) errors.push('Vencedor A incompatível com os sets.');
  if (state?.winner === 'B' && state.setsB <= state.setsA) errors.push('Vencedor B incompatível com os sets.');
  for (const event of state?.pointEvents || []) {
    if (!['A', 'B'].includes(event.winnerTeamId) || event.winnerTeamId === event.loserTeamId) errors.push(`Evento ${event.pointNumber} possui equipes inválidas.`);
  }
  return { valid: errors.length === 0, errors };
}
