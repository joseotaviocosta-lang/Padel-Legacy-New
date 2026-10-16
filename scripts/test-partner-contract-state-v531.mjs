// Fase 5.31 — status do contrato da dupla em linguagem de jogo, a partir do
// estado que o LIFECYCLE grava (nada recalculado): ativo, perto de vencer,
// renovação necessária, renovação recusada, encerra ao fim, encerra após
// compromissos. Data + dias numa linha só.
import { PROFILE, gateRunner, partnershipFixture, read, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-partner-contract-state-v531');

await withUi({ screen: '/src/lib/partnerScreen.js', lifecycle: '/src/game-core/partnerLifecycle.js' }, async ({ screen, lifecycle }) => {
  const at = (extra) => { const p = partnershipFixture(extra); return screen.buildPartnerContractStatus({ partnership: p, careerDate: PROFILE.career_date, decisionState: lifecycle.getContractDecisionState(p) }); };
  const active = at({});
  gate('1. ativo: "Contrato ativo" + "33 dias restantes · até 03/03/2026"', active.key === 'active' && active.label === 'Contrato ativo' && active.line === '33 dias restantes · até 03/03/2026', active.line);
  gate('2. perto de vencer = renovacao_proxima do lifecycle', at({ contract_status: 'renovacao_proxima' }).key === 'expiring');
  gate('3. vencido = "Renovação necessária" (tom de perigo)', at({ contract_status: 'vencido', renewal_available: true }).key === 'renewal_needed' && at({ contract_status: 'vencido' }).tone === 'danger');
  gate('4. nao_renovara = "Parceiro não vai renovar"', at({ contract_status: 'nao_renovara' }).label === 'Parceiro não vai renovar');
  gate('5. encerrar_ao_final = "Encerra no fim do contrato"', at({ contract_status: 'encerrar_ao_final' }).key === 'ending_at_expiry');
  gate('6. renovado = "Contrato renovado"', at({ contract_status: 'renovado' }).key === 'renewed');
  gate('7. sem parceria = "Sem parceiro"', screen.buildPartnerContractStatus({ partnership: null }).key === 'none');
  gate('8. último dia e vencido em texto humano', screen.remainingLabel(0) === 'último dia' && screen.remainingLabel(-3) === 'venceu há 3 dias' && screen.remainingLabel(1) === '1 dia restante');
  gate('9. a apresentação não muda o estado de decisão do lifecycle', lifecycle.getContractDecisionState(partnershipFixture({ contract_status: 'renovacao_proxima' })) === 'UNDECIDED');
  gate('10. ação: renovar quando perto/vencido; buscar próximo parceiro quando encerra; nada quando ativo', screen.selectPartnerPrimaryAction({ contract: at({ contract_status: 'vencido' }) }).target.tab === 'contract' && screen.selectPartnerPrimaryAction({ contract: at({ contract_status: 'encerrar_ao_final' }) }).target.filter === 'search' && screen.selectPartnerPrimaryAction({ contract: active }) === null);
});

const hub = read('src/pages/PartnerHub.jsx');
const panel = hub.slice(hub.indexOf('function ContractPanel'), hub.indexOf('function PartnerHistory'));
gate('11. Contrato: um resumo com selo + linha única de prazo', panel.includes('data-contract-line') && panel.includes('<StatusBadge tone={summary.tone}'));
gate('12. Contrato: no máximo 1 alerta (PartnerAlert único)', (panel.match(/<PartnerAlert /g) || []).length === 1);
gate('13. Contrato: "Confirmar novo contrato" é o único primário do painel', (panel.match(/level="primary"/g) || []).length === 1 && panel.includes('Confirmar novo contrato'));
gate('14. Contrato: encerramento recolhido, rescisão com confirmação', panel.includes('title="Encerrar parceria"') && panel.includes('Confirmar rescisão') && panel.includes('setConfirmRelease(true)'));
gate('15. regras do contrato intocadas (mesmas chamadas)', panel.includes('onRenew({durationDays, prizeSplit})') && panel.includes('onClick={onScheduleSeparation}') && panel.includes('onClick={onRelease}') && panel.includes('calculatePartnerRenewalInterest('));
gate('16. sem "Salário mensal" (parceria não tem salário)', !/Salário mensal/.test(hub));
finish();
