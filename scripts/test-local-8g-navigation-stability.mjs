// LOCAL-8G — estabilidade de navegação: P3 remanescentes da LOCAL-8D.
//
//   8G-01 Torneios: abrir não antecipa o calendário; a virada de mês e a de
//         temporada produzem o mesmo calendário com ou sem visita.
//   8G-02 Propostas (resolvidas pela 8F): revalidação — simultâneas,
//         reabertura, recusa parcial/total, janelas de +3 e +10 dias,
//         save/load, aceitação.
//   8G-03 Catálogos na 1ª visita: Imprensa e Enciclopédia não gravam.
//   8G-04 Data do computador: com o relógio do sistema simulado em datas
//         diferentes, preço da Loja e registros esportivos usam a data da
//         carreira.
//   8G-05 Entrevistas: abrir Home/Central não regrava entrevistas pendentes
//         e nunca reabre uma respondida.
// Modo automático: "corrigido" se existir src/lib/careerClock.js; senão
// "head" (código de ea79766) — a abertura de cada tela reproduz o que a
// página fazia nesse commit. Saves em memória.
// Uso: node scripts/test-local-8g-navigation-stability.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
let quietDepth = 0; let savedConsole = null;
const quiet = async (fn) => { if (process.env.PL8G_VERBOSE) return fn(); if (quietDepth++ === 0) { savedConsole = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = savedConsole; } };
let passed = 0; const failures = [];
const report = { label: process.env.PL8G_LABEL || 'working-tree', mode: null, sections: {} };
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
// Conta só gravações do SAVE da carreira (o índice de carreiras é à parte).
function memoryBackend() {
  const files = new Map(); const stats = { writes: 0 };
  return { stats, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { if (!String(p).includes('careers-index')) stats.writes += 1; files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const SAVES = 'reports/local-8a-career-audit/run10';
const NEW = 'reports/ui-redesign-532/fixtures/carreira-nova.json';
const T5D = 'reports/ui-redesign-532/fixtures/t5-com-dupla.json';
const FILES = { t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Relógio do sistema simulado (só durante fn).
const RealDate = Date;
async function withSystemClock(iso, fn) {
  const fixed = new RealDate(iso).getTime();
  class FakeDate extends RealDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } }
  globalThis.Date = FakeDate;
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const careerLib = await L('/src/lib/career.js');
  const { simulatePastTournaments } = await L('/src/lib/teamRanking.js');
  const { advanceCareerDay } = await L('/src/game-core/calendarLifecycle.js');
  const partnerOffers = await L('/src/lib/partnerOffers.js');
  const { ensurePostSeparationPartnerMarket } = await L('/src/game-core/postSeparationMarket.js');
  const { reconcileJournalistCatalog } = await L('/src/lib/pressData.js');
  const { ENCYCLOPEDIA_ENTRIES } = await L('/src/lib/encyclopediaData.js');
  const { computeItemPrice } = await L('/src/lib/marketEngine.js');
  const relationships = await L('/src/lib/relationships.js');
  const partnershipSystem = await L('/src/lib/partnershipSystem.js');
  const { reactToEvent } = await L('/src/lib/fanBase.js');
  const { ensureContextualCareerCommunications } = await L('/src/lib/careerCommunications.js');
  let FIXED = false;
  try { await L('/src/lib/careerClock.js'); FIXED = true; } catch { FIXED = false; }
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
  const ents = async () => (await activeCareerAdapter.getActiveCareer({ fresh: false })).entities;
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
  async function openTwice(fn) {
    const s0 = await snap(); const w0 = backend.stats.writes; const t0 = performance.now();
    await quiet(fn); const t1 = performance.now(); const s1 = await snap(); const w1 = backend.stats.writes;
    await quiet(fn); const t2 = performance.now(); const s2 = await snap(); const w2 = backend.stats.writes;
    return { open1: { records: count(diff(s0, s1)), diff: diff(s0, s1), writes: w1 - w0, ms: Math.round(t1 - t0) }, open2: { records: count(diff(s1, s2)), diff: diff(s1, s2), writes: w2 - w1, ms: Math.round(t2 - t1) } };
  }
  // Abertura das telas, como cada página faz (ver cabeçalho).
  const open = {
    async tournaments(profile) {
      if (!FIXED) { await simulatePastTournaments(profile.career_date); await careerLib.ensureFutureTournaments(profile.career_date); }
      await localGame.entities.Tournament.list('-start_date', 2000);
      return localGame.entities.Season.list('-start_date', 50);
    },
    async press(profile) {
      const existing = await localGame.entities.PressJournalist.filter({ profile_id: profile.id }, null, 50);
      const reconciliation = reconcileJournalistCatalog(existing, profile.id);
      if (!FIXED) for (const j of reconciliation.missing) await localGame.entities.PressJournalist.upsert(j.id, j);
      return reconciliation.records;
    },
    async encyclopedia() {
      const existing = await localGame.entities.EncyclopediaEntry.list('-created_date', 500);
      if (!FIXED) {
        const names = new Set((existing || []).map((e) => e.name));
        const missing = ENCYCLOPEDIA_ENTRIES.filter((e) => !names.has(e.name));
        if (missing.length) await localGame.entities.EncyclopediaEntry.bulkCreate(missing);
        return localGame.entities.EncyclopediaEntry.list('-created_date', 500);
      }
      const staticNames = new Set(ENCYCLOPEDIA_ENTRIES.map((e) => e.name));
      return [...ENCYCLOPEDIA_ENTRIES, ...(existing || []).filter((r) => r?.name && !staticNames.has(r.name))];
    },
    // Home / Central de comunicações (Communications.jsx monta o mesmo contexto).
    async communications(profile) {
      const [tournaments, matches, partnerships, sponsorContracts, calendarEvents, registrations, pressArticles] = await Promise.all([
        localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
        localGame.entities.Match.filter({ profile_id: profile.id }, '-created_date', 40).catch(() => []),
        localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, '-started_career_date', 1).catch(() => []),
        localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }, '-created_date', 20).catch(() => []),
        localGame.entities.CalendarEvent.filter({ profile_id: profile.id }, 'start_date', 100).catch(() => []),
        localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }, '-registered_at', 100).catch(() => []),
        localGame.entities.PressArticle.filter({ profile_id: profile.id }, '-created_date', 100).catch(() => []),
      ]);
      const nextTournament = (tournaments || []).filter((t) => t.start_date >= profile.career_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      return ensureContextualCareerCommunications(profile, { nextTournament, matches, partnership: partnerships?.[0] || null, sponsorContracts, partnerName: profile.partner_name, calendarEvents, registrations, pressArticles, activeMatchCheckpoint: null });
    },
  };

  // ── 8G-01 Torneios ────────────────────────────────────────────────────────
  {
    const T = report.sections.tournaments = {};
    for (const [label, file] of Object.entries(FILES)) {
      await load(file);
      const profile = await profileNow();
      const r = await openTwice(() => open.tournaments(profile));
      T[label] = r;
      ok(`${label}: abrir Torneios não grava (${r.open1.records} registro(s), ${r.open1.writes} gravação(ões) ${JSON.stringify(r.open1.diff)})`, r.open1.records === 0 && r.open1.writes === 0);
      ok(`${label}: reabrir Torneios não grava`, r.open2.records === 0 && r.open2.writes === 0);
    }
    // Perto da virada de mês e de temporada: A (sem abrir) × B (abre e avança).
    const calendarKey = async () => {
      const e = await ents();
      return {
        tournaments: (e.Tournament || []).map((t) => `${t.year || String(t.start_date).slice(0, 4)}:${t.circuit_code || t.name}:${t.start_date}`).sort(),
        seasons: (e.Season || []).map((s) => s.season_number).sort(),
        registrations: (e.TournamentRegistration || []).map((r) => `${r.tournament_id}:${r.status}:${r.partner_id || r.partner_name || ''}`).sort(),
        last: (e.Tournament || []).map((t) => t.start_date).sort().at(-1),
      };
    };
    for (const [label, date] of [['virada de mês', '2031-03-29'], ['virada de temporada', '2031-12-29']]) {
      const runAB = async (visit) => {
        await load(T5D, { career_date: date });
        let p = await profileNow();
        if (visit) await quiet(() => open.tournaments(p));
        for (let i = 0; i < 4; i += 1) { p = await quiet(() => advanceCareerDay(p, {})); if (visit) await quiet(() => open.tournaments(p)); }
        return { date: p.career_date, ...(await calendarKey()) };
      };
      const A = await runAB(false); const B = await runAB(true);
      const same = JSON.stringify(A) === JSON.stringify(B);
      T[label] = { A: { date: A.date, tournaments: A.tournaments.length, seasons: A.seasons, last: A.last }, B: { date: B.date, tournaments: B.tournaments.length, seasons: B.seasons, last: B.last } };
      ok(`${label}: calendário, temporadas e inscrições idênticos com e sem visita a Torneios (${A.tournaments.length} × ${B.tournaments.length} torneios, temporadas ${A.seasons.join('/')} × ${B.seasons.join('/')})`, same);
      const horizonMonths = (new Date(`${A.last}T00:00:00Z`) - new Date(`${A.date}T00:00:00Z`)) / (86400000 * 30.4);
      ok(`${label}: o motor mantém o horizonte do calendário (${A.date} → ${A.last}, ${horizonMonths.toFixed(1)} meses)`, horizonMonths >= 13);
    }
  }

  // ── 8G-02 Propostas (revalidação da LOCAL-8F) ─────────────────────────────
  {
    const P = report.sections.partners = {};
    const identity = { court_side: 'direita', play_style: 'equilibrado' };
    await load(NEW, identity);
    let profile = await profileNow();
    const conc = await Promise.allSettled([quiet(() => partnerOffers.ensureInitialPartnerOffers(profile)), quiet(() => partnerOffers.ensureInitialPartnerOffers(profile))]);
    ok('aberturas/inicializações simultâneas sem erro', conc.every((o) => o.status === 'fulfilled'));
    const list = await partnerOffers.listPartnerOffers(profile.id);
    const again = await partnerOffers.listPartnerOffers(profile.id);
    ok(`reabertura: mesmas propostas e mesma ordem (${list.length})`, list.length >= 3 && list.map((o) => o.id).join() === again.map((o) => o.id).join());
    const s0 = await snap();
    await quiet(() => partnerOffers.rejectPartnerOffer(profile, list[0]));
    await quiet(() => partnerOffers.ensureInitialPartnerOffers(profile));
    const dPartial = diff(s0, await snap());
    ok(`recusa parcial + reabertura: só a recusa é gravada (${JSON.stringify(dPartial)})`, (dPartial.PartnerOffer?.created || 0) === 0);
    for (const o of (await partnerOffers.listPartnerOffers(profile.id)).filter((x) => x.status === 'pending')) await quiet(() => partnerOffers.rejectPartnerOffer(profile, o));
    const s1 = await snap();
    await quiet(() => partnerOffers.ensureInitialPartnerOffers(profile));
    ok('recusa total + reabertura: nenhum lote novo', !diff(s1, await snap()).PartnerOffer);
    const w3 = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: addDays(profile.career_date, 3) }, addDays(profile.career_date, 3)));
    const w7 = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: addDays(profile.career_date, 7) }, addDays(profile.career_date, 7)));
    for (const o of (await partnerOffers.listPartnerOffers(profile.id)).filter((x) => x.status === 'pending')) await quiet(() => partnerOffers.rejectPartnerOffer({ ...profile, career_date: addDays(profile.career_date, 3) }, o));
    const w10 = await quiet(() => ensurePostSeparationPartnerMarket({ ...profile, career_date: addDays(profile.career_date, 10) }, addDays(profile.career_date, 10)));
    P.windows = { d3: w3?.created, d7: w7?.created, d10: w10?.created, reasons: [w3?.reason, w7?.reason, w10?.reason] };
    ok(`janelas do calendário: +3 dias cria, +7 (mesma janela) não duplica, +10 nova janela (${w3?.created}/${w7?.created}/${w10?.created})`, (w3?.created || 0) > 0 && (w7?.created || 0) === 0 && (w10?.created || 0) > 0);
    const all = await partnerOffers.listPartnerOffers(profile.id);
    ok(`nenhum candidato repetido (${all.length} propostas)`, new Set(all.map((o) => o.candidate_player_id)).size === all.length);
    const pending = all.find((o) => o.status === 'pending');
    const acc = pending ? await quiet(() => partnerOffers.acceptPartnerOffer({ ...profile, career_date: addDays(profile.career_date, 10) }, pending)).catch((e) => ({ error: e.message })) : { error: 'sem pendente' };
    ok(`aceitar e confirmar a dupla (${acc?.error || 'ok'})`, !acc?.error && (await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' })).length === 1);
    const exported = await manager.exportCareer(activeCareerAdapter.activeCareerId);
    const json = JSON.stringify(exported.entities.PartnerOffer);
    await load(NEW, identity);
    resetIdCollisionSequence();
    const b2 = memoryBackend(); const m2 = new CareerManager(new CareerRepository(new GameStorage(b2)));
    activeCareerAdapter.careerManager = m2; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await m2.importCareer(JSON.parse(JSON.stringify(exported))); activeCareerAdapter.setActiveCareer(await m2.loadCareer(exported.career_id)); });
    profile = await profileNow();
    await quiet(() => partnerOffers.ensureInitialPartnerOffers(profile));
    ok('save → load → reabrir: propostas idênticas', JSON.stringify((await m2.exportCareer(exported.career_id)).entities.PartnerOffer) === json);
  }

  // ── 8G-03 Catálogos na 1ª visita ──────────────────────────────────────────
  {
    const C = report.sections.catalogs = {};
    await load(T5D);
    const profile = await profileNow();
    C.press = await openTwice(() => open.press(profile));
    ok(`Imprensa (1ª abertura) não grava (${C.press.open1.records} registro(s), ${C.press.open1.writes} gravação(ões))`, C.press.open1.records === 0 && C.press.open1.writes === 0);
    const journalists = await quiet(() => open.press(profile));
    ok(`Imprensa mostra o catálogo completo de jornalistas (${journalists.length})`, journalists.length >= 10);
    // 1ª interação persiste o jornalista (upsert do registro inteiro, como Press.jsx).
    const persistedBefore = (await localGame.entities.PressJournalist.filter({ profile_id: profile.id })).length;
    const j = journalists.find((x) => !x.created_date) || journalists[0];
    await localGame.entities.PressJournalist.upsert(j.id, { ...j, profile_id: profile.id, bias_toward_player: (j.bias_toward_player || 0) + 3, interviews_done: (j.interviews_done || 0) + 1 });
    const persisted = await localGame.entities.PressJournalist.filter({ profile_id: profile.id });
    const after = await quiet(() => open.press(profile));
    ok(`responder entrevista persiste só o jornalista envolvido, com o estado novo (${persistedBefore} → ${persisted.length} persistidos)`, persisted.length <= persistedBefore + 1 && after.find((x) => x.id === j.id)?.bias_toward_player === (j.bias_toward_player || 0) + 3);
    C.encyclopedia = await openTwice(() => open.encyclopedia());
    ok(`Enciclopédia não grava (${C.encyclopedia.open1.records} registro(s), ${C.encyclopedia.open1.writes} gravação(ões))`, C.encyclopedia.open1.records === 0 && C.encyclopedia.open1.writes === 0);
    const entries = await quiet(() => open.encyclopedia());
    ok(`Enciclopédia exibe as ${ENCYCLOPEDIA_ENTRIES.length} entradas do catálogo (${entries.length})`, entries.length >= ENCYCLOPEDIA_ENTRIES.length);
  }

  // ── 8G-04 Data do computador ──────────────────────────────────────────────
  {
    const D = report.sections.dates = {};
    await load(T5D);
    const profile = await profileNow();
    const item = { id: 'item-teste-8g', price: 5000, rarity: 'lendario', category: 'raquete' };
    const priceAt = (clock) => withSystemClock(clock, () => computeItemPrice(item, [], null, [], profile.career_date)?.currentPrice);
    const p1 = await priceAt('2026-10-03T10:00:00Z'); const p2 = await priceAt('2041-05-17T22:00:00Z');
    D.price = { pc1: p1, pc2: p2 };
    ok(`preço da Loja independe do relógio do PC (${p1} × ${p2})`, p1 === p2);
    // Registros esportivos: histórico de relacionamento, conflito de dupla, fãs.
    const rel = (await localGame.entities.Relationship.filter({ profile_id: profile.id }, null, 1))[0];
    if (rel) {
      await withSystemClock('2041-05-17T22:00:00Z', () => quiet(() => relationships.updateRelationshipScore(rel.id, 2, 'teste_8g', 'teste')));
      const updated = await localGame.entities.Relationship.get(rel.id);
      D.relationship = { last: updated.history?.at(-1)?.date, interaction: updated.last_interaction_date, career: profile.career_date };
      ok(`relacionamento: histórico e última interação na data da carreira (${D.relationship.last} / ${D.relationship.interaction})`, D.relationship.last === profile.career_date && D.relationship.interaction === profile.career_date);
    } else ok('relacionamento: cenário encontrado', false, 'sem Relationship no save');
    const partnership = (await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1))[0];
    if (partnership) {
      await withSystemClock('2041-05-17T22:00:00Z', () => quiet(() => partnershipSystem.addConflict(partnership.id, 'Teste 8G', 'teste', 'baixa')));
      const upd = await localGame.entities.Partnership.get(partnership.id);
      D.conflict = upd.conflicts?.at(-1)?.date;
      ok(`conflito de dupla na data da carreira (${D.conflict})`, D.conflict === profile.career_date);
    } else ok('conflito de dupla: cenário encontrado', false, 'sem dupla ativa');
    const fan = await withSystemClock('2041-05-17T22:00:00Z', () => reactToEvent({ total_fans: 100, morale: 50, popularity: 40, loyalty: 40, influence: 10 }, 'title_win', { careerDate: profile.career_date }));
    D.fans = fan?.last_reaction_date;
    ok(`reação de fãs na data da carreira (${D.fans})`, D.fans === profile.career_date);
    // metadata.career_date/season da lista de carreiras: NÃO alterado nesta fase — mudar o que
    // createDefaultCareerData grava altera os baselines byte a byte da CLOUD-7B1 e o relógio
    // determinístico de 7G.1/7H/7H.1 (ver docs/LOCAL_8G_NAVIGATION_STABILITY.md, §8G-04).
  }

  // ── 8G-05 Entrevistas ─────────────────────────────────────────────────────
  {
    const E = report.sections.interviews = {};
    await load(T5D);
    const profile = await profileNow();
    await quiet(() => open.communications(profile));
    const records = await localGame.entities.PressInterview.filter({ profile_id: profile.id });
    E.pending = records.length;
    ok(`cenário: há entrevista(s) pendente(s) (${records.length})`, records.length > 0);
    const r = await openTwice(() => open.communications(profile));
    E.reopen = r;
    ok(`reabrir Home/Central não regrava entrevistas (${JSON.stringify(r.open1.diff)}, ${r.open1.writes} gravação(ões))`, !r.open1.diff.PressInterview && !r.open2.diff.PressInterview);
    if (records[0]) {
      await localGame.entities.PressInterview.update(records[0].id, { interview_status: 'answered' });
      await quiet(() => open.communications(profile));
      const back = await localGame.entities.PressInterview.get(records[0].id);
      ok(`entrevista respondida nunca volta a "available" (${back?.interview_status})`, back?.interview_status === 'answered');
    }
    const exported = await manager.exportCareer(activeCareerAdapter.activeCareerId);
    resetIdCollisionSequence();
    const b2 = memoryBackend(); const m2 = new CareerManager(new CareerRepository(new GameStorage(b2)));
    activeCareerAdapter.careerManager = m2; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await m2.importCareer(JSON.parse(JSON.stringify(exported))); activeCareerAdapter.setActiveCareer(await m2.loadCareer(exported.career_id)); });
    const p2 = await profileNow();
    await quiet(() => open.communications(p2));
    const re = await m2.exportCareer(exported.career_id);
    ok('save → load → Central: entrevistas idênticas', JSON.stringify(re.entities.PressInterview) === JSON.stringify(exported.entities.PressInterview));
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8g-navigation-stability', { recursive: true });
writeFileSync(`reports/local-8g-navigation-stability/stability-${report.label}.json`, JSON.stringify({ ...report, passed, failures }, null, 2));
console.log(`test-local-8g-navigation-stability (${report.mode}): ${passed} PASS · ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
