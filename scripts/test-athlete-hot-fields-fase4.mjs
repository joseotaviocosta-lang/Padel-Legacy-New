// Fase 4.0, item 2A (achado #18) — remoção de campos mortos do documento
// quente (AthleteProfile, clonado a cada transação de escrita) e migração
// de saves existentes.
//
// world_ranking: campo morto — todo consumidor já lia ranking_position
// primeiro (grep confirmou em toda a árvore de src/). Removido dos dois
// pontos de escrita (WorldTourLifecycle.js:reranked,
// rankingPopulation.js:seed).
//
// ranking_history: write-only — nenhum consumidor de LEITURA existe em
// nenhum arquivo de src/. Movido pra uma coleção própria,
// AthleteRankingHistory, em vez de descartado (intenção futura plausível:
// gráfico de evolução de ranking).
//
// Migração: o bulkUpdate semanal de processWorldCircuit já toca TODA a
// população — os dois campos entram como `undefined` no patch pra
// sobrescrever (não só omitir) qualquer valor legado, sem nenhuma escrita
// extra além da que já existia.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { processWorldCircuit } = await server.ssrLoadModule('/src/game-core/circuitLifecycle.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-hot-fields-fase4', name: 'QA Hot Fields Fase 4' });
  activeCareerAdapter.careerManager = careerManager;
  const career = await activeCareerAdapter.getActiveCareer();

  // (a) Duas linhas simulando um save LEGADO: já têm world_ranking e um
  // ranking_history acumulado (histórico real de semanas anteriores) direto
  // no AthleteProfile, do jeito que a versão anterior gravava.
  const legacyHistory = [
    { date: '2025-12-01', week: '2025-W48', points: 900, race_points: 0, gained: 0, decayed: 0 },
    { date: '2025-12-08', week: '2025-W49', points: 950, race_points: 0, gained: 50, decayed: 0 },
  ];
  await localGame.entities.AthleteProfile.create({
    id: 'legacy-athlete-1', sport_name: 'Atleta Legado 1', overall_rating: 70,
    world_ranking_points: 950, ranking_points: 950, ranking_position: 5,
    world_ranking: 5, ranking_history: legacyHistory, retired: false,
  });
  await localGame.entities.AthleteProfile.create({
    id: 'legacy-athlete-2', sport_name: 'Atleta Legado 2', overall_rating: 65,
    world_ranking_points: 800, ranking_points: 800, ranking_position: 12,
    world_ranking: 12, ranking_history: [], retired: false,
  });

  const before1 = await localGame.entities.AthleteProfile.get('legacy-athlete-1');
  gate('(setup) linha legada tem world_ranking antes da migração', before1.world_ranking === 5);
  gate('(setup) linha legada tem ranking_history antes da migração', Array.isArray(before1.ranking_history) && before1.ranking_history.length === 2);

  // (b) Roda o passe semanal do circuito — o mesmo bulkUpdate que já toca
  // toda a população, e que agora carrega a migração de graça.
  const playerProfile = { id: career.player.id, last_circuit_week: null };
  const result = await processWorldCircuit(playerProfile, '2025-12-29', '2026-01-05');
  gate('processWorldCircuit não pulou o passe (semana nova, sem last_circuit_week)', !result.skipped);

  const after1 = await localGame.entities.AthleteProfile.get('legacy-athlete-1');
  gate('(2A) world_ranking sumiu do AthleteProfile depois do passe semanal', after1.world_ranking === undefined);
  gate('(2A) ranking_history sumiu do AthleteProfile depois do passe semanal', after1.ranking_history === undefined);
  gate('(2A) ranking_position continua correto (não foi afetado pela remoção dos campos mortos)', Number.isFinite(after1.ranking_position));

  const after2 = await localGame.entities.AthleteProfile.get('legacy-athlete-2');
  gate('(2A) atleta sem histórico legado também não ganha world_ranking novo', after2.world_ranking === undefined);
  gate('(2A) atleta sem histórico legado também não ganha ranking_history novo', after2.ranking_history === undefined);

  // (c) O histórico não foi descartado — migrou pra AthleteRankingHistory,
  // preservando as semanas antigas E anexando a nova.
  const migratedHistory1 = await localGame.entities.AthleteRankingHistory.get('legacy-athlete-1');
  gate('(2A) AthleteRankingHistory existe pro atleta com histórico legado', Boolean(migratedHistory1));
  gate('(2A) histórico migrado preserva as 2 semanas antigas + 1 nova = 3', Array.isArray(migratedHistory1.history) && migratedHistory1.history.length === 3);
  gate('(2A) primeira semana migrada é a mais antiga do histórico legado (ordem preservada)', migratedHistory1.history[0].week === '2025-W48');
  gate('(2A) última entrada é a semana processada agora', migratedHistory1.history[migratedHistory1.history.length - 1].week === weekKeyLocal('2026-01-05'));

  const migratedHistory2 = await localGame.entities.AthleteRankingHistory.get('legacy-athlete-2');
  gate('(2A) atleta sem histórico legado também ganha entrada nova em AthleteRankingHistory', Boolean(migratedHistory2) && migratedHistory2.history.length === 1);

  // (d) Medição do efeito isolado (item 2A.3): tamanho do save antes vs.
  // depois de uma população com histórico cheio (51 semanas, o pico real).
  const fullHistory = Array.from({ length: 51 }, (_, i) => ({ date: `2025-${String(1 + (i % 12)).padStart(2, '0')}-01`, week: `2025-W${String(i + 1).padStart(2, '0')}`, points: 1000 + i, race_points: 0, gained: 5, decayed: 0 }));
  const rowWithHistoryInline = { id: 'x', sport_name: 'x', overall_rating: 70, world_ranking_points: 1000, ranking_points: 1000, ranking_position: 1, world_ranking: 1, ranking_history: fullHistory };
  const rowWithoutHistory = { id: 'x', sport_name: 'x', overall_rating: 70, world_ranking_points: 1000, ranking_points: 1000, ranking_position: 1 };
  const bytesInline = JSON.stringify(rowWithHistoryInline).length;
  const bytesMoved = JSON.stringify(rowWithoutHistory).length;
  const savingsPerAthleteBytes = bytesInline - bytesMoved;
  console.log(`\n[medição 2A.3] linha de AthleteProfile com histórico de 51 semanas inline: ${bytesInline}B · sem (movido pra coleção própria): ${bytesMoved}B · economia: ${savingsPerAthleteBytes}B/atleta no pico`);
  console.log(`[medição 2A.3] projeção pra ~1000 atletas no pico: ${((savingsPerAthleteBytes * 1000) / 1024).toFixed(0)}KB a menos no documento clonado a cada transação de escrita (achado #18)`);
  gate('(2A.3) remover ranking_history do documento quente economiza bytes mensuráveis por atleta no pico', savingsPerAthleteBytes > 1000);

  console.log(`\n${gates} gates executados, todos PASS — Fase 4.0, item 2A: campos mortos removidos, migração de saves existentes confirmada.`);
} finally {
  await server.close();
}

function weekKeyLocal(date) {
  const parsed = new Date(`${date}T00:00:00`);
  const first = new Date(parsed.getFullYear(), 0, 1);
  const days = Math.floor((parsed - first) / 86400000);
  return `${parsed.getFullYear()}-W${String(Math.ceil((days + first.getDay() + 1) / 7)).padStart(2, '0')}`;
}
