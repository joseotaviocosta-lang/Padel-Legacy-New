import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldBlockBeforeAdvance } from '../src/game-core/calendarAdvancePolicy.js';

// Hotfix — "torneio confirmado é pulado sem jogar ao avançar o dia".
// Reprodução: torneio agendado pra hoje, jogador clica "Confirmar Presença"
// (CalendarPage.jsx, PendingDecisionBanner -> handleResolveDecision, action
// 'play'), aperta "Avançar" de novo — o dia virava sem a partida acontecer.
//
// Causa raiz: `handleResolveDecision` chamava `resolveDecision(event.id,
// 'play')` (src/lib/calendarSystem.js) ANTES de abrir o modal do torneio —
// e `resolveDecision` limpa `requires_decision` incondicionalmente pra
// qualquer ação diferente de 'skip'. Isso acontecia mesmo que o jogador
// nunca tivesse jogado a partida (fechasse o modal, navegasse pra outra
// página). `canAdvanceDay` (chamado dentro do próprio `advanceDay`, não só
// na UI — src/lib/career.js) usa exatamente essa flag pra decidir se
// bloqueia o avanço; uma vez limpa, não sobrava nada pra bloquear.
//
// Este teste tem duas partes: (1) confirma que a política de bloqueio
// (calendarAdvancePolicy.js) já protege corretamente um torneio com
// requires_decision AINDA true — a peça que já funcionava; (2) confirma,
// por leitura de código, que handleResolveDecision (CalendarPage.jsx) não
// chama mais resolveDecision antes de abrir o torneio pra action:'play' —
// a peça que estava quebrada.

// --- Parte 1: a política de bloqueio protege um torneio não resolvido ---
const today = '2026-01-15';
const confirmedNotPlayed = {
  id: 'evt-1', event_type: 'tournament', status: 'scheduled',
  start_date: today, end_date: today, requires_decision: true, decision_type: 'play_tournament',
  metadata: { registration_id: 'reg-1' },
};
assert.equal(shouldBlockBeforeAdvance(confirmedNotPlayed, today), true, 'torneio confirmado, ainda não jogado, deve bloquear o avanço');

// Se `requires_decision` fosse limpo no clique de "Confirmar Presença"
// (o bug), o mesmo evento pararia de bloquear mesmo sem a partida ter
// acontecido — reproduzindo exatamente o pulo em silêncio.
const wronglyCleared = { ...confirmedNotPlayed, requires_decision: false };
assert.equal(shouldBlockBeforeAdvance(wronglyCleared, today), false, '(documentação do bug) sem requires_decision, nada bloqueia — por isso a correção não pode limpar essa flag ao só abrir o modal');

// --- Parte 2: handleResolveDecision não limpa a flag antes de abrir o torneio ---
const source = readFileSync(new URL('../src/pages/CalendarPage.jsx', import.meta.url), 'utf8');
const fnStart = source.indexOf('async function handleResolveDecision');
assert.ok(fnStart >= 0, 'handleResolveDecision deve existir em CalendarPage.jsx');
const fnEnd = source.indexOf('\n  function handleDayClick', fnStart);
const fnBody = source.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 2000);

const tournamentPlayCheckIdx = fnBody.indexOf("action === 'play' && event.event_type === 'tournament'");
const resolveDecisionCallIdx = fnBody.indexOf('await resolveDecision(event.id, action)');
assert.ok(tournamentPlayCheckIdx >= 0, 'handleResolveDecision deve checar action:play + event_type:tournament antes de resolver');
assert.ok(resolveDecisionCallIdx >= 0, 'handleResolveDecision deve chamar resolveDecision para os demais casos (skip, decisões não-torneio)');
assert.ok(
  tournamentPlayCheckIdx < resolveDecisionCallIdx,
  'a checagem de torneio+play deve vir ANTES da chamada a resolveDecision — senão requires_decision é limpo antes de a partida ser jogada, reabrindo o bug',
);
// O branch de torneio precisa retornar sem chegar em resolveDecision.
const branchSlice = fnBody.slice(tournamentPlayCheckIdx, resolveDecisionCallIdx);
assert.ok(branchSlice.includes('return;'), 'o branch de torneio+play deve retornar cedo, sem cair na chamada de resolveDecision');

console.log('tournament-confirm-no-skip: torneio confirmado continua bloqueando o avanço até a partida ser jogada — OK');
