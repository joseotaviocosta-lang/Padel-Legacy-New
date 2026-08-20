// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 1/17).
//
// Auditoria do CORE LOOP pedido pela Parte 1: JOGAR/TREINAR → EVOLUIR →
// RESULTADOS → SUBIR RANKING → REPUTAÇÃO/VISIBILIDADE → OPORTUNIDADES →
// TORNEIOS MAIORES → MARCOS → LEGADO. Os outros 5 testes novos desta fase
// (career-stage-progression, ranking-milestone-ladder, career-opportunity-
// progression, career-long-term-goals, career-legacy-integrity) já provam
// cada SETA isoladamente. Este teste prova que elas encadeiam de ponta a
// ponta numa ÚNICA progressão real e contínua — não unidades isoladas.
//
// Sequência simulada com o pipeline real (CareerManager + Match real +
// syncPlayerAchievements + achievementContext, sem mocks das etapas
// críticas): um atleta iniciante evolui level/rank/reputação através de
// vitórias oficiais reais, e a cada passo verificamos que a consequência
// downstream realmente mudou — nunca um número que sobe sem efeito
// (Parte 0, item 5: "sistemas que produzem números mas não consequências").
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { findNextRelevantAchievements, getCareerStageLabel, CAREER_STAGE_LABELS } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { syncPlayerAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { buildCareerTimeline } = await server.ssrLoadModule('/src/lib/careerStory.js');
  const { buildCoachMarket } = await server.ssrLoadModule('/src/lib/coaches.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-depth', name: 'QA Core Loop' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── Passo 0: atleta iniciante real (JOGAR/TREINAR ainda não começou) ────────
  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-depth', sport_name: 'QA Core Loop Athlete', birth_date: '2008-01-11', career_date: '2026-01-11',
    career_level: 3, coach_id: null, coach_hired_date: null,
    smash: 35, defense: 35, agility: 35, strategy: 35, emotional_control: 35, serve: 35, forehand: 35, backhand: 35, volley: 35, bandeja: 35,
  });
  const stage0Context = await buildAchievementContext(profile, { worldRank: { rank: 950 } });
  const stage0Label = getCareerStageLabel(profile, stage0Context);
  gate('Passo 0: atleta novo começa no estágio "Início" (rank ruim, nível baixo)', stage0Label === CAREER_STAGE_LABELS.beginner);
  const stage0Next = findNextRelevantAchievements(profile, stage0Context, { limit: 10 }).find((i) => i.achievement.trigger_type === 'reach_rank');
  gate('Passo 0: com rank #950, a meta de ranking visível é "Top 500" (degrau mais próximo, nunca um degrau distante)', stage0Next?.achievement.threshold === 500);

  // ── Passo 1: RESULTADOS reais — 3 vitórias oficiais de torneio ──────────────
  for (let i = 0; i < 3; i += 1) {
    await localGame.entities.Match.create({
      id: `qa-depth-match-${i}`, profile_id: profile.id, competition_type: 'tournament', is_official: true,
      result: 'vitória', date: `2026-0${i + 2}-01`, tournament_name: `Torneio QA ${i + 1}`,
    });
  }
  const step1Context = await buildAchievementContext(profile, { worldRank: { rank: 950 } });
  const step1Sync = await syncPlayerAchievements(profile, step1Context, { localGame });
  profile = step1Sync.profile;
  gate('Passo 1 (RESULTADOS): 3 vitórias oficiais desbloqueiam pelo menos 1 conquista real (play_official_match/win_official_match)', step1Sync.unlocked.some((a) => ['play_official_match', 'win_official_match'].includes(a.trigger_type)));
  gate('Passo 1: a recompensa de XP/coins da conquista realmente chegou ao profile (consequência real, não só um registro)', Number(profile.xp) > 0 || Number(profile.coins) > 0);

  // ── Passo 2: SUBIR RANKING — o atleta melhora de posição no circuito ────────
  const step2Context = await buildAchievementContext(profile, { worldRank: { rank: 420 } }); // cruzou Top 500
  const step2Sync = await syncPlayerAchievements(profile, step2Context, { localGame });
  profile = step2Sync.profile;
  gate('Passo 2 (SUBIR RANKING): cruzar de #950 pra #420 desbloqueia "Top 500" de verdade (não só um número — vira PlayerAchievement real)', step2Sync.unlocked.some((a) => a.trigger_type === 'reach_rank' && a.threshold === 500));
  const step2Next = findNextRelevantAchievements(profile, step2Context, { limit: 10 }).find((i) => i.achievement.trigger_type === 'reach_rank');
  gate('Passo 2: a próxima meta de ranking avança para "Top 250" (a escada anda junto com o rank real, nunca trava em Top 500)', step2Next?.achievement.threshold === 250);

  // ── Passo 3: REPUTAÇÃO/VISIBILIDADE + ESTÁGIO sobem com o progresso real ────
  profile = await localGame.entities.PlayerProfile.update(profile.id, { career_level: 14, reputation: 20 });
  const step3Context = await buildAchievementContext(profile, { worldRank: { rank: 420 } });
  const step3StageId = (await server.ssrLoadModule('/src/lib/achievementRelevance.js')).getCareerRelevanceStage(profile, step3Context);
  gate('Passo 3 (ESTÁGIO): level 14 + rank #420 + reputação 20 avança o estágio pra "professional" (Profissional)', step3StageId === 'professional');
  gate('Passo 3: o rótulo em português muda junto (nunca fica preso em "Início" com o resto já tendo avançado)', getCareerStageLabel(profile, step3Context) === 'Profissional');

  // ── Passo 4: OPORTUNIDADES — mercado de treinadores reflete o novo estágio ──
  const coachCatalog = [
    { id: 'coach-basico', tier: 'iniciante', overall: 50, reputation: 50, monthly_cost: 500, demands: { min_level: 'Iniciante' } },
    { id: 'coach-avancado', tier: 'avancado', overall: 82, reputation: 82, monthly_cost: 3000, demands: { min_level: 'Avançado' } },
  ];
  const marketBefore = buildCoachMarket(coachCatalog, { career_level: 3, ranking_position: 950, reputation: 0, level: 'Iniciante' });
  const marketAfter = buildCoachMarket(coachCatalog, { ...profile, level: 'Avançado' });
  gate('Passo 4 (OPORTUNIDADES): cap do mercado de treinadores cresce depois da evolução de estágio (professional > beginner)', marketAfter.cap > marketBefore.cap);

  // ── Passo 5: LEGADO — os eventos reais entram na timeline de carreira ───────
  // buildCareerTimeline (diferente de achievementContext) lê profile.ranking_position
  // diretamente, sem context — persiste o rank real do Passo 2 no profile,
  // como uma recomputação de ranking real faria no jogo de verdade.
  profile = await localGame.entities.PlayerProfile.update(profile.id, { ranking_position: 420 });
  const allMatches = await localGame.entities.Match.filter({ profile_id: profile.id });
  const timeline = buildCareerTimeline(profile, allMatches);
  gate('Passo 5 (LEGADO): a timeline registra "Primeira partida oficial" a partir das partidas reais criadas no Passo 1', timeline.some((e) => e.type === 'match'));
  gate('Passo 5: a timeline registra "Primeira vitória" (consequência visível do resultado real, não um número solto)', timeline.some((e) => e.type === 'win'));
  gate('Passo 5: a timeline registra a entrada no Top 500 (marco de ranking real do Passo 2)', timeline.some((e) => e.type === 'ranking' && e.title.includes('500')));

  // ── Sanidade final: nenhuma conquista foi concedida duas vezes ao longo da cadeia ──
  const allUnlocked = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  const ids = allUnlocked.map((row) => row.achievement_id);
  gate('Cadeia completa do core loop: nenhuma conquista foi registrada duas vezes (ids únicos)', new Set(ids).size === ids.length);

  console.log(`\n${gates} gates executados, todos PASS — Core loop de carreira ponta a ponta (Fase 13, Parte 1): jogar → resultados → ranking → estágio → oportunidades → legado, cada seta com consequência real e verificada.`);
} finally {
  await server.close();
}
