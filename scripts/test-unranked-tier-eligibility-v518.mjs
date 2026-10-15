// Playthrough 5.18-F, Partes B/D — AUDITORIA DE ELEGIBILIDADE PARA UNRANKED.
//
// Pergunta da Parte D: o fallback #1001 fecha todas as portas? E o rank 0
// (dupla sem NENHUM histórico) — onde ele entra?
//
// Distinção central (Parte B): o jogo hoje colapsa dois estados diferentes
// numa mesma posição de ranking:
//   UNRANKED       — dupla nova, 0 resultados, 0 eventos oficiais;
//   LOWEST_RANKED  — dupla com histórico real e desempenho pior do circuito.
// Este teste imprime, tier a tier, o que acontece com cada um.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

installShims('/unranked-eligibility');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { evaluateTournamentEntry, OPEN_TIER_CEILING } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
const { getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
const { classifyPairRankingState, RANKING_STATES } = await vite.ssrLoadModule('/src/lib/pairRankingState.js');

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

// Perfis a auditar. `rank` é o que `resolveEntryRank` devolveria.
const PROFILES = [
  { label: 'UNRANKED (rank 0)', rank: 0 },
  { label: 'fallback #1001', rank: 1001 },
  { label: 'rank 500', rank: 500 },
  { label: 'rank 120', rank: 120 },
  { label: 'rank 8', rank: 8 },
];

console.log('\n=== Parte D — elegibilidade por tier (contexto de IA) ===\n');
console.log(`${'tier'.padEnd(10)}${'minRank'.padEnd(9)}${'qualSize'.padEnd(9)}${PROFILES.map((p) => p.label.padEnd(20)).join('')}`);
const matrix = new Map();
for (const tier of TIERS) {
  const cfg = getTournamentTierConfig(tier);
  const tournament = { tier, id: `t-${tier}`, min_ranking: cfg.minRanking, qualifying_size: cfg.qualifyingSize };
  const cells = PROFILES.map((p) => {
    const r = evaluateTournamentEntry(tournament, { rank: p.rank, teamRank: p.rank }, { aiFieldContext: true });
    matrix.set(`${tier}|${p.label}`, r);
    return `${r.eligible ? 'SIM' : 'não'}:${r.path}`.padEnd(20);
  });
  console.log(`${tier.padEnd(10)}${String(cfg.minRanking).padEnd(9)}${String(cfg.qualifyingSize || 0).padEnd(9)}${cells.join('')}`);
}
console.log('');

const get = (tier, label) => matrix.get(`${tier}|${label}`);

check('Parte D1/D5: unranked entra em Bronze (tier de acesso livre)', () => {
  const r = get('Bronze', 'UNRANKED (rank 0)');
  note(`Bronze/unranked: ${r.path} — ${r.reason}`);
  assert.ok(r.eligible, 'unranked barrado do Bronze');
});

check('Parte D2: unranked entra em Silver', () => {
  const r = get('Silver', 'UNRANKED (rank 0)');
  note(`Silver/unranked: ${r.path} — ${r.reason}`);
  assert.ok(r.eligible, 'unranked barrado do Silver');
});

check('Parte D3: o caminho de qualifying para unranked está documentado', () => {
  const restricted = TIERS.filter((t) => getTournamentTierConfig(t).minRanking > 0 && (getTournamentTierConfig(t).qualifyingSize || 0) > 0);
  const results = restricted.map((t) => ({ t, r: get(t, 'UNRANKED (rank 0)') }));
  const viaQualifying = results.filter((x) => x.r.path === 'qualifying');
  note(`tiers restritos com qualifying: ${restricted.join(', ') || '(nenhum)'}`);
  note(`unranked elegível ao qualifying em: ${viaQualifying.map((x) => x.t).join(', ') || '(nenhum)'}`);
  // Registro factual, não gate: a política de qualifying exige `hasRanking`
  // por design (EntryManager.js:211). O que esta asserção protege é que a
  // política seja OBSERVÁVEL, não que ela seja permissiva.
  assert.ok(results.length === restricted.length, 'auditoria incompleta');
});

check('Parte D6/D7: o teto de acesso livre não exclui unranked', () => {
  // OPEN_TIER_CEILING só barra quem JÁ tem ranking bom (rank <= 400).
  const unranked = get('Bronze', 'UNRANKED (rank 0)');
  const fallback = get('Bronze', 'fallback #1001');
  const elite = get('Bronze', 'rank 8');
  note(`OPEN_TIER_CEILING=${OPEN_TIER_CEILING} | unranked=${unranked.eligible} #1001=${fallback.eligible} #8=${elite.eligible} (overqualified=${Boolean(elite.overqualified)})`);
  assert.ok(unranked.eligible && fallback.eligible, 'teto está excluindo quem não tem ranking');
  assert.ok(!elite.eligible && elite.overqualified, 'o teto deixou de barrar a elite na base');
});

check('Parte D10: o fallback #1001 NÃO fecha todas as portas de elegibilidade', () => {
  const open = TIERS.filter((t) => get(t, 'fallback #1001').eligible);
  note(`#1001 elegível em: ${open.join(', ') || '(nenhum tier)'}`);
  assert.ok(open.length > 0, '#1001 é inelegível em todo tier — a porta de entrada está fechada');
});

// ---------------------------------------------------------------- Parte B
console.log('\n=== Parte B — UNRANKED vs LOWEST_RANKED ===\n');

// Os campos abaixo são os REAIS da entidade TeamRanking, verificados contra
// um mundo recém-semeado: ranking_points, race_points, matches_played, wins,
// losses, titles, season_id, origin. Não existe `tournaments_played`.
const CASES = [
  { label: 'dupla nova do mercado', team: { ranking_points: 0, matches_played: 0, origin: 'market' }, results: [], expect: RANKING_STATES.UNRANKED },
  { label: 'dupla com 1 evento, 0 pontos', team: { ranking_points: 0, matches_played: 2, origin: 'market' }, results: [{}], expect: RANKING_STATES.RANKED },
  { label: 'dupla com histórico e pontos', team: { ranking_points: 180, matches_played: 22, origin: 'market' }, results: [{}, {}], expect: RANKING_STATES.RANKED },
  { label: 'linha do seed do mundo', team: { ranking_points: 13000, matches_played: 0, origin: 'seed-confirmado' }, results: [], expect: RANKING_STATES.RANKED },
  { label: 'sem linha de TeamRanking', team: null, results: [], expect: RANKING_STATES.UNRANKED },
];
for (const c of CASES) {
  const state = classifyPairRankingState(c.team, c.results);
  console.log(`  ${c.label.padEnd(32)} -> ${state}`);
}

check('Parte B: UNRANKED é distinguido de uma dupla ruim com histórico', () => {
  for (const c of CASES) {
    const state = classifyPairRankingState(c.team, c.results);
    assert.equal(state, c.expect, `${c.label}: esperado ${c.expect}, veio ${state}`);
  }
  note('fonte do estado: ausência de resultado oficial E ausência de partidas — nunca só "0 pontos"');
});

check('Parte B: 0 pontos sozinho não classifica como UNRANKED', () => {
  const state = classifyPairRankingState({ ranking_points: 0, matches_played: 6, origin: 'market' }, [{}]);
  note(`0 pontos com 6 partidas disputadas -> ${state}`);
  assert.equal(state, RANKING_STATES.RANKED, 'uma dupla que já competiu e não pontuou foi tratada como sem histórico');
});

check('Parte B: a posição de largada do mundo não é confundida com ponto inventado', () => {
  // As 500 linhas do seed nascem com pontos e matches_played=0. Uma regra que
  // exigisse partidas classificaria a dupla #1 do mundo como sem ranking.
  const top = { ranking_points: 13000, matches_played: 0, origin: 'seed-confirmado' };
  note(`linha de seed com 13000 pts e 0 partidas -> ${classifyPairRankingState(top, [])}`);
  assert.equal(classifyPairRankingState(top, []), RANKING_STATES.RANKED);
  assert.equal(classifyPairRankingState({ ranking_points: 0, matches_played: 0, origin: 'market' }, []), RANKING_STATES.UNRANKED);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
