// Playthrough 4.5B — primeira onda oficial (Londres/Madri/Cidade do
// Cabo/Doha): item 1 (causa exata de Cidade do Cabo sem chave no D-3),
// item 2 (proibição de chave retroativa silenciosa — política A/B/C),
// item 11 (auditoria D-3 de toda a onda) e item 12 (tabela de diagnóstico
// dia a dia até a final).
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-45b-first-wave', search: '' };
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
  const {
    ensureWorldTourDraws, resolveCompletedWorldTourEvents,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { validateCanonicalBracketGraph } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5B First Wave', playerName: 'Player 4.5B' });
  activeCareerAdapter.setActiveCareer(career);

  // Isola do calendário de fundo semeado pela fundação da carreira — os 4
  // torneios sintéticos abaixo são a ÚNICA "primeira onda" deste teste.
  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
  }

  async function seedPairs(count, idPrefix, rankStart = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = await localGame.entities.AthleteProfile.create({
        id: `${idPrefix}-${i}-a`, name: `${idPrefix} A${i}`, overall_rating: 80 - i, energy: 90,
        ranking_position: rankStart + i * 2, world_ranking_points: 5000 - i * 10, race_points: 0,
      });
      const b = await localGame.entities.AthleteProfile.create({
        id: `${idPrefix}-${i}-b`, name: `${idPrefix} B${i}`, overall_rating: 80 - i, energy: 90,
        ranking_position: rankStart + i * 2 + 1, world_ranking_points: 5000 - i * 10 - 5, race_points: 0,
      });
      await localGame.entities.Partnership.create({ id: `${idPrefix}-partnership-${i}`, athlete_a_id: a.id, athlete_b_id: b.id, status: 'ativa', chemistry: 60 });
    }
  }

  // População insuficiente para os 4 eventos concorrentes encherem o campo
  // mínimo simultaneamente (minViableDraw(24)==8 cada; Londres(16)==8;
  // 4×8=32 > total semeado) — reproduz a MESMA classe de escassez relatada
  // (evento elegível sem inscritos suficientes na janela), sem fixar de
  // antemão qual dos 4 é a "vítima": a atribuição semanal (chooseTournament
  // + fallback de tier, mesma autoridade do D-3) decide isso pela
  // pontuação real de cada torneio — Madri recebe o tier mais alto (Crown)
  // de propósito só para GARANTIR que ele tenha chave (é o torneio auditado
  // pelos itens 3/7/9, não o alvo do item 1).
  await seedPairs(30, 'wave');

  const londres = await localGame.entities.Tournament.create({
    id: 'londres-45b', name: 'Londres Challenge', tier: 'Silver', world_tour_event: true,
    start_date: '2026-09-01', end_date: '2026-09-04', main_draw_size: 16,
  });
  const madri = await localGame.entities.Tournament.create({
    id: 'madri-45b', name: 'Madri World Gold', tier: 'Crown', world_tour_event: true,
    start_date: '2026-09-01', end_date: '2026-09-06', main_draw_size: 24,
  });
  const doha = await localGame.entities.Tournament.create({
    id: 'doha-45b', name: 'Doha Champions Masters', tier: 'Masters', world_tour_event: true,
    start_date: '2026-09-01', end_date: '2026-09-06', main_draw_size: 24,
  });
  const capeTown = await localGame.entities.Tournament.create({
    id: 'cape-town-45b', name: 'Cidade do Cabo Gold Series', tier: 'Gold', world_tour_event: true,
    start_date: '2026-09-01', end_date: '2026-09-06', main_draw_size: 24,
  });
  const ALL = [londres, madri, doha, capeTown];

  // ── D-3: sorteia a onda inteira numa única chamada (mesmo cenário do
  // app real — todos os 4 tornam-se "due" juntos).
  await check('D-3: sorteio da onda inteira numa chamada só', async () => {
    const result = await ensureWorldTourDraws('2026-08-29');
    assert.deepEqual(result.errors, [], `sorteio não pode falhar silenciosamente: ${JSON.stringify(result.errors)}`);
  });

  // ── Item 11 — auditoria D-3 de TODA a onda: nunca estado silencioso.
  let shortfall = null;
  await check('11. D-3: cada torneio da onda tem bracket_schema_version==2 OU draw_pending_reason — nunca silencioso', async () => {
    for (const t of ALL) {
      const row = await localGame.entities.Tournament.get(t.id);
      const hasBracket = Number(row.bracket_schema_version) >= 2 && Array.isArray(row.bracket_history) && row.bracket_history.length > 0;
      const hasExplicitReason = Boolean(row.draw_pending_reason) || Boolean(row.world_tour_cancelled);
      assert.ok(hasBracket || hasExplicitReason, `${row.name}: nem chave nem motivo explícito — estado silencioso proibido`);
      if (!hasBracket) shortfall = row;
    }
    assert.ok(shortfall, 'com 30 duplas para 4 eventos que juntos precisam de 32 no mínimo, ao menos 1 deve ficar sem campo — se todos sortearam, a escassez não foi reproduzida');
    const madriRow = await localGame.entities.Tournament.get(madri.id);
    assert.equal(Number(madriRow.bracket_schema_version), 2, 'Madri (tier mais alto) precisa ter chave — é o torneio auditado pelos itens 3/7/9, a escassez tem que recair sobre outro');
  });

  // ── Item 1 — causa exata do torneio sem chave (na simulação do app real
  // relatada, Cidade do Cabo — aqui, o mesmo mecanismo, qualquer que seja
  // o torneio que a atribuição semanal deixou de fora).
  await check('1. Torneio sem chave no D-3: causa exata é falta de duplas elegíveis restantes na janela (agenda exclusiva dos concorrentes)', async () => {
    assert.equal(Number(shortfall.bracket_schema_version) >= 2, false, `${shortfall.name} genuinamente não tem chave ainda no D-3`);
    assert.equal(shortfall.draw_pending_reason, 'inscritos_insuficientes_ate_agora', 'motivo explícito, não silencioso');
    assert.ok(Number(shortfall.draw_pending_participant_count) >= 0);
    console.log(`   (torneio sem campo nesta seed: ${shortfall.name}, participantes encontrados: ${shortfall.draw_pending_participant_count})`);
  });

  // ── Item 2A — ainda há tempo antes do início: tenta de novo (D-2, D-1).
  await check('2A. D-2/D-1: ainda há tempo — draw_pending_reason persiste (não cancela cedo)', async () => {
    await ensureWorldTourDraws('2026-08-30');
    await ensureWorldTourDraws('2026-08-31');
    const row = await localGame.entities.Tournament.get(shortfall.id);
    assert.equal(row.world_tour_cancelled, undefined, 'ainda não pode cancelar — o início ainda não chegou');
    assert.equal(row.draw_pending_reason, 'inscritos_insuficientes_ate_agora');
  });

  // ── Item 2B — chegou ao início sem campo mínimo: cancela EXPLICITAMENTE,
  // nunca ganha uma chave "aparecendo do nada" depois.
  await check('2B. D0 (início) sem campo: continua sem chave; D+1: cancelamento EXPLÍCITO, nunca chave retroativa', async () => {
    await ensureWorldTourDraws('2026-09-01'); // D0 — última tentativa real.
    const atStart = await localGame.entities.Tournament.get(shortfall.id);
    assert.equal(Number(atStart.bracket_schema_version) >= 2, false, 'sem duplas suficientes, D0 não inventa uma chave forçada');

    await ensureWorldTourDraws('2026-09-02'); // D+1 — passou do início sem chave.
    const cancelled = await localGame.entities.Tournament.get(shortfall.id);
    assert.equal(cancelled.world_tour_cancelled, true, 'cancelamento explícito assim que passa do início sem campo');
    assert.equal(cancelled.cancellation_reason, 'sem_chave_ate_o_inicio');
    assert.equal(cancelled.world_tour_resolved, true);
    assert.equal(Number(cancelled.bracket_schema_version) >= 2, false, 'NUNCA ganha uma chave — cancelado, não "resolvido com chave nova"');
  });

  // ── Item 3/7/9 — snapshots por dia de Madri (não-potência-de-2) até a
  // final, sem corrupção. Roda ANTES do settlement pós-end_date (abaixo):
  // uma vez que o torneio é genuinamente finalizado, a projeção
  // corretamente passa a revelar tudo de uma vez (torneio realmente
  // acabou) — o que este bloco audita é o comportamento dia a dia
  // ENQUANTO o torneio ainda está em andamento, o cenário relatado.
  await check('3/7/9. Madri: snapshots diários íntegros até a final (torneio ainda em andamento)', async () => {
    const madriRow = await localGame.entities.Tournament.get(madri.id);
    assert.ok(Array.isArray(madriRow.bracket_history) && madriRow.bracket_history.length > 0, 'Madri precisa ter chave para este teste ter sentido');
    // O grafo ESTRUTURAL (match_id/source_match_ids) vive no dado ARMAZENADO
    // — sempre correto por construção (buildCanonicalTournamentBracket),
    // nunca muda por dia. Valida uma vez, contra o storage (item 8: "stored
    // bracket vs visible bracket — o grafo estrutural deve ser o mesmo").
    const storedGraph = validateCanonicalBracketGraph(madriRow);
    assert.equal(storedGraph.valid, true, `chave armazenada de Madri precisa ser estruturalmente sã: ${JSON.stringify(storedGraph.errors)}`);

    const roundDates = [...new Set(madriRow.bracket_history.map((round) => round.date))].sort();
    let madriGraphValidAllDays = true;
    let madriChampionBeforeFinal = false;
    for (const day of roundDates) {
      const visible = getVisibleTournamentBracketState(madriRow, day);
      // A versão VISÍVEL não pode introduzir nenhuma dupla repetida dentro
      // da mesma rodada (a corrupção relatada) — ignorando o placeholder
      // "Participante a definir", que trivialmente se repete entre slots
      // ainda ocultos (não é a mesma dupla, é "ainda não sei quem").
      const namesPerRound = visible.rounds.map((round) => round.matches.flatMap((m) => [m.team_a, m.team_b]).filter((n) => n !== 'Participante a definir'));
      const anyDuplicateInAnyRound = namesPerRound.some((names) => new Set(names).size !== names.length);
      // A estrutura (quantidade de rodadas/confrontos) tem que bater com o
      // armazenado — só os VALORES (team_a/team_b/winner) mudam por data.
      const structureMatches = visible.rounds.length === madriRow.bracket_history.length
        && visible.rounds.every((round, index) => round.matches.length === madriRow.bracket_history[index].matches.length);
      if (anyDuplicateInAnyRound || !structureMatches) {
        madriGraphValidAllDays = false;
        console.log(`   [debug] day=${day} anyDuplicate=${anyDuplicateInAnyRound} structureMatches=${structureMatches}`);
        console.log(`   [debug] namesPerRound=${JSON.stringify(namesPerRound)}`);
      }
      const lastRoundDate = madriRow.bracket_history.at(-1).date;
      if (visible.champion && day < lastRoundDate) madriChampionBeforeFinal = true;
    }
    assert.equal(madriGraphValidAllDays, true, 'Madri nunca corrompe (duplica dupla) em nenhum dia até a final, e a estrutura visível bate com a armazenada');
    assert.equal(madriChampionBeforeFinal, false, '9. Madri nunca mostra campeão antes da final real');
  });

  // ── Item 2C — mesmo depois do end_date, settlement não pode fabricar uma
  // chave para o torneio já cancelado explicitamente (a "chave retroativa"
  // relatada nunca mais acontece para este caminho).
  await check('2C. Depois do end_date: settlement não fabrica chave para o torneio já cancelado explicitamente', async () => {
    await resolveCompletedWorldTourEvents('2026-09-10');
    const row = await localGame.entities.Tournament.get(shortfall.id);
    assert.equal(Number(row.bracket_schema_version) >= 2, false, 'permanece sem chave — cancelado é estado terminal, não "pendente"');
    assert.equal(row.champion, undefined, 'nenhum campeão fabricado para um torneio cancelado por falta de campo');
  });

  // ── Item 12 — tabela de diagnóstico da onda inteira, depois de tudo
  // resolvido.
  await check('12. Tabela de diagnóstico da primeira onda', async () => {
    const diagnosticTable = [];
    for (const t of ALL) {
      const row = await localGame.entities.Tournament.get(t.id);
      const hasBracket = Number(row.bracket_schema_version) >= 2;
      const graphValid = hasBracket ? validateCanonicalBracketGraph(row).valid : null;
      diagnosticTable.push({
        tournament: row.name,
        d3_bracket: hasBracket,
        cancelled: Boolean(row.world_tour_cancelled),
        champion: row.champion || null,
        graph_valid: graphValid,
      });
    }
    console.log('\n--- Tabela de diagnóstico (item 12) ---');
    console.table(diagnosticTable);
    const nonCancelled = diagnosticTable.filter((row) => !row.cancelled);
    assert.ok(nonCancelled.every((row) => row.d3_bracket), 'todo evento não-cancelado tem chave desde o D-3');
    assert.ok(nonCancelled.every((row) => row.graph_valid !== false), 'nenhuma corrupção estrutural em nenhum torneio da onda');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-playthrough-4-5b-first-wave: PASS');
} finally {
  await vite.close();
}
