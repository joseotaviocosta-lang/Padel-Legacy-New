// Fase 12 — reconciliação de save antigo (docs/ACHIEVEMENTS_2_0.md,
// Parte 33-36). Simula um save que já tinha ranking alto, títulos,
// treinador, dinheiro e temporadas ANTES da Fase 12 existir, abre pela
// primeira vez sob o novo motor, e confirma: desbloqueio correto por
// estado já provado; zero recompensa retroativa; idempotência (reabrir de
// novo não duplica nada); nada é revogado.
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
  await careerManager.createCareer({ id: 'career-save-migration', name: 'QA Save Migration (Old Save)' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  // ── Simula um save PRÉ-Fase 12: carreira avançada, achievements_v2_reconciled ausente ──
  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-old-save', sport_name: 'Veterano', career_date: '2027-03-01', coins: 45000, xp: 12000,
    tournaments_played: 40, tournaments_won: 8, trainings_completed: 200,
    coach_id: 'coach-old', coach_hired_date: '2026-06-01',
    // achievements_v2_reconciled NÃO está presente — exatamente como um
    // save real gravado antes desta fase existir.
  });
  await localGame.entities.Coach.create({ id: 'coach-old', name: 'Treinador Antigo', tier: 'profissional', specialty: 'estrategia', monthly_cost: 1800 });
  for (let i = 0; i < 8; i += 1) {
    await localGame.entities.Match.create({ id: `old-match-${i}`, profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, result: i < 6 ? 'vitória' : 'derrota' });
  }
  await localGame.entities.FinancialTransaction.create({ id: 'old-ft-1', profile_id: profile.id, type: 'income', category: 'torneio', amount: 60000, date: '2027-01-01' });
  // CLOUD-2: linha de conquista de um save PRÉ-Fase-12, explícita na fixture.
  // Antes o teste usava a linha de demonstração do seed
  // ('player-achievement-001'), que o build 9002 deixou de semear
  // (PlayerAchievement em NEVER_SEED_WITH_DEMO_DATA, achado 4 do playtest).
  // Formato de antes da Fase 12: sem `reconciled`, desbloqueada há tempos.
  const LEGACY_ROW = { id: 'legacy-player-achievement-1', profile_id: profile.id, achievement_id: 'achv-primeiro-treino', unlocked_date: '2026-02-10', career_date: '2026-02-10', is_new: false, progress: 1 };
  await localGame.entities.PlayerAchievement.create(LEGACY_ROW);
  const legacyBefore = (await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id })).find((row) => row.id === LEGACY_ROW.id);
  gate('Fixture: linha legada pré-Fase-12 presente e sem o campo reconciled', Boolean(legacyBefore) && legacyBefore.reconciled === undefined);

  gate('Save antigo simulado não tem achievements_v2_reconciled (mesmo estado de um save real pré-Fase 12)', !profile.achievements_v2_reconciled);

  const beforeCoins = profile.coins;
  const beforeXp = profile.xp;

  // ── Primeira abertura sob a Fase 12: reconciliação ────────────────────
  const context = await buildAchievementContext(profile, { worldRank: { rank: 340 } });
  const firstSync = await syncPlayerAchievements(profile, context, { localGame, reconciliation: true });
  profile = firstSync.profile;

  gate('Reconciliação desbloqueia múltiplas conquistas já provadas pelo estado existente', firstSync.unlocked.length >= 6);
  gate('Reconciliação desbloqueia "Bicampeão" (win_tournament≥2, já provado por tournaments_won=8)', firstSync.unlocked.some((a) => a.trigger_type === 'win_tournament' && a.threshold === 2));
  gate('Reconciliação desbloqueia partidas oficiais reais (play_official_match/win_official_match)', firstSync.unlocked.some((a) => a.trigger_type === 'play_official_match') && firstSync.unlocked.some((a) => a.trigger_type === 'win_official_match'));
  gate('ZERO recompensa retroativa: coins do save antigo inalterados', profile.coins === beforeCoins);
  gate('ZERO recompensa retroativa: xp do save antigo inalterado', profile.xp === beforeXp);

  const allRows = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  // As garantias de reconciled/is_new valem para as linhas que ESTA
  // sincronização produziu; a linha legada da fixture é verificada à parte.
  const unlockedIds = new Set(firstSync.unlocked.map((a) => a.id));
  const rowsFromThisSync = allRows.filter((row) => unlockedIds.has(row.achievement_id));
  gate('Toda linha NOVA criada por esta reconciliação está marcada reconciled:true', rowsFromThisSync.length === unlockedIds.size && rowsFromThisSync.every((row) => row.reconciled === true));
  gate('Toda linha NOVA criada por esta reconciliação está marcada is_new:false (não gera notificação)', rowsFromThisSync.every((row) => row.is_new === false));

  // A linha legada (pré-Fase-12, sem `reconciled`) prova que o motor tolera
  // dado antigo: continua existindo, intacta, não é recriada nem revogada,
  // e o desbloqueio já provado não paga de novo.
  const legacyRow = allRows.find((row) => row.id === LEGACY_ROW.id);
  gate('Linha legada pré-Fase-12 sobrevive intacta (mesmos campos, sem reconciled)', legacyRow && legacyRow.reconciled === undefined && legacyRow.achievement_id === LEGACY_ROW.achievement_id && legacyRow.unlocked_date === LEGACY_ROW.unlocked_date && legacyRow.is_new === false);
  gate('Conquista já desbloqueada no save antigo NÃO é desbloqueada de novo pela reconciliação', !firstSync.unlocked.some((a) => a.id === LEGACY_ROW.achievement_id));
  gate('Conquista legada não é duplicada (uma linha só para achv-primeiro-treino)', allRows.filter((row) => row.achievement_id === LEGACY_ROW.achievement_id).length === 1);

  // Marca o perfil como reconciliado — mesmo passo que AchievementsPanel.jsx faz.
  profile = await localGame.entities.PlayerProfile.update(profile.id, { achievements_v2_reconciled: true });

  // ── Reabrir de novo (idempotência): nenhuma duplicata, nada revogado ──
  const secondContext = await buildAchievementContext(profile, { worldRank: { rank: 340 } });
  const secondSync = await syncPlayerAchievements(profile, secondContext, { localGame, reconciliation: false });
  profile = secondSync.profile;
  gate('Reabrir o save (agora como desbloqueio ao vivo normal) não re-desbloqueia nada já conquistado', secondSync.unlocked.length === 0);
  gate('Coins continuam inalterados após reabrir', profile.coins === beforeCoins);

  const reloadedRows = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  gate('Nenhuma conquista foi duplicada entre a reconciliação e o reabrir seguinte', reloadedRows.length === allRows.length);
  gate('Nenhum id de conquista aparece duas vezes', new Set(reloadedRows.map((r) => r.achievement_id)).size === reloadedRows.length);

  // ── Progresso normal DEPOIS da reconciliação: passa a conceder recompensa normalmente ──
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_won: 10 }); // cruza "Decacampeão" (win_tournament≥10)
  const thirdContext = await buildAchievementContext(profile, { worldRank: { rank: 340 } });
  const thirdSync = await syncPlayerAchievements(profile, thirdContext, { localGame, reconciliation: false });
  profile = thirdSync.profile;
  gate('Progresso NOVO depois da reconciliação desbloqueia normalmente ("Decacampeão")', thirdSync.unlocked.some((a) => a.trigger_type === 'win_tournament' && a.threshold === 10));
  gate('Progresso NOVO depois da reconciliação CONCEDE recompensa normalmente (coins aumentaram)', profile.coins > beforeCoins);

  // ── Fase 13 (Parte 15): catálogo cresce (5 novos degraus de reach_rank) —
  // confirma que um save deste tamanho reconcilia corretamente contra o
  // catálogo expandido. Rank 340 (usado desde o início deste teste) já
  // satisfaz o novo "Top 500" (340<=500) — ele foi silenciosamente
  // reconciliado (sem recompensa) na PRIMEIRA chamada de sync lá em cima,
  // junto com Bicampeão/partidas oficiais/etc., exatamente como qualquer
  // outro achievement provado por estado antigo. "Top 250" (340>250) ainda
  // não é satisfeito — fica pra quando o rank realmente melhorar.
  // (o gate de "zero recompensa retroativa" já foi provado logo após a
  // primeira sync, antes do bloco "Decacampeão" acima ter concedido coins —
  // aqui só confirma que "Top 500" especificamente está entre as linhas já
  // reconciliadas, sem reabrir aquela checagem de coins com um baseline
  // desatualizado.)
  const alreadyReconciledRows = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  gate('Fase 13: "Top 500" (rank 340 já o satisfazia) foi reconciliado silenciosamente na primeira abertura', alreadyReconciledRows.some((r) => r.achievement_id === 'achv-top-500'));
  gate('Fase 13: "Top 250" (rank 340 ainda não o satisfaz) continua bloqueado — não foi concedido cedo demais', !alreadyReconciledRows.some((r) => r.achievement_name === 'Top 250'));

  // Progresso real e NOVO (rank melhora de verdade) → Top 250 desbloqueia
  // como um live-unlock normal, com recompensa normal — a mesma seta
  // "subir ranking → consequência real" que o resto da Fase 13 testa.
  const preFase13Count = alreadyReconciledRows.length;
  const coinsBeforeTop250 = profile.coins;
  const improvedRankContext = await buildAchievementContext(profile, { worldRank: { rank: 200 } });
  const top250Sync = await syncPlayerAchievements(profile, improvedRankContext, { localGame, reconciliation: false });
  profile = top250Sync.profile;
  gate('Fase 13: melhorar o rank pra #200 desbloqueia "Top 250" normalmente, com recompensa (progresso novo, não retroativo)', top250Sync.unlocked.some((a) => a.threshold === 250) && profile.coins > coinsBeforeTop250);
  gate('Fase 13: "Top 500" (já reconciliado antes) NÃO é re-concedido junto com "Top 250"', !top250Sync.unlocked.some((a) => a.threshold === 500));
  const postFase13Rows = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
  gate('Fase 13: nenhuma linha pré-existente foi duplicada (só a nova de Top 250 foi adicionada)', postFase13Rows.length === preFase13Count + 1);
  gate('Fase 13: reprocessar o mesmo estado de novo não concede nada a mais (idempotência mantida com o catálogo expandido)', (await syncPlayerAchievements(profile, improvedRankContext, { localGame, reconciliation: false })).unlocked.length === 0);

  // CLOUD-2: preservação após save/reload real (nova leitura do arquivo).
  const activeCareer = await activeCareerAdapter.getActiveCareer();
  const reloadedCareer = await careerManager.loadCareer(activeCareer.career_id);
  const persistedRows = (reloadedCareer.entities.PlayerAchievement || []).filter((row) => row.profile_id === profile.id);
  gate('Save/reload: todas as conquistas (legada + reconciliadas + novas) persistem', persistedRows.length === postFase13Rows.length);
  gate('Save/reload: linha legada pré-Fase-12 persiste intacta', persistedRows.some((row) => row.id === LEGACY_ROW.id && row.reconciled === undefined && row.unlocked_date === LEGACY_ROW.unlocked_date));
  gate('Save/reload: nenhuma conquista duplicada no arquivo', new Set(persistedRows.map((row) => row.achievement_id)).size === persistedRows.length);

  console.log(`\n${gates} gates executados, todos PASS — Reconciliação de save antigo (desbloqueio correto, zero recompensa retroativa, idempotente, progresso normal depois; catálogo expandido da Fase 13 não re-concede nem duplica o que já existia).`);
} finally {
  await server.close();
}
