// LOCAL-8D — diagnóstico reproduzível das propostas iniciais de parceria
// (SSR, carreira nova em memória; o mesmo fluxo de PartnerHub:
// getAvailablePartners → excludeRetiredPartnerTemplates →
// ensureInitialPartnerOffers). É uma SONDA: registra fatos em JSON e
// verifica só as propriedades que o código promete (idempotência,
// pendentes preservadas, recusadas em cooldown não voltam). Achados que
// contrariam a expectativa saem como "ACHADO", sem derrubar o processo.
// Uso: node scripts/test-local-8d-partner-offers-probe.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = 1; let fake = 0;
const seed = (label) => { rng = hashSeed(label); fake = new Date('2026-01-01T00:00:00.000Z').getTime(); };
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date;
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); } static now() { return (fake += 1000); } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
let passed = 0; const findings = [];
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const finding = (label, fact) => { findings.push({ label, fact }); console.log(`ACHADO — ${label}: ${JSON.stringify(fact)}`); };
function memoryBackend() {
  const files = new Map();
  return { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
const report = {};
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js');
  const { CareerRepository } = await L('/src/careers/CareerRepository.js');
  const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js');
  const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await L('/src/lib/saveFoundation.js');
  const { getAvailablePartners } = await L('/src/lib/career.js');
  const { listRetiredPartnerOriginIds, excludeRetiredPartnerTemplates } = await L('/src/lib/partnerAthlete.js');
  const { ensureInitialPartnerOffers, listPartnerOffers, rejectPartnerOffer } = await L('/src/lib/partnerOffers.js');

  async function newCareer(label) {
    seed(label);
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Sonda 8D' });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({ id: 'probe-player', sport_name: 'Sonda 8D', career_date: '2026-01-01', birth_date: '2008-01-01', level: 'Iniciante', energy: 100, coins: 950, xp: 0, country: 'Brasil' });
    await quiet(async () => { const s = await verifySaveFoundation(); if (!s.ok) await ensureWorldSeed2025(); });
    return localGame.entities.PlayerProfile.get('probe-player');
  }
  const pool = async (profile) => excludeRetiredPartnerTemplates(getAvailablePartners(profile), await listRetiredPartnerOriginIds());
  const ids = (rows) => rows.map((o) => o.candidate_player_id).sort();
  const pendingOf = async (profile) => (await listPartnerOffers(profile.id)).filter((o) => o.status === 'pending');

  // 1/3. Abrir a página (sequencial) duas vezes.
  {
    const p = await newCareer('seq');
    const before = await listPartnerOffers(p.id);
    const first = await quiet(async () => ensureInitialPartnerOffers(p, await pool(p)));
    const second = await quiet(async () => ensureInitialPartnerOffers(p, await pool(p)));
    const all = await listPartnerOffers(p.id);
    report.sequential = { existingBeforeOpen: before.length, createdOnFirstOpen: first.length, afterSecondOpen: all.length, candidates: ids(all) };
    ok(`1. carreira nova sem propostas antes da 1ª abertura (${before.length}); a abertura cria ${first.length}`, before.length === 0 && first.length >= 3);
    ok('3. 2ª abertura (sequencial) não cria nem troca propostas — idempotente', all.length === first.length && ids(second).join() === ids(first).join());
    // Ordem exibida: 1ª abertura devolve a ordem de criação; as seguintes, listPartnerOffers ('-created_date').
    const orderFirst = first.map((o) => o.candidate_snapshot?.name);
    const orderLater = second.map((o) => o.candidate_snapshot?.name);
    report.sequential.displayOrder = { firstOpen: orderFirst, laterOpens: orderLater };
    if (orderFirst.join() !== orderLater.join()) finding('mesmas propostas, ORDEM diferente entre a 1ª e as demais aberturas (explica "propostas mudaram" na 5.32-C.1)', report.sequential.displayOrder);
    report.sequential.courtSide = p.court_side ?? null;
    report.sequential.poolSize = (await pool(p)).length;
  }
  // 1b. Duas aberturas SIMULTÂNEAS (efeito duplicado / dois componentes).
  {
    const p = await newCareer('par');
    const settled = await quiet(async () => Promise.allSettled([ensureInitialPartnerOffers(p, await pool(p)), ensureInitialPartnerOffers(p, await pool(p))]));
    const all = await listPartnerOffers(p.id);
    report.concurrent = { offers: all.length, distinctCandidates: new Set(all.map((o) => o.candidate_player_id)).size, outcomes: settled.map((r) => (r.status === 'fulfilled' ? `ok:${r.value.length}` : `erro:${String(r.reason?.message).slice(0, 80)}`)) };
    ok('1b. chamadas simultâneas não duplicam propostas (ids determinísticos por candidato)', all.length === report.sequential.createdOnFirstOpen && report.concurrent.distinctCandidates === all.length);
    if (settled.some((r) => r.status === 'rejected')) finding('abertura simultânea: a 2ª chamada LANÇA erro de id duplicado (a tela mostra "não foi possível carregar")', report.concurrent.outcomes);
  }
  // 6. Determinismo: duas carreiras idênticas → mesmas propostas?
  {
    const a = await newCareer('det');
    const offersA = ids(await quiet(async () => ensureInitialPartnerOffers(a, await pool(a))));
    const b = await newCareer('det');
    const offersB = ids(await quiet(async () => ensureInitialPartnerOffers(b, await pool(b))));
    report.determinism = { sameCandidates: offersA.join() === offersB.join(), a: offersA, b: offersB };
    ok('6. mesma carreira inicial → mesmos candidatos (seleção determinística)', report.determinism.sameCandidates);
  }
  // 11. O perfil mudou entre aberturas (ex.: lado de quadra definido)?
  {
    const p = await newCareer('drift');
    const first = ids(await quiet(async () => ensureInitialPartnerOffers(p, await pool(p))));
    const withSide = { ...p, court_side: 'direita', xp: 500 };
    const hypothetical = ids((await quiet(async () => {
      const { buildFirstPartnershipOffers } = await L('/src/lib/partnerOfferRules.js');
      const { BOTS_BY_DIFFICULTY } = await L('/src/lib/bots.js');
      const base = await pool(withSide);
      const seen = new Set(base.map((c) => c.id));
      return buildFirstPartnershipOffers(withSide, [...base, ...(BOTS_BY_DIFFICULTY.amador || []).filter((c) => !seen.has(c.id))]);
    })).map((o) => ({ candidate_player_id: o.candidate_player_id })));
    report.profileDrift = { sameIfProfileChanges: first.join() === hypothetical.join(), first, withCourtSideAndXp: hypothetical };
    if (!report.profileDrift.sameIfProfileChanges) finding('o lote depende do perfil no momento da 1ª abertura (lado/XP): abrir antes ou depois do onboarding muda os candidatos', { first, withCourtSideAndXp: hypothetical });
  }
  // 7/8. Pendentes preservadas; recusada em cooldown não volta.
  {
    const p = await newCareer('reject');
    const initial = await quiet(async () => ensureInitialPartnerOffers(p, await pool(p)));
    await quiet(() => rejectPartnerOffer(p, initial[0]));
    await quiet(async () => ensureInitialPartnerOffers(p, await pool(p)));
    const afterOne = await listPartnerOffers(p.id);
    ok('7. recusar 1 proposta e reabrir: as outras pendentes continuam, nenhuma nova', (await pendingOf(p)).length === initial.length - 1 && afterOne.length === initial.length);
    for (const o of (await pendingOf(p))) await quiet(() => rejectPartnerOffer(p, o));
    const regenerated = await quiet(async () => ensureInitialPartnerOffers(p, await pool(p)));
    const rejectedIds = new Set(initial.map((o) => o.candidate_player_id));
    report.rejection = { initial: ids(initial), regeneratedAfterAllRejected: ids(regenerated.filter((o) => o.status === 'pending')), cooldown: (await listPartnerOffers(p.id)).filter((o) => o.status === 'rejected').map((o) => o.rejection_cooldown_until) };
    ok('8. todas recusadas → novo lote na reabertura, sem os recusados em cooldown', regenerated.filter((o) => o.status === 'pending').every((o) => !rejectedIds.has(o.candidate_player_id)));
    finding('com todas recusadas, reabrir a página GERA um novo lote (sem avanço do calendário)', { novas: report.rejection.regeneratedAfterAllRejected.length });
  }
} finally {
  await vite.close();
}
mkdirSync('reports/local-8d-navigation-persistence-audit', { recursive: true });
writeFileSync('reports/local-8d-navigation-persistence-audit/partner-offers-probe.json', JSON.stringify({ report, findings }, null, 2));
console.log(`test-local-8d-partner-offers-probe: ${passed} PASS · ${findings.length} ACHADO(S)`);
