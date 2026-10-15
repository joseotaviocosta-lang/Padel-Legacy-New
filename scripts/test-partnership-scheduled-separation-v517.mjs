// Playthrough 5.17, Parte C — SEPARAÇÃO AGENDADA.
//
// Regra: se a dupla já confirmou participação num torneio antes da decisão
// de separação, a parceria competitiva não pode desaparecer no meio desse
// compromisso. A separação passa para depois do ÚLTIMO evento já assumido —
// e nem um dia além. A extensão honra o que foi assinado junto; não é
// renovação, e não reabre o mercado.
//
// Casos mínimos exigidos pela Parte C, todos aqui.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/partners');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const {
  findCommittedTournaments, resolveScheduledSeparationDate,
  canRegisterNewTournamentWithPartnership, resolveCommittedPartnerId,
} = await vite.ssrLoadModule('/src/lib/committedRoster.js');

const NOMINAL_END = '2026-03-03';
const PARTNER = 'pedro';

const tournaments = [
  { id: 'casablanca', name: 'Casablanca Challenge', start_date: '2026-03-05', end_date: '2026-03-08' },
  { id: 'lisboa', name: 'Lisboa Open', start_date: '2026-03-18', end_date: '2026-03-22' },
  { id: 'passado', name: 'Evento Antigo', start_date: '2026-01-05', end_date: '2026-01-09' },
];
const reg = (tournamentId, status = 'confirmed', partnerId = PARTNER) => ({
  id: `r-${tournamentId}`, tournament_id: tournamentId, profile_id: 'p1', partner_id: partnerId, status,
});

await check('Parte C: SEM compromisso futuro, termina na data original', () => {
  const pending = findCommittedTournaments({
    registrations: [reg('passado')], tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 0, 'um evento já encerrado virou compromisso pendente');
  const schedule = resolveScheduledSeparationDate(NOMINAL_END, pending);
  assert.equal(schedule.date, NOMINAL_END);
  assert.equal(schedule.extended, false);
});

await check('Parte C: 1 compromisso → termina DEPOIS dele', () => {
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca')], tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 1);
  const schedule = resolveScheduledSeparationDate(NOMINAL_END, pending);
  console.log(`   [registro] nominal ${NOMINAL_END} -> agendada ${schedule.date} (após ${schedule.until.name})`);
  assert.equal(schedule.date, '2026-03-08');
  assert.equal(schedule.extended, true);
  assert.equal(schedule.until.name, 'Casablanca Challenge');
});

await check('Parte C: 2 compromissos → termina após o ÚLTIMO', () => {
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca'), reg('lisboa')], tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 2);
  const schedule = resolveScheduledSeparationDate(NOMINAL_END, pending);
  console.log(`   [registro] dois compromissos -> ${schedule.date} (${schedule.until.name})`);
  assert.equal(schedule.date, '2026-03-22');
  assert.equal(schedule.until.tournamentId, 'lisboa');
});

await check('Parte C: eliminado cedo / evento concluído → não estende mais', () => {
  // Depois que o compromisso termina (status completed), ele deixa de
  // segurar a parceria — é o caso "jogador eliminado cedo".
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca', 'completed')], tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 0, 'compromisso concluído ainda segurava a parceria');
  assert.equal(resolveScheduledSeparationDate(NOMINAL_END, pending).extended, false);
});

await check('Parte C: inscrição cancelada não segura a parceria', () => {
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca', 'cancelled')], tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 0);
});

await check('Parte C: compromisso de OUTRO parceiro não conta', () => {
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca', 'confirmed', 'outro-parceiro')],
    tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  });
  assert.equal(pending.length, 0, 'compromisso de outra dupla estendeu esta parceria');
});

await check('Parte C: idempotência — recalcular dá o mesmo resultado', () => {
  const rows = [reg('casablanca'), reg('lisboa')];
  const a = resolveScheduledSeparationDate(NOMINAL_END, findCommittedTournaments({
    registrations: rows, tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  }));
  const b = resolveScheduledSeparationDate(NOMINAL_END, findCommittedTournaments({
    registrations: rows, tournaments, careerDate: NOMINAL_END, partnerId: PARTNER,
  }));
  assert.deepEqual(a.date, b.date);
  assert.deepEqual(a.until.tournamentId, b.until.tournamentId);
});

await check('Parte C: reload entre decisão e término preserva o alvo', () => {
  // "Reload" = recomputar a partir SÓ do estado persistido (registros +
  // torneios), sem nenhum estado de sessão. Se o alvo mudasse aqui, a
  // separação agendada não sobreviveria a fechar o jogo.
  const persisted = [reg('casablanca'), reg('lisboa')];
  const afterReload = resolveScheduledSeparationDate(NOMINAL_END, findCommittedTournaments({
    registrations: JSON.parse(JSON.stringify(persisted)),
    tournaments: JSON.parse(JSON.stringify(tournaments)),
    careerDate: NOMINAL_END, partnerId: PARTNER,
  }));
  assert.equal(afterReload.date, '2026-03-22');
  assert.equal(afterReload.until.tournamentId, 'lisboa');
});

await check('Parte C: a extensão NÃO prolonga o contrato indefinidamente', () => {
  // Depois do último compromisso, nada mais estende.
  const pending = findCommittedTournaments({
    registrations: [reg('casablanca'), reg('lisboa')],
    tournaments, careerDate: '2026-03-25', partnerId: PARTNER,
  });
  assert.equal(pending.length, 0, 'compromissos já terminados seguiam estendendo');
});

await check('Parte C: nenhuma inscrição NOVA depois da data nominal', () => {
  const p = { contract_status: 'encerrar_ao_final', contract_end_date: NOMINAL_END };
  assert.equal(canRegisterNewTournamentWithPartnership(p, '2026-03-01'), true);
  assert.equal(canRegisterNewTournamentWithPartnership(p, '2026-03-06'), false,
    'a extensão competitiva virou renovação silenciosa');
});

await check('Parte C: parceria sem decisão de encerrar segue podendo assinar', () => {
  const p = { contract_status: 'ativa', contract_end_date: NOMINAL_END };
  assert.equal(canRegisterNewTournamentWithPartnership(p, '2026-03-06'), true);
});

await check('Parte B: o roster do compromisso continua resolvendo o parceiro', () => {
  const id = resolveCommittedPartnerId('casablanca', { registrations: [reg('casablanca')] });
  assert.equal(id, PARTNER);
});

await vite.close();
finish('test-partnership-scheduled-separation-v517');
