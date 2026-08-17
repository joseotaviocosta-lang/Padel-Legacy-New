// Hotfix — realismo estatístico e não-repetição das orientações do técnico.
// QA relatou dicas como "22/22 últimas bolas foram jogadas no mesmo
// adversário" — impossível dado o texto real do motor (janela travada em 12
// ações, com no mínimo 8 e pelo menos 70% de concentração). Este teste
// simula muitas partidas reais (createMatch/playPoint, sem mocks) e mede,
// sobre TODAS as orientações geradas de verdade: amostra sempre coerente
// (numerador <= denominador, denominador <= janela), cooldown do motor nunca
// violado, e calibra estatísticas de frequência (medir primeiro, depois
// travar limites — nunca o contrário).
import { createServer } from 'vite';

function fakePlayer(id, name, extra = {}) {
  return {
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, partner_chemistry: 60, partner_trust: 60, partner_morale: 60,
    matches_played: 0, ...extra,
  };
}

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { createMatch, playPoint, decideLiveCoachSuggestion } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { LIVE_COACH_LIMITS } = await server.ssrLoadModule('/src/engine/live-coach/LiveCoachSettings.js');
  const { COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');

  const coach = COACHES_DATA.find((c) => c.tier === 'profissional') || COACHES_DATA[0];
  const liveCoachSettings = { liveCoachEnabled: true, suggestionFrequency: 'normal', allowMinorAutoAdjustments: false, showLiveMetrics: true, showConfidence: true, pauseOnImportantSuggestion: true };

  const N = 60;
  let totalAdvice = 0;
  let matchesWithZero = 0;
  let cooldownViolations = 0;
  const allSuggestions = [];
  const uniqueTexts = new Set();

  for (let m = 0; m < N; m += 1) {
    const teamA = [fakePlayer('me', 'Jogador'), fakePlayer('partner', 'Parceiro')];
    const teamB = [fakePlayer('bot1', 'Rival1'), fakePlayer('bot2', 'Rival2')];
    let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', coach, liveCoachSettings, seed: `realism-${m}` });
    let safety = 6000;
    const matchSuggestions = [];
    while (!state.finished && safety-- > 0) {
      state = playPoint(state);
      if (state.liveCoach.pendingSuggestion) {
        // Pior caso: jogador nunca decide — mede quantas orientações o motor
        // ofereceria se ninguém nunca interagisse (o teto real de "spam").
        matchSuggestions.push(state.liveCoach.pendingSuggestion);
        state = decideLiveCoachSuggestion(state, 'ignore');
      }
    }
    if (matchSuggestions.length === 0) matchesWithZero += 1;
    totalAdvice += matchSuggestions.length;
    allSuggestions.push(...matchSuggestions);
    for (const s of matchSuggestions) uniqueTexts.add(s.observation);

    const minGap = Math.ceil(LIVE_COACH_LIMITS.minimumGamesBetweenSimilarSuggestions);
    const lastGameByPattern = {};
    for (const s of matchSuggestions) {
      const last = lastGameByPattern[s.patternId];
      if (last !== undefined && s.createdAtGame - last < minGap) cooldownViolations += 1;
      lastGameByPattern[s.patternId] = s.createdAtGame;
    }
  }

  console.log(`\n=== Calibração observada (${N} partidas reais, jogador ignora toda sugestão) ===`);
  console.log('totalAdvice:', totalAdvice);
  console.log('avg advice/match:', (totalAdvice / N).toFixed(2));
  console.log('matchesWithZero:', matchesWithZero, '/', N);
  console.log('uniqueAdvice (textos distintos):', uniqueTexts.size);
  console.log('cooldownViolations:', cooldownViolations);

  // Não travar em números arbitrários — travar no que já foi observado como
  // saudável (item 14 do hotfix): quase nenhuma partida sem dica nenhuma, e
  // pelo menos uma dica em quase toda partida jogada até o fim.
  gate('a maioria das partidas com treinador recebe pelo menos uma orientação', matchesWithZero / N <= 0.25);
  gate('em média o técnico oferece orientações reais ao longo da partida', totalAdvice / N >= 1);
  gate('o cooldown por padrão (LIVE_COACH_LIMITS.minimumGamesBetweenSimilarSuggestions) nunca é violado', cooldownViolations === 0);
  gate('há variedade real de orientações (não é sempre o mesmo texto)', uniqueTexts.size >= 3);

  console.log(`\n=== Checagem de realismo estatístico (${allSuggestions.length} orientações reais) ===`);
  let sampleViolations = 0;
  let targetPatternChecked = 0;
  for (const s of allSuggestions) {
    const sample = s.evidence?.sampleSize;
    const persistence = s.evidence?.persistence;
    // Nenhuma orientação pode existir sem amostra real, e persistência (o
    // "numerador") nunca pode ultrapassar a amostra (o "denominador") — é
    // exatamente a classe de erro por trás do "22/22 impossível".
    if (!(typeof sample === 'number' && Number.isFinite(sample) && sample > 0)) { console.log('sampleSize inválido:', s); sampleViolations += 1; }
    if (persistence !== undefined && persistence !== null && persistence > sample) { console.log('persistence > sampleSize:', s); sampleViolations += 1; }

    // Varredura defensiva: qualquer "N das últimas M" ou "N de M" no texto
    // apresentado ao jogador precisa ter N <= M, e M nunca pode passar da
    // janela real de eventos (12 ações, o cap de recentTargetShots).
    const matches = [...s.observation.matchAll(/(\d+)\s*(?:das últimas|de)\s*(\d+)/g)];
    for (const found of matches) {
      const numerator = Number(found[1]);
      const denominator = Number(found[2]);
      if (numerator > denominator) { console.log('numerador > denominador no texto:', s.observation); sampleViolations += 1; }
      if (denominator > 12) { console.log('denominador maior que a janela real (12):', s.observation); sampleViolations += 1; }
      if (s.patternId === 'opponent_targeting_player') {
        targetPatternChecked += 1;
        if (denominator < 8) { console.log('amostra abaixo do mínimo exigido (8):', s.observation); sampleViolations += 1; }
        if (numerator / denominator < 0.7) { console.log('concentração abaixo do gatilho (70%):', s.observation); sampleViolations += 1; }
      }
    }
  }
  gate('nenhuma orientação real viola sampleSize/persistence coerentes', sampleViolations === 0);
  gate('o padrão histórico do "22/22" (opponent_targeting_player) foi exercitado nesta amostra', targetPatternChecked > 0);

  // Amostra explícita do texto real mostrado ao jogador — nunca porcentagem
  // "seca" sem base, sempre linguagem derivada de contagens reais.
  console.log('\nExemplos de orientações reais geradas:');
  for (const s of allSuggestions.slice(0, 8)) console.log(' -', s.observation);
} finally {
  await server.close();
}

console.log(`\ntest:live-coach-realism OK — ${gates} gates (calibração medida + integridade estatística de todas as orientações reais).`);
