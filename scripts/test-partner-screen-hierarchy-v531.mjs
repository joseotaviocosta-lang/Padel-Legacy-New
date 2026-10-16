// Fase 5.31 — Minha Dupla: RELATIONSHIP FIRST, DECISION SECOND, DETAILS ON
// DEMAND. O cartão da dupla responde quem/força/química/contrato/situação;
// no máximo 1 CTA primário; detalhes recolhidos; HUD duplicado removido.
import { PROFILE, gateRunner, measurements, partnershipFixture, pick, primaryCount, read, textOf, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-partner-screen-hierarchy-v531');

await withUi({ overview: '/src/components/partner/PartnerOverview.jsx', screen: '/src/lib/partnerScreen.js' }, async ({ overview, screen, render }) => {
  const Overview = overview.default;
  const partnership = partnershipFixture();
  const contract = screen.buildPartnerContractStatus({ partnership, careerDate: PROFILE.career_date, decisionState: 'UNDECIDED' });
  const html = render(Overview, { partnership, profile: PROFILE, contract, alert: null, primaryAction: screen.selectPartnerPrimaryAction({ contract }) });
  const text = textOf(html);
  gate('1. Estado B: cartão da dupla existe e vem antes das ações', html.indexOf('data-partner-hero="active"') > -1 && html.indexOf('data-partner-hero') < html.indexOf('Conversar'));
  gate('2. quem é o parceiro + OVR + lado', /Tomás Acosta/.test(text) && /OVR \d+/.test(text) && /Lado versátil/.test(text));
  gate('3. química (entrosamento) e ranking da dupla no cartão', /71 Entrosamento/.test(text) && /Ranking dupla/.test(text));
  gate('4. contrato curto: dias + "até DD/MM/AAAA"', /33d Contrato até 03\/03\/2026/.test(text), text.slice(0, 300));
  gate('5. situação do contrato como selo', /Contrato ativo/.test(text));
  gate('6. contrato ativo e sem decisão: ZERO primário (rotina fica secundária)', primaryCount(html) === 0);
  gate('7. ações de rotina secundárias: Conversar / Negociar / Encerrar', /Conversar/.test(text) && /Negociar/.test(text) && /Encerrar/.test(text));
  gate('8. detalhes sob demanda: compatibilidade/identidade recolhidas', /Mais sobre a dupla/.test(text) && !/Compatibilidade inicial/.test(text) && !/Identidade:/.test(text));
  const src = read('src/components/partner/PartnerOverview.jsx');
  gate('9. "Encerrar" exige confirmação (nunca encerra no primeiro toque)', src.includes('setConfirmEnd(true)') && src.includes('onEnd?.()'));

  const expiringPartnership = partnershipFixture({ contract_status: 'renovacao_proxima', contract_end_date: '2026-01-31' });
  const expiring = screen.buildPartnerContractStatus({ partnership: expiringPartnership, careerDate: PROFILE.career_date, decisionState: 'UNDECIDED' });
  const htmlC = render(Overview, { partnership: expiringPartnership, profile: PROFILE, contract: expiring, alert: screen.selectPartnerAlert({ contract: expiring, partnerName: 'Tomás Acosta' }), primaryAction: screen.selectPartnerPrimaryAction({ contract: expiring }) });
  gate('10. perto de vencer: exatamente 1 primário ("Renovar parceria")', primaryCount(htmlC) === 1 && /Renovar parceria/i.test(textOf(htmlC)));
  gate('11. perto de vencer: exatamente 1 alerta', (htmlC.match(/data-partner-alert=/g) || []).length === 1);

  const none = screen.buildPartnerContractStatus({ partnership: null });
  const htmlA = render(Overview, { partnership: null, profile: PROFILE, contract: none, primaryAction: screen.selectPartnerPrimaryAction({ contract: none, pendingOffers: 4 }) });
  gate('12. Estado A (sem parceiro): cartão próprio + 1 primário "Analisar propostas (4)"', htmlA.includes('data-partner-hero="none"') && primaryCount(htmlA) === 1 && /Analisar propostas \(4\)/i.test(textOf(htmlA)));
  const htmlA0 = render(Overview, { partnership: null, profile: PROFILE, contract: none, primaryAction: screen.selectPartnerPrimaryAction({ contract: none, pendingOffers: 0 }) });
  gate('13. sem parceiro e sem propostas: primário "Buscar parceiro"', /Buscar parceiro/i.test(textOf(htmlA0)) && primaryCount(htmlA0) === 1);
});

const hub = read('src/pages/PartnerHub.jsx');
gate('14. HUD do topo (entrosamento/confiança/ofertas repetidos) removido', !hub.includes('hudLabel="Estado da dupla"') && !hub.includes("label: 'entrosamento'"));
gate('15. conselhos dos assessores sob demanda (CollapsibleSection) e ainda na Visão geral', hub.includes('title="Conselhos dos assessores"') && hub.includes('<AdvisorPanel tips={tips} />'));
gate('16. instabilidade virou o alerta único (sem banner próprio)', !hub.includes('{/* Instability banner */}') && hub.includes('selectPartnerAlert('));

const before = measurements('before'); const after = measurements('after');
if (before && after) {
  for (const vp of ['360', '390']) {
    const b = pick(before, { screen: 'partner-overview', viewport: vp, state: 'com-parceiro' });
    const a = pick(after, { screen: 'partner-overview', viewport: vp, state: 'com-parceiro' });
    if (b && a) gate(`17. app real ${vp}: Dupla mais curta (${b.pageHeight} → ${a.pageHeight}px) e ≤1 primário`, a.pageHeight < b.pageHeight * 0.7 && a.primaryCount <= 1);
  }
}
finish();
