// LOCAL-7E — identidade da dupla nas chaves, resultados e rankings.
//   Duas duplas DISTINTAS com o mesmo nome de exibição ("Hugo López & Rafael López", caso real da CLOUD-7C) precisam
//   continuar sendo duas equipes: chave, colocações, campeão/vice, settlement, pontos e ranking por identidade.
//   A. Funções puras de produção: chave com/sem colisão (saída inalterada sem colisão), final entre homônimas, caso
//      "fundido", validador, derivação da chave persistida, resolvePairPlacements (id, nome único, legado ambíguo),
//      identidade de buildCanonicalPairs (ordem dos membros, parceria desfeita/nova).
//   B. Mundo só de IA (carreira nova em memória, pipeline diário real): subconjunto de duplas homônimas, settlement por
//      id, pontos/ledger/ranking por atleta, um torneio "sorteado antes da correção" (ids removidos) liquidado de forma
//      conservadora, save/load com torneio em andamento, idempotência e determinismo.
//   C. Sorteio do jogador (ensureTournamentDraw real) com homônimas no campo: nenhuma equipe repetida na chave.
// Uso: node scripts/test-local-7e-pair-identity.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

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

const HOMONYM = 'Hugo López & Rafael López';
const ID_FIELDS = ['team_a_pair_id', 'team_b_pair_id', 'winner_pair_id'];
const stripIds = (rounds) => rounds.map((round) => {
  const { bye_pair_ids: _byes, ...rest } = round;
  return { ...rest, matches: (round.matches || []).map((match) => Object.fromEntries(Object.entries(match).filter(([key]) => !ID_FIELDS.includes(key)))) };
});

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const s = await load('/src/gameplay/worldTour/tournamentSettlement.js');
  const w = await load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const quiet = (fn) => async (...a) => { const wn = console.warn; const l = console.log; const d = console.debug; const e = console.error; console.warn = () => {}; console.log = () => {}; console.debug = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.warn = wn; console.log = l; console.debug = d; console.error = e; } };

  // ═══ A. Funções puras ═══
  const field = (strengths, homonyms = [0, 1]) => strengths.map((strength, i) => ({
    name: homonyms.includes(i) ? HOMONYM : `Outra ${i} A & Outra ${i} B`, strength, seedRank: i + 1, pair_id: `pair-${i}`,
  }));
  const positionsById = (facts) => new Map(facts.placements.map((p) => [p.pair_id, p.position]));
  {
    const unique = field([900, 800, 700, 600, 500, 400, 300, 200], []);
    const withIds = s.buildCanonicalTournamentBracket({ tournamentId: 'l7e-a1', participants: unique, date: '2035-06-25' });
    const withoutIds = s.buildCanonicalTournamentBracket({ tournamentId: 'l7e-a1', participants: unique.map(({ pair_id: _p, ...rest }) => rest), date: '2035-06-25' });
    ok('A1. sem colisão de nomes a chave é byte a byte a mesma de antes (nenhum campo novo, save inalterado)', sha(withIds) === sha(withoutIds) && !JSON.stringify(withIds).includes('pair_id'));
    ok('A2. determinismo: mesma entrada, mesma chave', sha(s.buildCanonicalTournamentBracket({ tournamentId: 'l7e-a1', participants: unique, date: '2035-06-25' })) === sha(withIds));

    const final = s.buildCanonicalTournamentBracket({ tournamentId: 'l7e-a3', participants: field([900, 800, 50, 40, 30, 20, 10, 5]), date: '2035-06-25' });
    const finalMatch = final.bracket_history.at(-1).matches[0];
    ok('A3. final entre homônimas: as duas na final, campeã = a que venceu (mais forte), vice = a outra',
      finalMatch.team_a === HOMONYM && finalMatch.team_b === HOMONYM && final.champion_pair_id === 'pair-0' && final.runner_up_pair_id === 'pair-1' && finalMatch.winner_pair_id === 'pair-0');
    ok('A4. colocações: 8 entradas, 8 duplas distintas, campeã #1 e vice #2', final.placements.length === 8 && new Set(final.placements.map((p) => p.pair_id)).size === 8
      && positionsById(final).get('pair-0') === 1 && positionsById(final).get('pair-1') === 2);

    // Caso "fundido" da CLOUD-7C (tor-gol-w31-2): uma homônima é vice, a outra cai antes. Antes: 7 colocações para 8.
    const fused = s.buildCanonicalTournamentBracket({ tournamentId: 'l7e-a5', participants: field([100, 800, 900, 40, 30, 20, 10, 5]), date: '2035-06-25' });
    const fusedPos = positionsById(fused);
    const fusedFinal = fused.bracket_history.at(-1).matches[0];
    const finalistHomonym = [fusedFinal.team_a_pair_id, fusedFinal.team_b_pair_id].find((id) => id === 'pair-0' || id === 'pair-1');
    const otherHomonym = finalistHomonym === 'pair-0' ? 'pair-1' : 'pair-0';
    ok('A5. caso fundido: 8 colocações para 8 duplas; só a homônima que jogou a final é vice', fused.placements.length === 8 && fused.champion_pair_id === 'pair-2'
      && fused.runner_up_pair_id === finalistHomonym && fusedPos.get(finalistHomonym) === 2 && fusedPos.get(otherHomonym) > 2);
    ok('A6. validador aceita homônimas distintas (sem o falso "aparece duas vezes")', s.validateCanonicalBracketGraph(final).valid && s.validateCanonicalBracketGraph(fused).valid);
    const corrupted = JSON.parse(JSON.stringify(final));
    corrupted.bracket_history[0].matches[1].team_a_pair_id = corrupted.bracket_history[0].matches[0].team_a_pair_id;
    ok('A7. validador continua apontando a MESMA dupla em dois lugares da rodada', !s.validateCanonicalBracketGraph(corrupted).valid);

    // Chave persistida (round-trip JSON = save/load) → fatos idênticos aos do sorteio.
    const persisted = JSON.parse(JSON.stringify(fused.bracket_history));
    const derived = s.deriveTournamentFactsFromFullBracket(persisted);
    ok('A8. fatos derivados da chave salva = fatos do sorteio (campeão/vice/colocações por id)',
      derived.champion_pair_id === fused.champion_pair_id && derived.runner_up_pair_id === fused.runner_up_pair_id
      && sha(derived.placements) === sha(fused.placements) && derived.participants.length === 8);
    const uniqueDerived = s.deriveTournamentFactsFromFullBracket(JSON.parse(JSON.stringify(withIds.bracket_history)));
    ok('A9. sem colisão a derivação é a de antes (colocações por nome, sem pair_id)', sha(uniqueDerived.placements) === sha(withIds.placements) && !('champion_pair_id' in uniqueDerived));

    const pairs = field([100, 800, 900, 40, 30, 20, 10, 5]).map((p) => ({ id: p.pair_id, name: p.name }));
    const byId = s.resolvePairPlacements(pairs, derived);
    ok('A10. resolvePairPlacements por id: cada dupla na sua posição, campeã/vice corretas, nada ambíguo',
      pairs.every((p) => byId.positions.get(p.id) === fusedPos.get(p.id)) && byId.champion?.id === fused.champion_pair_id && byId.runnerUp?.id === finalistHomonym && !byId.ambiguousNames.length);

    // Save antigo: chave sorteada antes da correção (sem ids) com homônimas.
    const legacy = s.deriveTournamentFactsFromFullBracket(stripIds(persisted));
    const legacyResolved = s.resolvePairPlacements(pairs, legacy);
    const homonymPositions = [legacyResolved.positions.get('pair-0'), legacyResolved.positions.get('pair-1')];
    ok('A11. save antigo ambíguo: homônimas sinalizadas, mesma posição para as duas = a PIOR verdadeira (nunca acima do provado)',
      legacyResolved.ambiguousNames.includes(HOMONYM) && homonymPositions[0] === homonymPositions[1]
      && homonymPositions[0] === Math.max(fusedPos.get('pair-0'), fusedPos.get('pair-1')));
    ok('A12. save antigo: vice ambíguo não é atribuído a nenhuma homônima; duplas de nome único mantêm a posição',
      legacyResolved.runnerUp === null && legacyResolved.champion?.id === 'pair-2'
      && pairs.filter((p) => p.name !== HOMONYM).every((p) => legacyResolved.positions.get(p.id) === fusedPos.get(p.id)));
    const legacyFinal = s.resolvePairPlacements(pairs.map((p, i) => ({ ...p, id: `pair-${i}` })), s.deriveTournamentFactsFromFullBracket(stripIds(final.bracket_history)));
    ok('A13. save antigo com final entre homônimas: nenhuma recebe o título (as duas = vice, a pior posição listada)',
      legacyFinal.champion === null && legacyFinal.runnerUp === null && legacyFinal.positions.get('pair-0') === 2 && legacyFinal.positions.get('pair-1') === 2);
    const fusedOldShape = { ...legacy, placements: legacy.placements.filter((p, i, all) => all.findIndex((q) => q.team === p.team) === i) };
    const fusedResolved = s.resolvePairPlacements(pairs, fusedOldShape);
    ok('A14. save antigo já FUNDIDO (7 colocações para 8): homônimas recebem a última posição, nunca a de vice',
      fusedResolved.positions.get('pair-0') === 8 && fusedResolved.positions.get('pair-1') === 8);
    const uniqueResolved = s.resolvePairPlacements(unique.map((p) => ({ id: p.pair_id, name: p.name })), uniqueDerived);
    const oldMap = new Map(uniqueDerived.placements.map((p) => [p.team, p.position]));
    ok('A15. save antigo sem colisão: mesma colocação que a busca por nome de antes', unique.every((p) => uniqueResolved.positions.get(p.pair_id) === oldMap.get(p.name)) && !uniqueResolved.ambiguousNames.length);

    const idem = s.finalizeTournamentFromBracket({ tournament: { id: 'x', world_tour_resolved: true, champion: HOMONYM }, bracket: derived });
    ok('A16. settlement idempotente: torneio já resolvido não é reprocessado', idem.idempotent === true && !Object.keys(idem.patch).length);
    const patch = s.finalizeTournamentFromBracket({ tournament: { id: 'y' }, bracket: derived }).patch;
    ok('A17. settlement grava campeão/vice por id ao lado dos nomes', patch.champion_pair_id === 'pair-2' && patch.runner_up_pair_id === finalistHomonym && patch.champion === derived.champion);

    // Identidade das duplas (buildCanonicalPairs): atletas homônimos, ordem dos membros, parceria desfeita/nova.
    const ath = (id, name) => ({ id, name });
    const athletes = [ath('h1', 'Hugo López'), ath('r1', 'Rafael López'), ath('h2', 'Hugo López'), ath('r2', 'Rafael López'), ath('x1', 'Ana Ruiz'), ath('x2', 'Bia Sol')];
    const built = w.buildCanonicalPairs([
      { id: 'p-A', status: 'ativa', athlete_a_id: 'h1', athlete_b_id: 'r1', scope: 'world' },
      { id: 'p-B', status: 'ativa', athlete_a_id: 'r2', athlete_b_id: 'h2', scope: 'world' },
      { id: 'p-old', status: 'encerrada', athlete_a_id: 'h1', athlete_b_id: 'r2', scope: 'world' },
    ], athletes);
    ok('A18. atletas homônimos formam duplas distintas por id; parceria encerrada não forma dupla', built.length === 2 && new Set(built.map((p) => p.id)).size === 2
      && built.find((p) => p.id === 'p-A').athletes.map((a) => a.id).join() === 'h1,r1');
    ok('A19. a ordem dos membros muda só o rótulo, não a identidade', built.find((p) => p.id === 'p-B').name === 'Rafael López & Hugo López' && built.find((p) => p.id === 'p-A').name === HOMONYM);
    const viaProfile = w.buildCanonicalPairs([], [{ ...ath('zz', 'Zé'), ai_partner_id: 'aa' }, { ...ath('aa', 'Ana'), ai_partner_id: 'zz' }]);
    const viaProfileSwapped = w.buildCanonicalPairs([], [{ ...ath('aa', 'Ana'), ai_partner_id: 'zz' }, { ...ath('zz', 'Zé'), ai_partner_id: 'aa' }]);
    ok('A20. dupla sem Partnership: id `profile-pair:` com ids ordenados, independente da ordem', viaProfile[0].id === 'profile-pair:aa:zz' && viaProfileSwapped[0].id === viaProfile[0].id);
  }

  // ═══ B/C. Carreira em memória ═══
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { getRealAthleteRegistry } = await load('/src/players/realAthleteRegistry.js');
  const { ensureTournamentDraw } = await load('/src/lib/tournamentDraw.js');
  const realBotIds = new Set(getRealAthleteRegistry().map((entry) => entry?.id).filter(Boolean));

  async function boot(seed) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Local 7E' });
    activeCareerAdapter.setActiveCareer(career);
    const profileId = 'l7e-player';
    await activeCareerAdapter.createPlayerProfile({
      id: profileId, sport_name: 'Local 7E', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
      court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
    });
    await quiet(async () => { const status = await verifySaveFoundation(); if (!status.ok) await ensureWorldSeed2025(); })();
    const advance = quiet(async (n, onDay = null) => {
      let profile = await localGame.entities.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) {
        await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork();
        profile = await localGame.entities.PlayerProfile.get(profileId);
        if (onDay && await onDay(profile) === 'stop') break;
      }
      return profile;
    });
    const reload = async () => {
      await activeCareerAdapter.writeChain;
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
    };
    return { profileId, advance, reload };
  }
  // Duplas procedurais mutuamente parceiras (os reais ficam intactos); uma em cada três vira "Hugo López & Rafael López".
  async function makeHomonyms() {
    const athletes = await localGame.entities.AthleteProfile.filter({});
    const byId = new Map(athletes.map((a) => [a.id, a]));
    const pairs = [];
    const seen = new Set();
    for (const a of athletes.sort((x, y) => (x.ranking_position || 9999) - (y.ranking_position || 9999))) {
      const b = byId.get(a.ai_partner_id);
      if (!b || b.ai_partner_id !== a.id || seen.has(a.id) || seen.has(b.id) || realBotIds.has(a.bot_id) || realBotIds.has(b.bot_id)) continue;
      seen.add(a.id); seen.add(b.id);
      pairs.push([a, b]);
    }
    const chosen = pairs.filter((_, index) => index % 3 === 0);
    await localGame.entities.AthleteProfile.bulkUpdate(chosen.flatMap(([a, b]) => [
      { id: a.id, name: 'Hugo López', sport_name: 'Hugo López' }, { id: b.id, name: 'Rafael López', sport_name: 'Rafael López' },
    ]));
    return new Set(chosen.flatMap(([a, b]) => [a.id, b.id]));
  }

  // ═══ B. Mundo só de IA ═══
  {
    const rt = await boot('local-7e-world');
    const homonymAthletes = await makeHomonyms();
    ok('B1. cenário: atletas DISTINTOS com nomes iguais (ids diferentes, mesmo nome)', homonymAthletes.size >= 40);

    // Avança até haver um torneio sorteado COM homônimas e ainda não liquidado; tira os ids da chave dele (como um
    // sorteio feito antes desta correção) e faz save/load no meio do torneio.
    let legacyId = null;
    let controlId = null;
    await rt.advance(40, async () => {
      const open = (await localGame.entities.Tournament.filter({ status: 'chaveamento' })).filter((t) => Array.isArray(t.bracket_history) && JSON.stringify(t.bracket_history).includes('winner_pair_id'));
      if (open.length >= 2) { [legacyId, controlId] = [open[0].id, open[1].id]; return 'stop'; }
      return null;
    });
    ok('B2. sorteio D-3 real grava a identidade na chave quando há homônimas', legacyId && controlId);
    const legacyBefore = await localGame.entities.Tournament.get(legacyId);
    const truth = s.deriveTournamentFactsFromFullBracket(legacyBefore.bracket_history);
    await localGame.entities.Tournament.update(legacyId, { bracket_history: stripIds(legacyBefore.bracket_history) });
    const controlBefore = sha((await localGame.entities.Tournament.get(controlId)).bracket_history);
    await rt.reload();
    ok('B3. save/load com torneio em andamento preserva a chave e a identidade', sha((await localGame.entities.Tournament.get(controlId)).bracket_history) === controlBefore);

    await rt.advance(20);
    const tournaments = await localGame.entities.Tournament.filter({});
    const results = await localGame.entities.AthleteRankingResult.filter({});
    const resultsFor = (tid) => results.filter((r) => r.tournament_id === tid);
    const withIds = tournaments.filter((t) => t.status === 'finalizado' && t.world_tour_resolved && t.placements?.some((p) => p.pair_id));
    ok('B4. torneios com homônimas liquidados por identidade (há vários, inclusive o de controle)', withIds.length >= 3 && withIds.some((t) => t.id === controlId), `${withIds.length}`);

    const checkTournament = (t) => {
      const pairIds = t.draw_pair_ids || [];
      const placementById = new Map(t.placements.map((p) => [p.pair_id, p]));
      const rows = resultsFor(t.id);
      const pointsByAthlete = new Map(rows.map((r) => [r.athlete_id, Number(r.points) || 0]));
      const issues = [];
      if (t.placements.length !== pairIds.length) issues.push(`colocações ${t.placements.length} != duplas ${pairIds.length}`);
      if (new Set(t.placements.map((p) => p.pair_id)).size !== t.placements.length) issues.push('pair_id repetido nas colocações');
      if (!pairIds.every((id) => placementById.has(id))) issues.push('dupla sorteada sem colocação');
      if (t.champion_pair_id !== t.placements[0].pair_id || t.runner_up_pair_id !== t.placements[1].pair_id) issues.push('campeão/vice divergem das colocações');
      if (rows.length !== new Set(rows.map((r) => r.athlete_id)).size) issues.push('atleta com dois resultados no mesmo torneio');
      return { issues, pointsByAthlete, placementById };
    };
    const allIssues = withIds.flatMap((t) => checkTournament(t).issues.map((issue) => `${t.id}: ${issue}`));
    ok('B5. cada dupla sorteada tem exatamente uma colocação; campeão/vice = #1/#2; um resultado por atleta', allIssues.length === 0, allIssues.slice(0, 3).join(' | '));

    // Pontos por atleta seguem a colocação da SUA dupla: campeã e vice (por id) com pontos iguais entre os membros,
    // campeã com o máximo do torneio.
    const pointIssues = [];
    for (const t of withIds) {
      const { pointsByAthlete } = checkTournament(t);
      const champIds = t.champion_athlete_ids || [];
      const champPoints = champIds.map((id) => pointsByAthlete.get(id));
      if (champIds.length !== 2 || champPoints.some((p) => !(p > 0)) || champPoints[0] !== champPoints[1]) pointIssues.push(`${t.id}: campeã sem pontos iguais`);
      if (Math.max(...pointsByAthlete.values()) !== champPoints[0]) pointIssues.push(`${t.id}: campeã não tem o máximo`);
      const runnerPoints = (t.runner_up_athlete_ids || []).map((id) => pointsByAthlete.get(id));
      if (runnerPoints.length !== 2 || runnerPoints[0] !== runnerPoints[1] || !(runnerPoints[0] < champPoints[0])) pointIssues.push(`${t.id}: vice incoerente`);
      if (t.champion_athlete_ids?.some((id) => t.runner_up_athlete_ids.includes(id))) pointIssues.push(`${t.id}: campeã = vice`);
    }
    ok('B6. pontos para os atletas certos: campeã e vice (por id) com os pontos da própria colocação', pointIssues.length === 0, pointIssues.slice(0, 3).join(' | '));

    // Nomes repetidos de cada torneio, pelo snapshot do sorteio (pair_id ↔ nome no instante do sorteio).
    const duplicateNames = (t) => {
      const names = (t.draw_ranking_snapshot || []).map((entry) => entry.name);
      return new Set(names.filter((name, i) => names.indexOf(name) !== i));
    };
    const partnerships = new Map((await localGame.entities.Partnership.filter({})).map((p) => [p.id, p]));
    const membersOf = (pairId) => (String(pairId).startsWith('profile-pair:')
      ? String(pairId).slice('profile-pair:'.length).split(':')
      : [partnerships.get(pairId)?.athlete_a_id, partnerships.get(pairId)?.athlete_b_id]).filter(Boolean).sort().join(',');
    const finalsOk = withIds.every((t) => {
      const final = t.bracket_history.at(-1).matches[0];
      const loser = final.winner_pair_id === final.team_a_pair_id ? final.team_b_pair_id : final.team_a_pair_id;
      return final.winner_pair_id === t.champion_pair_id && loser === t.runner_up_pair_id
        && membersOf(t.champion_pair_id) === [...t.champion_athlete_ids].sort().join(',') && membersOf(t.runner_up_pair_id) === [...t.runner_up_athlete_ids].sort().join(',');
    });
    const homonymFinalists = withIds.filter((t) => duplicateNames(t).has(t.champion) || duplicateNames(t).has(t.runner_up));
    ok('B7. campeã e vice = os pares que jogaram a final (por id), com os atletas DESSES pares — inclusive homônimas finalistas',
      finalsOk && homonymFinalists.every((t) => [...t.champion_athlete_ids, ...t.runner_up_athlete_ids].every(Boolean)), `${homonymFinalists.length} finais com homônima`);
    const independent = withIds.filter((t) => {
      const dup = duplicateNames(t);
      return t.bracket_history.slice(1).some((round) => {
        const seen = new Map();
        for (const m of round.matches) for (const name of [m.team_a, m.team_b]) if (dup.has(name)) seen.set(name, (seen.get(name) || 0) + 1);
        return [...seen.values()].some((count) => count >= 2);
      });
    });
    ok('B8. eliminação de uma homônima não elimina a outra: há chaves com duas homônimas vivas na mesma rodada após a 1ª', independent.length > 0, `${independent.length}`);

    // Ledger de dupla (V/D) e ranking separados por par de atletas.
    const teamRows = await localGame.entities.TeamRanking.filter({});
    const homonymRows = teamRows.filter((r) => homonymAthletes.has(r.player1_id) && homonymAthletes.has(r.player2_id));
    ok('B9. ranking de duplas: homônimas continuam linhas distintas (uma por par de atletas), sem fusão',
      homonymRows.length >= 10 && homonymRows.length === new Set(homonymRows.map((r) => [r.player1_id, r.player2_id].sort().join('_'))).size);

    // Torneio "sorteado antes da correção": liquidação conservadora.
    const legacy = await localGame.entities.Tournament.get(legacyId);
    const legacyRows = resultsFor(legacyId);
    const pairs = (legacy.draw_ranking_snapshot || []).map((entry) => ({ id: entry.pair_id, name: entry.name }));
    const legacyDup = duplicateNames(legacy);
    const truthPos = new Map(truth.placements.map((p) => [p.pair_id, p.position]));
    ok('B10. save antigo ambíguo: torneio liquidado, sinalizado e sem campeã/vice escolhida por palpite quando ambíguas',
      legacy.status === 'finalizado' && legacy.pair_identity_ambiguous === true && legacyDup.size > 0 && [...legacyDup].every((name) => legacy.pair_identity_ambiguous_names?.includes(name))
      && (!legacyDup.has(legacy.champion) || legacy.champion_athlete_ids.length === 0) && (!legacyDup.has(legacy.runner_up) || legacy.runner_up_athlete_ids.length === 0)
      && !JSON.stringify(legacy.placements).includes('pair_id'));
    const legacyPositions = s.resolvePairPlacements(pairs, legacy).positions;
    const groupsOk = [...legacyDup].every((name) => {
      const ids = pairs.filter((p) => p.name === name).map((p) => p.id);
      const worst = Math.max(...ids.map((id) => truthPos.get(id)));
      return ids.length >= 2 && ids.every((id) => legacyPositions.get(id) === worst);
    });
    ok('B11. save antigo ambíguo: cada homônima recebe a pior posição verdadeira do grupo (nunca crédito acima do provado); as demais, a verdadeira',
      groupsOk && pairs.filter((p) => !legacyDup.has(p.name)).every((p) => legacyPositions.get(p.id) === truthPos.get(p.id)));
    ok('B12. save antigo ambíguo: um resultado por atleta, sem duplicar nem inventar', legacyRows.length === new Set(legacyRows.map((r) => r.athlete_id)).size
      && legacyRows.every((r) => Number.isFinite(Number(r.points))));

    // Idempotência: torneios finalizados não mudam com mais dias, e o settlement não reprocessa.
    const finishedDigest = sha(tournaments.filter((t) => t.status === 'finalizado').map((t) => [t.id, t.placements, t.champion_athlete_ids]).sort());
    const resultCount = results.length;
    await rt.advance(3);
    const after = await localGame.entities.Tournament.filter({});
    ok('B13. idempotência: torneios já liquidados permanecem idênticos; nenhum resultado duplicado',
      sha(after.filter((t) => tournaments.some((o) => o.id === t.id && o.status === 'finalizado')).map((t) => [t.id, t.placements, t.champion_athlete_ids]).sort()) === finishedDigest
      && (await localGame.entities.AthleteRankingResult.filter({})).every((r, i, all) => all.findIndex((q) => q.id === r.id) === i)
      && (await localGame.entities.AthleteRankingResult.filter({})).length >= resultCount);
    await rt.reload();
    ok('B14. save/load: colocações por id e resultados persistidos', sha((await localGame.entities.Tournament.filter({})).filter((t) => tournaments.some((o) => o.id === t.id && o.status === 'finalizado')).map((t) => [t.id, t.placements, t.champion_athlete_ids]).sort()) === finishedDigest);
  }

  // ═══ C. Sorteio do jogador com homônimas no campo ═══
  {
    const rt = await boot('local-7e-player');
    const homonymAthletes = await makeHomonyms();
    let profile = await rt.advance(8);
    const partner = (await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000)).find((a) => a.career_status !== 'aposentado' && !homonymAthletes.has(a.id));
    profile = await localGame.entities.PlayerProfile.update(rt.profileId, { partner_id: partner.id });
    const checks = [];
    for (const [index, tier] of ['Silver', 'Gold', 'Bronze', 'Platinum'].entries()) {
      const tournamentId = `l7e-player-${tier}`;
      const anchor = profile.career_date;
      const tournament = await localGame.entities.Tournament.create({ id: tournamentId, name: `${tier} 7E`, tier, start_date: anchor, end_date: anchor, status: 'inscricoes', world_tour_event: false });
      const event = await localGame.entities.CalendarEvent.create({
        id: `${tournamentId}-cal`, profile_id: profile.id, event_type: 'tournament', title: tournament.name, start_date: anchor, end_date: anchor,
        related_id: tournamentId, related_name: tournament.name, status: 'scheduled', is_mandatory: true, requires_decision: true, decision_type: 'play_tournament',
        metadata: { registration_id: `${tournamentId}-reg`, partner_id: partner.id, entry_path: 'direct', qualifying_required: index % 2 === 1, team_rank: 0, original_start_date: anchor },
      });
      await quiet(ensureTournamentDraw)({ profile: { ...profile, career_date: anchor }, tournament, calendarEvent: event });
      const drawn = await localGame.entities.Tournament.get(tournamentId);
      const run = (await localGame.entities.CalendarEvent.get(event.id)).metadata?.tournament_run;
      const round0 = (drawn.bracket_history || [])[0]?.matches || [];
      const teamNames = round0.flatMap((m) => [m.team_a, m.team_b]).filter(Boolean);
      const runNames = (run?.matches || []).map((m) => (m.opponent || []).map((o) => o.name).join(' & '));
      const homonymPairsInField = (drawn.draw_ranking_snapshot || []).filter((entry) => (entry.member_ids || []).every((id) => homonymAthletes.has(id))).length;
      checks.push({ tier, teams: teamNames.length, unique: new Set(teamNames).size, runUnique: new Set(runNames).size === runNames.length, homonymPairsInField, snapshotNames: (drawn.draw_ranking_snapshot || []).map((e) => e.name) });
    }
    ok('C1. sorteio do jogador gera as chaves com campo real', checks.every((c) => c.teams >= 4), JSON.stringify(checks.map((c) => [c.tier, c.teams])));
    ok('C2. na chave do jogador nenhuma equipe repete o nome de outra (identidade por nome inequívoca)', checks.every((c) => c.unique === c.teams), JSON.stringify(checks.map((c) => [c.tier, c.teams, c.unique])));
    ok('C3. adversários da campanha (qualifying + chave) sem nomes repetidos', checks.every((c) => c.runUnique));
    ok('C4. homônimas: no máximo uma dupla por nome de exibição entra no campo da chave do jogador', checks.every((c) => new Set(c.snapshotNames).size === c.snapshotNames.length)
      && checks.some((c) => c.homonymPairsInField >= 1), JSON.stringify(checks.map((c) => [c.tier, c.homonymPairsInField, c.snapshotNames.length, new Set(c.snapshotNames).size])));
  }
  console.log(`\nLOCAL-7E: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
