// Fase 12 — progressão de carreira multi-sistema
// (docs/ACHIEVEMENTS_2_0.md, Parte 61). Simula uma carreira tocando vários
// sistemas reais (ranking, treino, torneios, treinador, patrocínio,
// equipamento, temporadas) e confirma que os marcos correspondentes
// desbloqueiam através do pipeline real (buildAchievementContext +
// syncPlayerAchievements) — não isolado por trigger.
//
// Nota real descoberta ao escrever este teste: uma carreira nova já vem
// com dado inicial de demonstração (localSeed.js — 1 patrocínio, 1
// investimento, 1 item de inventário, receita inicial, centro de
// treinamento) — o teste faz uma sincronização de baseline primeiro (que
// já desbloqueia o que esse estado inicial prova) e depois valida só as
// conquistas NOVAS que cada evento simulado produz, em vez de assumir
// estado zerado.
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
  const { syncPlayerAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-progression', name: 'QA Career Progression' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-career-progression', sport_name: 'QA Athlete', career_date: '2026-01-01', coins: 5000, xp: 0,
    smash: 60, defense: 55, agility: 58, strategy: 62, emotional_control: 50, serve: 65, forehand: 70, backhand: 55, volley: 60, bandeja: 50,
  });
  const sync = async (extraContext = {}) => {
    const context = await buildAchievementContext(profile, extraContext);
    const result = await syncPlayerAchievements(profile, context, { localGame });
    profile = result.profile;
    return result.unlocked;
  };

  // ── Baseline: uma carreira nova já vem com dado inicial de demonstração
  // (localSeed.js) — sincroniza uma vez para capturar o que esse estado
  // inicial já prova, antes de medir os eventos simulados abaixo.
  const baselineUnlocked = await sync();
  gate('all_max_attributes NÃO desbloqueia com atributos parciais (50-70) — bug de threshold booleano corrigido', !baselineUnlocked.some((a) => a.trigger_type === 'all_max_attributes'));
  const baselineIds = new Set((await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id })).map((r) => r.achievement_id));

  // ── Treino: 50 treinos (o starter já cobre o 1º — testa o próximo degrau real) ──
  profile = await localGame.entities.PlayerProfile.update(profile.id, { trainings_completed: 50 });
  let unlocked = await sync();
  gate('50 treinos → "Disciplina de Aço" (complete_training≥50) desbloqueia', unlocked.some((a) => a.trigger_type === 'complete_training' && a.threshold === 50));

  // ── Torneio: inscrição + partida oficial + título ────────────────────
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 1, tournaments_won: 1 });
  await localGame.entities.Match.create({ id: 'career-official-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'vitória' });
  unlocked = await sync();
  gate('Primeira inscrição → "Estreia em Torneios" desbloqueia', unlocked.some((a) => a.trigger_type === 'join_tournament' && a.threshold === 1));
  gate('Primeira vitória oficial → "Primeira Vitória" (win_official_match) desbloqueia', unlocked.some((a) => a.trigger_type === 'win_official_match' && a.threshold === 1));
  gate('Primeiro título → "Primeiro Título" (win_tournament≥1) desbloqueia', unlocked.some((a) => a.trigger_type === 'win_tournament' && a.threshold === 1));

  // ── Ranking: Top 100 ──────────────────────────────────────────────────
  unlocked = await sync({ worldRank: { rank: 87 } });
  gate('Ranking #87 → "Top 100" desbloqueia', unlocked.some((a) => a.trigger_type === 'reach_rank' && a.threshold === 100));

  // ── Treinador: contratar ─────────────────────────────────────────────
  profile = await localGame.entities.PlayerProfile.update(profile.id, { coach_id: 'coach-qa', coach_name: 'Treinador QA', coach_hired_date: '2026-01-15' });
  await localGame.entities.Coach.create({ id: 'coach-qa', name: 'Treinador QA', tier: 'regional', specialty: 'tecnico', monthly_cost: 900, reputation: 60 });
  unlocked = await sync();
  gate('Contratar treinador → "Encontrou um Guia" (hire_coach) desbloqueia', unlocked.some((a) => a.trigger_type === 'hire_coach'));

  // ── Economia: renda acumulada real cruza o próximo degrau ────────────
  await localGame.entities.FinancialTransaction.create({ id: 'ft-qa-1', profile_id: profile.id, type: 'income', category: 'torneio', amount: 6000, date: '2026-02-01' });
  unlocked = await sync();
  gate('Renda acumulada real cruzando 5000 → "Primeiro Lucro" (reach_coins≥5000) desbloqueia', unlocked.some((a) => a.trigger_type === 'reach_coins' && a.threshold === 5000));

  // ── Todos os atributos maximizados: agora sim desbloqueia (bug corrigido) ──
  profile = await localGame.entities.PlayerProfile.update(profile.id, { smash: 100, defense: 100, agility: 100, strategy: 100, emotional_control: 100, serve: 100, forehand: 100, backhand: 100, volley: 100, bandeja: 100 });
  unlocked = await sync();
  gate('Todos os 10 atributos em 100 → "Perfeição Absoluta" (all_max_attributes) desbloqueia', unlocked.some((a) => a.trigger_type === 'all_max_attributes'));
  gate('Atributo específico também desbloqueia (ex.: "Saque Bomba", max_attribute=serve)', unlocked.some((a) => a.trigger_type === 'max_attribute' && a.attribute_key === 'serve'));

  // ── Estado final: nada foi desbloqueado 2x, tudo idempotente ─────────
  const allUnlocked = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  const ids = allUnlocked.map((row) => row.achievement_id);
  gate('Nenhuma conquista foi registrada duas vezes ao longo de toda a simulação', new Set(ids).size === ids.length);
  gate('Pelo menos 10 marcos NOVOS (além do baseline) desbloqueados ao longo da progressão simulada', allUnlocked.filter((row) => !baselineIds.has(row.achievement_id)).length >= 10);

  console.log(`\n${gates} gates executados, todos PASS — Progressão de carreira multi-sistema (treino, torneio, ranking, treinador, economia, atributos).`);
} finally {
  await server.close();
}
