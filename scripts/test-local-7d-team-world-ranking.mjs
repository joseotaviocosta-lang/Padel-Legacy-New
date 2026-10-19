// LOCAL-7D — ranking mundial de duplas.
//   Defeito 1 (interface): a lista Mundial · Duplas exibia `race_points ?? ranking_points`. As linhas semeadas
//     gravam `race_points: 0`, então Coello/Tapia (5V·0D) apareciam com 0 pontos com 24 mil gravados.
//   Defeito 2 (motor): na finalização do torneio do jogador, o parceiro recebia o resultado datado mas mantinha o
//     `world_ranking_points` antigo até a passada semanal; a linha da dupla saía com jogador novo + parceiro antigo.
//   A. Escolha do campo exibido (função pura de produção) e uso dela nas duas views.
//   B. Mundo de IA (carreira nova com a semeadura do navegador): pontos, campeão/vice, ausência de pontos legítima,
//      soma canônica após a projeção semanal, Race, duplicidade, avanço diário, save/load e idempotência.
//   C. Jogador e parceiro: atualização imediata do parceiro, idempotência, segundo torneio, avanço semanal,
//      save/load e troca de parceiro sem transferência de pontos.
// Uso: node scripts/test-local-7d-team-world-ranking.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await load('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await load('/src/lib/bots.js');
  const { getTeamRankings, getTeamRank, ensurePlayerTeamRanking, teamKey, computeCanonicalTeamRankingPoints } = await load('/src/lib/teamRanking.js');
  const { getTeamRaceRankings } = await load('/src/lib/teamRaceRanking.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await load('/src/lib/saveFoundation.js');
  const { repairLegacyPlayerPartnerAthlete } = await load('/src/lib/partnerAthlete.js');
  const { teamListPoints } = await load('/src/lib/rankingDisplay.js');
  const { startPartnership, endPartnership, getActivePartnership } = await load('/src/lib/partnershipSystem.js');
  const { finalizeTournamentRun } = await load('/src/game-core/tournamentLifecycle.js');
  const { processWorldCircuit } = await load('/src/game-core/circuitLifecycle.js');
  const { computeRollingPoints } = await load('/src/game-core/rankingWindow.js');
  const quiet = (fn) => async (...a) => { const w = console.warn; const l = console.log; const d = console.debug; const e = console.error; console.warn = () => {}; console.log = () => {}; console.debug = () => {}; console.error = () => {}; try { return await fn(...a); } finally { console.warn = w; console.log = l; console.debug = d; console.error = e; } };

  // ═══ A. Campo exibido pela lista de Duplas ═══
  {
    const seeded = { ranking_points: 24642, race_points: 0 };
    ok('A1. Mundial exibe ranking_points mesmo com race_points: 0 (o caso Coello/Tapia)', teamListPoints(seeded) === 24642);
    ok('A2. Race exibe race_points (0 legítimo continua 0)', teamListPoints(seeded, { race: true }) === 0);
    ok('A3. Race com pontos exibe race_points, não o mundial', teamListPoints({ ranking_points: 24642, race_points: 1000 }, { race: true }) === 1000);
    ok('A4. valores ausentes/inválidos viram 0, nunca NaN ou negativo', teamListPoints({}) === 0 && teamListPoints(null) === 0 && teamListPoints({ ranking_points: -5 }) === 0);
    const source = fs.readFileSync('src/pages/Ranking.jsx', 'utf8');
    ok('A5. TeamList não mistura mais os campos (`race_points ?? ranking_points` removido)', !/race_points\s*\?\?\s*\w*\.?ranking_points/.test(source));
    ok('A6. só a lista da Race passa `race`; a Mundial usa o padrão', /<TeamList\s+items=\{raceTeams\}\s+race\b/.test(source) && !/<TeamList\s+items=\{teams\}\s+race\b/.test(source));
  }

  async function boot({ seed, profileOverrides = {} }) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    const backend = memoryBackend();
    const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Local 7D' });
    activeCareerAdapter.setActiveCareer(career);
    const profileId = 'l7d-player';
    await activeCareerAdapter.createPlayerProfile({
      id: profileId, sport_name: 'Local 7D', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
      court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false, ...profileOverrides,
    });
    // Mesma sequência do SaveFoundationBootstrap do navegador: é ela que semeia as duplas reais com race_points: 0.
    const bootstrap = quiet(async () => {
      const status = await verifySaveFoundation();
      if (!status.ok) await ensureWorldSeed2025();
      const profile = await localGame.entities.PlayerProfile.get(profileId);
      const resolveTemplate = (id) => { for (const bots of Object.values(BOTS_BY_DIFFICULTY)) { const f = bots?.find((b) => b?.id === id); if (f) return f; } return null; };
      await repairLegacyPlayerPartnerAthlete(profile, resolveTemplate);
      await ensurePlayerTeamRanking(await localGame.entities.PlayerProfile.get(profileId));
    });
    await bootstrap();
    const advance = async (n) => {
      let profile = await localGame.entities.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); profile = await localGame.entities.PlayerProfile.get(profileId); }
      return profile;
    };
    const reload = async () => {
      await activeCareerAdapter.writeChain;
      activeCareerAdapter.clearActiveCareer();
      activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
      await bootstrap();
    };
    return { profileId, advance: quiet(advance), reload, bootstrap };
  }
  const teamDigest = async () => sha((await localGame.entities.TeamRanking.filter({}))
    .map((r) => [r.team_key, r.ranking_points, r.wins, r.losses, r.matches_played, r.stats_source]).sort());
  const findPair = (rows, ids) => rows.find((r) => r.team_key === teamKey(ids[0], ids[1]));

  // ═══ B. Mundo de IA ═══
  {
    const rt = await boot({ seed: 'local-7d-world' });
    const seededRows = await getTeamRankings(600);
    ok('B1. semeadura do navegador: duplas reais nascem com race_points: 0 e pontos mundiais > 0 (pré-condição do defeito)',
      seededRows.slice(0, 20).every((r) => Number(r.race_points) === 0 && Number(r.ranking_points) > 0));
    ok('B2. no Mundial o Top 20 semeado exibe os pontos gravados, não 0', seededRows.slice(0, 20).every((r) => teamListPoints(r) === Number(r.ranking_points) && teamListPoints(r) > 0));

    // 34 dias: torneios de fevereiro resolvidos e a passada semanal de 2026-02-08 já aplicada.
    const profile = await rt.advance(34);
    const rows = await getTeamRankings(600);
    const ledgerWinners = rows.filter((r) => r.stats_source === 'ledger' && Number(r.wins) > 0 && Number(r.ranking_points) > 0);
    ok('B3. duplas de IA com vitórias registradas aparecem com pontos no Mundial', ledgerWinners.length >= 10 && ledgerWinners.every((r) => teamListPoints(r) === Number(r.ranking_points)), `${ledgerWinners.length} duplas`);
    const topLedger = rows.slice(0, 10).filter((r) => r.stats_source === 'ledger');
    ok('B4. nenhuma das 10 primeiras duplas exibe 0 pontos', rows.slice(0, 10).every((r) => teamListPoints(r) > 0) && topLedger.length > 0);

    const athletes = new Map((await localGame.entities.AthleteProfile.filter({})).map((a) => [a.id, a]));
    const results = await localGame.entities.AthleteRankingResult.filter({});
    const finals = (await localGame.entities.Tournament.filter({})).filter((t) => t.status === 'finalizado' && t.world_tour_resolved
      && t.champion_athlete_ids?.length === 2 && t.runner_up_athlete_ids?.length === 2);
    ok('B5. há torneios mundiais concluídos com campeão e vice identificados', finals.length > 0);
    const pointsFor = (athleteId, tournamentId) => results.filter((r) => r.athlete_id === athleteId && r.tournament_id === tournamentId).reduce((s, r) => s + (Number(r.points) || 0), 0);
    ok('B6. campeão e vice recebem pontos individuais do torneio, campeão acima do vice',
      finals.every((t) => {
        const champ = t.champion_athlete_ids.map((id) => pointsFor(id, t.id));
        const runner = t.runner_up_athlete_ids.map((id) => pointsFor(id, t.id));
        return champ.every((p) => p > 0) && runner.every((p) => p > 0) && Math.min(...champ) > Math.max(...runner);
      }));
    ok('B7. campeão e vice que ainda formam dupla aparecem com pontos no Mundial',
      finals.flatMap((t) => [t.champion_athlete_ids, t.runner_up_athlete_ids]).map((ids) => findPair(rows, ids)).filter(Boolean).every((r) => teamListPoints(r) > 0));

    // Soma canônica após a projeção semanal: duplas ativas (parceiros mútuos) cujos membros não tiveram resultado
    // depois da última passada do circuito. As que tiveram resultado depois ficam defasadas até a próxima passada
    // (regra de produto: projeção semanal) — não entram na verificação.
    const lastCircuit = [...athletes.values()].map((a) => a.last_circuit_update || '').sort().pop();
    const lastResultDate = (id) => results.filter((r) => r.athlete_id === id).map((r) => r.date || '').sort().pop() || '';
    const settledPairs = rows.filter((r) => {
      const a = athletes.get(r.player1_id); const b = athletes.get(r.player2_id);
      return a && b && a.ai_partner_id === b.id && b.ai_partner_id === a.id && lastResultDate(a.id) < lastCircuit && lastResultDate(b.id) < lastCircuit;
    });
    const off = settledPairs.filter((r) => Number(r.ranking_points) !== computeCanonicalTeamRankingPoints(athletes.get(r.player1_id).world_ranking_points, athletes.get(r.player2_id).world_ranking_points));
    ok('B8. após a passada semanal, pontos da dupla = soma dos pontos individuais atuais', settledPairs.length >= 50 && off.length === 0, `${settledPairs.length} duplas, ${off.length} fora da soma`);

    const zeroPairs = rows.filter((r) => { const a = athletes.get(r.player1_id); const b = athletes.get(r.player2_id); return a && b && !Number(a.world_ranking_points) && !Number(b.world_ranking_points); });
    ok('B9. dupla sem pontos legítimos (0 + 0) continua exibida com 0', computeCanonicalTeamRankingPoints(0, 0) === 0 && zeroPairs.every((r) => teamListPoints(r) === 0));

    const raceRows = await getTeamRaceRankings(600, { profile });
    const raceTop = raceRows.find((r) => Number(r.race_points) > 0);
    ok('B10. Race de duplas segue exibindo race_points (líder com pontos de temporada)', raceTop && teamListPoints(raceTop, { race: true }) === Number(raceTop.race_points)
      && raceRows.every((r) => teamListPoints(r, { race: true }) === Math.max(0, Number(r.race_points) || 0)));

    const rawRows = await localGame.entities.TeamRanking.filter({});
    ok('B11. sem duplicidade: uma linha por dupla canônica', rawRows.length === new Set(rawRows.map((r) => teamKey(r.player1_id, r.player2_id))).size);
    ok('B12. sem duplicidade de pontos: no máximo um resultado por atleta e torneio', results.length === new Set(results.map((r) => `${r.athlete_id}|${r.tournament_id || r.id}`)).size);

    const before = new Map(rows.map((r) => [r.team_key, r]));
    await rt.advance(7);
    const after = await getTeamRankings(600);
    ok('B13. avanço diário: V/D do ledger nunca diminuem e as duplas do topo continuam com pontos',
      after.every((r) => { const b = before.get(r.team_key); return !b || b.stats_source !== 'ledger' || (Number(r.wins) >= Number(b.wins) && Number(r.losses) >= Number(b.losses)); })
      && after.slice(0, 10).every((r) => teamListPoints(r) > 0));

    const digestBefore = await teamDigest();
    const shownBefore = sha(after.map((r) => [r.team_key, teamListPoints(r)]));
    await rt.reload();
    const reloaded = await getTeamRankings(600);
    ok('B14. save/load + bootstrap: TeamRanking idêntico (pontos, V/D, origem)', (await teamDigest()) === digestBefore);
    ok('B15. save/load: valores exibidos idênticos', sha(reloaded.map((r) => [r.team_key, teamListPoints(r)])) === shownBefore);
    await rt.bootstrap();
    const current = await localGame.entities.PlayerProfile.get(rt.profileId);
    const second = await quiet(processWorldCircuit)(current, current.career_date, current.career_date);
    ok('B16. idempotência: bootstrap repetido e segunda passada do circuito na mesma semana não alteram nada', second?.skipped === true && (await teamDigest()) === digestBefore);
  }

  // ═══ C. Jogador e parceiro ═══
  {
    const rt = await boot({ seed: 'local-7d-player', profileOverrides: { rank_points: 800, race_points: 0 } });
    let profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    const bot = BOTS_BY_DIFFICULTY.avancado[0];
    await quiet(startPartnership)(profile, bot, 90, 50);
    const partnerId = bot.id;
    await localGame.entities.AthleteProfile.update(partnerId, { world_ranking_points: 3000, ranking_points: 3000 });
    const key = teamKey(rt.profileId, partnerId);
    const partnerRows = async () => localGame.entities.AthleteRankingResult.filter({ athlete_id: partnerId });
    const pairRow = async () => ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];

    const finalize = async (id, tier, roundsWon) => {
      const tournament = (await localGame.entities.Tournament.get(id).catch(() => null))
        || await localGame.entities.Tournament.create({ id, name: `Copa ${id}`, tier, start_date: '2026-01-05', status: 'em_andamento' });
      profile = await localGame.entities.PlayerProfile.get(rt.profileId);
      const partner = await localGame.entities.AthleteProfile.get(partnerId);
      return quiet(finalizeTournamentRun)({ profile, tournament, partner, roundsWon, totalRounds: 3 });
    };

    await finalize('l7d-silver', 'Silver', 2);
    profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    let partner = await localGame.entities.AthleteProfile.get(partnerId);
    let row = await pairRow();
    const expectedPartner = computeRollingPoints(await partnerRows(), [], profile.career_date);
    ok('C1. parceiro atualizado NA finalização: world_ranking_points = rolling dos resultados dele, acima do anterior',
      Number(partner.world_ranking_points) === expectedPartner && expectedPartner > 3000, `${partner.world_ranking_points} vs ${expectedPartner}`);
    ok('C2. linha da dupla = pontos atuais do jogador + do parceiro (não do parceiro antigo)',
      Number(row.ranking_points) === computeCanonicalTeamRankingPoints(profile.rank_points, partner.world_ranking_points));
    const rank = await getTeamRank(profile, { id: partnerId });
    ok('C3. card "Minha Dupla", lista Mundial e linha gravada mostram o mesmo total', rank.points === Number(row.ranking_points) && teamListPoints(row) === rank.points && !rank.unranked);

    const snapshot = { partner: partner.world_ranking_points, row: await teamDigest(), results: (await partnerRows()).length };
    const replay = await finalize('l7d-silver', 'Silver', 2);
    ok('C4. idempotência: finalizar o mesmo torneio de novo não altera parceiro, dupla nem resultados',
      replay.idempotent === true && (await localGame.entities.AthleteProfile.get(partnerId)).world_ranking_points === snapshot.partner
      && (await teamDigest()) === snapshot.row && (await partnerRows()).length === snapshot.results);

    await finalize('l7d-gold', 'Gold', 3);
    partner = await localGame.entities.AthleteProfile.get(partnerId);
    profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    row = await pairRow();
    const rowsNow = await partnerRows();
    ok('C5. segundo torneio (sem âncora nova): parceiro sobe na hora e a dupla acompanha',
      Number(partner.world_ranking_points) > snapshot.partner && Number(partner.world_ranking_points) === computeRollingPoints(rowsNow, [], profile.career_date)
      && Number(row.ranking_points) === computeCanonicalTeamRankingPoints(profile.rank_points, partner.world_ranking_points));
    ok('C6. um resultado por torneio para o parceiro, sem duplicar', rowsNow.length === new Set(rowsNow.map((r) => r.id)).size
      && rowsNow.filter((r) => r.tournament_id === 'l7d-silver').length === 1 && rowsNow.filter((r) => r.tournament_id === 'l7d-gold').length === 1);
    ok('C7. histórico da dupla: 2 torneios, 1 título', Number(row.matches_played) === 2 && Number(row.wins) === 1 && (row.titles || []).length === 1);

    await rt.advance(7);
    profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    partner = await localGame.entities.AthleteProfile.get(partnerId);
    row = await pairRow();
    ok('C8. após a passada semanal a dupla continua na soma canônica (sem salto nem regressão)',
      Number(row.ranking_points) === computeCanonicalTeamRankingPoints(profile.rank_points, partner.world_ranking_points) && Number(row.ranking_points) > 0);

    const digest = await teamDigest();
    const partnerPoints = partner.world_ranking_points;
    await rt.reload();
    ok('C9. save/load: pontos do parceiro e linha da dupla persistidos', (await localGame.entities.AthleteProfile.get(partnerId)).world_ranking_points === partnerPoints && (await teamDigest()) === digest);

    // Troca de parceiro: a regra existente apaga a linha da dupla desfeita (o histórico fica em PartnershipLegacy)
    // e a dupla nova nasce da soma dos pontos ATUAIS dos dois, com V/D zerados.
    profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    const active = await getActivePartnership(rt.profileId);
    await quiet(endPartnership)(active.id, 'encerrada_jogador', 'teste LOCAL-7D', profile.career_date);
    const newBot = BOTS_BY_DIFFICULTY.avancado[2];
    profile = await localGame.entities.PlayerProfile.get(rt.profileId);
    await quiet(startPartnership)(profile, newBot, 90, 50);
    await quiet(ensurePlayerTeamRanking)(await localGame.entities.PlayerProfile.get(rt.profileId));
    const after = await localGame.entities.PlayerProfile.get(rt.profileId);
    const oldPartner = await localGame.entities.AthleteProfile.get(partnerId);
    const newPartner = await localGame.entities.AthleteProfile.get(newBot.id);
    const newRow = ((await localGame.entities.TeamRanking.filter({ team_key: teamKey(rt.profileId, newBot.id) })) || [])[0];
    ok('C10. troca de parceiro não transfere pontos pessoais (jogador, ex-parceiro e novo parceiro intactos)',
      Number(after.rank_points) === Number(profile.rank_points) && oldPartner.world_ranking_points === partnerPoints && Number(newPartner.world_ranking_points) === 0);
    ok('C11. dupla nova = soma dos pontos atuais, V/D zerados; linha antiga removida pela regra existente',
      newRow && Number(newRow.ranking_points) === computeCanonicalTeamRankingPoints(after.rank_points, newPartner.world_ranking_points)
      && Number(newRow.wins) === 0 && Number(newRow.losses) === 0 && !(await pairRow()));
  }
  console.log(`\nLOCAL-7D: ${passed} verificações aprovadas.`);
} finally {
  await vite.close();
}
