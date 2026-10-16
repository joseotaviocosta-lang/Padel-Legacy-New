// Hotfix 5.31-B — selos quebram para outra linha antes de o nome truncar:
// nenhum selo removido, nenhum selo sobre o OVR, nenhum selo cortado, card
// só um pouco mais alto. Mesmo princípio no card de proposta de parceiro.
import { PROFILE } from './lib/v531UiKit.mjs';
import { audit, gateRunner, read, repro, textOf, withUi } from './lib/v531bKit.mjs';

const { gate, finish } = gateRunner('test-coach-card-badges-wrap-v531b');
const src = read('src/components/coaches/CoachCard.jsx');

await withUi({ card: '/src/components/coaches/CoachCard.jsx', coaches: '/src/lib/coaches.js' }, async ({ card, coaches, render }) => {
  const caio = coaches.COACHES_DATA.find((c) => c.name === 'Caio Silva');
  const base = coaches.evaluateCoachForCareer(caio, { ...PROFILE, career_level: 1 });
  const both = render(card.default, { evaluation: { ...base, recommended: true, bestValue: true }, profile: PROFILE, onDetails() {}, onHire() {} });
  const badges = both.slice(both.indexOf('data-coach-badges'), both.indexOf('</div>', both.indexOf('data-coach-badges')));
  gate('1. os dois selos continuam (nenhum removido): Recomendado + Melhor custo-benefício', /Recomendado/.test(textOf(badges)) && /Melhor custo-benefício/.test(textOf(badges)));
  gate('2. selos em grupo que quebra linha (flex-wrap)', both.includes('flex flex-wrap gap-1" data-coach-badges'));
  gate('3. prioridade: "Recomendado" vem antes de "Melhor custo-benefício"', textOf(badges).indexOf('Recomendado') < textOf(badges).indexOf('Melhor custo-benefício'));
  const none = render(card.default, { evaluation: { ...base, recommended: false, bestValue: false }, profile: PROFILE, onDetails() {}, onHire() {} });
  gate('4. sem selo: nenhuma linha vazia reservada', !none.includes('data-coach-badges'));
  const one = render(card.default, { evaluation: { ...base, recommended: false, bestValue: true }, profile: PROFILE, onDetails() {}, onHire() {} });
  gate('5. um selo só (custo-benefício) também aparece', /Melhor custo-benefício/.test(textOf(one)) && !/Recomendado/.test(textOf(one).replace('Recomendados', '')));
});
gate('6. selo não encolhe nem quebra o próprio texto (shrink-0, rounded-full)', /shrink-0 rounded-full border px-1\.5/.test(src));

const r = repro();
if (r) {
  for (const vw of ['360', '390']) {
    const a = r[vw]['caio-2-badges'].after; const none = r[vw]['sem-badge'].after;
    gate(`7. ${vw}px: selos não sobrepõem o OVR nem ficam cortados`, !a.badgeOverlapsOvr && !a.badgeClipped && !a.cardOverflow);
    gate(`8. ${vw}px: card só um pouco mais alto com 2 selos (+${a.cardHeight - none.cardHeight}px ≤ 60)`, a.cardHeight - none.cardHeight <= 60);
  }
}
const after = audit('after');
if (after) {
  const cards = after.results.flatMap((x) => x.coachCards || []);
  gate('9. app real: nenhum selo sobre o nome ou o OVR, nenhum selo cortado', cards.every((c) => !c.badgeOverlapsOvr && !c.badgeOverlapsName && !c.badgeClipped));
}
const offers = read('src/components/partner/PartnerOffersPanel.jsx');
gate('10. card de proposta de parceiro: o selo quebra para baixo antes de o nome truncar', offers.includes('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5') && /<h3 className="min-w-0 break-words[^"]*" data-candidate-name>/.test(offers));
finish();
