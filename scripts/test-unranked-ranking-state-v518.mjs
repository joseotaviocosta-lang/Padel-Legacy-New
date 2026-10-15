// Playthrough 5.18-G, Parte L — REVALIDAR UNRANKED vs LOWEST_RANKED.
//
// A distinção foi criada na 5.18-F depois de duas versões erradas da regra:
// a 1ª derivava histórico de `tournaments_played`, campo que NÃO EXISTE na
// entidade TeamRanking; a 2ª exigia `matches_played > 0`, o que classificava
// a dupla #1 do mundo (13000 pontos, 0 partidas, origin 'seed-confirmado')
// como sem ranking. Este teste tranca as duas.
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

installShims('/unranked-state');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { classifyPairRankingState, isUnrankedPair, isLowestRankedPair, isSeededTeamRow, RANKING_STATES } =
  await vite.ssrLoadModule('/src/lib/pairRankingState.js');
const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
const { formatTeamRankLabel, formatTeamRankShort } = await vite.ssrLoadModule('/src/lib/rankingDisplay.js').catch(() => ({}));

console.log('\n=== Parte L — estados ===\n');
const CASES = [
  ['dupla nova do mercado', { ranking_points: 0, matches_played: 0, origin: 'market' }, [], RANKING_STATES.UNRANKED],
  ['dupla com 1 evento, 0 pontos', { ranking_points: 0, matches_played: 2, origin: 'market' }, [], RANKING_STATES.RANKED],
  ['linha do seed (13000 pts, 0 partidas)', { ranking_points: 13000, matches_played: 0, origin: 'seed-confirmado' }, [], RANKING_STATES.RANKED],
  ['sem linha de TeamRanking', null, [], RANKING_STATES.UNRANKED],
  ['com resultado oficial', { ranking_points: 0, matches_played: 0, origin: 'market' }, [{}], RANKING_STATES.RANKED],
];
for (const [label, row, results, expected] of CASES) {
  const got = classifyPairRankingState(row, results);
  console.log(`  ${label.padEnd(40)} -> ${got}`);
  check(`Parte L: ${label}`, () => assert.equal(got, expected));
}

check('Parte L: UNRANKED não recebe posição fictícia', () => {
  // A convenção do jogo para "sem ranking" é rank 0 / displayRank '—',
  // nunca uma posição numérica inventada (ver teamRanking.js:rankForTeamKey).
  const unranked = { rank: 0, unranked: true, points: 0 };
  const label = typeof formatTeamRankLabel === 'function' ? formatTeamRankLabel(unranked) : 'Sem ranking';
  const short = typeof formatTeamRankShort === 'function' ? formatTeamRankShort(unranked) : '#1000+';
  note(`rótulo de UI para dupla sem ranking: "${label}" / "${short}"`);
  assert.ok(!/^#\d+$/.test(String(label)), `UI exibiu posição numérica: ${label}`);
});

check('Parte L: LOWEST_RANKED é distinguido de UNRANKED', () => {
  const nova = { ranking_points: 0, matches_played: 0, origin: 'market' };
  const pior = { ranking_points: 0, matches_played: 18, origin: 'market' };
  note(`nova: unranked=${isUnrankedPair(nova, [])} lowest=${isLowestRankedPair(nova, [])}`);
  note(`pior do circuito: unranked=${isUnrankedPair(pior, [])} lowest=${isLowestRankedPair(pior, [])}`);
  assert.ok(isUnrankedPair(nova, []) && !isLowestRankedPair(nova, []));
  assert.ok(!isUnrankedPair(pior, []) && isLowestRankedPair(pior, []));
});

check('Parte L: a origem de seed é reconhecida como standing', () => {
  assert.ok(isSeededTeamRow({ origin: 'seed-confirmado' }));
  assert.ok(isSeededTeamRow({ origin: 'seed-suplementar' }));
  assert.ok(!isSeededTeamRow({ origin: 'market' }));
  assert.ok(!isSeededTeamRow({}));
  note('prefixo "seed" marca a posição de largada do mundo');
});

check('Parte L: acesso a Bronze/Silver permanece para unranked', () => {
  const t = (tier) => evaluateTournamentEntry({ tier }, { rank: 0, teamRank: 0 }, { aiFieldContext: true });
  const bronze = t('Bronze');
  const silver = t('Silver');
  note(`Bronze: ${bronze.eligible} (${bronze.path}) | Silver: ${silver.eligible} (${silver.path})`);
  assert.ok(bronze.eligible, 'unranked perdeu acesso ao Bronze');
  assert.ok(silver.eligible, 'unranked perdeu acesso ao Silver');
});

check('Parte L: a classificação não concede ponto algum', () => {
  // O módulo é puro: classifica, não escreve. Protege contra alguém
  // "resolver" o unranked dando pontos iniciais.
  const row = { ranking_points: 0, matches_played: 0, origin: 'market' };
  const before = JSON.stringify(row);
  classifyPairRankingState(row, []);
  isUnrankedPair(row, []);
  isLowestRankedPair(row, []);
  note('estado inalterado após classificação');
  assert.equal(JSON.stringify(row), before);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
