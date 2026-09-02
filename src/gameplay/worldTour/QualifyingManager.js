import { buildSeedings } from './EntryManager.js';
import { fnv1aHash } from '@/lib/hashUtils.js';

function hashString(value = '') {
  return Math.abs(fnv1aHash(String(value)));
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function getQualifyingRoundCount(tournament = {}) {
  const size = Math.max(0, Number(tournament.qualifying_size || 0));
  if (size <= 4) return 1;
  if (size <= 8) return 2;
  if (size <= 16) return 3;
  return 4;
}

export function getQualifyingRoundLabels(tournament = {}) {
  const count = getQualifyingRoundCount(tournament);
  return Array.from({ length: count }, (_, index) => {
    const remaining = count - index;
    if (remaining === 1) return 'Rodada decisiva do qualifying';
    if (remaining === 2) return 'Semifinal do qualifying';
    if (remaining === 3) return 'Quartas do qualifying';
    return `Qualifying — rodada ${index + 1}`;
  });
}

export function createQualifyingState({ tournament, profile, partner, teamRank = 0, bots = [] }) {
  const labels = getQualifyingRoundLabels(tournament);
  const playerTeam = {
    id: `player-${profile.id}`,
    name: `${profile.sport_name || profile.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`,
    rank: Number(teamRank || profile.team_rank || profile.world_ranking || 9999),
    isPlayer: true,
  };
  const targetSize = Math.max(4, Number(tournament.qualifying_size || 8));
  const entrants = [playerTeam, ...bots.slice(0, targetSize - 1).map((bot, index) => ({
    id: bot.id || `qualifier-${index + 1}`,
    name: bot.team_name || bot.name || `Dupla do qualifying ${index + 1}`,
    rank: Number(bot.rank || bot.world_ranking || playerTeam.rank + index + 1),
    isPlayer: false,
  }))];
  while (entrants.length < targetSize) {
    const index = entrants.length;
    entrants.push({ id: `generated-${index}`, name: `Dupla qualificatória ${index}`, rank: playerTeam.rank + index + 20, isPlayer: false });
  }

  const seeded = buildSeedings(entrants, targetSize);
  const random = seededRandom(hashString(`${tournament.id}-${profile.id}-${tournament.start_date}`));
  const opponents = seeded
    .filter((entry) => !entry.isPlayer)
    .sort((a, b) => (a.seed || 999) - (b.seed || 999) || random() - 0.5)
    .slice(0, labels.length)
    .map((entry, index) => ({ ...entry, roundIndex: index }));

  return {
    version: 1,
    status: 'in_progress',
    currentRound: 0,
    roundLabels: labels,
    entrants: seeded,
    opponents,
    results: [],
    promoted: false,
    eliminated: false,
    createdAt: new Date().toISOString(),
  };
}

export function recordQualifyingResult(state, result) {
  const currentRound = Number(state.currentRound || 0);
  const next = {
    ...state,
    results: [...(state.results || []), { ...result, roundIndex: currentRound }],
  };
  if (!result.won) {
    return { ...next, status: 'eliminated', eliminated: true, finishedAt: new Date().toISOString() };
  }
  if (currentRound + 1 >= (state.roundLabels || []).length) {
    return { ...next, status: 'qualified', promoted: true, currentRound, finishedAt: new Date().toISOString() };
  }
  return { ...next, currentRound: currentRound + 1 };
}

export function getCurrentQualifyingOpponent(state) {
  return state?.opponents?.[Number(state.currentRound || 0)] || null;
}

export function buildQualifyingBracketHistory(state) {
  return (state?.results || []).map((result, index) => ({
    round: state.roundLabels?.[index] || `Qualifying ${index + 1}`,
    matches: [{
      team_a: result.teamA,
      team_b: result.teamB,
      winner: result.winner,
      score: result.score || '—',
    }],
  }));
}
