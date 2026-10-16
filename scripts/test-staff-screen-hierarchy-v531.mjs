// Fase 5.31 — Comissão técnica: quem trabalha comigo, função, impacto, custo
// e vaga livre — antes da reunião semanal (que dominava a primeira dobra).
import { gateRunner, measurements, pick, primaryCount, read, textOf, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-staff-screen-hierarchy-v531');

await withUi({ panel: '/src/components/economy/StaffPanel.jsx', catalog: '/src/lib/staffCatalog.js' }, async ({ panel, catalog, render }) => {
  const profile = { id: 'player-1', career_date: '2026-03-01', career_level: 5, coins: 5000, coach_id: 'coach-1', coach_name: 'Joaquim Pereira', coach_monthly_salary: 1800, coach_contract_status: 'active', coach_contract_end_date: '2027-03-01', coach_trust: 60 };
  const candidate = catalog.getStaffMarketForMonth(profile.career_date, profile)[0];
  const member = { id: 'hire-1', staff_id: candidate.id, staff_type: candidate.roleId, staff_name: candidate.name, monthly_cost: candidate.monthlyCost, contract_end_date: '2026-03-20', contract_status: 'active' };
  const slots = catalog.getStaffSlots(profile.career_level);
  const html = render(panel.default, { profile, staff: [member], onHire() {}, onFire() {}, onRenew() {}, busy: null });
  const text = textOf(html);
  gate('1. treinador principal aparece como posição líder (nome + "Líder da comissão" + custo)', html.includes('data-staff-position="coach"') && /Joaquim Pereira/.test(text) && /Líder da comissão · 1\.800\/mês/.test(text));
  gate('2. profissional: nome, função · especialidade · nível, custo/mês e prazo do contrato', text.includes(candidate.name) && /Nv\. 1/.test(text) && /\/mês/.test(text) && /19 dias restantes/.test(text), text.slice(0, 500));
  gate('3. contrato perto do fim destacado (≤30 dias)', /font-bold text-amber-300[^>]*>19 dias restantes/.test(html));
  gate('4. impacto principal visível (1 efeito) no card', (html.split('data-staff-position="member"')[1] || '').includes('rounded-full border border-primary/20'));
  gate(`5. vagas livres aparecem como posições (${slots - 1})`, (html.match(/data-staff-position="free"/g) || []).length === Math.min(3, slots - 1));
  gate('6. nenhum CTA primário na equipe (renovar/demitir são secundários)', primaryCount(html) === 0);
  gate('7. demissão continua em dois toques', read('src/components/economy/StaffPanel.jsx').includes("confirmFireId === member.id") && /Confirmar demissão/.test(read('src/components/economy/StaffPanel.jsx')));
  const noCoach = render(panel.default, { profile: { ...profile, coach_id: null, coach_contract_status: 'terminated' }, staff: [], onHire() {}, onFire() {}, onRenew() {}, busy: null });
  gate('8. Estado A (sem treinador): vaga do treinador sinalizada, com caminho para escolher', noCoach.includes('data-staff-position="coach-empty"') && /Escolher treinador principal/.test(textOf(noCoach)));
});

const page = read('src/pages/Staff.jsx');
gate('9. reunião da comissão sob demanda, DEPOIS da equipe', page.includes('title="Reunião da comissão"') && page.indexOf('<StaffPanel') < page.indexOf('<StaffLivePanel meeting={meeting} />'));
gate('10. HUD com vagas/folha/sinergia/liderança mantido (respostas "quanto custa" e "há vaga")', page.includes("label: 'vagas'") && page.includes("label: 'folha'"));
gate('11. vagas continuam vindo de getStaffSlots', page.includes('getStaffSlots') && read('src/components/economy/StaffPanel.jsx').includes('const occupiedSlots = activeStaff.length'));
gate('12. deep link de relatório preservado (scrollIntoView + StaffReportHighlight)', page.includes('scrollIntoView') && page.includes('<StaffReportHighlight'));

const before = measurements('before'); const after = measurements('after');
if (before && after) {
  for (const vp of ['360', '390']) {
    const b = pick(before, { screen: 'staff', viewport: vp, state: 'com-parceiro' });
    const a = pick(after, { screen: 'staff', viewport: vp, state: 'com-parceiro' });
    if (b && a) gate(`13. app real ${vp}: Comissão mais curta (${b.pageHeight} → ${a.pageHeight}px) e primeira ação mais alta (${b.firstActionY} → ${a.firstActionY})`, a.pageHeight < b.pageHeight * 0.75 && a.firstActionY < b.firstActionY);
  }
}
finish();
