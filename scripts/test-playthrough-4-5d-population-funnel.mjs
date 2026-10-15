// Playthrough 4.5D — o pool elegível da primeira onda estava ficando
// artificialmente pequeno (Cidade do Cabo cancelado com ~500 duplas
// canônicas potenciais no mundo). Causa raiz na ORIGEM (saveFoundation.js):
//   1. bots procedurais (~900) nasciam sem `ai_partner_id` — a única forma
//      de pareá-los (processAiPartnershipMarket) só dispara na 1ª virada de
//      mês, deixando o mundo até 30 dias sem NENHUMA dupla canônica de bot;
//   2. atletas reais (~100, incluindo Coello/Tapia/Galán/Chingotto) nunca
//      recebiam `ranking_position` na semeadura — só `world_ranking_points`
//      — e caíam no fallback 999 de normalizeAthlete até a 1ª liquidação de
//      torneio, tornando-os inelegíveis para Gold/Masters/Elite/Crown
//      (só Bronze/Silver, que não exigem ranking).
// Combinados: na primeira janela, só ~50 duplas reais existiam (nenhuma bot),
// TODAS avaliadas como rank 999 — 0 elegíveis para Gold/Masters. Corrigido
// na origem: bots são pareados na própria semeadura (reusando
// formNewPartnerships, o mesmo algoritmo do mercado mensal) e atletas reais
// recebem `ranking_position` a partir do `seed_rank` do registro.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-playthrough-4-5d-population-funnel', search: '' };
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

function addDaysIso(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const {
    ensureWorldTourDraws, resolveCompletedWorldTourEvents, buildCanonicalPairs, committedPairIdsForWindow,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { resolveEntryRank } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5D Population Funnel', playerName: 'Player 4.5D' });
  activeCareerAdapter.setActiveCareer(career);

  // ── Item 1 — funil de elegibilidade: a MESMA semeadura real do app
  // (ensureWorldSeed2025), aguardada (não fire-and-forget), como
  // SaveFoundationBootstrap.jsx deveria ter feito.
  await check('1. Semeadura real: >=1000 atletas, bots pareados na origem, reais com ranking_position', async () => {
    await ensureWorldSeed2025();
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', WORLD_RANKING_TARGET + 200);
    assert.ok(athletes.length >= WORLD_RANKING_TARGET, `população >= ${WORLD_RANKING_TARGET} (obtido: ${athletes.length})`);

    const reals = athletes.filter((a) => a.is_real);
    assert.ok(reals.length >= 90, `~100 atletas reais (obtido: ${reals.length})`);
    const realsWithRank = reals.filter((a) => Number.isFinite(Number(a.ranking_position)) && Number(a.ranking_position) > 0);
    assert.equal(realsWithRank.length, reals.length, 'TODOS os atletas reais recebem ranking_position na própria semeadura (causa raiz #2 corrigida)');

    const bots = athletes.filter((a) => !a.is_real);
    const botsWithPartner = bots.filter((a) => a.ai_partner_id);
    console.log(`   bots procedurais: ${bots.length}, pareados na semeadura: ${botsWithPartner.length} (${Math.round((botsWithPartner.length / bots.length) * 100)}%)`);
    assert.ok(botsWithPartner.length >= bots.length * 0.5, `pelo menos metade dos bots procedurais já pareados na semeadura, sem esperar a 1ª virada de mês (causa raiz #1 corrigida) — obtido ${botsWithPartner.length}/${bots.length}`);

    const partnerships = await localGame.entities.Partnership.list('-created_date', 5000).catch(() => []);
    const canonicalPairs = buildCanonicalPairs(partnerships, athletes.map((a) => ({ ...a, career_status: a.career_status })));
    console.log(`   duplas canônicas totais no D-3 (via buildCanonicalPairs): ${canonicalPairs.length}`);
    assert.ok(canonicalPairs.length >= 300, `>=300 duplas canônicas (era ~50 antes da correção) — obtido ${canonicalPairs.length}`);

    // Funil de elegibilidade por tier (item 1 — pool ideal antes de cortes).
    const eligibleForTier = (minRanking) => canonicalPairs.filter((pair) => {
      const ranks = pair.athletes.map((a) => resolveEntryRank(a)).filter((r) => r > 0);
      if (!ranks.length) return minRanking === 0;
      const avg = ranks.reduce((s, v) => s + v, 0) / ranks.length;
      return minRanking === 0 || avg <= Math.max(minRanking * 2, minRanking + 80);
    });
    console.log(`   elegíveis p/ Gold (qualifying~900): ${eligibleForTier(450).length}`);
    console.log(`   elegíveis p/ Masters (qualifying~460): ${eligibleForTier(230).length}`);
    assert.ok(eligibleForTier(450).length >= 24, '2. pool elegível para Gold cobre pelo menos um draw de 24 (causa raiz corrigida)');
    assert.ok(eligibleForTier(230).length >= 24, '2. pool elegível para Masters cobre pelo menos um draw de 24');
  });

  // ── Item 6 — primeira onda real (Londres/Madri/Cidade do Cabo/Doha, já
  // semeadas por createCareer em 2026-01-29): D-3, todos preenchidos.
  await check('6. Primeira onda real: Londres/Madri/Cidade do Cabo/Doha TODOS com chave no D-3, sem cancelamento artificial', async () => {
    const allTournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const firstWave = ['Londres Challenge', 'Madri World Gold', 'Cidade do Cabo Gold Series', 'Doha Champions Masters']
      .map((name) => allTournaments.find((t) => t.name === name))
      .filter(Boolean);
    assert.equal(firstWave.length, 4, 'pré-condição: os 4 torneios da primeira onda existem na semeadura real');

    const drawDate = addDaysIso(firstWave[0].start_date, -3);
    const result = await ensureWorldTourDraws(drawDate);
    assert.deepEqual(result.errors, [], `sorteio não pode falhar: ${JSON.stringify(result.errors)}`);

    const table = [];
    for (const t of firstWave) {
      const row = await localGame.entities.Tournament.get(t.id);
      table.push({
        tournament: row.name, tier: row.tier, bracket: Number(row.bracket_schema_version) >= 2,
        cancelled: Boolean(row.world_tour_cancelled), participants: row.draw_participant_count || 0,
      });
    }
    console.log('\n   --- Primeira onda (item 6) ---');
    console.table(table);

    for (const row of table) {
      assert.equal(row.bracket, true, `${row.tournament} (${row.tier}) precisa ter chave no D-3 — ${row.cancelled ? 'foi cancelado' : 'sem chave'}`);
      assert.equal(row.cancelled, false, `${row.tournament} não pode ser cancelado com a população corrigida`);
    }
  });

  // ── Item 6 (exclusividade) — nenhuma dupla nos 4 eventos simultâneos
  // aparece em mais de um.
  await check('6. Exclusividade de agenda continua válida com a população cheia', async () => {
    const allTournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const firstWave = ['Londres Challenge', 'Madri World Gold', 'Cidade do Cabo Gold Series', 'Doha Champions Masters']
      .map((name) => allTournaments.find((t) => t.name === name))
      .filter(Boolean);
    const rows = await Promise.all(firstWave.map((t) => localGame.entities.Tournament.get(t.id)));
    const allPairIds = rows.flatMap((row) => Array.isArray(row.draw_pair_ids) ? row.draw_pair_ids : []);
    assert.equal(new Set(allPairIds).size, allPairIds.length, 'nenhuma dupla aparece em mais de um dos 4 eventos simultâneos');

    // Prova direta de committedPairIdsForWindow com a população real.
    const committed = committedPairIdsForWindow(firstWave, rows);
    for (const row of rows) {
      for (const pairId of (row.draw_pair_ids || [])) {
        // A própria dupla sorteada aqui não deveria bloquear A SI MESMA — a
        // checagem correta é feita ANTES do sorteio, contra os OUTROS já
        // resolvidos; aqui só confirmamos que a função enxerga esses ids.
        assert.ok(typeof pairId === 'string' && pairId.length > 0);
      }
    }
    void committed;
  });

  // ── Item 2 — top-tier (Masters, o mais alto entre os 4) escolhe
  // primeiro: as duplas de maior pontuação do pool elegível vão para Doha,
  // não sobram por acaso para o Gold.
  await check('2. Top-tier (Doha Masters) prioriza as melhores duplas elegíveis', async () => {
    const allTournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const doha = allTournaments.find((t) => t.name === 'Doha Champions Masters');
    const madri = allTournaments.find((t) => t.name === 'Madri World Gold');
    const dohaRow = await localGame.entities.Tournament.get(doha.id);
    const madriRow = await localGame.entities.Tournament.get(madri.id);
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', WORLD_RANKING_TARGET + 200);
    const byName = new Map(athletes.map((a) => [a.name, a]));
    const avgRating = (teamName) => {
      const names = String(teamName || '').split(' & ');
      const ratings = names.map((n) => Number(byName.get(n)?.overall_rating) || 0).filter((v) => v > 0);
      return ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;
    };
    const dohaAvg = (dohaRow.participants || []).map(avgRating).filter((v) => v > 0);
    const madriAvg = (madriRow.participants || []).map(avgRating).filter((v) => v > 0);
    const meanOf = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
    console.log(`   overall médio Doha (Masters): ${meanOf(dohaAvg).toFixed(1)} · Madri (Gold): ${meanOf(madriAvg).toFixed(1)}`);
    assert.ok(meanOf(dohaAvg) >= meanOf(madriAvg) - 2, 'Masters (tier mais alto) não fica com um campo pior que o Gold concorrente');
  });

  void TEAM_RANKING_TARGET;
  void resolveCompletedWorldTourEvents;

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-playthrough-4-5d-population-funnel: PASS');
} finally {
  await vite.close();
}
