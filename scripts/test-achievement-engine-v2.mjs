// Fase 12 — motor de conquistas 2.0 (docs/ACHIEVEMENTS_2_0.md, Parte C).
// Prova: unlock real, progresso correto, idempotência (evento repetido,
// save/load, reload nunca re-concedem), recompensa concedida exatamente
// uma vez, reconciliação de save antigo (Parte 33-36: registra sem
// recompensa quando reconciliation:true).
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
  // Nota de infraestrutura (não é lógica de conquistas): achievementsData.js
  // agora importa padel.js (ATTRIBUTES, para attribute_key) — carregar esse
  // grafo de módulos DEPOIS de runtime.js/localGameClient.js expõe uma
  // dependência circular pré-existente em CareerEntityRepository.js (captura
  // gameRepository como default de construtor, sensível à ordem de
  // avaliação de módulos). Carregar achievementsData.js/achievementEngine.js
  // ANTES do setup de carreira evita o problema — mesma ordem já usada por
  // scripts/test-missions-achievements-unification.mjs.
  const { syncPlayerAchievements, evaluateAchievements, getAchievementProgress } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { ACHIEVEMENT_CATALOG } = await server.ssrLoadModule('/src/lib/achievementsData.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-achievement-engine', name: 'QA Achievement Engine' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-achievement-engine', sport_name: 'QA Athlete', career_date: '2026-06-01', coins: 500, xp: 0,
    tournaments_played: 1, tournaments_won: 1,
  });

  // ── 1) Progresso correto para um trigger simples (join_tournament) ──────
  const joinRow = getAchievementProgress(ACHIEVEMENT_CATALOG.find((a) => a.trigger_type === 'join_tournament' && a.threshold === 1), profile, {});
  gate('getAchievementProgress: join_tournament (threshold 1) com tournaments_played=1 está desbloqueado', joinRow.evaluable && joinRow.unlocked);

  // ── 2) Unlock real via syncPlayerAchievements ────────────────────────────
  const beforeCoins = profile.coins;
  const beforeXp = profile.xp;
  let sync = await syncPlayerAchievements(profile, {}, { localGame });
  profile = sync.profile;
  gate('syncPlayerAchievements desbloqueia "Estreia em Torneios" (join_tournament≥1)', sync.unlocked.some((a) => a.trigger_type === 'join_tournament' && a.threshold === 1));
  gate('Recompensa foi concedida (coins/xp aumentaram)', profile.coins > beforeCoins || profile.xp > beforeXp);
  const unlockedRow = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id }).then((rows) => rows.find((r) => r.achievement_id === sync.unlocked.find((a) => a.trigger_type === 'join_tournament' && a.threshold === 1).id));
  gate('PlayerAchievement criado com reconciled:false (desbloqueio ao vivo)', unlockedRow?.reconciled === false);

  // ── 3) Idempotência: evento repetido não re-concede ──────────────────────
  const coinsAfterFirst = profile.coins;
  const xpAfterFirst = profile.xp;
  sync = await syncPlayerAchievements(profile, {}, { localGame });
  profile = sync.profile;
  gate('Reprocessar o mesmo estado não desbloqueia de novo (idempotência)', sync.unlocked.length === 0);
  gate('Coins inalterados após reprocessamento', profile.coins === coinsAfterFirst);
  gate('XP inalterado após reprocessamento', profile.xp === xpAfterFirst);

  // ── 4) Save/load: reabrir a carreira não re-concede ──────────────────────
  const reloaded = await localGame.entities.PlayerProfile.filter({ id: profile.id }).then((rows) => rows[0]);
  const syncAfterReload = await syncPlayerAchievements(reloaded, {}, { localGame });
  gate('Reload/reabrir a carreira: zero nova recompensa', syncAfterReload.unlocked.length === 0 && syncAfterReload.profile.coins === coinsAfterFirst);

  // ── 5) Reconciliação de save antigo: registra SEM recompensa ────────────
  // Reaproveita o MESMO profile (memória: test_playerprofile_single_row —
  // este backend de teste só suporta 1 PlayerProfile por carreira; criar um
  // segundo faz campos vazarem entre os dois).
  let freshProfile = await localGame.entities.PlayerProfile.update(profile.id, { coins: 1000, xp: 500, tournaments_won: 3 });
  const beforeReconcileCoins = freshProfile.coins;
  const beforeReconcileXp = freshProfile.xp;
  const reconcileSync = await syncPlayerAchievements(freshProfile, {}, { localGame, reconciliation: true });
  freshProfile = reconcileSync.profile;
  gate('Reconciliação desbloqueia "Tricampeão" (estado já prova a conquista)', reconcileSync.unlocked.some((a) => a.trigger_type === 'win_tournament' && a.threshold === 3));
  gate('Reconciliação NÃO concede recompensa (Parte 35 — não é possível provar que nunca foi recebida)', freshProfile.coins === beforeReconcileCoins && freshProfile.xp === beforeReconcileXp);
  const reconciledRow = await localGame.entities.PlayerAchievement.filter({ profile_id: freshProfile.id }).then((rows) => rows.find((r) => r.achievement_id === reconcileSync.unlocked.find((a) => a.trigger_type === 'win_tournament' && a.threshold === 3).id));
  gate('PlayerAchievement da reconciliação fica marcado reconciled:true', reconciledRow?.reconciled === true);
  gate('PlayerAchievement da reconciliação fica marcado is_new:false (sem notificação)', reconciledRow?.is_new === false);

  // Reconciliar de novo (idempotência também vale para reconciliação)
  const secondReconcile = await syncPlayerAchievements(freshProfile, {}, { localGame, reconciliation: true });
  gate('Reconciliar duas vezes não duplica nem re-concede nada', secondReconcile.unlocked.length === 0);

  // ── 6) evaluateAchievements não quebra com contexto vazio ───────────────
  const rows = evaluateAchievements(profile, {});
  gate('evaluateAchievements roda sem exceção mesmo sem context assíncrono', Array.isArray(rows) && rows.length > 0);

  console.log(`\n${gates} gates executados, todos PASS — Achievement Engine 2.0 (unlock, idempotência, reconciliação).`);
} finally {
  await server.close();
}
