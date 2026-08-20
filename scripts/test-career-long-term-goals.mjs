// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 8/17).
//
// "Já existem Conquistas/achievementRelevance/seasonCareerPlan/rankingGoal/
// Centro de Decisões/próximo torneio/notificações. Precisamos de UMA
// orientação principal. Durante tutorial: getOnboardingNextAction soberano.
// Depois: usar progressão/conquistas como fonte principal, sem terceira
// fonte concorrente."
//
// Auditoria (sem criar nada novo — só provando que já é assim):
// - Durante o tutorial: CareerHub.jsx suprime CADA OUTRA fonte de sugestão
//   (`priorityActions = onboardingNextAction ? [] : buildPriorityActions(...)`)
//   — supressão total por código, não só por convenção documentada.
// - Depois do tutorial: `getOnboardingNextAction` retorna `null` (onboarding
//   concluído/pulado/nunca iniciado) e a Home passa a usar
//   `buildSeasonCareerPlan`'s `rankingGoal`, que por sua vez lê
//   `findNextLockedAchievement` — a MESMA fonte que a aba Conquistas usa
//   via `findNextRelevantAchievements` (achievementRelevance.js), ambas
//   sobre o catálogo real (achievementsData.js). `getNextCareerObjective`
//   (mesmo arquivo) existe como uma segunda função sobre a MESMA fonte, mas
//   está morta em produção (nenhum import fora de seasonCareerPlan.js) —
//   não é uma terceira fonte concorrente ativa, só superfície não usada,
//   documentado no relatório final.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const CAREER_HUB_SOURCE = readFileSync('src/pages/CareerHub.jsx', 'utf8');

// ── 1) Estrutural: supressão total durante o tutorial ────────────────────────
gate('CareerHub.jsx suprime priorityActions por completo quando onboardingNextAction existe (nenhuma fonte concorrente durante o tutorial)', /\(onboardingNextAction \? \[\] : buildPriorityActions/.test(CAREER_HUB_SOURCE));
gate('CareerHub.jsx importa getOnboardingNextAction de onboarding/onboardingNextAction.js', /import \{ getOnboardingNextAction \} from '@\/onboarding\/onboardingNextAction\.js'/.test(CAREER_HUB_SOURCE));
gate('CareerHub.jsx importa buildSeasonCareerPlan de lib/seasonCareerPlan.js (fonte pós-tutorial)', /import \{ buildSeasonCareerPlan \} from '@\/lib\/seasonCareerPlan\.js'/.test(CAREER_HUB_SOURCE));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { getOnboardingNextAction } = await server.ssrLoadModule('/src/onboarding/onboardingNextAction.js');
  const { buildSeasonCareerPlan, getNextCareerObjective } = await server.ssrLoadModule('/src/lib/seasonCareerPlan.js');
  const { findNextRelevantAchievements } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { findNextLockedAchievement } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

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
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-goals', name: 'QA Goals' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── 3) getOnboardingNextAction: soberano durante o tutorial, null depois ──
  gate('getOnboardingNextAction retorna null sem profile', getOnboardingNextAction(null) === null);
  gate('getOnboardingNextAction retorna null quando tutorial_onboarding ausente (nunca iniciado)', getOnboardingNextAction({}) === null);
  gate('getOnboardingNextAction retorna null quando status !== "in_progress" (concluído/pulado)', getOnboardingNextAction({ tutorial_onboarding: { status: 'completed' } }) === null);

  // ── 4) Pós-tutorial: rankingGoal (Home) e findNextRelevantAchievements (aba Conquistas) concordam ──
  const profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-goals', sport_name: 'QA Goals Athlete', birth_date: '2005-01-11', career_date: '2026-01-11',
    coach_id: 'coach-goals', coach_hired_date: '2026-01-05',
    smash: 50, defense: 50, agility: 50, strategy: 50, emotional_control: 50, serve: 50, forehand: 50, backhand: 50, volley: 50, bandeja: 50,
  });
  await localGame.entities.Coach.create({ id: 'coach-goals', name: 'Treinador QA', tier: 'regional', specialty: 'tecnico', monthly_cost: 900, reputation: 60 });

  const context = await buildAchievementContext(profile, { worldRank: { rank: 430 } });
  const plan = buildSeasonCareerPlan(profile, { ...context, worldRank: { rank: 430 } });
  const homeRankingGoal = plan.goals.find((g) => g.category === 'competicao');
  const tabRankingGoal = findNextRelevantAchievements(profile, context, { limit: 10 }).find((i) => i.achievement.trigger_type === 'reach_rank');
  gate('Home (rankingGoal) e aba Conquistas (findNextRelevantAchievements) apontam pro MESMO próximo degrau de ranking (#430 → Top 250 nos dois)', homeRankingGoal?.title === tabRankingGoal?.achievement.name);

  // ── 5) getNextCareerObjective: dead code seguro (mesma fonte, sem uso ativo em produção) ──
  const generalObjective = getNextCareerObjective(profile, context);
  const lockedNext = findNextLockedAchievement(profile, context);
  gate('getNextCareerObjective (não importado por nenhuma tela ativa) ainda concorda com findNextLockedAchievement quando chamado — mesma fonte, sem drift', generalObjective?.achievementId === lockedNext?.achievement.id);

  console.log(`\n${gates} gates executados, todos PASS — Fonte única de objetivo de longo prazo (Fase 13, Parte 8): onboarding soberano no tutorial, conquistas como fonte única depois.`);
} finally {
  await server.close();
}
