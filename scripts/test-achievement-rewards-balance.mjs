// Fase 12 — impacto econômico das recompensas de conquista
// (docs/ACHIEVEMENTS_2_0.md, Parte 37-40). Não recalibra nada
// preemptivamente — só mede e reporta. Simula um perfil cruzando vários
// marcos de uma vez (o pior caso realista: reconciliação de um save já
// avançado) e reporta a recompensa total em coins/XP, comparando contra
// referências reais já existentes no jogo (custo de treinador, receita
// mensal típica).
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
  const { evaluateAchievements, presentableAchievements, EVALUABLE_TRIGGER_TYPES } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-rewards-balance', name: 'QA Rewards Balance' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();
  await localGame.entities.PlayerProfile.create({ id: 'qa-rewards-balance', sport_name: 'X', career_date: '2026-01-01' });

  // ── 1) Auditoria: recompensa de cada trigger funcional vs. referências reais ──
  const functional = presentableAchievements().filter((a) => EVALUABLE_TRIGGER_TYPES.has(a.trigger_type));
  const totalXp = functional.reduce((sum, a) => sum + (Number(a.xp_reward) || 0), 0);
  const totalCoins = functional.reduce((sum, a) => sum + (Number(a.coins_reward) || 0), 0);
  const maxSingleReward = Math.max(...functional.map((a) => Number(a.coins_reward) || 0));
  console.log(`(info) ${functional.length} conquistas funcionais: soma total ${totalXp.toLocaleString('pt-BR')} XP / ${totalCoins.toLocaleString('pt-BR')} moedas se TODAS forem desbloqueadas de uma vez.`);
  console.log(`(info) Maior recompensa única (uma conquista): ${maxSingleReward.toLocaleString('pt-BR')} moedas.`);

  // A preocupação real da Parte 38 é conquista de COMEÇO de carreira
  // pagando demais (ex.: "compre tudo com uma conquista fácil") — não
  // conquistas lendárias/extremas de fim de carreira (Número 1 do Mundo,
  // maximizar 10 atributos, 10 anos de carreira — 100.000 moedas ali é
  // proporcional ao esforço, não desbalanceamento). Verificado
  // separadamente por dificuldade.
  const REALISTIC_MONTHLY_COACH_COST = 2000;
  const earlyTier = functional.filter((a) => ['facil', 'medio'].includes(a.difficulty));
  const maxEarlyReward = Math.max(...earlyTier.map((a) => Number(a.coins_reward) || 0));
  console.log(`(info) Maior recompensa entre conquistas fácil/médio (começo/meio de carreira): ${maxEarlyReward.toLocaleString('pt-BR')} moedas.`);
  gate('Nenhuma conquista fácil/médio paga, sozinha, mais que ~4 meses de um treinador caro (não financia o começo da carreira sozinha)', maxEarlyReward < REALISTIC_MONTHLY_COACH_COST * 4);
  const legendaryCount = functional.filter((a) => ['lendario', 'extremo'].includes(a.difficulty) && (Number(a.coins_reward) || 0) >= 30000).length;
  console.log(`(info) ${legendaryCount} conquistas lendário/extremo pagam >= 30.000 moedas — proporcional ao esforço de fim de carreira, documentado (não recalibrado sem evidência de que seja um problema real).`);

  // ── 2) Simulação de reconciliação: perfil "avançado" cruza vários marcos de uma vez ──
  let profile = await localGame.entities.PlayerProfile.update('qa-rewards-balance', {
    coins: 10000, xp: 5000, tournaments_played: 30, tournaments_won: 5, trainings_completed: 120,
    coach_id: 'coach-x', coach_hired_date: '2026-01-01',
  });
  const { syncPlayerAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  await localGame.entities.Coach.create({ id: 'coach-x', name: 'X', tier: 'regional', specialty: 'tecnico', monthly_cost: 900 });
  for (let i = 0; i < 6; i += 1) {
    await localGame.entities.Match.create({ id: `reward-match-${i}`, profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: i < 4 ? 'vitória' : 'derrota' });
  }
  const beforeCoins = profile.coins;
  const context = await buildAchievementContext(profile, { worldRank: { rank: 240 } });
  const sync = await syncPlayerAchievements(profile, context, { localGame, reconciliation: true });
  profile = sync.profile;
  gate('Reconciliação de perfil avançado desbloqueia múltiplos marcos de uma vez', sync.unlocked.length >= 5);
  gate('Reconciliação NÃO altera coins (Parte 35 — sem recompensa retroativa)', profile.coins === beforeCoins);

  // ── 3) % da renda proveniente de conquistas — desbloqueio AO VIVO (o único que paga) ──
  const liveRewardTotal = sync.unlocked.reduce((sum, a) => sum + (Number(a.coins_reward) || 0), 0);
  const typicalMonthlyIncome = 3000; // referência realista de receita mensal média já usada no jogo (prêmios+patrocínio)
  const monthsOfIncomeEquivalent = liveRewardTotal / typicalMonthlyIncome;
  console.log(`(info) Se esses ${sync.unlocked.length} marcos fossem AO VIVO (não reconciliação), pagariam ${liveRewardTotal.toLocaleString('pt-BR')} moedas — equivalente a ~${monthsOfIncomeEquivalent.toFixed(1)} meses de receita típica.`);
  gate('Recompensa combinada de marcos simultâneos fica em faixa razoável (< 12 meses de receita típica) — não domina a economia', monthsOfIncomeEquivalent < 12);

  console.log(`\n${gates} gates executados, todos PASS — Impacto econômico das recompensas de conquista (medido, não pressuposto).`);
} finally {
  await server.close();
}
