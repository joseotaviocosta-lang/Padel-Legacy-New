// Fase 12 — conquistas de partida oficial (docs/ACHIEVEMENTS_2_0.md,
// Parte 6/7). Gate obrigatório do briefing: partida de TREINO nunca conta
// para conquista de partida oficial; só Match com competition_type:
// 'tournament' && is_official:true conta, e result:'vitória'/'derrota'
// decide play/win/lose corretamente. Também prova beat_top10/beat_rank1
// via o novo campo Match.opponent_rank.
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
  // (ver memória test_playerprofile_single_row — dependência circular
  // sensível à ordem em CareerEntityRepository.js).
  const { evaluateAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-official-match-achievements', name: 'QA Official Match Achievements' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-official-match-achievements', sport_name: 'QA Athlete', career_date: '2026-06-01',
  });

  // ── 1) Só partida de TREINO: zero progresso em conquistas oficiais ──────
  await localGame.entities.Match.create({ id: 'practice-1', profile_id: profile.id, competition_type: 'practice', is_official: false, is_tournament: false, result: 'vitória' });
  await localGame.entities.Match.create({ id: 'practice-2', profile_id: profile.id, competition_type: 'practice', is_official: false, is_tournament: false, result: 'derrota' });
  let context = await buildAchievementContext(profile, {});
  gate('BUG-CLASSE BLOQUEADO: 2 partidas de treino → played_official continua 0', context.officialMatches.played === 0);
  gate('BUG-CLASSE BLOQUEADO: partida de treino vencida NÃO conta como vitória oficial', context.officialMatches.won === 0);

  let rows = evaluateAchievements(profile, context);
  const firstStep = rows.find((r) => r.achievement.trigger_type === 'play_official_match' && r.achievement.threshold === 1);
  const firstWin = rows.find((r) => r.achievement.trigger_type === 'win_official_match' && r.achievement.threshold === 1);
  gate('"Primeiro Passo" (play_official_match≥1) continua bloqueada só com partida de treino', firstStep.evaluable && !firstStep.unlocked);
  gate('"Primeira Vitória" (win_official_match≥1) continua bloqueada só com partida de treino', firstWin.evaluable && !firstWin.unlocked);

  // ── 2) Partida OFICIAL de torneio: progresso real ────────────────────────
  await localGame.entities.Match.create({ id: 'official-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'vitória', opponent_rank: 42 });
  context = await buildAchievementContext(profile, {});
  gate('1 partida oficial → played_official = 1 (a de treino não conta junto)', context.officialMatches.played === 1);
  gate('1 vitória oficial → won_official = 1', context.officialMatches.won === 1);

  rows = evaluateAchievements(profile, context);
  gate('"Primeiro Passo" desbloqueia com a partida oficial', rows.find((r) => r.achievement.trigger_type === 'play_official_match' && r.achievement.threshold === 1).unlocked);
  gate('"Primeira Vitória" desbloqueia com a partida oficial vencida', rows.find((r) => r.achievement.trigger_type === 'win_official_match' && r.achievement.threshold === 1).unlocked);

  // ── 3) Derrota oficial: play avança, win não ─────────────────────────────
  await localGame.entities.Match.create({ id: 'official-2', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'derrota', opponent_rank: 5 });
  context = await buildAchievementContext(profile, {});
  gate('Derrota oficial soma em played_official (2)', context.officialMatches.played === 2);
  gate('Derrota oficial NÃO soma em won_official (continua 1)', context.officialMatches.won === 1);

  // ── 4) beat_top10/beat_rank1: só quando VENCE contra rank alto ───────────
  gate('Derrota contra Top 5 NÃO conta como "venceu Top 10" (perdeu, não venceu)', context.officialMatches.beatTop10 === false);
  await localGame.entities.Match.create({ id: 'official-3', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'vitória', opponent_rank: 3 });
  context = await buildAchievementContext(profile, {});
  gate('Vitória contra oponente rank 3 → beat_top10 = true', context.officialMatches.beatTop10 === true);
  gate('Vitória contra oponente rank 3 (não #1) → beat_rank1 continua false', context.officialMatches.beatRank1 === false);
  rows = evaluateAchievements(profile, context);
  gate('"Carrasco de Lendas" (beat_top10) desbloqueia', rows.find((r) => r.achievement.trigger_type === 'beat_top10').unlocked);

  await localGame.entities.Match.create({ id: 'official-4', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'vitória', opponent_rank: 1 });
  context = await buildAchievementContext(profile, {});
  gate('Vitória contra oponente rank 1 → beat_rank1 = true', context.officialMatches.beatRank1 === true);
  rows = evaluateAchievements(profile, context);
  gate('"Destruidor de #1" (beat_rank1) desbloqueia', rows.find((r) => r.achievement.trigger_type === 'beat_rank1').unlocked);

  // ── 5) Partida antiga sem opponent_rank (save pré-Fase 12): não quebra ──
  await localGame.entities.Match.create({ id: 'legacy-official', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: 'vitória' });
  context = await buildAchievementContext(profile, {});
  gate('Partida oficial antiga (sem opponent_rank) soma em played/won sem quebrar', context.officialMatches.played === 5 && context.officialMatches.won === 4);

  console.log(`\n${gates} gates executados, todos PASS — Conquistas de partida oficial (treino nunca conta, vitória/derrota corretas, beat_top10/beat_rank1 via opponent_rank).`);
} finally {
  await server.close();
}
