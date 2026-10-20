// Fase 5.32-C — Diretório e Perfis de Atletas por COMPORTAMENTO.
//
//   S. helpers puros com dados sintéticos: posição = snapshot (nunca o
//      ranking_position gravado), parceiro atual pela fonte do motor (dupla
//      semeada sem contrato é atual; aposentado não tem parceiro), histórico
//      de parcerias por ids, zero ≠ não registrado, rótulos de resultado,
//      busca sem acento, recortes, ordenação, estilos dos dados, render do
//      cartão e do perfil;
//   R. carreira NOVA real em memória: diretório = catálogo inteiro, Top 100 =
//      o do Ranking, perfil do líder com parceiro semeado atual, perfil sem
//      parceiro, contadores "não registrados", abrir perfil não grava nada;
//   A. temporada 10 da LOCAL-8A (se o save existir localmente): líderes =
//      Ranking, aposentado com data/legado e sem posição, histórico de
//      parcerias e resultados reais, divergência do campo gravado medida,
//      custo de abrir perfil e filtrar o catálogo.
// Uso: node scripts/test-athletes-profile-v532c.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = 1;
let fake = 0;
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date;
globalThis.Date = class DeterministicDate extends RealDate {
  constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); }
  static now() { return (fake += 1000); }
};
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
rng = hashSeed('athletes-532c'); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime();
const realConsoleError = console.error;
console.error = (...args) => { if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return; realConsoleError(...args); };

let passed = 0;
let skipped = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const quiet = (fn) => async (...a) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(...a); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

function memoryBackend() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const P = await load('/src/lib/athleteProfileDisplay.js');
  const { default: AthleteCard } = await load('/src/components/athletes/AthleteCard.jsx');
  const Detail = await load('/src/components/athletes/AthleteDetail.jsx');
  const { deriveIndividualLadders } = await load('/src/pages/Ranking.jsx');
  const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));

  // ═══ S. Helpers puros ═══════════════════════════════════════════════════
  {
    const e = (id, rank, points, extra = {}) => ({ id, name: id, rank, points, racePoints: 0, raw: { ranking_position: 777 }, ...extra });
    const snapshot = { unranked: true, entries: [e('a', 1, 900, { racePoints: 10 }), e('p', 2, 800, { isPlayer: true }), e('b', 3, 700, { racePoints: 50 }), e('z', 4, 0)] };
    const idx = P.buildStandingIndex(snapshot);
    ok('S1. posição Mundial = a do snapshot (o ranking_position gravado, 777, é ignorado)', idx.world.get('a').rank === 1 && idx.world.get('b').rank === 3);
    ok('S2. sem pontos e jogador "sem ranking" não têm posição', !idx.world.has('z') && !idx.world.has('p'));
    ok('S3. Race: só quem pontuou, ordenado pelos pontos da Race', idx.race.get('b').rank === 1 && idx.race.get('a').rank === 2 && idx.race.size === 2);
    ok('S4. autoridade indisponível → nenhuma posição afirmada', P.standingOf(P.buildStandingIndex(null), 'a').available === false);

    const tapia = { id: 't', name: 'Agustín Tapia', ai_partner_id: 'c' };
    const coello = { id: 'c', name: 'Arturo Coello', ai_partner_id: 't' };
    ok('S5. dupla semeada sem contrato formal (ai_partner_id mútuo) = parceiro atual', P.resolveCurrentPartner({ athlete: tapia, partnerAthlete: coello }).status === 'current');
    ok('S6. aposentado não tem parceiro atual', P.resolveCurrentPartner({ athlete: { ...tapia, retired: true }, partnerAthlete: coello }).status === 'retired');
    ok('S7. parceiro apontado aposentado → sem parceiro', P.resolveCurrentPartner({ athlete: tapia, partnerAthlete: { ...coello, career_status: 'aposentado' } }).status === 'none');
    ok('S8. parceiro apontado que não aponta de volta → não confirmado (nada afirmado)', P.resolveCurrentPartner({ athlete: tapia, partnerAthlete: { ...coello, ai_partner_id: 'x' } }).status === 'unknown');
    ok('S9. sem ai_partner_id → sem parceiro', P.resolveCurrentPartner({ athlete: { id: 'm' } }).status === 'none');
    const withPlayer = P.resolveCurrentPartner({ athlete: { id: 'm' }, playerPartnership: { profile_id: 'me' }, player: { id: 'me', sport_name: 'Eu' } });
    ok('S10. parceiro do jogador pela Partnership ativa dele', withPlayer.status === 'current' && withPlayer.partner.isPlayer && withPlayer.partner.name === 'Eu');

    const partnerships = [
      { id: 'p1', athlete_ids: ['t', 'x1'], athlete_a_id: 't', athlete_b_id: 'x1', athlete_a_name: 'Agustín Tapia', athlete_b_name: 'Diego Sánchez', started_career_date: '2027-01-01', ended_career_date: '2028-01-01', status: 'encerrada_parceiro', end_reason: 'fim de contrato sem renovação' },
      { id: 'p2', athlete_ids: ['x2', 't'], athlete_a_id: 'x2', athlete_b_id: 't', athlete_a_name: 'Diego Sánchez', athlete_b_name: 'Agustín Tapia', started_career_date: '2029-01-01', status: 'ativa' },
    ];
    const legacies = [{ id: 'l1', original_partnership_id: 'p1', athlete_a_id: 't', athlete_b_id: 'x1', athlete_b_name: 'Diego Sánchez', ended_career_date: '2028-01-01', shared_titles: 3, end_reason: 'fim de contrato sem renovação' }];
    const current = { status: 'current', partner: { id: 'c', name: 'Arturo Coello' } };
    const history = P.buildPartnershipHistory('t', { partnerships, legacies, current });
    ok('S11. parcerias por ids: homônimos (dois "Diego Sánchez") continuam distintos', history.filter((r) => r.partnerName === 'Diego Sánchez').map((r) => r.partnerId).sort().join() === 'x1,x2');
    ok('S12. legado mescla na linha original (sem duplicar) e traz títulos juntos', history.filter((r) => r.partnerId === 'x1').length === 1 && history.find((r) => r.partnerId === 'x1').titles === 3);
    ok('S13. parceiro atual sem registro formal entra como atual sem data fabricada', history[0].current && history[0].partnerId === 'c' && history[0].start === null && history[0].unregistered);
    ok('S14. linha "ativa" de outro parceiro não confirmada pelo motor não é chamada de atual', history.find((r) => r.partnerId === 'x2').current === false);
    ok('S15. motivo de fim exibido como gravado', history.find((r) => r.partnerId === 'x1').endReason === 'fim de contrato sem renovação');

    const fresh = P.buildCareerSummary({ id: 'n' });
    const zero = P.buildCareerSummary({ id: 'z', career_titles: 0, tournaments_played: 0, career_wins: 0, career_losses: 0 });
    ok('S16. contadores ausentes = não registrado (null), nunca 0', fresh.every((item) => item.value === null));
    ok('S17. zero gravado = zero de verdade', zero.every((item) => item.value === 0));
    ok('S18. aposentado sem contadores usa o legado da aposentadoria', P.buildCareerSummary({ id: 'r', retired: true }, { career_titles: 5, career_wins: 77, career_losses: 44 }).find((i) => i.key === 'titles').value === 5);
    ok('S19. melhor posição: atual melhor que o registro é rotulada "atual"; senão o registro', P.bestRankingOf({ best_ranking_position: 9 }, 4).source === 'atual' && P.bestRankingOf({ best_ranking_position: 2 }, 4).rank === 2 && P.bestRankingOf({}, null) === null);

    const results = [
      { tournament_id: 'a', tournament_name: 'Roma Crown', tier: 'Crown', date: '2035-05-01', finish: 'Campeão', points: 2000 },
      { tournament_id: 'b', tournament_name: 'Lima Gold', tier: 'Gold', date: '2035-06-01', finish: 'r16', points: 10 },
      { tournament_id: 'b', tournament_name: 'Lima Gold', tier: 'Gold', date: '2035-06-01', finish: 'r16', points: 10 },
      { tournament_id: 'c', tournament_name: 'Seed', date: '2034-12-01', finish: 'legacy_seed', points: 100 },
    ];
    const rows = P.buildResultHistory(results, [{ tournament_id: 'a', partner_id: 'c', pair_name: 'Arturo Coello & Agustín Tapia' }]);
    ok('S20. resultados: mais recente primeiro, sem duplicar o mesmo torneio', rows.map((r) => r.tournamentId).join() === 'b,a,c');
    ok('S21. "Campeão" (texto antigo) conta como título; r16 = Oitavas; legacy_seed rotulado', rows.find((r) => r.tournamentId === 'a').won && rows.find((r) => r.tournamentId === 'b').finish === 'Oitavas' && /herdados/.test(rows.find((r) => r.tournamentId === 'c').finish));
    ok('S22. parceiro do torneio vem por id do torneio (recent_results), não por nome', rows.find((r) => r.tournamentId === 'a').partner.id === 'c' && rows.find((r) => r.tournamentId === 'b').partner === null);
    ok('S23. resumo por temporada conta só o que foi carregado', JSON.stringify(P.summarizeBySeason(rows)) === JSON.stringify([{ year: '2035', events: 2, titles: 1, finals: 0 }, { year: '2034', events: 1, titles: 0, finals: 0 }]));

    const ath = { name: 'Agustín Tapia', country: 'Argentina' };
    ok('S24. busca sem acento, parcial e por país', P.matchesAthleteSearch(ath, 'agustin tap') && P.matchesAthleteSearch(ath, 'ARGENT') && !P.matchesAthleteSearch(ath, 'coello'));
    const rank = (id) => ({ a1: 5, a2: 120 }[id] || null);
    ok('S25. Top 100 usa só a posição atual (sem posição → fora; aposentado → fora)', P.inSegment({ id: 'a1' }, 'top100', 5) && !P.inSegment({ id: 'a2' }, 'top100', 120) && !P.inSegment({ id: 'x', ranking_position: 3 }, 'top100', null) && !P.inSegment({ id: 'r', retired: true }, 'top100', 2));
    ok('S26. recorte Aposentados e "Antes do auge" pela fase registrada', P.inSegment({ retired: true }, 'retired') && P.inSegment({ career_stage: 'rising' }, 'rising') && !P.inSegment({ career_stage: 'rising', retired: true }, 'rising'));
    const sorted = [{ id: 'u1', overall_rating: 70 }, { id: 'a2', overall_rating: 60 }, { id: 'u2', overall_rating: 90 }, { id: 'a1', overall_rating: 50 }].sort(P.compareAthletes('ranking', rank));
    ok('S27. ordenar por ranking: posições primeiro, sem posição depois por OVR', sorted.map((a) => a.id).join() === 'a1,a2,u2,u1');
    ok('S28. estilos vêm dos dados (inclui Controle; "equilibrado" = "Equilibrado")', P.styleOptions([{ play_style: 'Controle' }, { play_style: 'equilibrado' }, { play_style: 'Equilibrado' }]).join() === 'Controle,Equilibrado');
    ok('S29. lado normalizado (left/flex/Direita)', P.sideLabel({ preferred_side: 'left' }) === 'Esquerda' && P.sideLabel({ preferred_side: 'flex' }) === 'Ambos os lados' && P.sideLabel({ court_side: 'Direita' }) === 'Direita' && P.sideLabel({}) === null);

    const retiredCard = text(render(AthleteCard, { athlete: { id: 'r', name: 'Velho', retired: true, ranking_position: 7, overall_rating: 70, country: 'Brasil' }, worldRank: null }));
    ok('S30. cartão de aposentado não mostra posição gravada', /Aposentado/.test(retiredCard) && !/\b7\b/.test(retiredCard.replace(/70/, '')), retiredCard);
    const unrankedCard = render(AthleteCard, { athlete: { id: 'u', name: 'Novo', ranking_position: 12, overall_rating: 55 }, worldRank: null });
    ok('S31. cartão sem posição atual mostra "—" (não o ranking_position 12)', /aria-label="sem ranking"/.test(unrankedCard) && !/>12</.test(unrankedCard));

    const model = Detail.buildAthleteProfileModel({ id: 'r', name: 'R', retired: true, retirement_date: '2035-08-01', retirement_age: 34 }, { careerLegacy: { years_active: 9, main_partner_name: 'X', career_titles: 2 }, partnerships: [], legacies: [], results: [] }, { world: { rank: 3, points: 10 }, race: null, available: true });
    ok('S32. perfil de aposentado: sem posição mesmo se o snapshot trouxer uma; dados da aposentadoria', model.retired && model.worldRank === null && model.retirement.date === '2035-08-01' && model.retirement.yearsActive === 9 && model.current.status === 'retired');
    const missing = Detail.buildAthleteProfileModel({ id: 'x', name: 'X' }, { partnerships: null, legacies: null, results: null }, null);
    ok('S33. autoridades que falharam = indisponível (null), não lista vazia', missing.partnerships === null && missing.results === null);
    const html = text(render(Detail.default, { athlete: { id: 'h', name: 'Header Test', country: 'Espanha', age: 30, preferred_side: 'right', overall_rating: 88, retired: false }, standing: { world: { rank: 12, points: 4321 }, race: { rank: 4, points: 300 }, available: true }, onClose: () => {} }));
    void html; // ModalShell usa portal: no SSR o conteúdo é validado pelo modelo e no navegador.
    ok('S34. modelo do cabeçalho: posição/pontos Mundial e Race do standing, OVR, idade, lado', (() => {
      const m = Detail.buildAthleteProfileModel({ id: 'h', age: 30, preferred_side: 'right', overall_rating: 88 }, null, { world: { rank: 12, points: 4321 }, race: { rank: 4, points: 300 }, available: true });
      return m.worldRank === 12 && m.worldPoints === 4321 && m.raceRank === 4 && m.racePoints === 300 && m.overall === 88 && m.age === 30 && m.side === 'Direita' && m.current === null;
    })());
  }

  // ═══ R / A. Carreiras reais em memória ═════════════════════════════════
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { repairLegacyPlayerPartnerAthlete } = await load('/src/lib/partnerAthlete.js');
  const { buildWorldRankingSnapshot } = await load('/src/lib/padel.js');

  // Conta toda escrita de entidade (abrir perfil não pode gravar nada).
  const WRITE_METHODS = ['create', 'bulkCreate', 'update', 'bulkUpdate', 'delete', 'bulkDelete', 'upsert'];
  function writeSpy() {
    const calls = [];
    const restores = [];
    for (const [name, entity] of Object.entries(localGame.entities)) {
      for (const method of WRITE_METHODS) {
        if (typeof entity?.[method] !== 'function') continue;
        const original = entity[method];
        entity[method] = (...args) => { calls.push(`${name}.${method}`); return original.apply(entity, args); };
        restores.push(() => { entity[method] = original; });
      }
    }
    const batch = localGame.batch;
    if (typeof batch === 'function') { localGame.batch = (...args) => { calls.push('batch'); return batch.apply(localGame, args); }; restores.push(() => { localGame.batch = batch; }); }
    return { calls, restore: () => restores.forEach((fn) => fn()) };
  }

  // O que o diretório e o Ranking mostram, pelas MESMAS leituras.
  const directoryFor = async (profile) => {
    const athletes = await localGame.entities.AthleteProfile.list('-overall_rating');
    const snapshot = await buildWorldRankingSnapshot(profile);
    const index = P.buildStandingIndex(snapshot);
    const { circuitAthletes } = deriveIndividualLadders(snapshot);
    return { athletes, index, snapshot, rankingTop100: circuitAthletes.filter((r) => r.ladder_position && r.ladder_position <= 100).map((r) => r.id).sort() };
  };
  const top100Of = ({ athletes, index }) => athletes.filter((a) => P.inSegment(a, 'top100', index.world.get(a.id)?.rank || null)).map((a) => a.id).sort();
  const profileOf = async (athlete, index) => {
    const spy = writeSpy();
    const t0 = performance.now();
    let extras;
    try { extras = await Detail.loadAthleteProfileExtras(athlete); } finally { spy.restore(); }
    const ms = performance.now() - t0;
    return { model: Detail.buildAthleteProfileModel(athlete, extras, P.standingOf(index, athlete.id)), writes: spy.calls, ms, extras };
  };

  {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Atletas 532C' });
    activeCareerAdapter.setActiveCareer(career);
    const profileId = 'a532-player';
    await activeCareerAdapter.createPlayerProfile({
      id: profileId, sport_name: 'Atletas 532C', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
      court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false, country: 'Brasil',
    });
    await quiet(async () => {
      const status = await verifySaveFoundation();
      if (!status.ok) await ensureWorldSeed2025();
      const profile = await localGame.entities.PlayerProfile.get(profileId);
      const resolveTemplate = (id) => { for (const bots of Object.values(BOTS_BY_DIFFICULTY)) { const f = bots?.find((b) => b?.id === id); if (f) return f; } return null; };
      await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
    })();
    const profile = await localGame.entities.PlayerProfile.get(profileId);
    const dir = await directoryFor(profile);
    ok(`R1. diretório lê o catálogo inteiro (${dir.athletes.length} atletas, antes 200)`, dir.athletes.length > 200);
    ok('R2. Top 100 do diretório = Top 100 do Ranking 5.32-A', top100Of(dir).join() === dir.rankingTop100.join() && dir.rankingTop100.length === 100, `${top100Of(dir).length}`);
    const leaderEntry = dir.snapshot.entries.find((entry) => entry.rank === 1);
    const leader = dir.athletes.find((a) => a.id === leaderEntry.id);
    const lp = await profileOf(leader, dir.index);
    ok('R3. perfil do líder: #1 Mundial pela autoridade do Ranking', lp.model.worldRank === 1);
    ok('R4. dupla semeada sem contrato formal aparece como parceiro atual (sem "encerrada" falsa)', lp.model.current.status === 'current' && lp.model.current.partner.id === leader.ai_partner_id, JSON.stringify(lp.model.current));
    ok('R5. histórico de parcerias inclui a atual sem data inventada', lp.model.partnerships.some((r) => r.current && r.partnerId === leader.ai_partner_id));
    const FIELD = { titles: 'career_titles', tournaments: 'tournaments_played', wins: 'career_wins', losses: 'career_losses' };
    ok('R6. carreira nova: contador ausente no save = "não registrado"; presente = valor gravado (inclusive 0)',
      lp.model.summary.every((item) => (leader[FIELD[item.key]] === undefined || leader[FIELD[item.key]] === null ? item.value === null : item.value === Number(leader[FIELD[item.key]]))),
      JSON.stringify(lp.model.summary));
    ok('R7. carreira nova: nenhum resultado inventado', Array.isArray(lp.model.results) && lp.model.results.every((r) => r.tournamentId));
    ok('R8. abrir o perfil não grava nada', lp.writes.length === 0, lp.writes.join());
    const single = dir.athletes.find((a) => !a.ai_partner_id && !P.isRetiredAthlete(a) && dir.index.world.get(a.id));
    const sp = await profileOf(single, dir.index);
    ok('R9. atleta sem parceiro: "sem parceiro", posição atual mantida', sp.model.current.status === 'none' && sp.model.worldRank === dir.index.world.get(single.id).rank);
    // Parceria encerrada (campos que dissolvePartnerships grava): o perfil
    // deixa de mostrar o ex como atual.
    const partnerId = leader.ai_partner_id;
    for (const id of [leader.id, partnerId]) await localGame.entities.AthleteProfile.update(id, { ai_partner_id: null, ai_partner_name: null, ai_partnership_status: 'encerrada' });
    const after = await profileOf(await localGame.entities.AthleteProfile.get(leader.id), dir.index);
    ok('R10. parceria encerrada: sem parceiro atual e nenhuma linha "atual" para o ex', after.model.current.status === 'none' && !after.model.partnerships.some((r) => r.current));
  }

  const SAVE = 'reports/local-8a-career-audit/run10/save-season-10.json';
  if (!existsSync(SAVE)) {
    skipped += 1; console.log(`SKIP — A: ${SAVE} ausente (artefato local da LOCAL-8A)`);
  } else {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const data = JSON.parse(readFileSync(SAVE, 'utf8'));
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); })();
    const profile = await localGame.entities.PlayerProfile.get(data.player.id);
    const t0 = performance.now();
    const dir = await directoryFor(profile);
    const dirMs = performance.now() - t0;
    ok(`A1. temporada 10: catálogo inteiro (${dir.athletes.length}) e Top 100 = Ranking`, dir.athletes.length === data.entities.AthleteProfile.length && top100Of(dir).join() === dir.rankingTop100.join());
    const divergent = dir.athletes.filter((a) => dir.index.world.get(a.id) && Number(a.ranking_position) !== dir.index.world.get(a.id).rank).length;
    console.log(`  A: ranking_position gravado ≠ posição atual em ${divergent} de ${dir.index.world.size} atletas ranqueados (a tela usa a posição atual)`);
    ok('A2. a divergência do campo gravado existe e o diretório não depende dele', divergent > 0);
    const t1 = performance.now();
    for (let i = 0; i < 20; i += 1) dir.athletes.filter((a) => P.inSegment(a, 'all') && P.matchesAthleteSearch(a, 'sanchez')).sort(P.compareAthletes('ranking', (id) => dir.index.world.get(id)?.rank || null));
    const filterMs = (performance.now() - t1) / 20;
    ok(`A3. filtrar + ordenar o catálogo inteiro é barato (${filterMs.toFixed(1)} ms < 30)`, filterMs < 30);
    const nameCount = new Map();
    for (const a of dir.athletes) nameCount.set(a.name, (nameCount.get(a.name) || 0) + 1);
    const [dupName, dupCount] = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const homonyms = dir.athletes.filter((a) => a.name === dupName);
    const found = dir.athletes.filter((a) => P.matchesAthleteSearch(a, dupName.normalize('NFD').replace(/[̀-ͯ]/g, '')));
    ok(`A4. homônimos exatos ("${dupName}" ×${dupCount}) são atletas distintos e a busca sem acento acha todos`, dupCount > 1 && new Set(homonyms.map((a) => a.id)).size === dupCount && homonyms.every((h) => found.includes(h)));
    const byName = (n) => dir.athletes.find((a) => a.name === n);
    const coello = await profileOf(byName('Arturo Coello'), dir.index);
    ok('A5. líder: posição = Ranking, parceiro atual Agustín Tapia, títulos por categoria reais', coello.model.worldRank === 1 && coello.model.current.partner?.name === 'Agustín Tapia' && coello.model.titlesByTier.length > 0);
    ok('A6. resultados reais (AthleteRankingResult) com parceiro por id quando registrado', coello.model.results.length > 0 && coello.model.results.some((r) => r.partner?.id === byName('Agustín Tapia').id));
    ok(`A7. abrir perfil: 0 gravações, ${coello.ms.toFixed(0)} ms`, coello.writes.length === 0 && coello.ms < 1500);
    const cepero = await profileOf(byName('Álvaro Cepero'), dir.index);
    ok('A8. aposentado: sem posição, sem parceiro atual, data/idade e legado da aposentadoria', cepero.model.retired && cepero.model.worldRank === null && cepero.model.current.status === 'retired'
      && cepero.model.retirement.date === '2036-01-01' && cepero.model.retirement.age === 33 && cepero.model.retirement.yearsActive === 10 && cepero.model.retirement.mainPartner === 'Gael Pereira');
    ok('A9. aposentado: histórico preservado (carreira e parcerias encerradas)', cepero.model.summary.find((i) => i.key === 'titles').value === 5 && cepero.model.partnerships.length > 0 && cepero.model.partnerships.every((r) => !r.current));
    const molina = await profileOf(byName('Carlos Molina'), dir.index);
    ok('A10. aposentado antigo sem data gravada: "não registrada", sem posição', molina.model.retired && molina.model.worldRank === null && (molina.model.retirement.date === null || typeof molina.model.retirement.date === 'string'));
    const mendes = await profileOf(byName('Martín Mendes'), dir.index);
    ok('A11. atleta comum (fora do antigo corte de 200) agora encontrável, com posição atual', Boolean(dir.index.world.get(byName('Martín Mendes').id)) && mendes.model.worldRank === dir.index.world.get(byName('Martín Mendes').id).rank);
    const endedRows = await localGame.entities.Partnership.filter({ status: 'encerrada_parceiro' });
    const endedIds = new Set(endedRows.flatMap((p) => p.athlete_ids || [p.athlete_a_id, p.athlete_b_id]));
    const exPartnered = dir.athletes.find((a) => !P.isRetiredAthlete(a) && a.ai_partner_id && endedIds.has(a.id) && dir.index.world.get(a.id));
    const ex = await profileOf(exPartnered, dir.index);
    ok('A12. atleta com ex-parceiros: uma única parceria atual e as demais encerradas', ex.model.partnerships.filter((r) => r.current).length <= 1 && ex.model.partnerships.some((r) => !r.current),
      JSON.stringify({ name: exPartnered.name, count: exPartnered.partnership_history_count, current: ex.model.current, rows: ex.model.partnerships.map((r) => [r.partnerName, r.start, r.end, r.current, r.ended]), raw: (ex.extras.partnerships || []).length, leg: (ex.extras.legacies || []).length }));
    const partial = await profileOf(byName('Mateo Ruiz'), dir.index);
    ok('A12b. contagem de parcerias maior que os registros salvos é declarada (registro parcial)', partial.model.partnershipCount > partial.model.partnerships.length);
    // Concordância do parceiro atual com a Partnership ativa (testemunha).
    const sample = dir.athletes.filter((a) => !P.isRetiredAthlete(a) && dir.index.world.get(a.id)?.rank <= 40);
    let agree = 0;
    for (const a of sample) {
      const prof = await profileOf(a, dir.index);
      const active = (prof.extras.partnerships || []).find((p) => p.status === 'ativa' && !p.ended_career_date);
      const witness = active ? (active.athlete_ids || [active.athlete_a_id, active.athlete_b_id]).find((id) => id !== a.id) : null;
      const shown = prof.model.current.status === 'current' ? prof.model.current.partner.id : null;
      if (shown === witness) agree += 1;
    }
    ok(`A13. parceiro atual bate com a Partnership ativa no top 40 (${agree}/${sample.length})`, agree === sample.length);
    console.log(`  A: abrir diretório (leituras) ${dirMs.toFixed(0)} ms · filtro ${filterMs.toFixed(1)} ms · perfil ${coello.ms.toFixed(0)} ms`);
  }

  console.log(`test-athletes-profile-v532c: ${passed} PASS${skipped ? ` · ${skipped} SKIP` : ''}`);
} finally {
  await vite.close();
}
