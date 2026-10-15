// Playthrough 5.15 (continuação), Partes A/B/C/E/F/G — o ranking exibido do
// adversário tem UMA autoridade: o TeamRanking canônico.
//
// Bug do playtest: duplas de BOTS_BY_DIFFICULTY (catálogo, fora do mundo)
// apareciam como "#20/#30/#40". A fonte canônica sempre disse "Sem
// ranking"; quem inventava o número era o fallback de
// `buildOpponentAnalysis`, que lia `ranking_position`/`world_rank` do
// próprio bot — um campo do catálogo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-opponent-ranking-canonical-authority-v515', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
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
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { buildOpponentAnalysis } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { getCanonicalTeamWorldRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.15 OppRank', playerName: 'P515R' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p515r', sport_name: 'P515R', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();

  // ---- CASO 1 (Parte F): adversário do catálogo, SEM TeamRanking ----
  const catalogPair = (BOTS_BY_DIFFICULTY.iniciante || []).slice(0, 2);
  assert.equal(catalogPair.length, 2, 'pré-condição: catálogo sem dupla');
  console.log('adversário de catálogo:');
  for (const bot of catalogPair) {
    console.log(`  ${bot.name} — ranking_position=${bot.ranking_position} world_rank=${bot.world_rank} OVR=${bot.overall_rating}`);
  }

  const canonical = await getCanonicalTeamWorldRank(catalogPair.map((b) => b.id));
  const analysisUnranked = buildOpponentAnalysis(catalogPair, {
    worldRank: canonical.unranked ? null : canonical.rank,
    analysisLevel: 2,
  });

  console.log(`\n  canônico: rank=${canonical.rank} unranked=${canonical.unranked} display=${canonical.displayRank}`);
  console.log(`  analysis.ranking exibido: ${analysisUnranked.ranking === null ? 'null -> "Sem ranking"' : `#${analysisUnranked.ranking}`}`);

  await check('Parte F: a fonte canônica classifica a dupla de catálogo como SEM ranking', () => {
    assert.equal(canonical.unranked, true);
    assert.equal(canonical.displayRank, '—');
  });

  await check('Parte B/F/29: o adversário sem TeamRanking NÃO exibe posição numérica', () => {
    assert.equal(analysisUnranked.ranking, null,
      `a tela mostraria #${analysisUnranked.ranking} para uma dupla sem ranking`);
  });

  await check('Parte C (achado): o bot TEM ranking_position no catálogo — e ele não pode vazar', () => {
    // É exatamente o campo que o fallback lia. Se ele existe e mesmo assim
    // `ranking` é null, a autoridade está correta.
    const hasCatalogRank = catalogPair.some((b) => Number(b.ranking_position) > 0 || Number(b.world_rank) > 0);
    console.log(`   [registro] bots com ranking_position/world_rank no catálogo: ${hasCatalogRank}`);
    if (hasCatalogRank) {
      assert.equal(analysisUnranked.ranking, null, 'o campo do catálogo vazou para a tela');
    }
  });

  await check('Parte C: seed/slot/dificuldade NUNCA viram ranking exibido', () => {
    // Mesmo passando um rank sintético como se fosse do chamador errado, a
    // função só aceita o que veio como `worldRank` — não recalcula nada.
    const withSyntheticMembers = catalogPair.map((b) => ({ ...b, ranking_position: 37, world_rank: 37 }));
    const analysis = buildOpponentAnalysis(withSyntheticMembers, { worldRank: null, analysisLevel: 0 });
    assert.equal(analysis.ranking, null, 'um ranking_position=37 injetado apareceu na tela');
  });

  // ---- CASO 2 (Parte G): adversário REAL do mundo, COM TeamRanking ----
  const teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  // `rankForTeamKey` trata dupla com 0 partidas como "sem ranking" (convenção
  // da 4.6B, item 8): no mundo recém-semeado até Coello/Tapia entra assim.
  // Para exercitar o caminho COM ranking, escolhe uma dupla que já jogou.
  const topPair = teams.find((t) => Number(t.matches_played) > 0 && Number(t.ranking_points) > 0) || teams[0];
  console.log(`\n(dupla de referência com partidas: ${topPair.player1_name}/${topPair.player2_name}, matches=${topPair.matches_played})`);
  const members = [topPair.player1_id, topPair.player2_id];
  const realCanonical = await getCanonicalTeamWorldRank(members);
  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const realMembers = members.map((id) => byId.get(id)).filter(Boolean);
  const analysisRanked = buildOpponentAnalysis(realMembers, {
    worldRank: realCanonical.unranked ? null : realCanonical.rank,
    analysisLevel: 2,
  });

  console.log(`\nadversário REAL: ${topPair.player1_name}/${topPair.player2_name}`);
  console.log(`  canônico rank=${realCanonical.rank} unranked=${realCanonical.unranked}`);
  console.log(`  analysis.ranking exibido: ${analysisRanked.ranking === null ? 'Sem ranking' : `#${analysisRanked.ranking}`}`);

  await check('Parte G/9: dupla do mundo COM TeamRanking exibe a posição canônica', () => {
    assert.equal(realCanonical.unranked, false, 'a dupla do topo deveria ter ranking');
    assert.equal(analysisRanked.ranking, realCanonical.rank,
      `exibido #${analysisRanked.ranking}, canônico #${realCanonical.rank}`);
  });

  await check('Parte B: as duas metades da regra convivem (real mostra, catálogo esconde)', () => {
    assert.ok(Number(analysisRanked.ranking) > 0);
    assert.equal(analysisUnranked.ranking, null);
  });

  await check('Parte D/E: existe uma única autoridade — buildOpponentAnalysis só repassa worldRank', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/gameplay/worldTour/TournamentRunManager.js', import.meta.url), 'utf8');
    const fn = source.slice(source.indexOf('export function buildOpponentAnalysis'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(!/ranking_position|world_rank/.test(body.replace(/\/\/.*$/gm, '')),
      'buildOpponentAnalysis voltou a ler campos de ranking do próprio membro');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-opponent-ranking-canonical-authority-v515: PASS');
} finally {
  await vite.close();
}
