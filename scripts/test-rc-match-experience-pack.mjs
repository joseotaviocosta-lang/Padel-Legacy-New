import fs from 'node:fs';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { buildMatchRecap, createMatchMomentum, updateMatchMomentumState } from '../src/lib/matchExperience.js';

function athlete(id, name, team) {
  return {
    id, name, team,
    energy: 100, confidence: 60,
    attributes: { serve: 65, drive: 68, backhand: 66, lob: 66, volley: 67, bandeja: 66, smash: 67, speed: 66, stamina: 68, reflex: 67, anticipation: 66, composure: 67, consistency: 67 },
    personality: {}, position: { zone: 'back' },
  };
}

const checks = [];
const momentumStart = createMatchMomentum();
let m = momentumStart;
for (let i = 0; i < 8; i += 1) {
  m = updateMatchMomentumState(m, {
    winnerTeamId: 'A', servingTeamId: 'A', rallyLength: 8,
    scoreBefore: { gamesA: 0, gamesB: 0, setsA: 0, setsB: 0 },
    scoreAfter: { gamesA: 0, gamesB: 0, setsA: 0, setsB: 0 },
  });
}
checks.push(['momentum cresce e respeita teto', m.value > 0 && m.value <= 100 && m.streak === 8]);
for (let i = 0; i < 30; i += 1) {
  m = updateMatchMomentumState(m, {
    winnerTeamId: 'B', servingTeamId: 'A', rallyLength: 20,
    scoreBefore: { gamesA: 0, gamesB: 0, setsA: 0, setsB: 0 },
    scoreAfter: { gamesA: 0, gamesB: 0, setsA: 0, setsB: 0 },
  });
}
checks.push(['momentum respeita piso', m.value >= -100 && m.value < 0]);

let state = createMatch(
  [athlete('a1', 'A Um', 'A'), athlete('a2', 'A Dois', 'A')],
  [athlete('b1', 'B Um', 'B'), athlete('b2', 'B Dois', 'B')],
  { seed: 'rc-match-experience-pack' },
);
let safety = 4000;
while (!state.finished && safety-- > 0) state = playPoint(state);
checks.push(['partida termina', state.finished && ['A', 'B'].includes(state.winner)]);
checks.push(['momentum persistido na partida', state.momentum && Math.abs(state.momentum.value) <= 100]);
checks.push(['eventos carregam momentum', state.pointEvents.length > 0 && state.pointEvents.every((event) => event.momentumAfter)]);
checks.push(['narrativa contextual existe', state.narration.some((event) => event.type === 'moment')]);
const recap = buildMatchRecap(state);
checks.push(['recap premium consistente', recap && recap.highlights.length >= 3 && recap.stats.longestRally >= 0 && recap.mvp]);

const live = fs.readFileSync('src/components/matches/LiveMatch.jsx', 'utf8');
const recapUi = fs.readFileSync('src/components/matches/MatchRecapPremium.jsx', 'utf8');
const practice = fs.readFileSync('src/components/matches/SimulationModal.jsx', 'utf8');
const tournament = fs.readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
checks.push(['HUD usa momentum persistente', live.includes('state.momentum?.value') && live.includes("event.type === 'moment'")]);
checks.push(['recap integrado em treino e torneio', recapUi.includes('Resumo premium') && practice.includes('MatchRecapPremium') && tournament.includes('MatchRecapPremium')]);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('RCMatchExperiencePackTest: FAIL');
  failed.forEach(([name]) => console.error(` - ${name}`));
  process.exit(1);
}
console.log(`RCMatchExperiencePackTest: PASS (${checks.length}/${checks.length})`);
