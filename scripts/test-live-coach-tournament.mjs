// Hotfix — técnico durante partidas (torneio). O ticket exige que o mesmo
// sistema funcione em treino E torneio (não aceitar "só funciona em
// torneio"). Este teste atravessa o pipeline real de torneio (criação de
// run, R16, composição de equipes igual a TournamentModal.startMatch()) com
// o motor real (createMatch/playPoint) e o componente LiveMatch de verdade,
// provando paridade com test:live-coach-practice.
import { createServer } from 'vite';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function fakePlayer(id, name, extra = {}) {
  return {
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, partner_chemistry: 60, partner_trust: 60, partner_morale: 60,
    matches_played: 0, ...extra,
  };
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { createMatch, playPoint, attachLiveCoach } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');
  const liveMatchModule = await server.ssrLoadModule('/src/components/matches/LiveMatch.jsx');
  const LiveMatch = liveMatchModule.default;
  const runManagerModule = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { createTournamentRun, completePreTournamentMeeting, startTournamentMatch, getCurrentTournamentMatch } = runManagerModule;

  const coach = COACHES_DATA.find((c) => c.tier === 'elite') || COACHES_DATA[0];
  const liveCoachSettings = { liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false, showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true };

  // Monta a rodada exatamente como TournamentModal.startMatch() monta.
  const tournament = { id: 'coach-cup', name: 'Coach Cup', tier: 'Silver', start_date: '2026-03-01' };
  const profile = fakePlayer('me', 'Jogador', { career_date: '2026-03-01', partner_id: 'partner-1' });
  const partner = fakePlayer('partner-1', 'Parceiro');
  let run = createTournamentRun({
    tournament, profileId: profile.id, startDate: profile.career_date,
    mainRounds: [{ label: 'R16', short: 'R16' }],
    opponents: [{ members: [fakePlayer('r16-a', 'R16 A'), fakePlayer('r16-b', 'R16 B')], rank: 180 }],
    now: '2026-02-28T10:00:00.000Z',
  });
  run = completePreTournamentMeeting(run, 'balanced').run;
  run = startTournamentMatch(run, profile.career_date);
  const r16 = getCurrentTournamentMatch(run);
  gate('torneio: R16 fica com status playing após startTournamentMatch', r16.status === 'playing');
  const playerForMatch = { ...profile, _chemistryBonus: 1.2, _energyPenalty: 0, _coachMatchBonus: 0, _partnerBondBonus: 0.3 };
  const teamA = [playerForMatch, partner];
  const teamB = r16.opponent;

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — Caminho feliz: treinador disponível, joga a rodada inteira.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: treinador presente na rodada de torneio ---');
  let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', coach, liveCoachSettings, seed: 'tournament-happy' });
  let safety = 6000;
  while (!state.finished && safety-- > 0) state = playPoint(state);
  gate('torneio: partida termina jogando pontos reais', state.finished === true);
  gate('torneio: coach presente = true', Boolean(state.liveCoach.coach));
  gate('torneio: orientações geradas = true', state.liveCoach.suggestions.length >= 1);
  const suggestion = state.liveCoach.suggestions[0];
  gate('torneio: orientação baseada em dados reais (sampleSize > 0)', Number(suggestion.evidence?.sampleSize) > 0);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — Mesma regressão de "treinador atrasado" também não pode
  // acontecer em torneio: prova que attachLiveCoach cobre os dois fluxos.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: treinador atrasado também recupera em torneio ---');
  let lateState = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', coach: null, liveCoachSettings, seed: 'tournament-late' });
  for (let i = 0; i < 6 && !lateState.finished; i += 1) lateState = playPoint(lateState);
  lateState = attachLiveCoach(lateState, coach);
  safety = 6000;
  while (!lateState.finished && safety-- > 0) lateState = playPoint(lateState);
  gate('torneio: depois de anexado, também gera orientações reais', lateState.liveCoach.suggestions.length >= 1);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — Sem treinador em torneio: mesma garantia de zero fallback.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: sem treinador em torneio ---');
  let noCoachState = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', coach: null, liveCoachSettings, seed: 'tournament-nocoach' });
  safety = 6000;
  while (!noCoachState.finished && safety-- > 0) noCoachState = playPoint(noCoachState);
  gate('torneio sem treinador: ZERO orientações', noCoachState.liveCoach.suggestions.length === 0);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — Render real do LiveMatch usado por TournamentModal.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: LiveMatch exibe a orientação de verdade (torneio) ---');
  gate('pré-condição: partida do cenário 1 terminou com sugestão pendente', Boolean(state.liveCoach.pendingSuggestion));
  const rendered = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveMatch, {
    teamA, teamB, initialTacticId: 'equilibrado', coach, liveCoachSettings,
    onFinished: () => {}, displayMode: 'text', onDisplayModeChange: () => {}, onCheckpoint: null,
    initialState: state, matchType: 'tournament', matchId: r16.id,
  }));
  gate('a UI real mostra o banner "Nova sugestão do técnico" em partida de torneio', rendered.includes('Nova sugestão do técnico'));
} finally {
  await server.close();
}

console.log(`\ntest:live-coach-tournament OK — ${gates} gates (paridade com treino: caminho feliz + treinador atrasado + sem treinador + render real).`);
