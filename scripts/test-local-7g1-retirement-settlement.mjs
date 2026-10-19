// LOCAL-7G.1 — aposentadoria entre o sorteio e o settlement não apaga a participação da dupla.
//   Defeito: no settlement AI-only, os membros das duplas SORTEADAS eram resolvidos só entre atletas ativos; uma dupla
//   cujo membro se aposentou depois do sorteio saía do campo — ninguém dela pontuava (nem o parceiro ativo) e, se fosse a
//   campeã, o título ia para outra dupla. Casos 1–10: nenhum/primeiro/segundo/ambos aposentados, antes/depois do
//   sorteio, depois do torneio, save/load, idempotência, ranking e Race. Pipeline diário real, carreira em memória.
// Uso: node scripts/test-local-7g1-retirement-settlement.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const FIXTURE_FILE = path.resolve('reports/cloud-phase-7c-long-career-validation/fixtures/active-player-save-season1-baseline.json.gz');
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

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
const reseed = (seed) => { rng = hashSeed(seed); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(seed) % 100000); };

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };

function memoryBackend() {
  const files = new Map();
  return {
    files,
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
  const s = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const runs = await load('/src/gameplay/worldTour/TournamentRunManager.js');
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { ensureTournamentDraw } = await load('/src/lib/tournamentDraw.js');
  const { resolveUnavailablePlayerMatch, finalizeTournamentRun } = await load('/src/game-core/tournamentLifecycle.js');
  const { getTournamentRounds } = await load('/src/lib/career.js');
  const { getRealAthleteRegistry } = await load('/src/players/realAthleteRegistry.js');
  const realBotIds = new Set(getRealAthleteRegistry().map((entry) => entry?.id).filter(Boolean));
  const quiet = (fn) => async (...a) => { const w = console.warn; const l = console.log; const d = console.debug; const e = console.error; console.warn = () => {}; console.log = () => {}; console.debug = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.warn = w; console.log = l; console.debug = d; console.error = e; } };
  const E = localGame.entities;
  const opp = (match) => s.opponentTeamNameOfRunMatch(match);

  async function boot(seed, { loadText = null } = {}) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Local 7F' });
    let profileId = 'l7f-player';
    if (loadText) {
      const external = JSON.parse(loadText);
      external.career_id = career.career_id;
      await manager.saveCareer(career.career_id, external);
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
      profileId = external.player.id;
    } else {
      activeCareerAdapter.setActiveCareer(career);
      await activeCareerAdapter.createPlayerProfile({
        id: profileId, sport_name: 'Local 7F', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
        court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
      });
      await quiet(async () => { const status = await verifySaveFoundation(); if (!status.ok) await ensureWorldSeed2025(); })();
    }
    const advance = quiet(async (n) => {
      let profile = await E.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); profile = await E.PlayerProfile.get(profileId); }
      return profile;
    });
    const reload = async () => {
      await activeCareerAdapter.writeChain;
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
    };
    return { profileId, advance, reload };
  }


  const { getRoundOutcomeTable } = await load('/src/lib/circuitCatalog.js');
  const { computeRollingPoints } = await load('/src/game-core/rankingWindow.js');
  const { resolveCompletedWorldTourEvents } = await load('/src/gameplay/worldTour/WorldTourLifecycle.js');

  // Pontos oficiais do AI-only para a posição `position` num campo de `entrants` duplas (mesma conta de resolveFinish).
  const pointsForPosition = (tier, position, entrants) => {
    const { roundCount, roundPoints } = getRoundOutcomeTable(tier, entrants);
    const index = position - 1;
    const depth = index <= 0 ? 0 : Math.floor(Math.log2(index)) + 1;
    const tierIndex = Math.max(0, roundCount - depth);
    return roundPoints[tierIndex] ?? roundPoints[0] ?? 0;
  };
  const rowsFor = async (tid) => (await E.AthleteRankingResult.filter({})).filter((r) => r.tournament_id === tid);
  // Aposentadoria com os MESMOS campos da produção (livingCircuitRules) + parceria encerrada e parceiro liberado.
  async function retire(athleteId, date) {
    const athlete = await E.AthleteProfile.get(athleteId);
    await E.AthleteProfile.update(athleteId, {
      retired: true, retirement_date: date, career_status: 'aposentado', market_status: 'aposentado',
      ai_partner_id: null, ai_partner_name: null, ai_partnership_status: athlete.ai_partner_id ? 'encerrada' : athlete.ai_partnership_status,
    });
    if (athlete.ai_partner_id) {
      const partner = await E.AthleteProfile.get(athlete.ai_partner_id).catch(() => null);
      if (partner && partner.ai_partner_id === athleteId) await E.AthleteProfile.update(partner.id, { ai_partner_id: null, ai_partner_name: null, ai_partnership_status: 'encerrada' });
    }
    for (const p of (await E.Partnership.filter({})).filter((row) => row.status === 'ativa' && [row.athlete_a_id, row.athlete_b_id].includes(athleteId))) {
      await E.Partnership.update(p.id, { status: 'encerrada_parceiro', end_reason: 'Aposentadoria', ended_career_date: date });
    }
  }

  const rt = await boot('local-7g1');
  // Avança até haver um torneio de IA sorteado (D-3) e ainda não liquidado, com duplas de Partnership suficientes.
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await rt.advance(1);
    const open = (await E.Tournament.filter({ status: 'chaveamento' })).filter((t) => t.world_tour_event !== false && !t.world_tour_resolved
      && (t.draw_pair_ids || []).filter((id) => !String(id).startsWith('profile-pair:')).length >= 6);
    target = open[0] || null;
  }
  ok('0. cenário: torneio de IA sorteado e ainda não liquidado', Boolean(target));
  const partnerships = new Map((await E.Partnership.filter({})).map((p) => [p.id, p]));
  const drawnPairs = target.draw_pair_ids.filter((id) => partnerships.get(id)?.status === 'ativa');
  const [p0, p1, p2, p3] = drawnPairs.map((id) => ({ id, a: partnerships.get(id).athlete_a_id, b: partnerships.get(id).athlete_b_id }));
  const before = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
  const today = (await E.PlayerProfile.get(rt.profileId)).career_date;

  // 2/3/4 + 6: aposentadoria DEPOIS do sorteio — primeiro membro (p1), segundo membro (p2), ambos (p3). p0 intacta (1).
  await retire(p1.a, today);
  await retire(p2.b, today);
  await retire(p3.a, today);
  await retire(p3.b, today);
  // 8: save/load entre a aposentadoria e o settlement.
  await rt.reload();
  ok('8a. save/load antes do settlement: aposentadorias e chave persistidas', (await E.AthleteProfile.get(p1.a)).career_status === 'aposentado'
    && sha((await E.Tournament.get(target.id)).bracket_history) === sha(target.bracket_history));
  for (let i = 0; i < 12 && !(await E.Tournament.get(target.id)).world_tour_resolved; i += 1) await rt.advance(1);
  const t = await E.Tournament.get(target.id);
  ok('0b. o torneio é liquidado normalmente', t.status === 'finalizado' && t.world_tour_resolved && Boolean(t.champion));

  const rows = await rowsFor(target.id);
  const rowOf = (id) => rows.find((r) => r.athlete_id === id);
  const positionOf = (pairId) => {
    const name = (t.draw_ranking_snapshot || []).find((e) => e.pair_id === pairId)?.name;
    return (t.placements || []).find((p) => (p.pair_id ? p.pair_id === pairId : p.team === name))?.position;
  };
  const expectedFor = (pairId) => pointsForPosition(t.tier, positionOf(pairId), t.simulated_entrants);
  ok('1. nenhum aposentado: a dupla pontua os dois membros pela colocação', rowOf(p0.a) && rowOf(p0.b) && Number(rowOf(p0.a).points) === expectedFor(p0.id) && Number(rowOf(p0.b).points) === expectedFor(p0.id));
  ok('2. primeiro membro aposentado: o parceiro ativo pontua pela colocação da dupla; o aposentado não recebe gravação',
    Number(rowOf(p1.b)?.points) === expectedFor(p1.id) && !rowOf(p1.a));
  ok('3. segundo membro aposentado: o parceiro ativo pontua pela colocação da dupla; o aposentado não recebe gravação',
    Number(rowOf(p2.a)?.points) === expectedFor(p2.id) && !rowOf(p2.b));
  ok('4. ambos aposentados: ninguém recebe gravação, mas a dupla continua no campo (posição registrada, nada inventado)',
    !rowOf(p3.a) && !rowOf(p3.b) && Number.isFinite(positionOf(p3.id)));
  ok('6. campo do settlement = campo sorteado (nenhuma dupla some, nenhuma inscrição nova)', t.simulated_entrants === t.draw_pair_ids.length
    && (t.placements || []).length === t.draw_pair_ids.length);
  const allIssues = t.draw_pair_ids.filter((id) => partnerships.has(id)).flatMap((id) => {
    const p = partnerships.get(id);
    return [p.athlete_a_id, p.athlete_b_id].filter((athleteId) => !(before.get(athleteId)?.retired) && ![p1.a, p2.b, p3.a, p3.b].includes(athleteId))
      .filter((athleteId) => Number(rowOf(athleteId)?.points) !== expectedFor(id)).map((athleteId) => `${id}:${athleteId}`);
  });
  ok('1b. todas as demais duplas pontuam pela própria colocação (aposentadoria de outros não desloca ninguém)', allIssues.length === 0, allIssues.slice(0, 3).join(' | '));
  const champMembers = (() => { const name = t.champion; const entry = (t.draw_ranking_snapshot || []).find((e) => e.name === name); const p = entry && partnerships.get(entry.pair_id); return p ? [p.athlete_a_id, p.athlete_b_id].sort().join(',') : null; })();
  ok('6b. campeão gravado = membros da dupla campeã da chave (nunca outra dupla por fallback)', champMembers === [...t.champion_athlete_ids].sort().join(','));

  // Política do aposentado: nada nele muda (pontos, Race, contadores, status).
  const retiredNow = await Promise.all([p1.a, p2.b, p3.a, p3.b].map((id) => E.AthleteProfile.get(id)));
  ok('P. aposentado preservado: status, pontos, Race e contadores intactos (não volta ao ranking por este torneio)',
    retiredNow.every((a) => a.career_status === 'aposentado' && a.retired === true && Number(a.race_points || 0) === Number(before.get(a.id).race_points || 0)
      && Number(a.career_wins || 0) === Number(before.get(a.id).career_wins || 0) && Number(a.tournaments_played || 0) === Number(before.get(a.id).tournaments_played || 0)));

  // 10: ranking e Race do parceiro ativo.
  const activePartners = [p1.b, p2.a];
  const allRows = await E.AthleteRankingResult.filter({});
  const partnersNow = await Promise.all(activePartners.map((id) => E.AthleteProfile.get(id)));
  ok('10a. Race do parceiro ativo recebe os pontos do torneio', partnersNow.every((a) => Number(a.race_points) >= Number(before.get(a.id).race_points || 0) + Number(rowOf(a.id).points)));
  ok('10b. ranking individual do parceiro ativo = janela rolling dos resultados (inclui o torneio, sem soma direta)',
    partnersNow.every((a) => Number(a.world_ranking_points) === computeRollingPoints(allRows.filter((r) => r.athlete_id === a.id), [], a.last_circuit_update && a.last_circuit_update > t.resolved_at ? a.last_circuit_update : t.resolved_at)));
  ok('10c. um resultado por atleta neste torneio (sem duplicação)', rows.length === new Set(rows.map((r) => r.athlete_id)).size);

  // 9: idempotência — nova chamada do settlement e novos dias não mudam nada.
  const digest = sha((await rowsFor(target.id)).map((r) => [r.id, r.points]).sort());
  const tournamentDigest = sha([t.placements, t.champion_athlete_ids, t.simulated_entrants]);
  const again = await quiet(resolveCompletedWorldTourEvents)((await E.PlayerProfile.get(rt.profileId)).career_date);
  await rt.advance(2);
  const t2 = await E.Tournament.get(target.id);
  ok('9. idempotência: settlement repetido e novos dias não reprocessam nem duplicam', !(again?.tournaments || []).some((x) => (x?.id || x) === target.id)
    && sha((await rowsFor(target.id)).map((r) => [r.id, r.points]).sort()) === digest && sha([t2.placements, t2.champion_athlete_ids, t2.simulated_entrants]) === tournamentDigest);
  // 8b: save/load depois do settlement.
  await rt.reload();
  ok('8b. save/load depois do settlement: resultados e torneio persistidos', sha((await rowsFor(target.id)).map((r) => [r.id, r.points]).sort()) === digest);

  // 7: aposentadoria DEPOIS do torneio — o resultado histórico do atleta permanece; o torneio não é reprocessado.
  await retire(p0.a, (await E.PlayerProfile.get(rt.profileId)).career_date);
  await rt.advance(2);
  ok('7. aposentadoria depois do torneio: o resultado conquistado permanece e o torneio não é reprocessado',
    Boolean((await rowsFor(target.id)).find((r) => r.athlete_id === p0.a)) && sha((await rowsFor(target.id)).map((r) => [r.id, r.points]).sort()) === digest);

  // 5: aposentadoria ANTES do sorteio — a dupla não entra em sorteios posteriores (elegibilidade preservada).
  const retiredIds = new Set([p1.a, p2.b, p3.a, p3.b, p0.a]);
  const retiredAt = (await E.PlayerProfile.get(rt.profileId)).career_date;
  await rt.advance(14);
  const laterDraws = (await E.Tournament.filter({})).filter((x) => x.draw_date && x.draw_date > retiredAt && Array.isArray(x.draw_pair_ids));
  const laterPartnerships = new Map((await E.Partnership.filter({})).map((p) => [p.id, p]));
  const membersOf = (pairId) => (String(pairId).startsWith('profile-pair:') ? String(pairId).slice(13).split(':') : [laterPartnerships.get(pairId)?.athlete_a_id, laterPartnerships.get(pairId)?.athlete_b_id]);
  ok('5. aposentado antes do sorteio: não aparece em nenhum sorteio posterior (elegibilidade inalterada)',
    laterDraws.length > 0 && laterDraws.every((x) => x.draw_pair_ids.every((id) => membersOf(id).every((m) => !retiredIds.has(m)))), `${laterDraws.length} sorteios`);

  console.log(`\nLOCAL-7G.1: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
