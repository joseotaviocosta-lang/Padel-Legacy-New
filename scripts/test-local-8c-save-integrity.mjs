// LOCAL-8C — integridade do save ao consultar atletas (SSR, saves em memória).
//
// Para cada save (carreira nova semeada em memória + fixtures da 5.32 +
// temporadas 1/5/10 da LOCAL-8A, se presentes — nunca escritos):
//   W. leituras do Diretório (loadAthleteDirectory, a MESMA da página),
//      filtros/ordenação/busca e leituras de perfil (loadAthleteProfileExtras)
//      para líder, homônimos, aposentado e parceiros: 0 chamadas de escrita
//      em qualquer entidade e a carreira inteira idêntica (JSON) depois;
//   L. save/load: exportar → importar em outro gerenciador → carregar →
//      consultar → exportar de novo: idêntico;
//   C. controle de sensibilidade: a montagem ANTIGA (ensureAthleteProfiles +
//      generateRelationships), rodada numa cópia, É detectada (cria/regrava);
//   K. classificação (só leitura) dos atletas: A homônimos legítimos,
//      B modelos do catálogo de parceiros materializados sem uso esportivo,
//      C modelos materializados com uso (parceria, ranking, resultados).
// Uso: node scripts/test-local-8c-save-integrity.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };

function memoryBackend() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória',
  };
}

const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = {
  'carreira-nova (fixture UI)': 'reports/ui-redesign-532/fixtures/carreira-nova.json',
  't5-com-dupla (fixture)': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json',
  t1: `${SAVES}/save-season-1.json`,
  t5: `${SAVES}/save-season-5.json`,
  t10: `${SAVES}/save-season-10.json`,
};
const OUT = 'reports/local-8c-directory-save-integrity';
mkdirSync(OUT, { recursive: true });

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
const report = { createdAt: new Date().toISOString(), saves: {} };
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { loadAthleteDirectory } = await load('/src/pages/Athletes.jsx');
  const { loadAthleteProfileExtras } = await load('/src/components/athletes/AthleteDetail.jsx');
  const P = await load('/src/lib/athleteProfileDisplay.js');
  const { ensureAthleteProfiles, generateRelationships } = await load('/src/lib/athleteBehavior.js');
  const { getAllBotsAsProfiles } = await load('/src/lib/bots.js');
  const CATALOG = new Set(getAllBotsAsProfiles().flatMap((b) => [b.id, b.template_id].filter(Boolean)));

  const WRITES = ['create', 'bulkCreate', 'update', 'bulkUpdate', 'delete', 'bulkDelete', 'upsert'];
  function spyWrites() {
    const calls = []; const restore = [];
    for (const [name, entity] of Object.entries(localGame.entities)) {
      for (const m of WRITES) {
        if (typeof entity?.[m] !== 'function') continue;
        const orig = entity[m];
        entity[m] = (...args) => { calls.push(`${name}.${m}`); return orig.apply(entity, args); };
        restore.push(() => { entity[m] = orig; });
      }
    }
    const batch = localGame.batch;
    if (typeof batch === 'function') { localGame.batch = (...a) => { calls.push('batch'); return batch.apply(localGame, a); }; restore.push(() => { localGame.batch = batch; }); }
    return { calls, restore: () => restore.forEach((fn) => fn()) };
  }
  const careerJson = async () => JSON.stringify((await activeCareerAdapter.getActiveCareer({ fresh: false })).entities);
  async function openCareer(data) {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    return manager;
  }
  // Consulta completa: Diretório + recortes/busca/ordenação + perfis.
  async function consult(profile) {
    const { athletes, standingIndex } = await loadAthleteDirectory(profile);
    const rankOf = (id) => standingIndex?.world.get(id)?.rank || null;
    for (const seg of P.DIRECTORY_SEGMENTS) athletes.filter((a) => P.inSegment(a, seg.id, rankOf(a.id)));
    for (const sort of ['ranking', 'overall', 'form', 'clutch']) [...athletes].sort(P.compareAthletes(sort, rankOf));
    athletes.filter((a) => P.matchesAthleteSearch(a, 'agustin'));
    const count = new Map(); athletes.forEach((a) => count.set(a.name, (count.get(a.name) || 0) + 1));
    const dupName = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const picks = [
      [...athletes].sort(P.compareAthletes('ranking', rankOf))[0],
      ...athletes.filter((a) => a.name === dupName).slice(0, 2),
      athletes.find((a) => P.isRetiredAthlete(a)),
      athletes.find((a) => a.ai_partner_id),
    ].filter(Boolean);
    for (const a of picks) {
      const extras = await loadAthleteProfileExtras(a);
      if (extras?.partnerAthlete) await loadAthleteProfileExtras(extras.partnerAthlete);
    }
    return { athleteCount: athletes.length, profilesOpened: picks.length, homonym: dupName && count.get(dupName) > 1 ? `${dupName} ×${count.get(dupName)}` : null };
  }
  function classify(entities) {
    const athletes = entities.AthleteProfile || [];
    const used = new Set();
    for (const p of entities.Partnership || []) (p.athlete_ids || [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id]).forEach((id) => id && used.add(id));
    for (const t of entities.TeamRanking || []) [t.player1_id, t.player2_id].forEach((id) => id && used.add(id));
    for (const r of entities.AthleteRankingResult || []) used.add(r.athlete_id);
    for (const t of entities.Tournament || []) [...(t.champion_athlete_ids || []), ...(t.runner_up_athlete_ids || [])].forEach((id) => used.add(id));
    const fromCatalog = athletes.filter((a) => CATALOG.has(a.id) || CATALOG.has(a.template_id) || CATALOG.has(a.bot_id));
    const footprint = (a) => used.has(a.id) || Number(a.tournaments_played) > 0 || Number(a.world_ranking_points ?? a.ranking_points) > 0;
    const names = new Map(); athletes.forEach((a) => names.set(a.name, [...(names.get(a.name) || []), a.id]));
    const homonymGroups = [...names.values()].filter((ids) => ids.length > 1);
    return {
      athletes: athletes.length,
      ids: new Set(athletes.map((a) => a.id)).size,
      A_homonymGroups: homonymGroups.length,
      A_homonymAthletes: homonymGroups.flat().length,
      B_catalogWithoutUse: fromCatalog.filter((a) => !footprint(a)).length,
      C_catalogWithUse: fromCatalog.filter(footprint).length,
      catalogDuplicatesOfRealNames: fromCatalog.filter((a) => athletes.some((o) => o !== a && o.name === a.name && !CATALOG.has(o.id))).map((a) => a.name).slice(0, 5),
    };
  }

  for (const [label, file] of Object.entries(FILES)) {
    if (!existsSync(file)) { console.log(`SKIP — ${label}: ${file} ausente`); continue; }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const manager = await openCareer(data);
    const profile = await localGame.entities.PlayerProfile.get(data.player.id);
    const before = await careerJson();
    const spy = spyWrites();
    let info;
    const t0 = performance.now();
    try { info = await consult(profile); await consult(profile); await consult(profile); } finally { spy.restore(); }
    const ms = (performance.now() - t0) / 3;
    const after = await careerJson();
    ok(`${label}: consulta ×3 (${info.athleteCount} atletas, ${info.profilesOpened} perfis${info.homonym ? `, homônimos ${info.homonym}` : ''}) → 0 escritas`, spy.calls.length === 0, spy.calls.slice(0, 5).join());
    ok(`${label}: carreira idêntica (todas as entidades) depois da consulta`, before === after);

    // Save/load.
    const exported = await manager.exportCareer(data.career_id);
    const second = await openCareer(JSON.parse(JSON.stringify(exported)));
    const profile2 = await localGame.entities.PlayerProfile.get(data.player.id);
    await consult(profile2);
    const reexported = await second.exportCareer(data.career_id);
    ok(`${label}: save → load → consulta → save idêntico (entidades)`, JSON.stringify(exported.entities) === JSON.stringify(reexported.entities));

    const klass = classify(JSON.parse(after));
    report.saves[label] = { consultMs: Math.round(ms), athletes: info.athleteCount, homonym: info.homonym, classification: klass };
    ok(`${label}: IDs de atleta únicos (${klass.ids}/${klass.athletes})`, klass.ids === klass.athletes);
    console.log(`  ${label}: A=${klass.A_homonymGroups} grupos de homônimos (${klass.A_homonymAthletes} atletas) · B=${klass.B_catalogWithoutUse} · C=${klass.C_catalogWithUse} · consulta ${Math.round(ms)} ms`);

    // Controle: a montagem antiga, numa cópia, é detectada.
    if (label === 't10' || label === 'carreira-nova (fixture UI)') {
      await openCareer(JSON.parse(JSON.stringify(exported)));
      const pre = JSON.parse(await careerJson());
      await quiet(async () => { await ensureAthleteProfiles(); await generateRelationships(); });
      const post = JSON.parse(await careerJson());
      const preRel = new Map(pre.AthleteProfile.map((a) => [a.id, JSON.stringify(a.relationships || null)]));
      const relChanged = post.AthleteProfile.filter((a) => preRel.has(a.id) && preRel.get(a.id) !== JSON.stringify(a.relationships || null)).length;
      const created = post.AthleteProfile.length - pre.AthleteProfile.length;
      const legacy = classify(post);
      // Perfis criados com ids que JÁ eram referenciados por registros
      // históricos (TeamRanking/PartnershipLegacy...) sem atleta: a montagem
      // antiga colava um atleta inventado a uma identidade existente.
      const preIds = new Set(pre.AthleteProfile.map((a) => a.id));
      const refs = new Set([
        ...(pre.TeamRanking || []).flatMap((t) => [t.player1_id, t.player2_id]),
        ...(pre.PartnershipLegacy || []).flatMap((l) => [l.athlete_a_id, l.athlete_b_id]),
        ...(pre.Partnership || []).flatMap((p) => p.athlete_ids || [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id]),
        ...(pre.AthleteRankingResult || []).map((r) => r.athlete_id),
      ].filter(Boolean));
      const hijacked = post.AthleteProfile.filter((a) => !preIds.has(a.id) && refs.has(a.id)).map((a) => a.id);
      report.saves[label].legacyMountControl = { created, relationshipsChanged: relChanged, createdOverHistoricalIds: hijacked, classificationAfter: legacy };
      ok(`${label}: controle — a montagem ANTIGA é detectada (+${created} atletas, ${relChanged} relações regravadas, ${hijacked.length} perfis inventados sobre ids históricos)`,
        created > 0 && relChanged > 0 && legacy.B_catalogWithoutUse + (legacy.C_catalogWithUse - klass.C_catalogWithUse) === created);
    }
  }
} finally {
  await vite.close();
}
writeFileSync(`${OUT}/save-integrity.json`, JSON.stringify(report, null, 2));
console.log(`test-local-8c-save-integrity: ${passed} PASS → ${OUT}/save-integrity.json`);
