// Fase 5.31 — mercado de staff e de técnicos: cards compactos, UMA ação por
// candidato, paginação, indisponível sinalizado, sem vaga sinalizado.
import { PROFILE, gateRunner, measurements, pick, primaryCount, read, textOf, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-staff-market-cards-v531');

await withUi({ panel: '/src/components/economy/StaffPanel.jsx', catalog: '/src/lib/staffCatalog.js', card: '/src/components/coaches/CoachCard.jsx', coaches: '/src/lib/coaches.js' }, async ({ panel, catalog, card, coaches, render }) => {
  const profile = { id: 'player-1', career_date: '2026-03-01', career_level: 5, coins: 5000 };
  const market = catalog.getStaffMarketForMonth(profile.career_date, profile);
  const html = render(panel.default, { profile, staff: [], onHire() {}, onFire() {}, onRenew() {}, busy: null, initialView: 'market' });
  const cards = html.split('data-staff-candidate').slice(1).map((c) => c.slice(0, c.indexOf('</article>')));
  gate(`1. mercado pagina em 6 (de ${market.length})`, cards.length === Math.min(6, market.length));
  if (market.length > 6) gate('2. "Mostrar mais (N restantes)"', textOf(html).includes(`Mostrar mais (${market.length - 6} restantes)`));
  gate('3. uma ação por candidato', cards.every((c) => (c.match(/<button/g) || []).length === 1));
  gate('4. card: função · especialidade, nível (tier), custo/mês e efeito principal', /\/mês/.test(textOf(cards[0] || '')) && /qualidade/.test(textOf(cards[0] || '')) && (cards[0] || '').includes('rounded-full border border-primary/20'));
  gate('5. nenhum primário na lista', primaryCount(html) === 0);
  // Estado D — indisponível: procura um mês em que algum candidato esteja fora do mercado.
  let unavailable = null; let month = null;
  for (let m = 1; m <= 12 && !unavailable; m += 1) {
    const date = `2026-${String(m).padStart(2, '0')}-01`;
    const found = catalog.getStaffMarketForMonth(date, profile).find((c) => !c.available);
    if (found) { unavailable = found; month = date; }
  }
  if (unavailable) {
    const htmlD = render(panel.default, { profile: { ...profile, career_date: month }, staff: [], onHire() {}, onFire() {}, onRenew() {}, busy: null, initialView: 'market' });
    const target = htmlD.split('data-staff-candidate').slice(1).find((c) => c.includes(unavailable.name));
    if (target) gate('6. Estado D: indisponível sinalizado com motivo e botão desabilitado', target.includes(unavailable.unavailableReason) && /disabled=""[^>]*>Indisponível/.test(target));
    else gate('6. Estado D: indisponível sinalizado (fora da 1ª página, verificado no código)', read('src/components/economy/StaffPanel.jsx').includes('{candidate.unavailableReason}'));
  }
  const full = render(panel.default, { profile: { ...profile, career_level: 1 }, staff: market.slice(0, catalog.getStaffSlots(1)).map((c, i) => ({ id: `h${i}`, staff_id: c.id, staff_type: c.roleId, staff_name: c.name, contract_status: 'active' })), onHire() {}, onFire() {}, onRenew() {}, busy: null, initialView: 'market' });
  gate('7. sem vaga: contratação bloqueada com "Sem vagas disponíveis"', /Sem vagas disponíveis/.test(textOf(full)));

  // Técnicos: card compacto com uma ação.
  const evaluations = coaches.COACHES_DATA.slice(0, 60).map((coach) => coaches.evaluateCoachForCareer(coach, { ...PROFILE, career_level: 1, reputation: 0 }));
  const open = evaluations.find((e) => e.availability.available);
  const blocked = evaluations.find((e) => !e.availability.available);
  const htmlOpen = render(card.default, { evaluation: open, profile: PROFILE, onDetails() {}, onHire() {} });
  gate('8. técnico disponível: 1 ação ("Ver detalhes"), custo/mês, assinatura e afinidade', (htmlOpen.match(/<button/g) || []).length === 1 && /Ver detalhes/.test(textOf(htmlOpen)) && /moedas\/mês/.test(textOf(htmlOpen)) && /afinidade/.test(textOf(htmlOpen)));
  gate('9. técnico disponível: efeito principal em destaque', /<strong class="shrink-0 text-foreground">/.test(htmlOpen));
  if (blocked) {
    const htmlBlocked = render(card.default, { evaluation: blocked, profile: PROFILE, onDetails() {}, onHire() {} });
    gate('10. técnico bloqueado: 1 ação ("Ver requisitos") + motivo', (htmlBlocked.match(/<button/g) || []).length === 1 && /Ver requisitos/.test(textOf(htmlBlocked)) && /Ainda não disponível/.test(textOf(htmlBlocked)));
  }
});

const coachesPage = read('src/pages/Coaches.jsx');
gate('11. filtros existentes preservados, apresentados num só controle recolhível', coachesPage.includes('aria-label="Filtrar situação"') && coachesPage.includes('specialtyFilter') && coachesPage.includes('Custo-benefício') && coachesPage.includes('setFiltersOpen'));
gate('12. técnico atual separado do mercado e HUD duplicado removido', coachesPage.includes('Técnico atual') && coachesPage.includes('coach.id !== hiredCoach?.id') && !coachesPage.includes("label: 'afinidade'"));

const before = measurements('before'); const after = measurements('after');
if (before && after) {
  for (const [screen, state] of [['staff-market', 'com-parceiro'], ['coach', 'com-parceiro']]) {
    const b = pick(before, { screen, viewport: '390', state });
    const a = pick(after, { screen, viewport: '390', state });
    if (b && a) gate(`13. app real 390 ${screen}: ${b.pageHeight} → ${a.pageHeight}px, 0 primário na lista`, a.pageHeight < b.pageHeight * 0.75 && a.primaryCount === 0);
  }
}
finish();
