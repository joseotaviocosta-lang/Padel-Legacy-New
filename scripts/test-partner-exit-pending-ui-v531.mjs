// Fase 5.31 — Estado D: separação pendente / compromisso restante. Precisa
// estar VISÍVEL e correto: selo "Encerra após compromissos", prazo efetivo
// (data da separação, não a do contrato), compromissos listados e a
// renovação bloqueada — tudo vindo de findCommittedTournaments/
// resolveScheduledSeparationDate (as mesmas autoridades do motor).
import { PROFILE, gateRunner, partnershipFixture, read, textOf, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-partner-exit-pending-ui-v531');

await withUi({ screen: '/src/lib/partnerScreen.js', lifecycle: '/src/game-core/partnerLifecycle.js', overview: '/src/components/partner/PartnerOverview.jsx' }, async ({ screen, lifecycle, overview, render }) => {
  const partnership = partnershipFixture({ contract_status: 'encerra_apos_compromisso', contract_end_date: '2026-01-31' });
  const decisionState = lifecycle.getContractDecisionState(partnership);
  gate('1. lifecycle classifica como ENDING_AFTER_COMMITMENTS', decisionState === lifecycle.CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS);
  const commitments = [{ tournamentId: 't-lon', name: 'Londres Challenge', startDate: '2026-01-29' }];
  const contract = screen.buildPartnerContractStatus({ partnership, careerDate: PROFILE.career_date, decisionState, commitments, separationDate: '2026-02-01' });
  gate('2. selo "Encerra após compromissos"', contract.key === 'ending_after_commitments' && contract.label === 'Encerra após compromissos');
  gate('3. prazo efetivo = data da separação (01/02/2026), não o fim do contrato', contract.until === '01/02/2026' && contract.line === '3 dias restantes · até 01/02/2026', contract.line);
  const alert = screen.selectPartnerAlert({ contract, partnerName: 'Tomás Acosta', commitments });
  gate('4. alerta único "Separação após compromissos" com os compromissos', alert?.id === 'separation-pending' && alert.commitments.length === 1 && /Tomás Acosta/.test(alert.text));
  gate('5. separação pendente vence instabilidade/conflito na escolha do alerta', screen.selectPartnerAlert({ contract, switchCount: 5, instability: { label: 'Instável', desc: 'x' }, conflicts: [{ title: 'c' }] }).id === 'separation-pending');
  gate('6. ação principal: buscar o próximo parceiro (não "renovar")', screen.selectPartnerPrimaryAction({ contract }).target.filter === 'search');
  const html = render(overview.default, { partnership, profile: PROFILE, contract, alert, primaryAction: screen.selectPartnerPrimaryAction({ contract }) });
  const text = textOf(html);
  gate('7. Visão geral mostra o selo e o alerta (estado nunca escondido)', /Encerra após compromissos/.test(text) && /Separação após compromissos/.test(text) && html.includes('data-partner-alert="separation-pending"'));
  gate('8. Visão geral mostra o prazo efetivo (3d · até 01/02/2026)', /3d Contrato até 01\/02\/2026/.test(text), text.slice(0, 400));
});

const hub = read('src/pages/PartnerHub.jsx');
gate('9. Contrato: renovação bloqueada quando a saída já foi decidida (regra preservada)', hub.includes('decisionState === CONTRACT_DECISION_STATES.ENDING_AFTER_COMMITMENTS') && hub.includes("'Contrato em encerramento'"));
gate('10. Contrato: lista de compromissos + "parceria esportiva" + data de separação', /commitments\.map/.test(hub) && /parceria esportiva/.test(hub) && /separationDate \?/.test(hub));
gate('11. Hub continua lendo as autoridades do motor', hub.includes('findCommittedTournaments(') && hub.includes('resolveScheduledSeparationDate('));
finish();
