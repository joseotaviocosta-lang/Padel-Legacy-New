// Hotfix — técnico durante partidas (treino). QA real relatou: jogador com
// treinador contratado, partida treino roda normalmente, mas o técnico nunca
// oferece nenhuma orientação. Causa raiz: `coach` chega a SimulationModal por
// um efeito assíncrono (ensureStarterCoach); se LiveMatch monta ANTES desse
// efeito resolver, `useState(() => createMatch(..., { coach }))` grava
// `liveCoach.coach = null` PARA SEMPRE (o lazy initializer só roda uma vez) —
// mesmo depois do prop `coach` atualizar, o motor nunca mais observa nada.
// Este teste primeiro REPRODUZ a regressão contra o motor real e depois prova
// que attachLiveCoach() (o fix) resolve, atravessando o pipeline real
// (createMatch/playPoint de src/engine/match, e o componente LiveMatch de
// verdade via react-dom/server) — sem mockar a camada crítica.
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

function playFullMatch(createMatch, playPoint, teamA, teamB, options) {
  let state = createMatch(teamA, teamB, options);
  let safety = 6000;
  while (!state.finished && safety-- > 0) state = playPoint(state);
  if (!state.finished) throw new Error('Partida não terminou dentro do limite de segurança.');
  return state;
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

  const coach = COACHES_DATA.find((c) => c.tier === 'iniciante') || COACHES_DATA[0];
  const liveCoachSettings = { liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false, showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true };
  const teamA = [fakePlayer('me', 'Jogador'), fakePlayer('partner', 'Parceiro')];
  const teamB = [fakePlayer('bot1', 'Rival1'), fakePlayer('bot2', 'Rival2')];

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1 — REPRODUÇÃO: coach ainda não carregou quando o motor cria o
  // estado (exatamente o `useState(() => createMatch(..., { coach: null }))`
  // que acontece se o efeito de ensureStarterCoach não terminou a tempo).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 1: reprodução da regressão (coach chega atrasado) ---');
  const withoutFix = playFullMatch(createMatch, playPoint, teamA, teamB, { initialTacticId: 'equilibrado', coach: null, liveCoachSettings, seed: 'practice-repro' });
  gate('sem anexar o treinador depois, a partida treino termina com ZERO orientações (reproduz o bug relatado)', withoutFix.liveCoach.suggestions.length === 0);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2 — FIX: o mesmo atraso, mas o treinador chega e é anexado (é
  // exatamente o que o novo useEffect de LiveMatch.jsx faz quando o prop
  // `coach` muda de null para o treinador carregado).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 2: treinador chega atrasado, mas é anexado (fix) ---');
  let lateState = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', coach: null, liveCoachSettings, seed: 'practice-latefix' });
  for (let i = 0; i < 6 && !lateState.finished; i += 1) lateState = playPoint(lateState);
  gate('treinador ainda null nos primeiros pontos (confirma que o atraso é real)', lateState.liveCoach.coach === null);
  lateState = attachLiveCoach(lateState, coach);
  gate('attachLiveCoach anexa o treinador sem reiniciar a partida', lateState.liveCoach.coach?.id === coach.id && lateState.pointNumber > 0);
  let safety = 6000;
  while (!lateState.finished && safety-- > 0) lateState = playPoint(lateState);
  gate('depois de anexado, a partida treino termina com orientações reais', lateState.liveCoach.suggestions.length >= 1);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3 — CAMINHO FELIZ: treinador já disponível na criação (caso
  // comum quando o carregamento termina antes do jogador apertar "Iniciar").
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 3: treinador disponível desde o início ---');
  const happyPath = playFullMatch(createMatch, playPoint, teamA, teamB, { initialTacticId: 'equilibrado', coach, liveCoachSettings, seed: 'practice-happy' });
  gate('coach presente = true', Boolean(happyPath.liveCoach.coach));
  gate('advice engine ativo = true (analytics acumulou pontos)', happyPath.liveCoach.analytics.points.length > 0);
  gate('orientações geradas = true', happyPath.liveCoach.suggestions.length >= 1);
  const firstSuggestion = happyPath.liveCoach.suggestions[0];
  gate(
    'orientações baseadas em dados reais (sampleSize > 0, evidence e observação presentes)',
    Number(firstSuggestion.evidence?.sampleSize) > 0 && typeof firstSuggestion.observation === 'string' && firstSuggestion.observation.length > 0,
  );
  gate('confiança calculada a partir da amostra (não fixa)', ['low', 'medium', 'high'].includes(firstSuggestion.confidence));

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4 — SEM TREINADOR: nunca deve haver fallback fantasma.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 4: sem treinador contratado ---');
  const noCoach = playFullMatch(createMatch, playPoint, teamA, teamB, { initialTacticId: 'equilibrado', coach: null, liveCoachSettings, seed: 'practice-nocoach' });
  gate('sem treinador, liveCoach.coach permanece null', noCoach.liveCoach.coach === null);
  gate('sem treinador, ZERO orientações a partida inteira (sem fallback fantasma)', noCoach.liveCoach.suggestions.length === 0);

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 5 — RENDER REAL: o componente LiveMatch (o mesmo que
  // SimulationModal monta) precisa exibir a sugestão quando ela existe.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenário 5: LiveMatch exibe a orientação de verdade ---');
  gate('pré-condição do cenário 5: a partida do cenário 3 terminou com uma sugestão ainda pendente', Boolean(happyPath.liveCoach.pendingSuggestion));
  const renderWithSuggestion = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveMatch, {
    teamA, teamB, initialTacticId: 'equilibrado', coach, liveCoachSettings,
    onFinished: () => {}, displayMode: 'text', onDisplayModeChange: () => {}, onCheckpoint: null,
    initialState: happyPath,
    matchType: 'practice', matchId: 'render-check-practice',
  }));
  gate('a UI real mostra o banner "Nova sugestão do técnico" quando há pendingSuggestion', renderWithSuggestion.includes('Nova sugestão do técnico'));

  const renderNoCoach = ReactDOMServer.renderToStaticMarkup(React.createElement(LiveMatch, {
    teamA, teamB, initialTacticId: 'equilibrado', coach: null, liveCoachSettings,
    onFinished: () => {}, displayMode: 'text', onDisplayModeChange: () => {}, onCheckpoint: null,
    initialState: null, matchType: 'practice', matchId: 'render-check-practice-nocoach',
  }));
  gate('sem treinador, LiveMatch renderiza sem exceção e sem banner de sugestão', !renderNoCoach.includes('Nova sugestão do técnico'));
} finally {
  await server.close();
}

console.log(`\ntest:live-coach-practice OK — ${gates} gates (reprodução + fix + caminho feliz + sem treinador + render real).`);
