// Playthrough 4.5 — Circuito Cronológico Real.
//
// Regressão para o lifecycle temporal descrito na tarefa: sorteio (D-3) não
// pode resolver partidas, cada rodada só resolve na sua própria data,
// campeão/WorldEvent só existem depois da final real, duplas não podem
// disputar dois eventos sobrepostos, tiers concorrentes priorizam o mais
// alto, o primeiro adversário do jogador não é um fallback fixo (#493), e o
// Jornal prioriza o tier competitivo do torneio sobre a campanha do jogador.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-45-temporal-circuit', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const {
    ensureWorldTourDraws, resolveCompletedWorldTourEvents, assignPairsForWeek,
    committedPairIdsForWindow, isWorldTourResolutionPending,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { buildCanonicalTournamentBracket, buildPlayerTournamentBracket, applyPlayerMatchToCanonicalBracket } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { getCanonicalRoundDates } = await vite.ssrLoadModule('/src/lib/tournamentSchedule.js');
  const { finalizeTournamentRun, resolvePendingPlayerCanonicalTournaments } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { heroRank } = await vite.ssrLoadModule('/src/components/world/WorldFeed.jsx');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5 Temporal Circuit', playerName: 'Player 4.5' });
  activeCareerAdapter.setActiveCareer(career);

  // A fundação de uma carreira nova já semeia o calendário real da temporada
  // (Londres/Madri/Cidade do Cabo/Doha...) — exatamente os torneios que a
  // tarefa está investigando. Cancela-os aqui: os testes abaixo criam seus
  // PRÓPRIOS torneios sintéticos, isolados, e não podem competir por duplas
  // com o calendário de fundo ou herdar `due`s dele.
  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true });
  }

  function pairAthlete(idPrefix, index, overrides = {}) {
    return {
      id: `${idPrefix}-${index}`, name: `${idPrefix} Atleta ${index}`, overall_rating: 70, energy: 90,
      ranking_position: 200 + index, world_ranking_points: 500 - index, race_points: 0,
      ...overrides,
    };
  }

  async function seedPairs(count, idPrefix, overrides = {}) {
    const athletes = [];
    for (let i = 0; i < count * 2; i += 1) athletes.push(await localGame.entities.AthleteProfile.create(pairAthlete(idPrefix, i, overrides)));
    const partnerships = [];
    for (let i = 0; i < count; i += 1) {
      const a = athletes[i * 2];
      const b = athletes[i * 2 + 1];
      partnerships.push(await localGame.entities.Partnership.create({
        id: `${idPrefix}-partnership-${i}`, athlete_a_id: a.id, athlete_b_id: b.id, status: 'ativa', chemistry: 60,
      }));
    }
    return { athletes, partnerships };
  }

  // ── 1/2/18. D-3 cria bracket sem resolver match; rodadas futuras ficam
  // ocultas até a própria data — a mesma chave (buildCanonicalTournamentBracket)
  // é resolvida deterministicamente por baixo, mas a PROJEÇÃO visível
  // (getVisibleTournamentBracketState) só revela cada rodada quando sua data
  // chega. Placar/vencedor de rodada futura precisam ser null/scheduled.
  await check('1/2. D-3 (AI-only) — chave completa é resolvida por baixo, mas a projeção visível oculta rodadas futuras por data', () => {
    const roundDates = getCanonicalRoundDates('2026-03-01', 3); // 8 duplas → 3 rodadas
    const teams = Array.from({ length: 8 }, (_, i) => ({ name: `Dupla ${i + 1}`, strength: 100 - i }));
    const bracket = buildCanonicalTournamentBracket({ tournamentId: 'doha-madrid-8', participants: teams, date: '2026-03-01', roundDates });
    assert.deepEqual(roundDates, ['2026-03-01', '2026-03-02', '2026-03-03'], 'cada rodada recebe sua própria data, não a mesma para todas');

    const tournament = {
      id: 'doha-madrid-8', tier: 'Bronze', status: 'chaveamento', current_phase: 'chaveamento',
      start_date: '2026-03-01', end_date: '2026-03-03', bracket_history: bracket.bracket_history,
    };
    // No próprio dia do sorteio (D0 da 1ª rodada): só R1 pode estar decidida.
    const day0 = getVisibleTournamentBracketState(tournament, '2026-03-01');
    assert.equal(day0.rounds[0].matches.every((m) => m.terminal), true, 'rodada 1 já resolvida no seu próprio dia');
    assert.equal(day0.rounds[1].matches.every((m) => !m.terminal && m.winner === null && m.score === null), true, 'semifinal permanece sem placar/vencedor antes da sua data');
    assert.equal(day0.rounds[2].matches.every((m) => !m.terminal && m.winner === null), true, 'final permanece sem vencedor antes da sua data');
    assert.equal(day0.champion, null, 'sem campeão gravado, torneio em andamento não expõe campeão');

    // Um dia depois: só a semifinal (rodada 2) se soma às resolvidas.
    const day1 = getVisibleTournamentBracketState(tournament, '2026-03-02');
    assert.equal(day1.rounds[1].matches.every((m) => m.terminal), true, 'semifinal resolve no seu próprio dia');
    assert.equal(day1.rounds[2].matches.every((m) => !m.terminal), true, 'final ainda não resolvida um dia antes da sua data');

    // Reload no mesmo dia não avança nada — pura função de (tournament, data).
    const day1Again = getVisibleTournamentBracketState(tournament, '2026-03-02');
    assert.deepEqual(day1Again, day1, '19. reload não avança artificialmente a rodada (mesma leitura pura)');
  });

  // ── 3/4/6/7/15/17. Roma: eliminação precoce do jogador não decide
  // campeão/WorldEvent antes da final REAL alcançar sua data.
  await check('3/4/6/7/15/17. Roma — eliminação nas quartas não produz campeão/WorldEvent antes da final real', async () => {
    const partner = BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({
      id: 'p45-roma', sport_name: 'Player 4.5', career_date: '2026-01-05',
      birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
      partner_id: partner.id, partner_name: partner.name, energy: 100, fatigue: 0, coins: 5000,
      xp: 0, morale: 70, form: 50, ranking_position: 1000, weekly_training_enabled: false,
    });
    // Roma/Exibição: draw_size 8 → 3 rodadas (R1/QF, SF, Final).
    const roundDates = getCanonicalRoundDates('2026-01-05', 3);
    const tournament = await localGame.entities.Tournament.create({
      id: 'roma-45', name: 'Roma Pré-Temporada', tier: 'Exibição', status: 'em_andamento',
      start_date: '2026-01-05', end_date: roundDates[2], world_tour_event: true,
      main_draw_size: 8, bracket_schema_version: 2,
    });
    const bracket = buildPlayerTournamentBracket({
      tournamentId: tournament.id, roundDates, playerTeamName: 'Player 4.5 & ' + partner.name,
      mainOpponents: [{ name: 'Opp QF' }, { name: 'Opp SF' }, { name: 'Opp F' }],
      fillerFactory: (count, k) => Array.from({ length: count }, (_, index) => ({ name: `Filler ${k}-${index}`, strength: 40 + index })),
    });
    assert.equal(bracket[0].matches[0].date, roundDates[0]);
    assert.equal(bracket[2].date, roundDates[2], 'a final carrega sua PRÓPRIA data, não a data do sorteio');

    // Jogador perde logo na 1ª rodada (roundsWon 0 de 3) — SEM avançar os dias.
    // applyPlayerMatchToCanonicalBracket registra o resultado REAL da rodada 0
    // (o mesmo passo que TournamentModal.jsx dispara ao final da partida) —
    // sem isso a chave nunca teria um vencedor de rodada 0 gravado.
    const { rounds: bracketAfterLoss } = applyPlayerMatchToCanonicalBracket(bracket, {
      roundIndex: 0, playerTeamName: 'Player 4.5 & ' + partner.name, opponentTeamName: 'Opp QF',
      won: false, score: '4-6 3-6', date: roundDates[0],
    });
    const result = await finalizeTournamentRun({
      profile: await activeCareerAdapter.getPlayerProfile(),
      tournament, partner, roundsWon: 0, totalRounds: bracket.length, bracketHistory: bracketAfterLoss,
    });
    const afterElimination = await localGame.entities.Tournament.get(tournament.id);
    assert.notEqual(afterElimination.status, 'finalizado', '6. Tournament.status continua em andamento — não finaliza pela campanha do jogador');
    assert.equal(afterElimination.champion, undefined, '6. Tournament.champion continua null antes da final real');
    assert.equal(afterElimination.world_tour_resolved, undefined, '15. world_tour_resolved continua false — settlement não ocorre antecipadamente');
    const worldEventEarly = await localGame.entities.WorldEvent.filter({ related_tournament_id: tournament.id, event_type: 'tournament_result' });
    assert.equal(worldEventEarly.length, 0, '4/7. nenhum WorldEvent de título antes da final real');
    assert.equal(result.champion, false, 'campanha pessoal do jogador é registrada como eliminação, sem inventar título');

    // A chave (resolvida deterministicamente desde o sorteio) já teria um
    // "vencedor" para a final se lida crua — mas a projeção visível não pode
    // expor isso antes da data real da final.
    const visibleBeforeFinal = getVisibleTournamentBracketState(afterElimination, roundDates[1]);
    assert.equal(visibleBeforeFinal.champion, null, '3. campeão não aparece na chave antes da final alcançar sua data');

    // Nenhuma partida do jogador dispara a finalização depois disso — só o
    // day-tick (resolvePendingPlayerCanonicalTournaments) retoma quando a
    // final chega.
    const beforeFinalTick = await resolvePendingPlayerCanonicalTournaments(roundDates[1]);
    assert.equal(beforeFinalTick.resolved, 0, 'day-tick não resolve antes da data da final');
    assert.equal((await localGame.entities.Tournament.get(tournament.id)).status, afterElimination.status, 'nenhuma mudança de status antes da data da final');

    assert.equal(isWorldTourResolutionPending({ ...afterElimination, world_tour_event: true }, roundDates[2]), false,
      '6 (Playthrough 4). torneio do jogador com chave canônica nunca cai na fila genérica do circuito de IA');

    // Avança até a final realmente acontecer.
    const finalTick = await resolvePendingPlayerCanonicalTournaments(roundDates[2]);
    assert.equal(finalTick.resolved, 1, '17. settlement ocorre exatamente quando a final é alcançada, não antes');
    const finalized = await localGame.entities.Tournament.get(tournament.id);
    assert.equal(finalized.status, 'finalizado');
    assert.ok(finalized.champion, '3. campeão só existe depois da final real');
    const worldEventAfter = await localGame.entities.WorldEvent.filter({ related_tournament_id: tournament.id, event_type: 'tournament_result' });
    assert.equal(worldEventAfter.length, 1, '4. exatamente um WorldEvent de título, criado só após a final real');
    assert.equal(worldEventAfter[0].title.includes(finalized.champion), true);

    // Idempotência: rodar de novo no mesmo dia (ou depois) não duplica nada.
    const secondTick = await resolvePendingPlayerCanonicalTournaments(roundDates[2]);
    assert.equal(secondTick.resolved, 0, 'settlement já ocorrido não roda de novo');
    const worldEventTwice = await localGame.entities.WorldEvent.filter({ related_tournament_id: tournament.id, event_type: 'tournament_result' });
    assert.equal(worldEventTwice.length, 1, '12/13. nenhuma duplicação de matéria/evento no reprocessamento');
  });

  // ── 9. Same Partnership não entra em dois eventos sobrepostos ──
  await check('9. Coello/Tapia (mesma dupla) não pode ser sorteada em dois torneios sobrepostos', async () => {
    // População generosa (20 duplas) para que AMBOS os eventos consigam
    // encher sua chave (8) mesmo depois da exclusividade remover quem já
    // está comprometido — sem isso o teste não distingue "exclusividade
    // funcionando" de "não sobrou gente pro segundo evento".
    await seedPairs(20, 'excl');
    const doha = await localGame.entities.Tournament.create({
      id: 'doha-excl', name: 'Doha Masters', tier: 'Masters', world_tour_event: true,
      start_date: '2026-04-02', end_date: '2026-04-06', main_draw_size: 8,
    });
    // Doha sorteia primeiro — sua janela [04-02, 04-06] cruza a de Madrid
    // (criada só depois), exatamente o cenário relatado (Coello/Tapia
    // aparecendo em Madri E Doha na mesma janela).
    await ensureWorldTourDraws('2026-03-30'); // D-3 de Doha
    const dohaDrawn = await localGame.entities.Tournament.get(doha.id);
    assert.ok(Array.isArray(dohaDrawn.draw_pair_ids) && dohaDrawn.draw_pair_ids.length > 0, 'Doha sorteou com duplas reais');

    const madrid = await localGame.entities.Tournament.create({
      id: 'madrid-excl', name: 'Madrid Gold', tier: 'Gold', world_tour_event: true,
      start_date: '2026-04-01', end_date: '2026-04-05', main_draw_size: 8,
    });
    // Madrid abre sua própria janela D-3 DEPOIS, com as mesmas duplas
    // disponíveis — mas quem já está em Doha (janela sobreposta) precisa
    // ficar de fora do pool de Madrid.
    await ensureWorldTourDraws('2026-03-29'); // D-3 de Madrid
    const madridDrawn = await localGame.entities.Tournament.get(madrid.id);
    assert.ok(Array.isArray(madridDrawn.draw_pair_ids) && madridDrawn.draw_pair_ids.length > 0, 'Madri também sorteou (sobrou gente após a exclusividade)');
    const overlap = madridDrawn.draw_pair_ids.filter((id) => dohaDrawn.draw_pair_ids.includes(id));
    assert.equal(overlap.length, 0, 'nenhuma dupla sorteada em Doha aparece também na chave de Madri (janelas sobrepostas)');

    for (const pairId of dohaDrawn.draw_pair_ids) {
      const inBoth = dohaDrawn.draw_pair_ids.includes(pairId) && madridDrawn.draw_pair_ids.includes(pairId);
      assert.equal(inBoth, false, `for-each-Partnership: count(overlapping active tournaments) <= 1 — violado por ${pairId}`);
    }
  });

  // ── 10. Top pair prefere tier superior (concentração da elite) ──
  await check('10. Duplas de topo preferem o tier superior concorrente; o tier aberto recebe as restantes', () => {
    const masters = { id: 'masters-conc', tier: 'Masters', name: 'Doha Masters', main_draw_size: 4, minRanking: 230, start_date: '2026-05-01', end_date: '2026-05-05' };
    const gold = { id: 'gold-conc', tier: 'Gold', name: 'Madrid Gold', main_draw_size: 8, minRanking: 450, start_date: '2026-05-01', end_date: '2026-05-05' };
    const pairs = Array.from({ length: 10 }, (_, i) => ({
      id: `pair-conc-${i}`, name: `Dupla ${i}`, chemistry: 50, priorityWindowRemaining: 0,
      athletes: [
        { id: `pc-${i}-a`, name: `A${i}`, overall_rating: 90 - i, ranking_position: 10 + i * 5, form: 60, energy: 90 },
        { id: `pc-${i}-b`, name: `B${i}`, overall_rating: 90 - i, ranking_position: 10 + i * 5, form: 60, energy: 90 },
      ],
    }));
    const assignments = assignPairsForWeek([masters, gold], pairs);
    const inMasters = new Set((assignments.get(masters.id) || []).map((p) => p.id));
    const inGold = new Set((assignments.get(gold.id) || []).map((p) => p.id));
    // As duplas de rank mais alto (índices baixos) devem preferir o Masters.
    const bestPairIds = pairs.slice(0, 4).map((p) => p.id);
    const bestInMasters = bestPairIds.filter((id) => inMasters.has(id)).length;
    assert.ok(bestInMasters >= 3, `pelo menos 3 das 4 melhores duplas escolhem o Masters (obtido: ${bestInMasters})`);
    assert.ok(inGold.size > 0, 'Gold recebe as duplas restantes em vez de ficar vazio');
  });

  // ── 11. Evento elegível não é silenciosamente ignorado ──
  await check('11. Torneio elegível sem inscritos suficientes grava motivo explícito (sem silent skip)', async () => {
    // Playthrough 4.5D, item 3 — desde o fallback de resgate (duplas
    // canônicas ociosas, sem checar tier, como último recurso antes de
    // pendente/cancelado), o tier Crown sozinho não basta mais pra garantir
    // zero disponibilidade: sobras de outros blocos deste script (ex.: as
    // 20 duplas do item 9) podem estar ociosas e seriam corretamente
    // resgatadas. Este teste precisa de escassez REAL, não só
    // inelegibilidade por tier — aposenta todo mundo antes de medir.
    for (const athlete of (await localGame.entities.AthleteProfile.list('-created_date', 2000)) || []) {
      await localGame.entities.AthleteProfile.update(athlete.id, { retired: true }).catch(() => {});
    }
    const capeTown = await localGame.entities.Tournament.create({
      id: 'cape-town-45', name: 'Cidade do Cabo', tier: 'Crown', world_tour_event: true,
      start_date: '2026-06-10', end_date: '2026-06-13', main_draw_size: 16,
    });
    await ensureWorldTourDraws('2026-06-07'); // D-3, sem nenhuma dupla no mundo.
    const after = await localGame.entities.Tournament.get(capeTown.id);
    assert.equal(after.bracket_schema_version, undefined, 'sem inscritos suficientes, não cria uma chave inventada');
    assert.equal(after.draw_pending_reason, 'inscritos_insuficientes_ate_agora', 'motivo explícito persistido — nunca um continue silencioso');
    assert.ok(after.draw_pending_checked_at, 'timestamp do diagnóstico persistido');
  });

  // ── 13. Adversário #493 recorrente — getTeamRank não inventa rank de população ──
  await check('13. Dupla sem ranking não recebe rank sintético = tamanho da população + 1 (bug do #493)', async () => {
    const rows = [];
    for (let i = 0; i < 500; i += 1) rows.push(await localGame.entities.TeamRanking.create({
      team_key: `seed-${i}`, player1_id: `seed-${i}-a`, player2_id: `seed-${i}-b`, ranking_points: Math.max(1, 500 - i), matches_played: 5,
    }));
    const rank = await getTeamRank({ id: 'fresh-player' }, { id: 'fresh-partner' });
    assert.equal(rank.unranked, true, 'dupla nova (0 pontos, 0 partidas) é reconhecida como sem ranking');
    assert.notEqual(rank.rank, rows.length + 1, `rank não pode ser "tamanho da população + 1" (${rows.length + 1}) — obtido ${rank.rank}`);
    assert.equal(rank.rank, 0, 'sem ranking real, rank é 0 (mesma convenção de resolveEntryRank), não uma posição inventada');
    // O adversário sintético da rodada 0 usa `rank.rank || 240` — com rank 0
    // isso já cai no fallback neutro de sempre, nunca em 501-8=493.
    const syntheticOpponentRank = Math.max(1, Number(rank.rank || 240) - 8);
    assert.notEqual(syntheticOpponentRank, 493, 'primeiro adversário sintético não é mais o fallback fixo #493');
    assert.equal(syntheticOpponentRank, 232, 'usa o default neutro (240) menos o passo da rodada, não o tamanho da população');
  });

  // ── 16. Jornal prioriza Masters sobre Bronze do jogador ──
  await check('16. heroRank prioriza campeão de Masters sobre Bronze do jogador na mesma janela', () => {
    const mastersResult = { event_type: 'tournament_result', tier: 'masters', created_date: '2026-07-01T08:00:00.000Z' };
    const playerBronzeResult = { event_type: 'tournament_result', tier: 'bronze', created_date: '2026-07-01T23:00:00.000Z' };
    const events = [playerBronzeResult, mastersResult]; // Bronze do jogador é MAIS recente.
    const hero = [...events].sort((a, b) => heroRank(a) - heroRank(b))[0];
    assert.equal(hero, mastersResult, 'Masters vence mesmo sendo a notícia mais antiga da janela');
    assert.ok(heroRank(mastersResult) < heroRank(playerBronzeResult), 'Masters sempre tem prioridade editorial maior que Bronze');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-playthrough-4-5-temporal-circuit: PASS');
} finally {
  await vite.close();
}
