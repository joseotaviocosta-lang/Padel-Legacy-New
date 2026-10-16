// Fase 5.31 — Mercado de parceiros: cards enxutos (nome, OVR, lado,
// compatibilidade, termos, situação), detalhe sob demanda, o único primário
// só no modal, comparação sem tabela que estoura no celular.
import { PROFILE, gateRunner, measurements, pick, primaryCount, read, textOf, withUi } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-partner-market-cards-v531');

await withUi({ panel: '/src/components/partner/PartnerOffersPanel.jsx', career: '/src/lib/career.js' }, async ({ panel, career, render }) => {
  const bots = career.getAvailablePartners({ ...PROFILE, xp: 0 }).slice(0, 3);
  const offers = bots.map((bot, index) => ({ id: `offer-${index}`, status: 'pending', candidate_snapshot: bot, recommended: index === 0, contract: { durationDays: 30, prizeSplit: 58 } }));
  const html = render(panel.default, { profile: PROFILE, offers, loading: false, error: null, busyOfferId: null, focusOfferId: null, onRetry() {}, onAccept() {}, onReject() {}, onSearch() {} });
  const text = textOf(html);
  const cards = html.split('data-partner-candidate="offer"').slice(1);
  gate('1. um card por proposta pendente', cards.length === 3, `cards=${cards.length}`);
  gate('2. card mostra nome + OVR + lado + compatibilidade', bots.every((bot) => text.includes(bot.name)) && /OVR \d+/.test(text) && /(versátil|direita|esquerda)/.test(text));
  gate('3. card mostra termos (dias + parte do prêmio) e interesse', /30 dias · você 58%/.test(text) && /Interesse/.test(text));
  gate('4. proposta recomendada x proposta comum diferenciadas', /Recomendado/.test(text) && /Proposta/.test(text));
  gate('5. nenhum primário na lista (o "Aceitar" vive no modal)', primaryCount(html) === 0);
  gate('6. card não despeja métricas: sem formação/pontos fortes na lista', !/Formação sugerida/.test(text) && !/Pontos fortes/.test(text));
  gate('7. ≤ 2 ações por card (Comparar + Analisar)', cards.every((c) => (c.split('data-partner-candidate')[0].match(/<button/g) || []).length <= 2));
});

const src = read('src/components/partner/PartnerOffersPanel.jsx');
gate('8. detalhe sob demanda mantém formação sugerida, pontos fortes e termos', src.includes('Formação sugerida') && src.includes('Pontos fortes') && src.includes('Parceria temporária'));
gate('9. modal canônico com "Aceitar proposta" e deep link focusOfferId preservados', src.includes('<ModalShell') && src.includes('Aceitar proposta') && src.includes('focusOfferId'));
gate('10. comparação sem min-w de 520px (sem rolagem lateral)', !src.includes('min-w-[520px]') && src.includes('data-partner-comparison'));
gate('11. comparação com a dupla atual só com dados existentes (química/parte do prêmio)', src.includes('data-offer-vs-current') && src.includes('currentPartnership.chemistry') && src.includes('currentPartnership.prize_split_pct'));
const search = read('src/components/partner/PartnerSearch.jsx');
gate('12. busca: card não é mais <button> com <button> dentro', search.includes('<article key={bot.id}') && !search.includes('<button\n              key={bot.id}'));
gate('13. busca: estilo de jogo e detalhamento só ao abrir; "Convidar" é o primário do detalhe', /\{open && \([\s\S]*PlayStyleSummary[\s\S]*Convidar/.test(search));
gate('14. busca: mesmos filtros (lado + ordenação) em 2 seletores', search.includes('aria-label="Filtrar por lado preferido"') && search.includes('aria-label="Ordenar candidatos"'));
gate('15. busca usa o mesmo resolver canônico de OVR', search.includes('overallRating(bot)'));

const before = measurements('before'); const after = measurements('after');
if (before && after) {
  const b = pick(before, { screen: 'partner-market', viewport: '390', state: 'sem-parceiro' });
  const a = pick(after, { screen: 'partner-market', viewport: '390', state: 'sem-parceiro' });
  if (b && a) gate(`16. app real 390: mercado com 4 propostas mais curto (${b.pageHeight} → ${a.pageHeight}px) e 0 primário na lista`, a.pageHeight < b.pageHeight * 0.7 && a.primaryCount === 0);
  const m = pick(after, { screen: 'partner-offer-detail', viewport: '360', state: 'sem-parceiro' });
  if (m) gate('17. app real 360: modal da proposta com 1 primário e nada cortado', m.modalOpen && m.modalPrimaryCount === 1 && m.modalClippedCount === 0);
}
finish();
