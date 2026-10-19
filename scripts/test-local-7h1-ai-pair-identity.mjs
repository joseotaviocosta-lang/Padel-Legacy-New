// LOCAL-7H.1 — identidade das duplas de IA no settlement, independente da ordem dos nomes.
//   Defeito: uma dupla real sorteada como `profile-pair:` que ganha Partnership antes do settlement (ou cujos membros
//   trocam de posição no ranking) era refeita com o nome em outra ordem; a busca de colocação por nome falhava e a dupla
//   recebia a colocação da ordem de força (fallback `index + 1`): pontos, Race, ledger e campeão/vice gravados errados.
//   Correção: a colocação resolve pelo rótulo gravado no sorteio do mesmo pair_id.
//   Execução 1: cenário exato da reprodução (8 duplas). Execução 2: ordem invertida provocada (Partnership nova e troca de
//   posição no ranking), homônimas, aposentadoria, save/load, idempotência.
// Uso: node scripts/test-local-7h1-ai-pair-identity.mjs
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
  const { resolveCompletedWorldTourEvents } = await load('/src/gameplay/worldTour/WorldTourLifecycle.js');

  // Pontos oficiais do AI-only para a posição (mesma conta de resolveFinish), e V/D reais da chave (+BYE, regra existente).
  const pointsFor = (tier, position, entrants) => {
    const { roundCount, roundPoints } = getRoundOutcomeTable(tier, entrants);
    const index = position - 1;
    const depth = index <= 0 ? 0 : Math.floor(Math.log2(index)) + 1;
    return roundPoints[Math.max(0, roundCount - depth)] ?? roundPoints[0] ?? 0;
  };
  const realRecord = (rounds) => {
    const rec = new Map();
    const add = (name, field) => { const r = rec.get(name) || { w: 0, l: 0 }; r[field] += 1; rec.set(name, r); };
    for (const round of rounds) for (const m of round.matches) { if (!m.team_a || !m.team_b || !m.winner) continue; add(m.winner, 'w'); add(m.winner === m.team_a ? m.team_b : m.team_a, 'l'); }
    for (const name of rounds[0]?.byes || []) { const r = rec.get(name) || { w: 0, l: 0 }; r.w += 1; rec.set(name, r); }
    return rec;
  };
  const key = (ids) => [...ids].sort().join('_');
  // Auditoria de TODO torneio só de IA liquidado: cada atleta ativo de cada dupla sorteada pontua pela posição REAL
  // (colocação do rótulo do sorteio); campeão/vice gravados = membros das duplas finalistas da chave.
  async function auditAiTournaments() {
    const parts = new Map((await E.Partnership.filter({})).map((p) => [p.id, p]));
    const athletes = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
    const results = await E.AthleteRankingResult.filter({});
    const membersOf = (pairId) => (String(pairId).startsWith('profile-pair:') ? String(pairId).slice(13).split(':') : [parts.get(pairId)?.athlete_a_id, parts.get(pairId)?.athlete_b_id]).filter(Boolean);
    const active = (id) => athletes.get(id) && !athletes.get(id).retired && athletes.get(id).career_status !== 'aposentado';
    const ai = (await E.Tournament.filter({})).filter((t) => t.world_tour_resolved && t.status === 'finalizado' && t.world_tour_event !== false && (t.draw_ranking_snapshot || []).length);
    const wrong = [];
    const finals = [];
    let pairs = 0;
    for (const t of ai) {
      for (const entry of t.draw_ranking_snapshot) {
        pairs += 1;
        const placement = (t.placements || []).find((p) => (p.pair_id ? p.pair_id === entry.pair_id : p.team === entry.name));
        const expected = pointsFor(t.tier, placement?.position, t.simulated_entrants);
        for (const id of membersOf(entry.pair_id).filter(active)) {
          const row = results.find((r) => r.athlete_id === id && r.tournament_id === t.id);
          if (!row || Number(row.points) !== expected) wrong.push({ t, entry, expected, got: row?.points });
        }
      }
      const byLabel = (label) => t.draw_ranking_snapshot.find((e) => e.name === label);
      const champ = byLabel(t.champion); const runner = byLabel(t.runner_up);
      finals.push(champ && runner && key(membersOf(champ.pair_id)) === key(t.champion_athlete_ids) && key(membersOf(runner.pair_id)) === key(t.runner_up_athlete_ids));
    }
    return { ai, wrong, finals, pairs, results, membersOf };
  }

  // ═══ Execução 1 — cenário exato da reprodução (mesma seed, nenhuma intervenção) ═══
  {
    const rt = await boot('repro-7h-ai');
    await rt.advance(32);
    const { ai, wrong, finals, pairs, results, membersOf } = await auditAiTournaments();
    ok('1a. reprodução: todas as duplas de todos os torneios de IA pontuam pela colocação real (antes: 8 de 88 erradas)',
      ai.length >= 4 && pairs >= 80 && wrong.length === 0, `${ai.length} torneios, ${pairs} duplas; ${wrong.slice(0, 3).map((w) => `${w.entry.name} ${w.got}≠${w.expected}`).join(' | ')}`);
    // As 8 duplas afetadas, com a colocação real e os pontos antes/depois medidos na reprodução.
    const affected = [
      ['Marc Quílez & Federico Mouriño', 1, 100, 60], ['Mariano Agustín González San Martín & Flavio Abbate', 22, 5, 36],
      ['Marc Sintes Villalonga & Enrique Goenaga', 3, 36, 18], ['Francisco Cabeza Teres & Alonso Rodríguez Martínez', 13, 9, 5],
      ['José Antonio Diestro & Ignacio Piotto Albornoz', 10, 9, 5], ['Gonzalo Alfonso & Álex Chozas', 10, 45, 23],
      ['Juanlu Esbrí & Alejandro Ruiz', 6, 90, 45], ['Juan Tello & Javier Garrido', 20, 23, 45],
    ];
    const status = affected.map(([name, position, expected]) => {
      const t = ai.find((x) => x.draw_ranking_snapshot.some((e) => e.name === name));
      const entry = t?.draw_ranking_snapshot.find((e) => e.name === name);
      const pos = (t?.placements || []).find((p) => p.team === name)?.position;
      const pts = entry ? membersOf(entry.pair_id).map((id) => Number(results.find((r) => r.athlete_id === id && r.tournament_id === t.id)?.points)) : [];
      return { name, ok: pos === position && pts.length === 2 && pts.every((p) => p === expected), pos, pts };
    });
    ok('1b. as 8 duplas afetadas recebem os pontos da colocação real (campeão 100, eliminado na estreia 5, …)', status.every((s) => s.ok), JSON.stringify(status.filter((s) => !s.ok)));
    ok('1c. campeão e vice gravados (ids dos atletas) = duplas que jogaram a final da chave, em todo torneio', finals.length >= 4 && finals.every(Boolean));
    // Race: dentro do ano, a Race de cada atleta das 8 duplas = soma dos resultados de torneio datados (acumulador do ano).
    const athletes = new Map((await E.AthleteProfile.filter({})).map((a) => [a.id, a]));
    const raceIssues = affected.flatMap(([name]) => {
      const t = ai.find((x) => x.draw_ranking_snapshot.some((e) => e.name === name));
      return membersOf(t.draw_ranking_snapshot.find((e) => e.name === name).pair_id).filter((id) => {
        const sum = results.filter((r) => r.athlete_id === id && r.tournament_id && String(r.date || '').startsWith('2026')).reduce((s, r) => s + Number(r.points), 0);
        return Number(athletes.get(id).race_points || 0) !== sum;
      });
    });
    ok('1d. Race das 8 duplas = soma dos resultados reais do ano (sem pontos da ordem de força)', raceIssues.length === 0, raceIssues.join(','));
    // Ledger: duplas com 1 evento registram as partidas reais (+BYE, regra existente do AI-only).
    const ledger = new Map((await E.TeamRanking.filter({})).map((r) => [key([r.player1_id, r.player2_id]), r]));
    const ledgerIssues = [];
    let ledgerChecked = 0;
    for (const t of ai) {
      const rec = realRecord(t.bracket_history);
      for (const entry of t.draw_ranking_snapshot) {
        const row = ledger.get(key(membersOf(entry.pair_id)));
        if (!row || row.stats_source !== 'ledger' || Number(row.ledger_events) !== 1) continue;
        ledgerChecked += 1;
        const real = rec.get(entry.name) || { w: 0, l: 0 };
        if (Number(row.wins) !== real.w || Number(row.losses) !== real.l) ledgerIssues.push(`${entry.name}: ${row.wins}V/${row.losses}D real ${real.w}V/${real.l}D`);
      }
    }
    ok('1e. histórico da parceria (ledger) = partidas reais da chave, inclusive das duplas afetadas', ledgerChecked >= 40 && ledgerIssues.length === 0, `${ledgerChecked} duplas; ${ledgerIssues.slice(0, 3).join(' | ')}`);
  }

  // ═══ Execução 2 — ordem invertida provocada no torneio já sorteado ═══
  {
    const rt = await boot('local-7h1');
    // Homônimas (LOCAL-7E): um terço das duplas procedurais com o mesmo nome antes dos sorteios.
    {
      const athletes = await E.AthleteProfile.filter({});
      const byId = new Map(athletes.map((a) => [a.id, a]));
      const updates = [];
      const seen = new Set();
      let count = 0;
      for (const a of athletes) {
        const b = byId.get(a.ai_partner_id);
        if (!b || b.ai_partner_id !== a.id || seen.has(a.id) || seen.has(b.id) || realBotIds.has(a.bot_id) || realBotIds.has(b.bot_id)) continue;
        seen.add(a.id); seen.add(b.id);
        if (count % 3 === 0) updates.push({ id: a.id, name: 'Hugo López', sport_name: 'Hugo López' }, { id: b.id, name: 'Rafael López', sport_name: 'Rafael López' });
        count += 1;
      }
      await E.AthleteProfile.bulkUpdate(updates);
    }
    let target = null;
    for (let i = 0; i < 40 && !target; i += 1) {
      await rt.advance(1);
      target = (await E.Tournament.filter({ status: 'chaveamento' })).find((t) => !t.world_tour_resolved && (t.draw_ranking_snapshot || []).filter((e) => String(e.pair_id).startsWith('profile-pair:')).length >= 3) || null;
    }
    ok('2a. cenário: torneio de IA sorteado com duplas reais `profile-pair` ainda não liquidado', Boolean(target));
    const profilePairs = target.draw_ranking_snapshot.filter((e) => String(e.pair_id).startsWith('profile-pair:'));
    const [viaPartnership, viaRanking, retiredPair] = profilePairs;
    const idsOf = (entry) => entry.pair_id.slice('profile-pair:'.length).split(':');
    // Mecanismo 1: o mercado cria a Partnership da dupla com os membros na ordem INVERSA do rótulo do sorteio.
    {
      const [x, y] = idsOf(viaPartnership);
      const athleteX = await E.AthleteProfile.get(x);
      const [first, second] = viaPartnership.name.startsWith(athleteX.name) ? [y, x] : [x, y];
      await E.Partnership.create({ id: `partnership-${first}-${second}-l7h1`, status: 'ativa', scope: 'world', partnership_type: 'npc', athlete_a_id: first, athlete_b_id: second, chemistry: 60, started_career_date: '2026-01-01' });
    }
    // Mecanismo 2: troca semanal de posição no ranking — o membro listado depois passa à frente.
    {
      const [x, y] = idsOf(viaRanking);
      const ax = await E.AthleteProfile.get(x); const ay = await E.AthleteProfile.get(y);
      await E.AthleteProfile.update(x, { world_ranking_points: ay.world_ranking_points, ranking_points: ay.world_ranking_points });
      await E.AthleteProfile.update(y, { world_ranking_points: ax.world_ranking_points, ranking_points: ax.world_ranking_points });
    }
    // Aposentadoria (LOCAL-7G.1) de um integrante de uma terceira dupla real depois do sorteio.
    const retiredId = idsOf(retiredPair)[0];
    await E.AthleteProfile.update(retiredId, { retired: true, career_status: 'aposentado', market_status: 'aposentado', ai_partner_id: null });
    // Save/load entre o sorteio e o settlement.
    const bracketBefore = sha(target.bracket_history);
    await rt.reload();
    ok('2b. save/load antes do settlement: chave e rótulos do sorteio preservados', sha((await E.Tournament.get(target.id)).bracket_history) === bracketBefore);
    for (let i = 0; i < 12 && !(await E.Tournament.get(target.id)).world_tour_resolved; i += 1) await rt.advance(1);
    const t = await E.Tournament.get(target.id);
    const results = (await E.AthleteRankingResult.filter({})).filter((r) => r.tournament_id === t.id);
    const placementOf = (entry) => (t.placements || []).find((p) => (p.pair_id ? p.pair_id === entry.pair_id : p.team === entry.name))?.position;
    const pointsOf = (id) => Number(results.find((r) => r.athlete_id === id)?.points);
    const expectedOf = (entry) => pointsFor(t.tier, placementOf(entry), t.simulated_entrants);
    ok('2c. ordem INVERTIDA por Partnership nova: a dupla pontua pela colocação real (ids estáveis)', idsOf(viaPartnership).every((id) => pointsOf(id) === expectedOf(viaPartnership)),
      `${viaPartnership.name}: ${idsOf(viaPartnership).map(pointsOf).join('/')} esperado ${expectedOf(viaPartnership)}`);
    ok('2d. troca de posição no ranking entre sorteio e settlement: a dupla pontua pela colocação real', idsOf(viaRanking).every((id) => pointsOf(id) === expectedOf(viaRanking)),
      `${viaRanking.name}: ${idsOf(viaRanking).map(pointsOf).join('/')} esperado ${expectedOf(viaRanking)}`);
    const activePartner = idsOf(retiredPair)[1];
    ok('2e. aposentadoria após o sorteio: parceiro ativo pontua pela colocação real; aposentado sem gravação (LOCAL-7G.1)',
      pointsOf(activePartner) === expectedOf(retiredPair) && !results.some((r) => r.athlete_id === retiredId));
    const { wrong, finals } = await auditAiTournaments();
    ok('2f. todo o campo de todos os torneios de IA pontua pela colocação real (inclusive homônimas — LOCAL-7E)', wrong.length === 0, wrong.slice(0, 3).map((w) => `${w.entry.name} ${w.got}≠${w.expected}`).join(' | '));
    ok('2g. campeão e vice gravados = finalistas da chave em todos os torneios', finals.every(Boolean));
    ok('2h. um resultado por atleta no torneio (sem duplicação)', results.length === new Set(results.map((r) => r.athlete_id)).size);

    // Idempotência: settlement repetido, novos dias e reload não mudam o torneio liquidado.
    const digest = sha([results.map((r) => [r.id, r.points]).sort(), t.placements, t.champion_athlete_ids, t.runner_up_athlete_ids]);
    await quiet(resolveCompletedWorldTourEvents)((await E.PlayerProfile.get(rt.profileId)).career_date);
    await rt.advance(2);
    await rt.reload();
    const t2 = await E.Tournament.get(target.id);
    const results2 = (await E.AthleteRankingResult.filter({})).filter((r) => r.tournament_id === t.id);
    ok('2i. idempotência e persistência: settlement repetido, novos dias e reload não alteram o torneio liquidado',
      sha([results2.map((r) => [r.id, r.points]).sort(), t2.placements, t2.champion_athlete_ids, t2.runner_up_athlete_ids]) === digest);
  }

  // Determinismo: a mesma seed produz exatamente os mesmos resultados e colocações.
  {
    const run = async () => {
      const rt = await boot('local-7h1-det');
      await rt.advance(30);
      const ai = (await E.Tournament.filter({})).filter((t) => t.world_tour_resolved && t.world_tour_event !== false);
      const rows = (await E.AthleteRankingResult.filter({})).filter((r) => ai.some((t) => t.id === r.tournament_id));
      return sha([ai.map((t) => [t.id, t.placements, t.champion_athlete_ids]).sort(), rows.map((r) => [r.id, r.points]).sort()]);
    };
    ok('3. determinismo: duas execuções com a mesma seed geram colocações e pontos idênticos', (await run()) === (await run()));
  }
  console.log(`\nLOCAL-7H.1: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
