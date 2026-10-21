// LOCAL-8F — custo no save de abrir cada tela do escopo (2 aberturas) e da
// ativação da carreira, em saves grandes. Mesmos modelos de abertura do teste
// scripts/test-local-8f-lifecycle.mjs (modo detectado automaticamente).
// Uso: PL8F_LABEL=<rótulo> node reports/local-8f-lifecycle-persistence/tools/save-cost.mjs [cenários]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
let quietDepth = 0; let savedConsole = null;
const quiet = async (fn) => { if (process.env.PL8F_VERBOSE) return fn(); if (quietDepth++ === 0) { savedConsole = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = savedConsole; } };
const report = { label: process.env.PL8F_LABEL || 'working-tree', mode: null, sections: {} };
// Conta só gravações do SAVE da carreira (o índice de carreiras, ~0,5 KB, é
// atualizado à parte pelo CareerManager).
function memoryBackend() {
  const files = new Map(); const stats = { writes: 0, bytes: 0 };
  return { stats, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { if (!String(p).includes("careers-index")) { stats.writes += 1; stats.bytes += String(c).length; } files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = { t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FILES);
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

  const out = { label: report.label, mode: report.mode, scenarios: {} };
  for (const id of ids) {
    const r = out.scenarios[id] = {};
    const screens = { partners: (p) => open.partners(p), missions: () => open.missions(), achievements: (p) => open.achievements(p), news: (p) => open.news(p.career_date), clubs: () => open.clubs(), coaches: (p) => open.coaches(p), shop: () => open.shop() };
    // Ativação (só no modo corrigido faz algo).
    await load(FILES[id]);
    const size0 = JSON.stringify(await manager.exportCareer(activeCareerAdapter.activeCareerId)).length;
    let w = backend.stats.writes; let t0 = performance.now();
    await activate();
    r.activation = { writes: backend.stats.writes - w, ms: Math.round(performance.now() - t0), bytes: JSON.stringify(await manager.exportCareer(activeCareerAdapter.activeCareerId)).length - size0 };
    const ts = performance.now(); JSON.stringify(await manager.exportCareer(activeCareerAdapter.activeCareerId)); r.serializeMs = Math.round(performance.now() - ts); r.saveBytes = size0;
    for (const [name, fn] of Object.entries(screens)) {
      const profile = await profileNow();
      const before = JSON.stringify(await manager.exportCareer(activeCareerAdapter.activeCareerId)).length;
      const row = r[name] = { ms: [], writes: [] };
      for (let i = 0; i < 2; i += 1) { w = backend.stats.writes; t0 = performance.now(); await quiet(() => fn(profile)); row.ms.push(Math.round(performance.now() - t0)); row.writes.push(backend.stats.writes - w); }
      row.bytesDelta = JSON.stringify(await manager.exportCareer(activeCareerAdapter.activeCareerId)).length - before;
    }
    console.log(id, JSON.stringify(r));
  }
  mkdirSync('reports/local-8f-lifecycle-persistence', { recursive: true });
  writeFileSync(`reports/local-8f-lifecycle-persistence/save-cost-${report.label}.json`, JSON.stringify(out, null, 2));
} finally { await vite.close(); }
