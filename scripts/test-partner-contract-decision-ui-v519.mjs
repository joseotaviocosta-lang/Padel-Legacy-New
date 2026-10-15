// Playthrough 5.19, Partes E/F/G — A TELA DE DECISAO CONTRATUAL.
//
// A Parte E exige que o clique em "Contrato se aproximando do fim" leve a uma
// tela contextual com parceiro, data de termino, situacao, compromissos
// assumidos e opcoes reais (renovar / encerrar ao fim). A Parte F exige que os
// compromissos ja assumidos sejam explicados, refletindo a regra da 5.17.
//
// O ContractPanel ja existia com renovacao e encerramento; o que faltava era
// (a) nao ser interceptado pela conversa de pos-jogo e (b) mostrar os
// compromissos antes da decisao. Este teste cobre o CONTEUDO da tela.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

installShims('/contract-ui');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const roster = await vite.ssrLoadModule('/src/lib/committedRoster.js');
const { findCommittedTournaments, resolveScheduledSeparationDate, canRegisterNewTournamentWithPartnership } = roster;

const HUB = stripComments(readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8'));
const PANEL = HUB.slice(HUB.indexOf('function ContractPanel'));

console.log('\n=== Parte E: o que a tela de contrato mostra ===\n');
const FIELDS = [
  ['parceiro', /partnership\.partner_name/],
  ['data de termino', /contract_end_date|scheduled_end_date/],
  ['situacao do contrato', /contract_status|status/],
  ['entrosamento', /chemistry/],
  ['moral do parceiro', /partner_morale|morale/],
];
for (const [label, re] of FIELDS) {
  console.log(`  ${label.padEnd(24)}${re.test(PANEL) ? 'presente' : 'AUSENTE'}`);
}
console.log('');

check('Parte E: a tela mostra parceiro, termino e situacao', () => {
  for (const [label, re] of FIELDS) {
    assert.ok(re.test(PANEL), `campo ausente na tela: ${label}`);
  }
  note(`${FIELDS.length} campos contextuais presentes`);
});

check('Parte E: a tela oferece RENOVAR e ENCERRAR', () => {
  const hasRenew = /onRenew/.test(PANEL);
  const hasRelease = /onRelease/.test(PANEL);
  const hasSchedule = /onScheduleSeparation/.test(PANEL);
  note(`renovar=${hasRenew} | liberar=${hasRelease} | encerrar ao fim=${hasSchedule}`);
  assert.ok(hasRenew, 'sem opcao de renovar');
  assert.ok(hasRelease || hasSchedule, 'sem opcao de encerrar');
});

check('Parte E: a renovacao permite escolher termos reais', () => {
  const hasDuration = /durationDays/.test(PANEL);
  const hasSplit = /prizeSplit/.test(PANEL);
  note(`duracao=${hasDuration} | divisao de premiacao=${hasSplit}`);
  assert.ok(hasDuration && hasSplit, 'a renovacao nao expoe termos');
});

console.log('=== Parte F: compromissos assumidos ===\n');

check('Parte F (gate): a tela lista os compromissos antes da decisao', () => {
  const hasBlock = /commitments\.length/.test(PANEL);
  const listsNames = /commitments\.map/.test(PANEL);
  note(`bloco de compromissos=${hasBlock} | lista os torneios=${listsNames}`);
  assert.ok(hasBlock && listsNames, 'a tela nao mostra compromissos assumidos');
});

check('Parte F: a tela explica a consequencia do encerramento', () => {
  const explains = /parceria esportiva/i.test(PANEL);
  const showsDate = /separationDate/.test(PANEL);
  note(`explica continuidade=${explains} | mostra data real de separacao=${showsDate}`);
  assert.ok(explains, 'a consequencia do encerramento nao e explicada');
});

check('Parte F: os compromissos vem da autoridade do motor', () => {
  const usesAuthority = /findCommittedTournaments/.test(HUB);
  const usesSeparation = /resolveScheduledSeparationDate/.test(HUB);
  note(`findCommittedTournaments=${usesAuthority} | resolveScheduledSeparationDate=${usesSeparation}`);
  assert.ok(usesAuthority, 'a tela usa uma segunda leitura de inscricoes');
});

console.log('\n=== Parte F: a regra da 5.17 continua valendo ===\n');

const REGS = [
  { id: 'r1', tournament_id: 'casablanca', partner_id: 'pedro', status: 'confirmed' },
  { id: 'r2', tournament_id: 'passado', partner_id: 'pedro', status: 'completed' },
];
const TS = [
  { id: 'casablanca', name: 'Casablanca Challenge', start_date: '2026-04-13', end_date: '2026-04-16' },
  { id: 'passado', name: 'Evento Antigo', start_date: '2026-02-01', end_date: '2026-02-04' },
];

check('Parte F: compromisso pendente conta, concluido nao', () => {
  const list = findCommittedTournaments({ registrations: REGS, tournaments: TS, careerDate: '2026-04-01', partnerId: 'pedro' });
  note(`compromissos: ${list.map((c) => c.name).join(', ') || '(nenhum)'}`);
  assert.equal(list.length, 1);
  assert.equal(list[0].tournamentId, 'casablanca');
});

check('Parte F: a separacao e adiada ate o ultimo compromisso', () => {
  const list = findCommittedTournaments({ registrations: REGS, tournaments: TS, careerDate: '2026-04-01', partnerId: 'pedro' });
  const scheduled = resolveScheduledSeparationDate('2026-04-10', list);
  note(`termino nominal 2026-04-10 -> real ${scheduled.date} (estendido=${scheduled.extended})`);
  assert.ok(scheduled.extended, 'a separacao nao foi adiada apesar do compromisso');
  assert.ok(scheduled.date >= '2026-04-16', 'a separacao ocorre antes do fim do compromisso');
});

check('Parte F: sem compromisso, nada e adiado', () => {
  const scheduled = resolveScheduledSeparationDate('2026-04-10', []);
  note(`sem compromisso -> ${scheduled.date} (estendido=${scheduled.extended})`);
  assert.equal(scheduled.extended, false);
  assert.equal(scheduled.date, '2026-04-10');
});

check('Parte F: encerramento agendado limita inscricao ao periodo do contrato', () => {
  // A 1ª versao desta assercao esperava `false` para uma parceria com
  // encerramento agendado, em qualquer data. Estava errada: a regra real
  // (committedRoster.js:156-163) permite inscrever ENQUANTO a data de carreira
  // for anterior ao termino nominal — o que e coerente, porque um torneio que
  // acontece antes do fim do contrato pode ser disputado pela dupla atual. O
  // bloqueio comeca no termino.
  const ending = { contract_status: 'encerrar_ao_final', contract_end_date: '2026-04-10' };
  const active = { contract_status: 'ativo', contract_end_date: '2026-12-01' };
  const antes = canRegisterNewTournamentWithPartnership(ending, '2026-04-01');
  const noDia = canRegisterNewTournamentWithPartnership(ending, '2026-04-10');
  const depois = canRegisterNewTournamentWithPartnership(ending, '2026-04-20');
  note(`encerrando: antes=${antes} | no termino=${noDia} | depois=${depois}`);
  note(`parceria ativa: ${canRegisterNewTournamentWithPartnership(active, '2026-04-01')}`);
  assert.equal(antes, true, 'bloqueou inscricao valida antes do termino');
  assert.equal(noDia, false, 'permitiu inscricao a partir do termino');
  assert.equal(depois, false, 'permitiu inscricao depois do termino');
  assert.equal(canRegisterNewTournamentWithPartnership(active, '2026-04-01'), true);
  assert.equal(canRegisterNewTournamentWithPartnership(null, '2026-04-01'), false);
});

console.log('\n=== Parte G: a conversa segue disponivel ===\n');
check('Parte G: conversar com o parceiro continua acionavel pelo jogador', () => {
  const hasTrigger = /onConverse=\{\(\) => setShowConverse\(true\)\}/.test(HUB);
  const hasSurface = /showConverse && activePartnership/.test(HUB);
  note(`acionador do jogador=${hasTrigger} | superficie=${hasSurface}`);
  assert.ok(hasTrigger && hasSurface, 'a conversa com o parceiro foi perdida');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
