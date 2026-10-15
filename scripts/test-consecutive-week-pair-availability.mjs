// Playthrough 4.6B, itens 9/10/12/13 — depois da primeira onda funcionar,
// Los Angeles Cup e Barcelona Championship (semana de 05/02) cancelaram por
// "número insuficiente de duplas elegíveis" mesmo com ~497 duplas canônicas
// no mundo (a mesma população que a Fase 4.5D já provou ter ~452 elegíveis
// Gold / ~223 elegíveis Masters). Este teste reproduz o cenário de DUAS
// semanas consecutivas (torneios que terminam 01/02 -> torneios que começam
// 05/02, SEM sobreposição real de datas) e audita exatamente onde o pool
// de ~500 duplas desaparece: exclusão por overlap (committedPairIdsForWindow),
// elegibilidade de ranking, status de partnership, ou consumo indevido do
// pool ocioso entre chamadas.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-consecutive-week-pair-availability', search: '' };
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
    ensureWorldTourDraws, resolveCompletedWorldTourEvents, buildCanonicalPairs, committedPairIdsForWindow,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6B Two Weeks', playerName: 'Player 4.6B' });
  activeCareerAdapter.setActiveCareer(career);

  for (const seeded of (await localGame.entities.Tournament.list('start_date', 2000)) || []) {
    await localGame.entities.Tournament.update(seeded.id, { world_tour_cancelled: true, world_tour_resolved: true });
  }

  // ~500 duplas canônicas, ranking espalhado de #1 a #1000 (2 atletas por
  // dupla) — mesma escala que o relato real (~497 pares).
  const PAIR_COUNT = 500;
  async function seedPairs(count) {
    for (let i = 0; i < count; i += 1) {
      const a = await localGame.entities.AthleteProfile.create({
        id: `w-${i}-a`, name: `Atleta ${i}A`, overall_rating: Math.max(30, 90 - i * 0.08), energy: 100,
        ranking_position: i * 2 + 1, world_ranking_points: Math.max(1, 4000 - i * 6), race_points: 0,
      });
      const b = await localGame.entities.AthleteProfile.create({
        id: `w-${i}-b`, name: `Atleta ${i}B`, overall_rating: Math.max(30, 90 - i * 0.08), energy: 100,
        ranking_position: i * 2 + 2, world_ranking_points: Math.max(1, 4000 - i * 6 - 2), race_points: 0,
      });
      await localGame.entities.Partnership.create({ id: `w-partnership-${i}`, athlete_a_id: a.id, athlete_b_id: b.id, status: 'ativa', chemistry: 60 });
    }
  }
  await seedPairs(PAIR_COUNT);

  const week1 = [
    { id: 'londres-46b', name: 'Londres Challenge', tier: 'Silver', world_tour_event: true, start_date: '2026-01-29', end_date: '2026-02-01', main_draw_size: 32 },
    { id: 'madri-46b', name: 'Madri', tier: 'Gold', world_tour_event: true, start_date: '2026-01-29', end_date: '2026-02-01', main_draw_size: 24 },
    { id: 'cidadedocabo-46b', name: 'Cidade do Cabo', tier: 'Bronze', world_tour_event: true, start_date: '2026-01-29', end_date: '2026-02-01', main_draw_size: 24 },
    { id: 'doha-46b', name: 'Doha Champions Masters', tier: 'Masters', world_tour_event: true, start_date: '2026-01-29', end_date: '2026-02-01', main_draw_size: 24 },
  ];
  const week2 = [
    { id: 'losangeles-46b', name: 'Los Angeles Cup', tier: 'Gold', world_tour_event: true, start_date: '2026-02-05', end_date: '2026-02-08', main_draw_size: 24 },
    { id: 'barcelona-46b', name: 'Barcelona Championship', tier: 'Gold', world_tour_event: true, start_date: '2026-02-05', end_date: '2026-02-08', main_draw_size: 24 },
  ];
  for (const t of [...week1, ...week2]) await localGame.entities.Tournament.create(t);

  // Item 6/9/10 — sorteio D-3 da semana 1 (torneios começam 29/01).
  await ensureWorldTourDraws('2026-01-26');
  const week1Rows = await Promise.all(week1.map((t) => localGame.entities.Tournament.get(t.id)));
  console.log('\n--- Semana 1 (sorteio D-3, 26/01) ---');
  console.table(week1Rows.map((r) => ({ id: r.id, drawn: Number(r.bracket_schema_version) >= 2, participantes: r.draw_participant_count || 0, pending: r.draw_pending_reason || null })));

  await check('9. semana 1 sorteia campo normalmente (baseline antes da transição)', () => {
    for (const row of week1Rows) {
      assert.equal(Number(row.bracket_schema_version) >= 2, true, `${row.id} deveria ter sorteado: pending=${row.draw_pending_reason}`);
    }
  });

  // Item 9/10 — assenta a semana 1 (settlement real, não um flag manual) no
  // dia SEGUINTE ao fim real (02/02) — isWorldTourResolutionPending exige
  // `end < careerDate` (o torneio ainda está "em curso" durante seu próprio
  // end_date; a resolução começa no dia seguinte, mesma regra de produção),
  // antes do sorteio da semana 2 avaliar exclusividade de agenda.
  await resolveCompletedWorldTourEvents('2026-02-02');
  const week1Settled = await Promise.all(week1.map((t) => localGame.entities.Tournament.get(t.id)));
  console.log('\n--- Semana 1 após settlement (02/02, D+1 do fim real) ---');
  console.table(week1Settled.map((r) => ({ id: r.id, world_tour_resolved: Boolean(r.world_tour_resolved), champion: r.champion || null })));

  await check('9/10. semana 1 fica world_tour_resolved=true no dia seguinte ao fim real (não deveria mais contar como comprometida)', () => {
    for (const row of week1Settled) {
      assert.equal(Boolean(row.world_tour_resolved), true, `${row.id} deveria estar resolvido em 02/02: ${JSON.stringify({ status: row.status, phase: row.current_phase })}`);
    }
  });

  // Item 10 — auditoria direta de committedPairIdsForWindow pra semana 2
  // (torneios due em 02/02, D-3 de 05/02), contra o estado JÁ ASSENTADO da
  // semana 1. Não deveria sobrar nenhuma dupla comprometida pela semana 1
  // (que já terminou 01/02, sem overlap real com 05/02+).
  const allTournamentsAfterSettlement = await localGame.entities.Tournament.list('start_date', 2000);
  const week2Rows0 = week2.map((t) => allTournamentsAfterSettlement.find((row) => row.id === t.id));
  const committedForWeek2 = committedPairIdsForWindow(week2Rows0, allTournamentsAfterSettlement);
  console.log(`\nduplas marcadas como "comprometidas" (overlap) pra semana 2: ${committedForWeek2.size}`);
  await check('10. nenhuma dupla da semana 1 (já terminada, sem overlap real) fica presa pra semana 2', () => {
    assert.equal(committedForWeek2.size, 0, `committedPairIdsForWindow não deveria reter nenhuma dupla após a semana 1 estar resolvida: ${[...committedForWeek2].slice(0, 10).join(', ')}`);
  });

  // Item 9 — pool canônico total, pra referência no relato.
  const [rawAthletesAfter, partnershipsAfter] = await Promise.all([
    localGame.entities.AthleteProfile.list('-world_ranking_points', 2000),
    localGame.entities.Partnership.list('-created_date', 2000),
  ]);
  const canonicalPairsTotal = buildCanonicalPairs(partnershipsAfter, rawAthletesAfter.filter((a) => !a.retired));
  console.log(`duplas canônicas totais no mundo: ${canonicalPairsTotal.length}`);

  // Item 6/9/10 — sorteio D-3 da semana 2 (torneios começam 05/02, D-3 =
  // 02/02, um dia depois do fim real da semana 1).
  await ensureWorldTourDraws('2026-02-02');
  const week2Rows = await Promise.all(week2.map((t) => localGame.entities.Tournament.get(t.id)));
  console.log('\n--- Semana 2 (sorteio D-3, 02/02 — 1 dia após o fim real da semana 1) ---');
  console.table(week2Rows.map((r) => ({ id: r.id, drawn: Number(r.bracket_schema_version) >= 2, participantes: r.draw_participant_count || 0, pending: r.draw_pending_reason || null, cancelado: Boolean(r.world_tour_cancelled) })));

  await check('7/9/10/19. Los Angeles Cup e Barcelona Championship sorteiam campo normalmente na semana seguinte (mesmas ~500 duplas livres)', () => {
    for (const row of week2Rows) {
      assert.equal(Boolean(row.world_tour_cancelled), false, `${row.id} não deveria cancelar: motivo=${row.cancellation_reason}`);
      assert.equal(Number(row.bracket_schema_version) >= 2, true, `${row.id} deveria ter sorteado: pending=${row.draw_pending_reason}, participantes=${row.draw_participant_count}`);
      assert.ok(Number(row.draw_participant_count) >= 16, `${row.id} deveria ter um campo saudável (>=16), teve ${row.draw_participant_count}`);
    }
  });

  // Item 12 — nenhuma Partnership foi "consumida"/desativada por ter jogado
  // a semana 1; todas continuam 'ativa' e disponíveis pro mercado/próxima
  // semana sem precisar ser "reformada".
  const partnershipsFinal = await localGame.entities.Partnership.list('-created_date', 2000);
  await check('12. nenhuma partnership muda de status por ter disputado um torneio (não precisa ser "reformada")', () => {
    const inactive = partnershipsFinal.filter((p) => String(p.id || '').startsWith('w-partnership-') && p.status !== 'ativa');
    assert.equal(inactive.length, 0, `partnerships que deixaram de ser 'ativa' sem motivo: ${inactive.map((p) => p.id).join(', ')}`);
  });

  // Item 13/15 — nenhuma dupla aparece em dois torneios SIMULTÂNEOS da
  // semana 2 (exclusividade real continua valendo).
  await check('13/15. nenhuma dupla aparece em dois torneios simultâneos da semana 2', () => {
    const idsLA = new Set(week2Rows[0].draw_pair_ids || []);
    const idsBCN = week2Rows[1].draw_pair_ids || [];
    const overlap = idsBCN.filter((id) => idsLA.has(id));
    assert.equal(overlap.length, 0, `duplas duplicadas entre Los Angeles e Barcelona: ${overlap.join(', ')}`);
  });

  // Item 13/15 — pares PODEM repetir entre semanas (mesma dupla jogou
  // semana 1 e semana 2), desde que sem overlap real.
  await check('13. duplas podem repetir entre semanas diferentes (sem overlap real)', () => {
    const week1Ids = new Set(week1Settled.flatMap((row) => row.draw_pair_ids || []));
    const week2Ids = new Set(week2Rows.flatMap((row) => row.draw_pair_ids || []));
    const reused = [...week1Ids].filter((id) => week2Ids.has(id));
    assert.ok(reused.length > 0, 'esperado que ao menos algumas duplas joguem nas duas semanas (pool livre o bastante)');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-consecutive-week-pair-availability: PASS');
} finally {
  await vite.close();
}
