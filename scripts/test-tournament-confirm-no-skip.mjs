import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldBlockBeforeAdvance } from '../src/game-core/calendarAdvancePolicy.js';

// Hotfix — "torneio confirmado é pulado sem jogar ao avançar o dia".
//
// Dois fluxos distintos já reproduziram o mesmo bug:
//   (A) botão "Avançar" direto, com o torneio pendente do dia;
//   (B) clicar no calendário -> banner "Confirmar Presença" -> confirmar.
//
// Causa raiz comum: `resolveDecision` (src/lib/calendarSystem.js) limpava
// `requires_decision` incondicionalmente para qualquer ação != 'skip', e
// `canAdvanceDay` (chamado DENTRO de advanceDay, src/lib/career.js) usa
// exatamente essa flag para bloquear o avanço. A 1ª correção viveu só no
// chamador (CalendarPage.jsx) e tinha um fall-through: quando o torneio não
// estava na lista local — e `Tournament.list('-start_date', 100)` não
// devolvia NENHUM torneio de janeiro numa carreira nova (medido: o mais
// antigo visível era julho) — o fluxo caía em `resolveDecision` assim mesmo.
//
// Agora a garantia é da própria calendarSystem (shouldClearPendingDecision),
// não do chamador, e a UI nunca depende da lista truncada para abrir o
// torneio (openTournamentById busca por id).

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ── 1. Invariante central: confirmar presença nunca encerra um torneio ──
const { shouldClearPendingDecision } = await import('../src/lib/calendarSystem.js')
  .catch(async () => {
    // calendarSystem.js importa aliases '@/...' que só o Vite resolve.
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    const mod = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
    await vite.close();
    return mod;
  });

const tournamentEvent = { id: 'evt-1', event_type: 'tournament', decision_type: 'play_tournament' };
assert.equal(shouldClearPendingDecision(tournamentEvent, 'play'), false, 'confirmar presença num torneio NÃO pode encerrar o compromisso');
assert.equal(shouldClearPendingDecision(tournamentEvent, 'confirm'), false, 'nenhuma ação além de skip pode encerrar um compromisso de torneio');
assert.equal(shouldClearPendingDecision(tournamentEvent, 'skip'), true, 'cancelar o torneio continua encerrando o compromisso');
// Evento não-torneio mantém o comportamento antigo (resolvido no clique).
assert.equal(shouldClearPendingDecision({ id: 'e2', event_type: 'press', requires_decision: true }, 'play'), true);
// Evento não encontrado (get falhou) não pode ser tratado como torneio nem travar outros tipos.
assert.equal(shouldClearPendingDecision(null, 'play'), true);

// ── 2. A política de bloqueio protege um torneio não resolvido ──
const today = '2026-01-15';
const confirmedNotPlayed = {
  id: 'evt-1', event_type: 'tournament', status: 'scheduled',
  start_date: today, end_date: today, requires_decision: true, decision_type: 'play_tournament',
  metadata: { registration_id: 'reg-1' },
};
assert.equal(shouldBlockBeforeAdvance(confirmedNotPlayed, today), true, 'torneio confirmado e não jogado deve bloquear o avanço');
assert.equal(shouldBlockBeforeAdvance({ ...confirmedNotPlayed, requires_decision: false }, today), false, '(documentação do bug) sem a flag, nada bloqueia');

// ── 3. Fluxo A e B: a UI nunca cai em resolveDecision para um torneio ──
const page = read('src/pages/CalendarPage.jsx');
const fnStart = page.indexOf('async function handleResolveDecision');
assert.ok(fnStart >= 0, 'handleResolveDecision deve existir');
const fnBody = page.slice(fnStart, page.indexOf('\n  function handleDayClick', fnStart));
const branchIdx = fnBody.indexOf("action === 'play' && event.event_type === 'tournament'");
const resolveIdx = fnBody.indexOf('await resolveDecision(event.id, action)');
assert.ok(branchIdx >= 0 && resolveIdx >= 0, 'handleResolveDecision deve tratar torneio antes de resolver os demais casos');
assert.ok(branchIdx < resolveIdx, 'o branch de torneio deve vir ANTES de resolveDecision');
const branch = fnBody.slice(branchIdx, resolveIdx);
assert.ok(branch.includes('return;'), 'o branch de torneio deve retornar sempre — nunca cair em resolveDecision');
assert.ok(
  !/const tournament = tournaments\.find\([^)]*\);\s*if \(tournament\)/.test(branch),
  'o branch não pode depender de encontrar o torneio na lista local (truncada) para evitar o fall-through',
);
assert.ok(branch.includes('openTournamentById'), 'o branch deve abrir o torneio por id, não pela lista local');

// Fluxo B também usa o botão "Jogar Torneio" da tela de detalhe do dia.
assert.ok(
  /async function handlePlayTournament[\s\S]{0,400}openTournamentById/.test(page),
  'handlePlayTournament deve abrir o torneio por id (antes falhava em silêncio quando não estava na lista)',
);
// A busca por id não pode depender do limite da consulta de lista.
assert.ok(
  /async function openTournamentById[\s\S]{0,500}Tournament\.get\(/.test(page),
  'openTournamentById deve buscar o torneio por id quando ele não está na lista local',
);

// ── 4. Os limites de consulta não podem esconder o torneio do dia ──
for (const [file, label] of [['src/pages/CalendarPage.jsx', 'calendário'], ['src/pages/Tournaments.jsx', 'torneios']]) {
  const source = read(file);
  const limits = [...source.matchAll(/Tournament\.list\('-start_date',\s*(\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(limits.length > 0, `${file} deve consultar torneios`);
  for (const limit of limits) {
    assert.ok(limit >= 1000, `${label}: limite ${limit} é menor que o histórico de uma carreira (162 eventos/ano, ordenação DESCENDENTE) — esconde os torneios mais antigos, incluindo o do dia no início da carreira`);
  }
}

console.log('tournament-confirm-no-skip: invariante central + fluxos A/B + limites de consulta — OK');
