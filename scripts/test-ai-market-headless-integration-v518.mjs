// Playthrough 5.18-B, Partes D/E — PARIDADE HEADLESS × PRODUÇÃO.
//
// Bug metodológico que esta continuação fecha: `runHeadlessWorldSimulation`
// não executava `processAiPartnershipMarket` nem `simulateWorldDay`, embora a
// produção rode as duas todo dia via gameStateLifecycle. O mundo headless
// ficava congelado no seed (994/1000 pareados, ~6 livres) e toda conclusão de
// ecologia tirada dele media um universo que o jogador nunca vê.
//
// Este teste é a guarda permanente contra a reintrodução do bug: compara o
// harness COM e SEM paridade e exige que a versão com paridade realmente
// mova a população.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function census(sim) {
  const alive = sim.athletes.filter((a) => !a.retired && a.career_status !== 'aposentado');
  const free = alive.filter((a) => !a.ai_partner_id);
  const byId = new Map(sim.athletes.map((a) => [a.id, a]));
  let unilateral = 0;
  for (const a of sim.athletes) {
    if (!a.ai_partner_id) continue;
    const b = byId.get(a.ai_partner_id);
    if (!b || b.ai_partner_id !== a.id) unilateral += 1;
  }
  const active = (sim.partnerships || []).filter((p) => p.status === 'ativa');
  const appearances = new Map();
  for (const p of active) {
    for (const id of [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id].filter(Boolean)) {
      appearances.set(id, (appearances.get(id) || 0) + 1);
    }
  }
  const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  return {
    athletes: sim.athletes.length,
    alive: alive.length,
    free: free.length,
    freePct: free.length / Math.max(1, alive.length),
    activePartnerships: active.length,
    unilateral,
    inTwoPlus: [...appearances.values()].filter((n) => n > 1).length,
    drawn: drawn.length,
    completed: drawn.filter((t) => t.champion).length,
    teams: (sim.teamRankings || []).length,
    stats: sim.lifecycleStats,
  };
}

// --- Sem paridade: reproduz o mundo congelado que a 5.15-5.17 mediu -------
console.log('=== SEM paridade (worldLifecycles: false) ===');
const frozen = await runHeadlessWorldSimulation({
  years: 1, label: 'parity-off', trackWeeklyDraws: false, includeRankingResults: true,
  worldLifecycles: false,
});
const cFrozen = census(frozen);
console.log(`atletas=${cFrozen.athletes} livres=${cFrozen.free} (${(cFrozen.freePct * 100).toFixed(0)}%) parcerias=${cFrozen.activePartnerships} sorteados=${cFrozen.drawn}`);
console.log(`lifecycle: ${JSON.stringify(cFrozen.stats)}`);

// --- Com paridade: o mundo que o jogador realmente joga -------------------
console.log('\n=== COM paridade (default) ===');
const live = await runHeadlessWorldSimulation({
  years: 1, label: 'parity-on', trackWeeklyDraws: false, includeRankingResults: true,
});
const cLive = census(live);
console.log(`atletas=${cLive.athletes} livres=${cLive.free} (${(cLive.freePct * 100).toFixed(0)}%) parcerias=${cLive.activePartnerships} sorteados=${cLive.drawn}`);
console.log(`lifecycle: ${JSON.stringify(cLive.stats)}`);

console.log('\n=== PARTE D: comparativo de domínios simulados ===');
console.log('domínio                    sem paridade   com paridade');
for (const [name, a, b] of [
  ['atletas', cFrozen.athletes, cLive.athletes],
  ['atletas vivos', cFrozen.alive, cLive.alive],
  ['agentes livres', cFrozen.free, cLive.free],
  ['parcerias ativas', cFrozen.activePartnerships, cLive.activePartnerships],
  ['duplas no ranking', cFrozen.teams, cLive.teams],
  ['torneios sorteados', cFrozen.drawn, cLive.drawn],
  ['torneios concluídos', cFrozen.completed, cLive.completed],
  ['atleta em 2+ duplas', cFrozen.inTwoPlus, cLive.inTwoPlus],
  ['parcerias unilaterais', cFrozen.unilateral, cLive.unilateral],
]) {
  console.log(`${name.padEnd(26)}${String(a).padStart(13)}${String(b).padStart(15)}`);
}

check('Parte E: o harness com paridade EXECUTA o mercado mensal', () => {
  console.log(`   [registro] meses de mercado=${cLive.stats.marketMonths} formadas=${cLive.stats.formed} dissolvidas=${cLive.stats.dissolved}`);
  assert.ok(cLive.stats.worldLifecycles, 'paridade não está ativa por default');
  assert.ok(cLive.stats.marketMonths >= 11, `só ${cLive.stats.marketMonths} meses de mercado em 1 ano`);
});

check('Parte E: o harness SEM paridade não executa nada disso', () => {
  assert.equal(cFrozen.stats.marketMonths, 0, 'o modo congelado rodou o mercado');
  assert.equal(cFrozen.stats.formed, 0);
  assert.equal(cFrozen.stats.dissolved, 0);
});

check('Parte E: dissoluções e formações > 0 com paridade', () => {
  assert.ok(cLive.stats.dissolved > 0, 'nenhuma dissolução no ano');
  assert.ok(cLive.stats.formed > 0, 'nenhuma formação no ano');
});

check('Parte E: o bug original fica provado (mundo congelado vs vivo)', () => {
  console.log(`   [registro] livres: congelado=${cFrozen.free} vivo=${cLive.free}`);
  assert.ok(cFrozen.free <= 20, `o modo congelado deveria manter o seed (~6), deu ${cFrozen.free}`);
  assert.ok(cLive.free >= 100, `o modo vivo deveria liberar a população, deu ${cLive.free}`);
});

check('Parte D: o domínio de TORNEIOS continua funcionando com paridade', () => {
  // Paridade não pode quebrar o sistema que o harness já testava.
  console.log(`   [registro] sorteados ${cFrozen.drawn} -> ${cLive.drawn} | concluídos ${cFrozen.completed} -> ${cLive.completed}`);
  assert.ok(cLive.drawn > 0, 'nenhum torneio sorteado com paridade');
  assert.ok(cLive.completed > 0, 'nenhum torneio concluído com paridade');
  const delta = Math.abs(cLive.drawn - cFrozen.drawn) / Math.max(1, cFrozen.drawn);
  assert.ok(delta < 0.25, `volume de sorteios mudou ${(delta * 100).toFixed(0)}% — suspeito`);
});

check('Parte E: integridade preservada nos dois modos', () => {
  for (const [name, c] of [['congelado', cFrozen], ['vivo', cLive]]) {
    assert.equal(c.unilateral, 0, `${name}: ${c.unilateral} parcerias unilaterais`);
    assert.equal(c.inTwoPlus, 0, `${name}: ${c.inTwoPlus} atletas em 2+ duplas`);
  }
});

check('Parte O: a população não explode com os lifecycles de paridade', () => {
  // simulateWorldDay gera prospects mensalmente e poda aposentados.
  console.log(`   [registro] atletas: congelado=${cFrozen.athletes} vivo=${cLive.athletes}`);
  assert.ok(cLive.athletes <= cFrozen.athletes + 120,
    `população saltou de ${cFrozen.athletes} para ${cLive.athletes}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-ai-market-headless-integration-v518: PASS');
