// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 3/17).
//
// Polish 12.1 revelou que um iniciante podia receber "Top 100" cedo demais
// (a escada de reach_rank só tinha 5 degraus: 100/50/10/3/#1 — um salto
// grande demais entre o rank real de um novato, ~#900-#1000, e o primeiro
// degrau visível). Esta fase preencheu os degraus que faltavam no catálogo
// (achievementsData.js: Top 500/250/30/20/5, junto aos já existentes Top
// 100/50/10/3/#1) SEM tocar em achievementRelevance.js — a seleção "próximo
// degrau de cada escada" já comparava por `percent` (não pelo threshold
// cru), o que já resolve corretamente a direção invertida de reach_rank
// (Top 100 é MAIS fácil que Top 10, apesar do threshold menor).
//
// Este teste prova, com o pipeline real (CareerManager + achievementContext
// + achievementRelevance, sem mocks das etapas críticas), a ladder completa
// pedida pela Parte 17: os 9 exemplos numéricos do próprio briefing E os 9
// boundaries exatos — garantindo zero off-by-one nos dois sentidos.
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
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  // Fase 12: carregar módulos de conquista ANTES de runtime/localGameClient
  // (dependência circular sensível à ordem em CareerEntityRepository.js).
  const { findNextRelevantAchievements, CAREER_STAGE_LABELS, getCareerStageLabel } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { findNextLockedAchievement } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-ladder', name: 'QA Ladder' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-ladder', sport_name: 'QA Ladder Athlete', birth_date: '2005-01-11', career_date: '2026-01-11',
    coach_id: 'coach-ladder', coach_hired_date: '2026-01-05', partner_chemistry: 50,
    smash: 60, defense: 60, agility: 60, strategy: 60, emotional_control: 60, serve: 60, forehand: 60, backhand: 60, volley: 60, bandeja: 60,
  });
  await localGame.entities.Coach.create({ id: 'coach-ladder', name: 'Treinador QA', tier: 'international', specialty: 'tecnico', monthly_cost: 3000, reputation: 80 });

  async function nextRankGoal(rank) {
    const context = await buildAchievementContext(profile, { worldRank: { rank } });
    const items = findNextRelevantAchievements(profile, context, { limit: 10 });
    const rankItem = items.find((i) => i.achievement.trigger_type === 'reach_rank');
    return rankItem ? { name: rankItem.achievement.name, threshold: rankItem.achievement.threshold } : null;
  }

  // ── Parte 17: os 9 exemplos numéricos do próprio briefing ─────────────────
  const briefingExamples = [
    [912, 500], [430, 250], [180, 100], [72, 50], [41, 30], [24, 20], [13, 10], [7, 5], [3, 1],
  ];
  for (const [rank, expectedThreshold] of briefingExamples) {
    const goal = await nextRankGoal(rank);
    console.log(`(info) #${rank} -> ${goal ? `${goal.name} (limiar ${goal.threshold})` : '(nenhuma)'}`);
    gate(`#${rank} -> próximo degrau é o limiar ${expectedThreshold}`, goal?.threshold === expectedThreshold);
  }

  // ── Parte 17: boundaries exatos — rank == limiar já desbloqueia aquele degrau, próximo é o de cima ──
  // #5 -> "Top 3" (não #1): a conquista "Top 3" pré-existente foi mantida
  // (Parte 3 do briefing pede "não duplicar", não "remover a existente") e
  // fica entre Top 5 e #1 na escada real — confirmado na verificação manual
  // original desta mesma fase (rank #5 -> Top 3) antes deste teste existir.
  const boundaries = [
    [500, 250], [250, 100], [100, 50], [50, 30], [30, 20], [20, 10], [10, 5], [5, 3], [3, 1],
  ];
  for (const [rank, expectedThreshold] of boundaries) {
    const goal = await nextRankGoal(rank);
    console.log(`(info) boundary #${rank} -> ${goal ? `${goal.name} (limiar ${goal.threshold})` : '(nenhuma)'}`);
    gate(`boundary #${rank} (exatamente no limiar) -> próximo degrau é o limiar ${expectedThreshold}, não ${rank}`, goal?.threshold === expectedThreshold);
  }

  // ── Caso terminal: #1 já é o topo da ladder — nenhuma meta de ranking resta ──
  const topGoal = await nextRankGoal(1);
  console.log(`(info) boundary #1 -> ${topGoal ? `${topGoal.name}` : '(nenhuma meta de ranking — topo da ladder)'}`);
  gate('boundary #1 (topo da ladder) -> nenhuma conquista de reach_rank resta como meta', topGoal === null);

  // ── Regressão do brief de Polish 12.1 (Parte 17 pede "não duplicar"): #1000 também mapeia pro degrau Top 500 ──
  const goal1000 = await nextRankGoal(1000);
  gate('#1000 (fora de toda a ladder) -> ainda mapeia para Top 500 (primeiro degrau)', goal1000?.threshold === 500);

  // ── Sem off-by-one no sentido oposto: um rank 1 acima do limiar ainda vê aquele limiar como meta ──
  const justOutside = [[501, 500], [251, 250], [101, 100], [51, 50], [31, 30], [21, 20], [11, 10], [6, 5], [2, 1]];
  for (const [rank, expectedThreshold] of justOutside) {
    const goal = await nextRankGoal(rank);
    gate(`#${rank} (1 posição fora do limiar ${expectedThreshold}) -> ainda mostra o limiar ${expectedThreshold} como meta`, goal?.threshold === expectedThreshold);
  }

  // ── Parte 8: seasonCareerPlan.js's rankingGoal lê `findNextLockedAchievement`
  // (categoria 'carreira' + trigger 'reach_rank') — uma fonte DIFERENTE de
  // findNextRelevantAchievements, mas sobre o MESMO catálogo. Precisa
  // generalizar pra nova ladder de forma independente, senão a Home e a aba
  // Conquistas divergiriam sobre qual é "o próximo degrau" — exatamente a
  // duplicação de fontes que a Parte 8 do briefing pede pra evitar.
  const seasonPlanExamples = [[912, 500], [180, 100], [24, 20], [3, 1], [500, 250], [5, 3]];
  for (const [rank, expectedThreshold] of seasonPlanExamples) {
    const context = await buildAchievementContext(profile, { worldRank: { rank } });
    const next = findNextLockedAchievement(profile, context, { category: 'carreira', triggerType: 'reach_rank' });
    console.log(`(info) seasonCareerPlan rankingGoal #${rank} -> ${next ? `${next.achievement.name} (limiar ${next.achievement.threshold})` : '(nenhuma)'}`);
    gate(`seasonCareerPlan.rankingGoal: #${rank} -> mesmo degrau (${expectedThreshold}) que a aba Conquistas mostraria`, next?.achievement.threshold === expectedThreshold);
  }
  const topSeasonPlan = findNextLockedAchievement(profile, await buildAchievementContext(profile, { worldRank: { rank: 1 } }), { category: 'carreira', triggerType: 'reach_rank' });
  gate('seasonCareerPlan.rankingGoal: #1 (topo da ladder) -> nenhum degrau de ranking resta, cai no fallback "Defender a liderança"', topSeasonPlan === null);

  // ── Parte 2: rótulos de estágio de carreira derivados, sem novo campo persistido ──
  gate('CAREER_STAGE_LABELS cobre os 5 estágios de getCareerEconomyStage', ['beginner', 'regional', 'professional', 'international', 'elite'].every((k) => typeof CAREER_STAGE_LABELS[k] === 'string'));
  gate('CAREER_STAGE_LABELS usa os 5 nomes em português do briefing', ['Início', 'Ascensão', 'Profissional', 'Elite', 'Lenda'].every((label) => Object.values(CAREER_STAGE_LABELS).includes(label)));
  const lowRankStageLabel = getCareerStageLabel(profile, await buildAchievementContext(profile, { worldRank: { rank: 912 } }));
  console.log(`(info) rótulo de estágio para rank #912: ${lowRankStageLabel}`);
  gate('getCareerStageLabel retorna um rótulo string válido (nunca undefined/estágio cru em inglês)', typeof lowRankStageLabel === 'string' && Object.values(CAREER_STAGE_LABELS).includes(lowRankStageLabel));

  console.log(`\n${gates} gates executados, todos PASS — Ladder de milestones de ranking (Fase 13, Parte 3/17).`);
} finally {
  await server.close();
}
