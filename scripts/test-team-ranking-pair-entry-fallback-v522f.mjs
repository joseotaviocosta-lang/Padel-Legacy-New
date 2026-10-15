// Playthrough 5.22-F, Parte 6 — auditoria do fallback pairEntryRank.
//
// Antes, quando uma dupla ainda não tinha linha de TeamRanking, o seeding
// caía na MÉDIA DOS RANKS INDIVIDUAIS (unidade antiga). Isso podia divergir
// materialmente da autoridade de soma. Alinhado: o fallback de seeding agora
// calcula a SOMA dos rolling atuais dos membros e a posiciona contra a
// distribuição canônica. `pairEntryRank` continua existindo apenas como
// último recurso (board canônico vazio / membros irresolvíveis).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeCanonicalTeamRankingPoints as canonical, buildSyntheticPopulation, gapRatio } from './lib/teamFormulaModels.mjs';

const source = readFileSync(new URL('../src/gameplay/worldTour/WorldTourLifecycle.js', import.meta.url), 'utf8');

assert.match(source, /positionForCanonicalPoints/, 'fallback canônico de seeding ausente');
assert.match(source, /canonicalTeamPointsDesc/, 'distribuição canônica de pontos ausente');

const seedRankBlock = source.match(/const pairSeedRank =[\s\S]*?\n  \};/);
assert.ok(seedRankBlock, 'bloco pairSeedRank não encontrado');
const block = seedRankBlock[0];
const atCanonicalMap = block.indexOf('canonicalTeamRanks.get');
const atCanonicalPoints = block.indexOf('positionForCanonicalPoints');
const atProxy = block.indexOf('pairEntryRank(pair)');
assert.ok(atCanonicalMap >= 0 && atCanonicalPoints >= 0 && atProxy >= 0, 'pairSeedRank não cobre os três caminhos');
assert.ok(atCanonicalMap < atCanonicalPoints, 'linha canônica deve ser preferida ao fallback de pontos');
assert.ok(atCanonicalPoints < atProxy, 'proxy individual só pode ser o ÚLTIMO recurso');

// Documentação quantitativa da divergência do proxy (média de ranks
// individuais) contra o rank canônico (soma) na população sintética.
const { pairs, athletes } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });
const individualRank = new Map([...athletes].sort((a, b) => b.points - a.points).map((a, i) => [a.id, i + 1]));
const rows = pairs.map((p) => {
  const [id1, id2] = p.name.split('/');
  const proxy = Math.round((individualRank.get(id1) + individualRank.get(id2)) / 2);
  return { ratio: gapRatio(p.a, p.b), proxy, sum: canonical(p.a, p.b) };
});
const canonicalDesc = rows.map((r) => r.sum).sort((a, b) => b - a);
const canonicalPosition = (points) => {
  let i = 0; while (i < canonicalDesc.length && canonicalDesc[i] > points) i += 1; return i + 1;
};
const balanced = rows.filter((r) => r.ratio < 1.5);
const divergent = balanced.map((r) => Math.abs(r.proxy - canonicalPosition(r.sum)));
const maxDiv = Math.max(...divergent);
const medianDiv = divergent.sort((a, b) => a - b)[Math.floor(divergent.length / 2)];
console.log(`   [registro] divergência proxy individual vs rank canônico (equilibradas): mediana ${medianDiv}, máx ${maxDiv}`);

assert.ok(Number.isFinite(maxDiv), 'divergência não finita');
// A divergência é MATERIAL (o proxy mistura duas unidades: rank individual
// médio vs posição da soma). É exatamente por isso que o fallback de seeding
// foi alinhado à autoridade canônica; se divergisse pouco, o alinhamento não
// seria necessário.
assert.ok(medianDiv > 50, `proxy individual NÃO divergiu materialmente (mediana ${medianDiv}) — o alinhamento seria desnecessário`);

console.log(`test-team-ranking-pair-entry-fallback-v522f: PASS (divergência material mediana ${medianDiv} → fallback alinhado à soma)`);
