// Fase 5.31 — CTAs de contratação/aceite/renovação: rótulo curto, preço na
// linha secundária, dentro das margens. Nunca estourar (hard rule).
import { gateRunner, measurements, read } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-contract-cta-overflow-v531');
const coach = read('src/components/coaches/CoachDetail.jsx');
const offers = read('src/components/partner/PartnerOffersPanel.jsx');
const hub = read('src/pages/PartnerHub.jsx');
const button = read('src/components/design-system/Button.jsx');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

gate('1. Button aceita sublabel e quebra linha com segurança (5.28)', button.includes('sublabel') && button.includes('pl-btn-sublabel'));
gate('2. "Contratar treinador": rótulo curto + "N/mês · luvas N" no sublabel', coach.includes('Contratar treinador') && coach.includes('/mês${evaluation.signingCost > 0 ? ` · luvas'));
gate('3. "Aceitar proposta": rótulo curto + "N dias · você fica com N%" no sublabel', offers.includes('Aceitar proposta') && offers.includes('dias · você fica com'));
gate('4. aceite usa o padrão ModalActions (primário em largura total no celular)', offers.includes('<ModalActions'));
gate('5. renovação da dupla: um primário em largura total', hub.includes('size="touch" onClick={()=>onRenew({durationDays, prizeSplit})}') && hub.includes('className="w-full disabled:opacity-50'));
gate('6. nenhum rótulo de CTA com preço embutido no texto principal', !/Contratar ·|CONTRATAR ·|\+ \d+ DE ASSINATURA/.test(stripComments(coach + offers)));

const after = measurements('after');
if (after) {
  const modals = after.results.filter((r) => r.modalOpen);
  gate(`7. app real: ${modals.length} modais medidos, 0 botão cortado em todos`, modals.length >= 8 && modals.every((r) => r.modalClippedCount === 0), JSON.stringify(modals.filter((r) => r.modalClippedCount).map((r) => `${r.screen}@${r.viewport}`)));
  gate('8. app real: cada modal de decisão tem exatamente 1 primário', modals.every((r) => r.modalPrimaryCount === 1));
  const pages = after.results.filter((r) => !r.skipped);
  gate(`9. app real: 0 botão cortado nas ${pages.length} capturas de página`, pages.every((r) => r.clippedCount === 0));
}
finish();
