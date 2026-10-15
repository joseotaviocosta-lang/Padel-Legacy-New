// Playthrough 5.18-H, Parte L — COMPROMISSO OBSOLETO NÃO PODE BLOQUEAR.
//
// Hipótese a testar: uma dupla deixa de competir porque um compromisso antigo
// segue bloqueando a agenda — evento já concluído ainda contando, janela de
// sobreposição larga demais, ou parceria antiga contaminando compromisso novo.
//
// Era candidata legítima para o limbo até a 5.18-H medir a causa real
// (exaustão permanente + amostragem sem rotação). O teste continua necessário:
// a causa ter sido outra não prova que o compromisso obsoleto não bloqueie.
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

installShims('/stale-commitment');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const wt = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { committedPairIdsForWindow } = wt;
const reg = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

const drawnEvent = (id, start, end, resolved = false) => ({
  id, name: id, tier: 'Silver', start_date: start, end_date: end,
  bracket_schema_version: 2, draw_pair_ids: ['pair-1'],
  world_tour_resolved: resolved,
});

console.log('\n=== Parte L: janela de compromisso ===\n');

check('Parte L: evento em curso bloqueia a mesma janela', () => {
  const due = [drawnEvent('t-now', '2026-03-02', '2026-03-05')];
  const all = [...due];
  const committed = committedPairIdsForWindow(due, all);
  note(`evento nao resolvido na janela -> comprometidos: ${[...committed].join(',') || '(nenhum)'}`);
  // O proprio evento devido nao deve se auto-bloquear, mas um OUTRO evento
  // sobreposto e nao resolvido deve.
  const other = drawnEvent('t-overlap', '2026-03-04', '2026-03-07');
  const committed2 = committedPairIdsForWindow(due, [...all, other]);
  note(`com evento sobreposto nao resolvido -> comprometidos: ${[...committed2].join(',') || '(nenhum)'}`);
  assert.ok(committed2.has('pair-1'), 'sobreposicao real nao foi detectada');
});

check('Parte L: evento JA RESOLVIDO nao bloqueia mais nada', () => {
  const due = [drawnEvent('t-future', '2026-03-16', '2026-03-19')];
  const finished = drawnEvent('t-past', '2026-03-16', '2026-03-19', true);
  const committed = committedPairIdsForWindow(due, [...due, finished]);
  note(`evento resolvido sobreposto -> comprometidos: ${[...committed].join(',') || '(nenhum)'}`);
  assert.ok(!committed.has('pair-1'), 'evento ja resolvido continua bloqueando a agenda');
});

check('Parte L: evento sem chave sorteada nao bloqueia', () => {
  const due = [drawnEvent('t-future', '2026-04-06', '2026-04-09')];
  const noDraw = { ...drawnEvent('t-nodraw', '2026-04-06', '2026-04-09'), draw_pair_ids: [] };
  const committed = committedPairIdsForWindow(due, [...due, noDraw]);
  note(`evento sem draw_pair_ids -> comprometidos: ${[...committed].join(',') || '(nenhum)'}`);
  assert.ok(!committed.has('pair-1'), 'evento sem chave bloqueou a agenda');
});

check('Parte L: a janela nao e larga demais (evento adjacente nao bloqueia)', () => {
  const due = [drawnEvent('t-week2', '2026-03-16', '2026-03-19')];
  // Termina no dia anterior ao inicio do proximo: nao ha sobreposicao.
  const adjacent = drawnEvent('t-week1', '2026-03-09', '2026-03-15');
  const committed = committedPairIdsForWindow(due, [...due, adjacent]);
  note(`evento que termina 1 dia antes -> comprometidos: ${[...committed].join(',') || '(nenhum)'}`);
  assert.ok(!committed.has('pair-1'), 'janela de bloqueio se estende alem da sobreposicao real');
});

check('Parte L: sobreposicao de um unico dia conta como conflito', () => {
  const due = [drawnEvent('t-b', '2026-03-15', '2026-03-18')];
  const touching = drawnEvent('t-a', '2026-03-12', '2026-03-15');
  const committed = committedPairIdsForWindow(due, [...due, touching]);
  note(`eventos que compartilham 2026-03-15 -> comprometidos: ${[...committed].join(',') || '(nenhum)'}`);
  assert.ok(committed.has('pair-1'), 'sobreposicao de um dia passou despercebida');
});

console.log('\n=== Parte L: conflito de agenda do jogador ===\n');

const player = { id: 'p1', partner_id: 'q1', career_date: '2026-03-01', coins: 5000, energy: 100, age: 24 };
const partner = { id: 'q1', status: 'active' };
const target = { id: 'target', name: 'Alvo', tier: 'Silver', start_date: '2026-03-16', end_date: '2026-03-19' };

check('Parte L: inscricao concluida no passado nao gera DATE_CONFLICT', () => {
  const past = {
    id: 'r-past', profile_id: player.id, partner_id: partner.id,
    tournament_id: 'old', tournament_name: 'Antigo', status: 'completed',
    effective_start_date: '2026-03-02', effective_end_date: '2026-03-05',
  };
  const r = reg.evaluateTournamentRegistration({
    player, partner, tournament: target, currentDate: '2026-03-10',
    registrations: [past], tournaments: [target, { id: 'old', start_date: '2026-03-02', end_date: '2026-03-05' }],
  });
  note(`permitido=${r.allowed} motivos=${r.reasons.map((x) => x.code).join(',') || '-'}`);
  assert.ok(!r.reasons.some((x) => x.code === 'DATE_CONFLICT'), 'evento passado gerou conflito de data');
});

check('Parte L: inscricao CANCELADA nao bloqueia', () => {
  const cancelled = {
    id: 'r-cancel', profile_id: player.id, partner_id: partner.id,
    tournament_id: 'overlap', tournament_name: 'Sobreposto', status: 'cancelled',
    effective_start_date: '2026-03-17', effective_end_date: '2026-03-20',
  };
  const overlap = { id: 'overlap', start_date: '2026-03-17', end_date: '2026-03-20' };
  const r = reg.evaluateTournamentRegistration({
    player, partner, tournament: target, currentDate: '2026-03-10',
    registrations: [cancelled], tournaments: [target, overlap],
  });
  note(`permitido=${r.allowed} motivos=${r.reasons.map((x) => x.code).join(',') || '-'}`);
  assert.equal(r.allowed, true, `inscricao cancelada bloqueou: ${JSON.stringify(r.reasons)}`);
});

check('Parte L: sobreposicao CONFIRMADA continua bloqueando', () => {
  const confirmed = {
    id: 'r-ok', profile_id: player.id, partner_id: partner.id,
    tournament_id: 'overlap', tournament_name: 'Sobreposto', status: 'confirmed',
    effective_start_date: '2026-03-17', effective_end_date: '2026-03-20',
  };
  const overlap = { id: 'overlap', start_date: '2026-03-17', end_date: '2026-03-20' };
  const r = reg.evaluateTournamentRegistration({
    player, partner, tournament: target, currentDate: '2026-03-10',
    registrations: [confirmed], tournaments: [target, overlap],
  });
  note(`permitido=${r.allowed} motivos=${r.reasons.map((x) => x.code).join(',') || '-'}`);
  assert.ok(r.reasons.some((x) => x.code === 'DATE_CONFLICT'), 'sobreposicao real deixou de bloquear');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
