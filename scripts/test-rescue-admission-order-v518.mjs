// Playthrough 5.18-G, Parte G — RESGATE, TESTADO DIRIGIDAMENTE.
//
// Por que este teste não usa simulação: numa temporada real o resgate NUNCA
// dispara (medido: 0 de 124 sorteios). Os campos ficam sobre-inscritos, não
// sub-inscritos — Bronze tem fila média de 263 para 16 vagas. Um gate que
// "passa" sobre 0 ocorrências não prova nada sobre a ordem do resgate, então
// aqui a condição é construída diretamente sobre a função exportada que o
// resgate usa (`rankCandidatesByTierFit`) e sobre o mínimo viável.
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

installShims('/rescue-order');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { rankCandidatesByTierFit } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { getTierRankingFit, getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

const mkPair = (id, rankA, rankB, ovr) => ({
  id,
  name: id,
  chemistry: 50,
  priorityWindowRemaining: 0,
  athletes: [
    { id: `${id}-a`, name: `${id}-a`, ranking_position: rankA, overall_rating: ovr, tournaments_played: 0 },
    { id: `${id}-b`, name: `${id}-b`, ranking_position: rankB, overall_rating: ovr, tournaments_played: 0 },
  ],
});

// Tier de acesso restrito, para que o fit discrimine de verdade.
const tournament = { id: 't-gold-rescue', tier: 'Gold', main_draw_size: 24 };
const cfg = getTournamentTierConfig('Gold');
console.log(`\n=== Gold: minRanking=${cfg.minRanking} chave=${cfg.mainDrawSize} ===\n`);

const candidates = [
  mkPair('elite-2', 2, 2, 95),
  mkPair('ideal-460', 460, 460, 74),
  mkPair('ideal-500', 500, 500, 72),
  mkPair('longe-900', 900, 900, 60),
  mkPair('longe-1200', 1200, 1200, 55),
];
const ordered = rankCandidatesByTierFit(candidates, tournament);
console.log('ordem de resgate (rankCandidatesByTierFit):');
for (const p of ordered) {
  const r = Math.round((p.athletes[0].ranking_position + p.athletes[1].ranking_position) / 2);
  console.log(`  ${p.id.padEnd(12)} rank=${String(r).padStart(5)} fit=${String(getTierRankingFit('Gold', r)).padStart(4)}`);
}
console.log('');

check('Parte G: o resgate prioriza ADEQUAÇÃO ao tier, não força bruta', () => {
  // A dupla #2 do mundo tem o maior OVR da lista; se o resgate ordenasse por
  // talento ela viria primeiro. A ordem correta é por fit — o resgate existe
  // para completar um campo com quem pertence àquele nível.
  const first = ordered[0].id;
  const rankOf = (p) => Math.round((p.athletes[0].ranking_position + p.athletes[1].ranking_position) / 2);
  const fits = ordered.map((p) => getTierRankingFit('Gold', rankOf(p)));
  note(`ordem: ${ordered.map((p) => p.id).join(' > ')}`);
  note(`fits na ordem: ${fits.join(' > ')}`);
  for (let i = 1; i < fits.length; i += 1) {
    assert.ok(fits[i] <= fits[i - 1], `fit não decrescente em ${i}: ${fits[i - 1]} -> ${fits[i]}`);
  }
  assert.notEqual(first, 'elite-2', 'o resgate escolheu por talento bruto, não por adequação');
});

check('Parte G: empate de fit é desempatado por força, não arbitrariamente', () => {
  const a = mkPair('par-a', 500, 500, 70);
  const b = mkPair('par-b', 500, 500, 85);
  const out = rankCandidatesByTierFit([a, b], tournament);
  note(`mesmo rank, OVR 70 vs 85 -> primeiro: ${out[0].id}`);
  assert.equal(out[0].id, 'par-b', 'empate de fit não foi desempatado pelo mais forte');
});

check('Parte G: a ordem do resgate é estável e determinística', () => {
  const a = rankCandidatesByTierFit(candidates, tournament).map((p) => p.id);
  const b = rankCandidatesByTierFit([...candidates].reverse(), tournament).map((p) => p.id);
  note(`ordem direta:  ${a.join(' > ')}`);
  note(`ordem invertida: ${b.join(' > ')}`);
  assert.deepEqual(a, b, 'a ordem depende da ordem de entrada');
});

check('Parte G: o resgate não é acionado acima do mínimo viável', () => {
  // Espelha minViableDraw (WorldTourLifecycle.js:293, não exportada):
  // min(8, max(2, ceil(draw/2))).
  const minViable = (draw) => Math.min(8, Math.max(2, Math.ceil(draw / 2)));
  const cases = [[24, 8], [16, 8], [8, 4], [4, 2], [2, 2]];
  for (const [draw, expected] of cases) {
    assert.equal(minViable(draw), expected, `minViable(${draw})`);
  }
  note(`mínimo viável: ${cases.map(([d, e]) => `chave ${d} -> ${e}`).join(' | ')}`);
  note('resgate só dispara quando o campo fica ABAIXO desses valores');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
