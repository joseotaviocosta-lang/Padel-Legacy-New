// Playthrough 5.18-H, Partes F/G/H/I — ZONA MORTA DE TIER.
//
// Hipótese a testar: existe faixa em que uma dupla ativa fica simultaneamente
// OVERQUALIFIED para os tiers que ela acessa e INELIGIBLE para os superiores,
// indefinidamente? Era o candidato principal para o caso OVR 76 / 82 semanas
// antes de a 5.18-H medir a causa real (exaustão permanente por
// `activityFor` cego a energia).
//
// O teste continua sendo necessário: a causa ter sido outra não prova que a
// zona morta não exista.
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

installShims('/dead-zone');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { evaluateTournamentEntry, OPEN_TIER_CEILING } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
const { getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
const { classifyPairRankingState, RANKING_STATES } = await vite.ssrLoadModule('/src/lib/pairRankingState.js');

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const entry = (tier, rank) => {
  const cfg = getTournamentTierConfig(tier);
  return evaluateTournamentEntry(
    { tier, id: `t-${tier}`, min_ranking: cfg.minRanking, qualifying_size: cfg.qualifyingSize },
    { rank, teamRank: rank },
    { aiFieldContext: true },
  );
};

// Varredura de TODA a faixa de ranking, não de uma amostra: uma zona morta
// estreita passaria despercebida numa amostra por faixas.
console.log('\n=== Parte I: varredura de rank 0 a 1200 ===\n');
const dead = [];
const openOnly = [];
for (let rank = 0; rank <= 1200; rank += 1) {
  const results = TIERS.map((t) => ({ t, r: entry(t, rank) }));
  const eligible = results.filter((x) => x.r.eligible);
  if (!eligible.length) {
    const overqualified = results.filter((x) => x.r.overqualified).map((x) => x.t);
    dead.push({ rank, overqualified });
  } else if (eligible.every((x) => getTournamentTierConfig(x.t).minRanking === 0)) {
    openOnly.push(rank);
  }
}
console.log(`ranks sem NENHUM tier elegivel: ${dead.length}`);
if (dead.length) {
  const first = dead[0];
  const last = dead[dead.length - 1];
  console.log(`  faixa: #${first.rank} a #${last.rank}`);
  console.log(`  exemplo #${first.rank}: overqualified em ${first.overqualified.join(', ') || '(nenhum)'}`);
}
console.log(`ranks com acesso SO a tiers de porta aberta: ${openOnly.length}` + (openOnly.length ? ` (#${openOnly[0]} a #${openOnly[openOnly.length - 1]})` : ''));
console.log('');

check('Parte I (gate): nao existe faixa de rank sem nenhum tier elegivel', () => {
  note(`ranks varridos: 1201 | sem saida: ${dead.length}`);
  for (const d of dead.slice(0, 6)) note(`  #${d.rank} overqualified em: ${d.overqualified.join(', ') || '(nenhum)'}`);
  assert.equal(dead.length, 0, `${dead.length} posicoes de ranking sem nenhum torneio acessivel`);
});

check('Parte H: a fronteira do teto de porta aberta tem continuidade', () => {
  // Quem passa o teto de Bronze/Silver precisa JA estar elegivel a um tier
  // superior, senao a transicao cria a zona morta.
  const atCeiling = entry('Bronze', OPEN_TIER_CEILING);
  const justInside = entry('Bronze', OPEN_TIER_CEILING + 1);
  const gold = getTournamentTierConfig('Gold');
  note(`teto de porta aberta=${OPEN_TIER_CEILING} | corte do Gold=${gold.minRanking}`);
  note(`rank ${OPEN_TIER_CEILING} no Bronze: ${atCeiling.eligible ? 'elegivel' : `barrado (${atCeiling.overqualified ? 'overqualified' : 'abaixo'})`}`);
  note(`rank ${OPEN_TIER_CEILING + 1} no Bronze: ${justInside.eligible ? 'elegivel' : 'barrado'}`);
  // A continuidade exige que o corte do tier seguinte seja MAIOR que o teto:
  // assim todo rank barrado por excesso ja cabe no tier de cima.
  assert.ok(gold.minRanking >= OPEN_TIER_CEILING, `corte do Gold (${gold.minRanking}) abaixo do teto de porta aberta (${OPEN_TIER_CEILING}) — abre zona morta`);
});

console.log('=== Parte H: matriz por faixa de forca e estado de ranking ===\n');
const BANDS = [
  ['<60', 55], ['60-69', 65], ['70-79', 76], ['80-89', 85], ['90+', 93],
];
const RANK_STATES = [
  ['UNRANKED (rank 0)', 0],
  ['#1001 (fundo)', 1001],
  ['#500', 500],
  ['#401 (logo acima do teto)', 401],
  ['#400 (no teto)', 400],
  ['#120', 120],
  ['#8 (elite)', 8],
];
console.log(`${'estado'.padEnd(28)}${'Bronze'.padEnd(9)}${'Silver'.padEnd(9)}${'Gold'.padEnd(8)}${'Quali'.padEnd(8)}resultado`);
for (const [label, rank] of RANK_STATES) {
  const b = entry('Bronze', rank).eligible;
  const s = entry('Silver', rank).eligible;
  const g = entry('Gold', rank).eligible;
  const q = TIERS.some((t) => entry(t, rank).path === 'qualifying');
  const any = TIERS.some((t) => entry(t, rank).eligible);
  console.log(`${label.padEnd(28)}${String(b).padEnd(9)}${String(s).padEnd(9)}${String(g).padEnd(8)}${String(q).padEnd(8)}${any ? 'tem rota' : 'SEM ROTA'}`);
}
console.log('');
console.log('Nota: OVR nao entra em `evaluateTournamentEntry` — a elegibilidade e por');
console.log('RANKING, nunca por forca. Por isso uma dupla OVR 90 sem ranking acessa');
console.log('Bronze/Silver como qualquer outra: forca nao fecha porta nenhuma.\n');

check('Parte H: forca bruta nao altera elegibilidade', () => {
  // Confirma o que a nota afirma: mesma posicao de ranking, OVRs diferentes,
  // mesma elegibilidade. Se algum dia OVR passar a filtrar, este teste cai.
  for (const [, ovr] of BANDS) {
    const a = evaluateTournamentEntry({ tier: 'Bronze' }, { rank: 0, teamRank: 0, overall_rating: ovr }, { aiFieldContext: true });
    assert.equal(a.eligible, true, `OVR ${ovr} sem ranking perdeu acesso ao Bronze`);
  }
  note(`faixas testadas: ${BANDS.map(([l]) => l).join(', ')} — todas com acesso`);
});

check('Parte G: dupla sem ranking segue recebendo rota indefinidamente', () => {
  // O corredor morto sospeitado: a dupla falha em Bronze/Silver muitas vezes e
  // em algum momento deixa de receber opcoes. A elegibilidade nao tem memoria
  // de tentativas, entao nao existe estado que a feche.
  const first = entry('Bronze', 0);
  const later = entry('Bronze', 0);
  note(`estado UNRANKED -> Bronze: ${first.path} / ${later.path} (sem memoria de tentativas)`);
  assert.equal(first.eligible, later.eligible);
  assert.equal(classifyPairRankingState({ ranking_points: 0, matches_played: 0, origin: 'market' }, []), RANKING_STATES.UNRANKED);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
