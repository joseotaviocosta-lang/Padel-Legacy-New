// LOCAL-8F — ciclo de vida e persistência: propostas de dupla, missões,
// conquistas, notícias, clubes, treinadores e relíquias.
//
// Regra testada: abrir uma tela só CONSULTA; o mundo nasce na ativação da
// carreira (inicialização) e evolui no avanço do dia (atualização temporal)
// ou por ação explícita do jogador.
//
// Modo de execução (automático):
//   - "corrigido": existe src/game-core/careerSystemsInitialization.js — a
//     "abertura" de cada tela usa as funções de leitura reais das páginas
//     (ex.: loadPartnerHubOffers exportada de PartnerHub.jsx).
//   - "head": código anterior à LOCAL-8F — a "abertura" reproduz fielmente o
//     que a página fazia no commit b59bc07 (funções chamadas na montagem).
// Saves em memória (nenhum arquivo de save é escrito). Relatório em
// reports/local-8f-lifecycle-persistence/lifecycle-<PL8F_LABEL>.json.
// Uso: node scripts/test-local-8f-lifecycle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
let quietDepth = 0; let savedConsole = null;
const quiet = async (fn) => { if (process.env.PL8F_VERBOSE) return fn(); if (quietDepth++ === 0) { savedConsole = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = savedConsole; } };
let passed = 0; const failures = [];
const report = { label: process.env.PL8F_LABEL || 'working-tree', mode: null, sections: {} };
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
// Conta só gravações do SAVE da carreira (o índice de carreiras, ~0,5 KB, é
// atualizado à parte pelo CareerManager).
function memoryBackend() {
  const files = new Map(); const stats = { writes: 0, bytes: 0 };
  return { stats, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { if (!String(p).includes("careers-index")) { stats.writes += 1; stats.bytes += String(c).length; } files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const NEW = 'reports/ui-redesign-532/fixtures/carreira-nova.json';
const T5 = 'reports/ui-redesign-532/fixtures/t5-com-dupla.json';
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const partnerOffers = await L('/src/lib/partnerOffers.js');
  const { getAvailablePartners } = await L('/src/lib/career.js');
  const { listRetiredPartnerOriginIds, excludeRetiredPartnerTemplates } = await L('/src/lib/partnerAthlete.js');
  const { ensurePostSeparationPartnerMarket } = await L('/src/game-core/postSeparationMarket.js');
  const padel = await L('/src/lib/padel.js');
  const { findMissingMissionCatalog, buildMissionAliasUpdates } = await L('/src/lib/missionCatalogLogic.js');
  const { buildAchievementContext } = await L('/src/lib/achievementContext.js');
  const { evaluateAchievements, syncPlayerAchievements } = await L('/src/lib/achievementEngine.js');
  const world = await L('/src/lib/world.js');
  const worldEvents = await L('/src/lib/worldEvents.js');
  const { ensureWorldClubCatalog, buildWorldClubCatalog } = await L('/src/lib/sportsEconomyV26.js');
  const coachLifecycle = await L('/src/game-core/coachLifecycle.js');
  const { getGlobalMarketSnapshot } = await L('/src/game-core/globalMarketLifecycle.js');
  const { resolveCoachCanonicalSalary, COACHES_DATA } = await L('/src/lib/coaches.js');
  const { seedMarket, HISTORICAL_RARE_ITEMS } = await L('/src/lib/marketEngine.js');
  const { ensureExpandedShopCatalog } = await L('/src/lib/storeCatalog.js');
  const { advanceCareerDay } = await L('/src/game-core/calendarLifecycle.js');
  let init = null; let partnerHub = null;
  try { init = await L('/src/game-core/careerSystemsInitialization.js'); partnerHub = await L('/src/pages/PartnerHub.jsx'); } catch { init = null; }
  const FIXED = Boolean(init?.ensureCareerSystemsInitialized);
  report.mode = FIXED ? 'corrigido' : 'head';
  console.log(`modo: ${report.mode}`);

  let backend = null; let manager = null;
  async function load(file, patchPlayer = null) {
    resetIdCollisionSequence();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (patchPlayer) data.player = { ...data.player, ...patchPlayer };
    backend = memoryBackend();
    manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    return data;
  }
  const profileNow = async () => (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
  const snap = async () => {
    const c = await activeCareerAdapter.getActiveCareer({ fresh: false });
    const out = {};
    for (const [n, rows] of Object.entries(c.entities || {})) if (Array.isArray(rows)) out[n] = new Map(rows.map((r, i) => [String(r?.id ?? `#${i}`), JSON.stringify(r)]));
    return { out, player: JSON.stringify({ ...c.player, updated_date: 0 }) };
  };
  const diff = (a, b) => {
    const res = {};
    for (const n of new Set([...Object.keys(a.out), ...Object.keys(b.out)])) {
      const x = a.out[n] || new Map(); const y = b.out[n] || new Map();
      const created = [...y.keys()].filter((id) => !x.has(id)).length;
      const removed = [...x.keys()].filter((id) => !y.has(id)).length;
      const changed = [...y.keys()].filter((id) => x.has(id) && x.get(id) !== y.get(id)).length;
      if (created || removed || changed) res[n] = { created, removed, changed };
    }
    if (a.player !== b.player) res.__player = { changed: 1 };
    return res;
  };
  const count = (d) => Object.values(d).reduce((s, v) => s + (v.created || 0) + (v.removed || 0) + (v.changed || 0), 0);
  // Abertura de tela, idêntica ao que cada página faz (ver cabeçalho).
  async function activate() {
    if (FIXED) return quiet(() => init.ensureCareerSystemsInitialized({ careerId: activeCareerAdapter.activeCareerId }));
    return null; // HEAD: a ativação não inicializava estes sistemas.
  }
  const open = {
    async partners(profile) {
      if (FIXED) return partnerHub.loadPartnerHubOffers(profile);
      const available = excludeRetiredPartnerTemplates(getAvailablePartners(profile), await listRetiredPartnerOriginIds());
      const active = await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1);
      return active.length ? partnerOffers.listPartnerOffers(profile.id) : partnerOffers.ensureInitialPartnerOffers(profile, available);
    },
    async missions() {
      if (FIXED) { await padel.ensureTutorialMissionCatalog(); return localGame.entities.Mission.filter({ is_active: true }); }
      // HEAD — syncExtendedMissionCatalog() de Missions.jsx (b59bc07).
      let existing = await localGame.entities.Mission.list('-created_date', 300);
      const missing = findMissingMissionCatalog(existing, padel.TUTORIAL_MISSIONS);
      if (missing.length) { const created = await localGame.entities.Mission.bulkCreate(missing.map((m) => ({ ...m, is_active: true }))); existing = [...existing, ...created]; }
      const aliases = buildMissionAliasUpdates(existing);
      if (aliases.length) await localGame.entities.Mission.bulkUpdate(aliases);
      const periodic = existing.filter((m) => ['diaria', 'semanal', 'mensal', 'sazonal'].includes(m.mission_type) && m.is_active !== false);
      if (periodic.length) await localGame.entities.Mission.bulkUpdate(periodic.map((m) => ({ id: m.id, is_active: false, retired_reason: 'periodic_missions_removed_v40' })));
      return localGame.entities.Mission.filter({ is_active: true });
    },
    async achievements(profile) {
      const worldRank = await padel.getWorldRank(profile).catch(() => ({ rank: 0 }));
      const context = await buildAchievementContext(profile, { worldRank });
      if (!FIXED) {
        // HEAD — AchievementsPanel.jsx (b59bc07): sync com recompensa.
        const needs = !profile.achievements_v2_reconciled;
        await syncPlayerAchievements(profile, context, { localGame, reconciliation: needs }).catch(() => null);
        if (needs) await localGame.entities.PlayerProfile.update(profile.id, { achievements_v2_reconciled: true }).catch(() => {});
      }
      await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
      return evaluateAchievements(profile, context);
    },
    async news(date) {
      if (!FIXED) await world.ensureWorldEvents(date, 15);
      const list = await world.getRecentWorldEvents(50);
      const macros = FIXED ? await worldEvents.getActiveMacroEvents(date) : await worldEvents.ensureMacroEvents(date, 2);
      return { list, macros };
    },
    async clubs() { if (!FIXED) await ensureWorldClubCatalog(72); return localGame.entities.Club.list('-club_points', 120); },
    async coaches(profile) {
      const init0 = await coachLifecycle.ensureCoachMarketInitialized(activeCareerAdapter.activeCareerId);
      return FIXED ? coachLifecycle.listCoachMarketForDate(profile.career_date, init0.coaches) : init0.coaches;
    },
    async shop() { if (!FIXED) { await seedMarket(); await ensureExpandedShopCatalog(); } return localGame.entities.ShopItem.filter({ is_available: true }, 'catalog_order', 1000); },
  };
  async function openTwice(label, fn) {
    const s0 = await snap(); const w0 = backend.stats.writes; const t0 = performance.now();
    await quiet(fn); const t1 = performance.now(); const s1 = await snap(); const w1 = backend.stats.writes;
    await quiet(fn); const t2 = performance.now(); const s2 = await snap(); const w2 = backend.stats.writes;
    const d1 = diff(s0, s1); const d2 = diff(s1, s2);
    return { open1: { records: count(d1), diff: d1, writes: w1 - w0, ms: Math.round(t1 - t0) }, open2: { records: count(d2), diff: d2, writes: w2 - w1, ms: Math.round(t2 - t1) } };
  }

  // ── 1. Ativação: carreira nova + todas as telas abertas 2× ────────────────
  {
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado' });
    const w0 = backend.stats.writes; const s0 = await snap();
    const t0 = performance.now(); const result = await activate(); const activationMs = Math.round(performance.now() - t0);
    const activationDiff = diff(s0, await snap());
    report.sections.activation = { result, writes: backend.stats.writes - w0, ms: activationMs, diff: activationDiff };
    const profile = await profileNow();
    const screens = {};
    screens.partners = await openTwice('partners', () => open.partners(profile));
    screens.missions = await openTwice('missions', () => open.missions());
    screens.achievements = await openTwice('achievements', () => open.achievements(profile));
    screens.news = await openTwice('news', () => open.news(profile.career_date));
    screens.clubs = await openTwice('clubs', () => open.clubs());
    screens.coaches = await openTwice('coaches', () => open.coaches(profile));
    screens.shop = await openTwice('shop', () => open.shop());
    report.sections.newCareerScreens = screens;
    for (const [name, r] of Object.entries(screens)) {
      ok(`carreira nova: abrir ${name} (1ª vez) não grava registros (${r.open1.records} registro(s), ${r.open1.writes} gravação(ões) ${JSON.stringify(r.open1.diff)})`, r.open1.records === 0);
      ok(`carreira nova: reabrir ${name} não grava (${r.open2.records} registro(s), ${r.open2.writes} gravação(ões))`, r.open2.records === 0 && r.open2.writes === 0);
    }
    const ents = (await activeCareerAdapter.getActiveCareer({ fresh: false })).entities;
    const clubKeys = new Set((ents.Club || []).flatMap((c) => [c.world_club_key, `${c.name}|${c.city}`]));
    const missingClubs = buildWorldClubCatalog(72).filter((c) => !clubKeys.has(c.world_club_key) && !clubKeys.has(`${c.name}|${c.city}`));
    ok(`ativação: catálogo de clubes completo (${(ents.Club || []).length} clubes, ${missingClubs.length} faltando)`, missingClubs.length === 0);
    ok(`ativação: treinadores do catálogo, sem duplicatas (${(ents.Coach || []).length} de ${COACHES_DATA.length}, ${new Set((ents.Coach || []).map((c) => c.catalog_key)).size} chaves)`, (ents.Coach || []).length === COACHES_DATA.length && new Set((ents.Coach || []).map((c) => c.catalog_key)).size === COACHES_DATA.length);
    ok(`ativação: propostas iniciais existem sem visitar Duplas (${(ents.PartnerOffer || []).length})`, (ents.PartnerOffer || []).length >= 3);
    ok(`ativação: catálogo da Loja inicializado (${(ents.ShopItem || []).length} itens)`, (ents.ShopItem || []).length >= 115);
  }

  // ── 2. Propostas de dupla ─────────────────────────────────────────────────
  {
    const P = report.sections.partners = {};
    // Concorrência: duas inicializações simultâneas.
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado' });
    let profile = await profileNow();
    const outcomes = await Promise.allSettled([quiet(() => open.partners(profile)), quiet(() => FIXED ? partnerOffers.ensureInitialPartnerOffers(profile) : open.partners(profile))]);
    P.concurrent = outcomes.map((o) => o.status === 'fulfilled' ? `ok:${o.value?.length}` : `erro:${String(o.reason?.message || o.reason).slice(0, 60)}`);
    ok(`aberturas simultâneas não lançam erro (${P.concurrent.join(' | ')})`, outcomes.every((o) => o.status === 'fulfilled'));
    // Sequência: ativação → abrir 2× (ordem estável) → recusar todas → abrir.
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado' });
    await activate();
    profile = await profileNow();
    const first = await quiet(() => open.partners(profile));
    const second = await quiet(() => open.partners(profile));
    const ids = (rows) => (rows || []).map((r) => r.id).join(',');
    ok(`ordem das propostas estável entre aberturas (${(first || []).length} propostas)`, ids(first) === ids(second) && (first || []).length > 0);
    const candidates = (first || []).map((o) => o.candidate_snapshot || {});
    ok('propostas trazem idade (birth/age) e país do candidato', candidates.length > 0 && candidates.every((c) => (c.birth_date || c.age) && (c.country || c.nationality)));
    for (const offer of (first || []).filter((o) => o.status === 'pending')) await quiet(() => partnerOffers.rejectPartnerOffer(profile, offer));
    const before = await snap();
    const afterReject = await quiet(() => open.partners(profile));
    const dReject = diff(before, await snap());
    P.afterRejectAll = { offers: (afterReject || []).length, diff: dReject };
    ok(`recusar todas e reabrir NÃO gera lote novo no mesmo dia (${count(dReject)} registro(s) ${JSON.stringify(dReject)})`, count(dReject) === 0);
    // Calendário: janelas de nova busca a partir da recusa (3 dias, depois 7).
    const d3 = addDays(profile.career_date, 3);
    const r1 = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: d3 }, d3));
    const r1b = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: d3 }, d3));
    const r2 = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: addDays(d3, 2) }, addDays(d3, 2)));
    P.calendarWindows = { d3: r1, repeat: r1b, sameWindow: r2 };
    ok(`após recusar todas, o calendário abre nova janela de propostas em +3 dias (${r1?.created ?? 0} criada(s), motivo ${r1?.reason || '-'})`, (r1?.created || 0) > 0);
    ok(`a mesma janela não duplica propostas (${r1b?.created ?? 0} / ${r2?.created ?? 0})`, (r1b?.created || 0) === 0 && (r2?.created || 0) === 0);
    const all = await partnerOffers.listPartnerOffers(profile.id);
    ok(`nenhum candidato proposto duas vezes (${all.length} propostas, ${new Set(all.map((o) => o.candidate_player_id)).size} candidatos)`, new Set(all.map((o) => o.candidate_player_id)).size === all.length);
    // Aceitação de uma proposta da janela + confirmação da dupla.
    const pending = all.find((o) => o.status === 'pending');
    let accepted = null;
    if (pending) accepted = await quiet(() => partnerOffers.acceptPartnerOffer({ ...profile, career_date: d3 }, pending)).catch((e) => ({ error: e.message }));
    const active = await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1);
    ok(`aceitar proposta forma a dupla (${accepted?.error || active.length})`, active.length === 1 && !accepted?.error);
    // Save/load: as propostas persistem idênticas.
    const exported = await manager.exportCareer(activeCareerAdapter.activeCareerId);
    const json = JSON.stringify(exported.entities.PartnerOffer || []);
    resetIdCollisionSequence();
    const backend2 = memoryBackend(); const manager2 = new CareerManager(new CareerRepository(new GameStorage(backend2)));
    activeCareerAdapter.careerManager = manager2; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager2.importCareer(JSON.parse(JSON.stringify(exported))); activeCareerAdapter.setActiveCareer(await manager2.loadCareer(exported.career_id)); });
    const p2 = await profileNow();
    await quiet(() => open.partners(p2));
    const re = await manager2.exportCareer(exported.career_id);
    ok('save → load → Duplas → save: propostas idênticas', JSON.stringify(re.entities.PartnerOffer || []) === json);
  }

  // ── 3. Missões (save com as 3 missões de demonstração ativas) ─────────────
  {
    await load(T5);
    await activate();
    const before = await snap();
    const missionsBefore = JSON.parse(JSON.stringify((await activeCareerAdapter.getActiveCareer({ fresh: false })).entities.Mission || []));
    const r = await openTwice('missions', () => open.missions());
    report.sections.missions = r;
    ok(`Objetivos (1ª abertura) não altera missões (${JSON.stringify(r.open1.diff)})`, r.open1.records === 0);
    ok(`Objetivos (2ª abertura) não altera missões (${JSON.stringify(r.open2.diff)})`, r.open2.records === 0);
    const after = (await activeCareerAdapter.getActiveCareer({ fresh: false })).entities.Mission || [];
    const demo = after.filter((m) => ['mission-train-1', 'mission-play-1', 'mission-days-1'].includes(m.id));
    ok(`missões de demonstração nunca viram "semanal" ativa (${demo.map((m) => `${m.mission_type || '∅'}/${m.is_active !== false}`).join(', ')})`, demo.every((m) => !(m.mission_type === 'semanal' && m.is_active !== false)));
    ok('recompensas das missões preservadas (xp/coins do catálogo)', missionsBefore.filter((m) => m.mission_type === 'tutorial').every((m) => { const n = after.find((x) => x.id === m.id); return n && Number(n.xp_reward) === Number(m.xp_reward) && Number(n.coins_reward) === Number(m.coins_reward); }));
    const progressBefore = before.out.MissionProgress || new Map();
    const progressAfter = (await snap()).out.MissionProgress || new Map();
    ok('progresso das missões intacto (nenhuma concluída volta a pendente)', [...progressBefore].every(([id, j]) => progressAfter.get(id) === j));
  }

  // ── 4. Conquistas ─────────────────────────────────────────────────────────
  {
    const A = report.sections.achievements = {};
    // Carreira nova reconciliada com uma conquista econômica já merecida.
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado', coins: 250000 });
    await activate();
    let profile = await profileNow();
    const ctx = await buildAchievementContext(profile, { worldRank: { rank: 0 } });
    const merited = evaluateAchievements(profile, ctx).filter((r) => r.evaluable && r.unlocked).map((r) => r.achievement.id);
    A.merited = merited;
    ok(`cenário: há conquista(s) merecida(s) ainda não registrada(s) (${merited.length})`, merited.length > 0);
    const coins0 = profile.coins;
    const r = await openTwice('achievements', async () => open.achievements(await profileNow()));
    A.open = r;
    ok(`abrir Conquistas não credita moedas nem registra conquistas (${JSON.stringify(r.open1.diff)})`, r.open1.records === 0 && (await profileNow()).coins === coins0);
    // Avanço de dia: a recompensa chega sem visitar a aba.
    profile = await profileNow();
    const next = await quiet(() => advanceCareerDay(profile, {}));
    const pas = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
    const fresh = await profileNow();
    A.afterDay = { recorded: pas.length, coins: fresh.coins, date: next?.career_date };
    ok(`avanço de dia desbloqueia as conquistas merecidas (${pas.filter((p) => merited.includes(p.achievement_id)).length}/${merited.length})`, merited.every((id) => pas.some((p) => p.achievement_id === id)));
    const tx = (await localGame.entities.FinancialTransaction.filter({ profile_id: profile.id })).filter((t) => t.category === 'conquista');
    const paid = pas.reduce((s, p) => s + (Number(p.reward_coins) || 0), 0);
    ok(`moedas creditadas uma vez, com lançamento no extrato (${paid} moedas, ${tx.length} lançamento(s))`, paid > 0 && fresh.coins >= coins0 + paid - 1 && tx.length === pas.filter((p) => Number(p.reward_coins) > 0).length);
    const coins1 = fresh.coins;
    await quiet(() => open.achievements(fresh)); await quiet(() => open.achievements(fresh));
    const pNow = await profileNow();
    const next2 = await quiet(() => advanceCareerDay(pNow, {}));
    void next2;
    const pas2 = await localGame.entities.PlayerAchievement.filter({ profile_id: profile.id });
    const tx2 = (await localGame.entities.FinancialTransaction.filter({ profile_id: profile.id })).filter((t) => t.category === 'conquista');
    ok(`reabrir a aba e avançar outro dia não paga de novo (${pas2.length} registro(s), ${tx2.length} lançamento(s))`, pas2.length === pas.length && tx2.length === tx.length && (await profileNow()).coins >= coins1 - 100000);
    ok('data de desbloqueio é a data da carreira', pas.every((p) => String(p.unlocked_date || '').slice(0, 10) === String(p.career_date || '').slice(0, 10)));
  }

  // ── 5. Notícias ───────────────────────────────────────────────────────────
  {
    await load(T5);
    await activate();
    const profile = await profileNow();
    const r = await openTwice('news', () => open.news(profile.career_date));
    report.sections.news = r;
    ok(`abrir Notícias/Circuito não cria notícias (${JSON.stringify(r.open1.diff)})`, r.open1.records === 0);
    ok(`reabrir não muda notícias (${JSON.stringify(r.open2.diff)})`, r.open2.records === 0);
    // Determinismo da geração diária: duas execuções independentes, mesmo dia.
    const dates = Array.from({ length: 40 }, (_, i) => addDays('2031-02-01', i));
    const runDaily = async () => {
      await load(T5);
      const out = [];
      for (const d of dates) {
        const m = await quiet(() => worldEvents.maybeGenerateMacroEvent(d));
        const e = world.generateEventObject(d, `editorial:${d}`);
        out.push(`${d}|${m ? `${m.event_type}:${m.title}:${m.likes}` : '-'}|${e.title}:${e.likes}:${e.source_event_id}`);
      }
      return out;
    };
    const a = await runDaily(); const b = await runDaily();
    const same = a.filter((x, i) => x === b[i]).length;
    report.sections.news.dailyDeterminism = { days: dates.length, identical: same };
    ok(`geração diária de notícias determinística (${same}/${dates.length} dias idênticos)`, same === dates.length);
  }

  // ── 6. Clubes (temporada sem catálogo) ────────────────────────────────────
  {
    await load(T5);
    const w0 = backend.stats.writes;
    const tc = performance.now();
    const created = await quiet(() => ensureWorldClubCatalog(72));
    const catalogMs = Math.round(performance.now() - tc);
    const activationWrites = backend.stats.writes - w0;
    ok(`inicializar o catálogo de clubes: ${created.created} clubes em ${activationWrites} gravação(ões) (${catalogMs} ms)`, created.created > 0 && activationWrites === 1);
    await activate();
    const r = await openTwice('clubs', () => open.clubs());
    report.sections.clubs = { created: created.created, catalogWrites: activationWrites, catalogMs, ...r };
    ok(`abrir Clubes não cria clubes (${r.open1.records} registro(s), ${r.open1.writes} gravação(ões))`, r.open1.records === 0 && r.open1.writes === 0);
    const clubs = (await activeCareerAdapter.getActiveCareer({ fresh: false })).entities.Club || [];
    ok(`clubes sem duplicatas e com ids estáveis (${clubs.length})`, new Set(clubs.map((c) => c.world_club_key || c.id)).size === clubs.length && clubs.filter((c) => c.is_world_club).every((c) => c.id === c.world_club_key));
  }

  // ── 7. Treinadores: valor exibido = valor contratado ──────────────────────
  {
    const C = report.sections.coaches = {};
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado', coins: 500000, level: 'Lenda', xp: 999999, reputation: 100, ranking_position: 1 });
    await activate();
    let profile = await profileNow();
    const coachesScreen = await quiet(() => open.coaches(profile));
    const market = await quiet(() => getGlobalMarketSnapshot(profile, profile.career_date));
    const coachKey = (c) => c.catalog_key || c.name;
    const byName = new Map((market.coaches || []).map((c) => [coachKey(c), c]));
    const mismatches = (coachesScreen || []).filter((c) => {
      const m = byName.get(coachKey(c));
      return !m || Boolean(m.market_available) !== (c.market_available !== false) || resolveCoachCanonicalSalary(m) !== resolveCoachCanonicalSalary(c) || Number(m.market_signing_bonus ?? m.sign_on_bonus ?? 0) !== Number(c.market_signing_bonus ?? c.sign_on_bonus ?? 0);
    });
    C.mismatches = mismatches.length; C.total = (coachesScreen || []).length;
    ok(`Treinadores × Mercado Mundial: disponibilidade, salário e luvas iguais (${mismatches.length} divergência(s) em ${C.total})`, mismatches.length === 0 && C.total > 0);
    const candidate = (market.coaches || []).find((c) => c.market_available && c.tier === 'iniciante' && c.id);
    const coins0 = profile.coins;
    let hired = null;
    if (candidate) hired = await quiet(() => coachLifecycle.hirePrimaryCoach(profile, coachesScreen.find((c) => c.id === candidate.id) || candidate, 12)).catch((e) => ({ error: e.message }));
    C.hire = { coach: candidate?.name, shownSalary: resolveCoachCanonicalSalary(candidate || {}), contracted: hired?.coach_monthly_salary, error: hired?.error };
    ok(`contratação cobra o salário exibido (${C.hire.shownSalary} → ${C.hire.contracted})`, Boolean(hired) && !hired.error && hired.coach_monthly_salary === C.hire.shownSalary);
    ok(`luvas debitadas = luvas exibidas (${coins0 - (hired?.coins ?? coins0)} × ${candidate?.market_signing_bonus})`, Boolean(hired) && coins0 - hired.coins === Number(candidate?.market_signing_bonus ?? candidate?.sign_on_bonus ?? 0));
    // Mudança legítima entre consulta e confirmação: o mês vira.
    await load(NEW, { court_side: 'direita', play_style: 'equilibrado', coins: 500000, level: 'Lenda', xp: 999999, reputation: 100, ranking_position: 1 });
    await activate();
    profile = await profileNow();
    const shown = (await quiet(() => open.coaches(profile))).filter((c) => c.market_available !== false && c.tier === 'iniciante');
    const nextMonth = `${String(Number(profile.career_date.slice(0, 4)) + (profile.career_date.slice(5, 7) === '12' ? 1 : 0))}-${String((Number(profile.career_date.slice(5, 7)) % 12) + 1).padStart(2, '0')}-01`;
    const later = { ...profile, career_date: nextMonth };
    const nextMarket = await quiet(() => getGlobalMarketSnapshot(later, nextMonth));
    const target = shown.find((c) => resolveCoachCanonicalSalary(c) !== resolveCoachCanonicalSalary((nextMarket.coaches || []).find((x) => x.name === c.name) || {}) && (nextMarket.coaches || []).find((x) => x.name === c.name)?.market_available);
    if (target) {
      const res = await quiet(() => coachLifecycle.hirePrimaryCoach(later, target, 12)).catch((e) => ({ error: e.message }));
      const expected = resolveCoachCanonicalSalary((nextMarket.coaches || []).find((x) => x.name === target.name));
      C.monthTurn = { coach: target.name, shownOld: resolveCoachCanonicalSalary(target), expectedNew: expected, contracted: res?.coach_monthly_salary, error: res?.error };
      ok(`mês vira entre consulta e confirmação: contrata pelos termos do mês vigente (${C.monthTurn.shownOld} → ${C.monthTurn.contracted}, esperado ${expected})`, !res?.error && res?.coach_monthly_salary === expected);
    } else {
      ok('mês vira entre consulta e confirmação: cenário encontrado', false, 'nenhum treinador com salário diferente no mês seguinte');
    }
    const s0 = await snap();
    await quiet(() => open.coaches(profile)); await quiet(() => getGlobalMarketSnapshot(profile, profile.career_date));
    ok('abrir Treinadores e Mercado não altera treinadores', !diff(s0, await snap()).Coach);
  }

  // ── 8. Relíquias da Loja ──────────────────────────────────────────────────
  {
    const R = report.sections.relics = {};
    await load(T5);
    await activate();
    await quiet(() => open.shop());
    const rows = () => activeCareerAdapter.getActiveCareer({ fresh: false }).then((c) => c.entities);
    let ents = await rows();
    const names = new Set(HISTORICAL_RARE_ITEMS.map((i) => i.name));
    const relics = (ents.ShopItem || []).filter((i) => names.has(i.name) && i.catalog_order == null && i.rarity === 'exclusivo');
    R.relics = relics.length;
    ok(`as 10 relíquias existem (${relics.length})`, relics.length === HISTORICAL_RARE_ITEMS.length);
    ok('relíquias com preço, raridade e coleção do modelo', relics.length > 0 && relics.every((r) => { const t = HISTORICAL_RARE_ITEMS.find((x) => x.name === r.name); return t && r.price === t.price && r.rarity === t.rarity && r.collection === t.collection; }));
    const stock = (ents.MarketPriceHistory || []).filter((h) => h.is_limited_stock);
    R.stock = stock.length;
    ok(`estoque limitado só para as relíquias (${stock.length} entrada(s))`, stock.length === relics.length && stock.every((h) => relics.some((r) => r.id === h.item_id)));
    const collectibles = (ents.ShopItem || []).filter((i) => ['Medalha Circuito Local', 'Réplica Troféu Major'].includes(i.name));
    ok(`colecionáveis comuns não viraram relíquia (${collectibles.length})`, collectibles.length === 2 && collectibles.every((c) => c.price < 10000));
    const inv0 = JSON.stringify(ents.PlayerInventory || []); const coins0 = (await profileNow()).coins;
    const s0 = await snap();
    for (let i = 0; i < 10; i += 1) { await activate(); await quiet(() => open.shop()); }
    const d = diff(s0, await snap());
    ents = await rows();
    R.after10 = { diff: d, items: (ents.ShopItem || []).length };
    ok(`10 ativações + aberturas da Loja: nada criado ou reescrito (${JSON.stringify(d)})`, count(d) === 0);
    ok('inventário e saldo intactos', JSON.stringify(ents.PlayerInventory || []) === inv0 && (await profileNow()).coins === coins0);
  }

  // ── 9. Carreira nova de ponta a ponta (sem visitar telas) ─────────────────
  {
    const N = report.sections.newCareerFlow = {};
    resetIdCollisionSequence();
    backend = memoryBackend();
    manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    const { ensureWorldSeed2025, verifySaveFoundation } = await L('/src/lib/saveFoundation.js');
    const { career } = await quiet(() => manager.createCareer({ playerName: 'Carreira 8F' }));
    activeCareerAdapter.setActiveCareer(career);
    await quiet(() => activeCareerAdapter.createPlayerProfile({ id: 'player-8f', sport_name: 'Carreira 8F', career_date: '2026-01-01', coins: 900, xp: 0, energy: 100, achievements_v2_reconciled: true }));
    await quiet(async () => { const s = await verifySaveFoundation(); if (!s.ok) await ensureWorldSeed2025(); });
    await activate();
    // Escolha de lado e estilo (Missions.jsx): identidade completa.
    let profile = await localGame.entities.PlayerProfile.update('player-8f', { court_side: 'direita', preferred_side: 'direita', play_style: 'equilibrado' });
    if (FIXED && partnerOffers.isReadyForInitialPartnerOffers(profile)) await quiet(() => partnerOffers.ensureInitialPartnerOffers(profile));
    const offers = await partnerOffers.listPartnerOffers(profile.id);
    N.offers = offers.length;
    ok(`carreira nova: propostas iniciais após escolher o estilo, sem abrir Duplas (${offers.length})`, offers.length >= 3);
    const acc = offers[0] ? await quiet(() => partnerOffers.acceptPartnerOffer(profile, offers[0])).catch((e) => ({ error: e.message })) : { error: 'sem proposta' };
    ok(`carreira nova: primeira dupla confirmada (${acc?.error || 'ok'})`, !acc?.error);
    const ents = (await activeCareerAdapter.getActiveCareer({ fresh: false })).entities;
    N.catalogs = { clubs: (ents.Club || []).length, coaches: (ents.Coach || []).length, shop: (ents.ShopItem || []).length, missions: (ents.Mission || []).filter((m) => m.is_active !== false).length };
    ok(`carreira nova: catálogos prontos sem visitar telas (${JSON.stringify(N.catalogs)})`, N.catalogs.clubs >= 72 && N.catalogs.coaches === COACHES_DATA.length && N.catalogs.shop >= 125 && N.catalogs.missions > 0);
    profile = await profileNow();
    let advanced = profile; let errors = 0;
    for (let i = 0; i < 3; i += 1) { try { advanced = await quiet(() => advanceCareerDay(advanced, {})); } catch { errors += 1; } }
    N.advance = { date: advanced?.career_date, errors };
    ok(`carreira nova: avança 3 dias sem erro (${profile.career_date} → ${advanced?.career_date})`, errors === 0 && advanced?.career_date === addDays(profile.career_date, 3));
    const exported = await manager.exportCareer(career.career_id);
    resetIdCollisionSequence();
    const b2 = memoryBackend(); const m2 = new CareerManager(new CareerRepository(new GameStorage(b2)));
    activeCareerAdapter.careerManager = m2; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await m2.importCareer(JSON.parse(JSON.stringify(exported))); activeCareerAdapter.setActiveCareer(await m2.loadCareer(career.career_id)); });
    const s0 = await snap();
    await activate();
    ok(`carreira nova: save → load → ativação não regrava nada (${JSON.stringify(diff(s0, await snap()))})`, count(diff(s0, await snap())) === 0);
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8f-lifecycle-persistence', { recursive: true });
writeFileSync(`reports/local-8f-lifecycle-persistence/lifecycle-${report.label}.json`, JSON.stringify({ ...report, passed, failures }, null, 2));
console.log(`test-local-8f-lifecycle (${report.mode}): ${passed} PASS · ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
