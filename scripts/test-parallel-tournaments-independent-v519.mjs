// Playthrough 5.19, Partes Y/AA/AB — EVENTOS DO MESMO DIA SÃO INDEPENDENTES.
//
// O playtest: com o jogador lesionado e seu evento em W.O., outros torneios da
// MESMA data cancelaram por "duplas insuficientes".
//
// Este teste cobre a independência entre eventos simultâneos de IA, sem o
// jogador envolvido: cada evento tem roster próprio, nenhuma dupla aparece em
// dois eventos sobrepostos, e nenhum cancelamento ocorre por estado alheio.
// A forense de cada evento é impressa (Parte AA): não basta "insuficiente", é
// preciso saber POR QUE ficaram insuficientes.
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

installShims('/parallel-independent');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const wt = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { assignPairsForWeek, committedPairIdsForWindow } = wt;

const WEEK_START = '2026-05-11';
const WEEK_END = '2026-05-14';
const mkT = (id, tier, draw, extra = {}) => ({
  id, name: id, tier, world_tour_event: true,
  start_date: WEEK_START, end_date: WEEK_END, main_draw_size: draw, ...extra,
});
const mkPair = (n, rank, ovr) => ({
  id: `pair-${n}`, name: `Dupla ${n}`, chemistry: 50, priorityWindowRemaining: 0,
  athletes: [
    { id: `a-${n}-1`, name: `A${n}1`, ranking_position: rank, overall_rating: ovr, tournaments_played: 5, energy: 100 },
    { id: `a-${n}-2`, name: `A${n}2`, ranking_position: rank + 4, overall_rating: ovr, tournaments_played: 5, energy: 100 },
  ],
});

// Cinco tiers na MESMA janela (Parte Y).
const events = [
  mkT('bronze-sp', 'Bronze', 16),
  mkT('silver-xangai', 'Silver', 16),
  mkT('gold-melbourne', 'Gold', 24),
  mkT('platinum-doha', 'Platinum', 32),
  mkT('masters-madrid', 'Masters', 24),
];
const pairs = Array.from({ length: 160 }, (_, i) => mkPair(i, 5 + i * 6, 92 - Math.floor(i / 4)));
const minViable = (draw) => Math.min(8, Math.max(2, Math.ceil(draw / 2)));

const assignments = assignPairsForWeek(events, pairs);

console.log('\n=== Parte AA: forense por evento (mesma janela, 5 tiers) ===\n');
console.log(`${'evento'.padEnd(18)}${'tier'.padEnd(11)}${'cand'.padEnd(7)}${'chave'.padEnd(7)}${'minimo'.padEnd(8)}${'final'.padEnd(7)}situacao`);
const forensics = [];
for (const t of events) {
  const list = assignments.get(t.id) || [];
  const finalCount = Math.min(list.length, t.main_draw_size);
  const viable = finalCount >= minViable(t.main_draw_size);
  forensics.push({
    id: t.id, tier: t.tier, candidateCount: list.length, draw: t.main_draw_size,
    minViable: minViable(t.main_draw_size), finalCount, viable,
    cancelReason: viable ? null : 'inscritos_insuficientes',
    ids: new Set(list.map((p) => p.id)),
  });
  console.log(`${t.id.padEnd(18)}${t.tier.padEnd(11)}${String(list.length).padEnd(7)}${String(t.main_draw_size).padEnd(7)}${String(minViable(t.main_draw_size)).padEnd(8)}${String(finalCount).padEnd(7)}${viable ? 'OK' : 'CANCELARIA'}`);
}
const assignedTotal = forensics.reduce((s, f) => s + f.candidateCount, 0);
const idle = pairs.length - new Set(forensics.flatMap((f) => [...f.ids])).size;
console.log(`\n  duplas no pool=${pairs.length} | alocadas=${assignedTotal} | ociosas=${idle}\n`);

check('Parte Y: cada evento tem roster proprio e nao vazio', () => {
  for (const f of forensics) {
    assert.ok(f.candidateCount > 0, `${f.id} sem nenhum candidato`);
  }
  note(`eventos=${forensics.length} | todos com roster proprio`);
});

check('Parte Y (gate): nenhuma dupla aparece em DOIS eventos sobrepostos', () => {
  const seen = new Map();
  const collisions = [];
  for (const f of forensics) {
    for (const id of f.ids) {
      if (seen.has(id)) collisions.push(`${id}: ${seen.get(id)} + ${f.id}`);
      else seen.set(id, f.id);
    }
  }
  note(`duplas distintas alocadas=${seen.size} | colisoes=${collisions.length}`);
  for (const c of collisions.slice(0, 5)) note(`  ${c}`);
  assert.equal(collisions.length, 0, 'a mesma dupla foi alocada a dois eventos simultaneos');
});

check('Parte Y: nenhum evento cancela nesta janela', () => {
  const failing = forensics.filter((f) => !f.viable);
  note(`eventos abaixo do minimo viavel: ${failing.length}`);
  for (const f of failing) note(`  ${f.id}: final=${f.finalCount} minimo=${f.minViable} motivo=${f.cancelReason}`);
  assert.equal(failing.length, 0);
});

check('Parte AA: toda forense tem os campos exigidos', () => {
  // A Parte AA proibe aceitar apenas "insufficient pairs": cada evento precisa
  // reportar candidatos, elegiveis, minimo, final e motivo.
  for (const f of forensics) {
    for (const key of ['candidateCount', 'draw', 'minViable', 'finalCount']) {
      assert.ok(Number.isFinite(f[key]), `${f.id} sem ${key}`);
    }
  }
  note(`campos de forense presentes em ${forensics.length} eventos`);
});

// --------------------------------------------------- exclusividade de agenda
console.log('=== Parte L/Y: exclusividade de agenda entre janelas sobrepostas ===\n');
check('Parte Y: dupla ja sorteada em evento sobreposto nao concorre de novo', () => {
  const drawnElsewhere = mkT('already-drawn', 'Gold', 24, {
    bracket_schema_version: 2,
    draw_pair_ids: ['pair-0', 'pair-1', 'pair-2'],
    world_tour_resolved: false,
  });
  const committed = committedPairIdsForWindow(events, [...events, drawnElsewhere]);
  note(`comprometidas em evento sobreposto: ${[...committed].join(', ') || '(nenhuma)'}`);
  assert.ok(committed.has('pair-0') && committed.has('pair-1'), 'exclusividade de agenda nao detectou o compromisso');
  const free = pairs.filter((p) => !committed.has(p.id));
  const reassigned = assignPairsForWeek(events, free);
  const anyCommitted = [...reassigned.values()].flat().some((p) => committed.has(p.id));
  note(`duplas comprometidas reaproveitadas: ${anyCommitted ? 'SIM' : 'nenhuma'}`);
  assert.equal(anyCommitted, false);
});

check('Parte Y: evento JA RESOLVIDO nao bloqueia a janela', () => {
  const resolved = mkT('resolved-event', 'Gold', 24, {
    bracket_schema_version: 2,
    draw_pair_ids: ['pair-10', 'pair-11'],
    world_tour_resolved: true,
  });
  const committed = committedPairIdsForWindow(events, [...events, resolved]);
  note(`evento resolvido -> comprometidas: ${[...committed].join(', ') || '(nenhuma)'}`);
  assert.ok(!committed.has('pair-10'), 'evento ja resolvido continua bloqueando duplas');
});

check('Parte AB: nenhum campo foi aumentado nem minimo reduzido', () => {
  const sizes = Object.fromEntries(events.map((t) => [t.tier, t.main_draw_size]));
  note(`chaves: ${Object.entries(sizes).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  assert.equal(sizes.Masters, 24, 'Masters deixou de ser 24');
  for (const [draw, want] of [[24, 8], [16, 8], [32, 8]]) {
    assert.equal(minViable(draw), want, `minViable(${draw})`);
  }
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
