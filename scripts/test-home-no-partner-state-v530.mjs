// Fase 5.30 — Home sem parceiro: não quebra, mostra "Sem parceiro" no
// status, e propostas pendentes viram prioridade de alto impacto.
import { afterMeasurements, functionalRuns, gateRunner, HOME_LIB, homeSource, withModules } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-no-partner-state-v530');
await withModules({ home: HOME_LIB }, async ({ home }) => {
  const r = home.buildHomePriorities({ pendingOffersCount: 2, hasPartner: false });
  gate('1. propostas sem parceiro viram prioridade "danger"', r.items[0]?.id === 'partner-offers' && r.items[0].tone === 'danger');
  gate('2. texto explica a situação', /2 propostas de parceria/.test(r.items[0].title) && /sem parceiro/.test(r.items[0].description));
  gate('3. a prioridade abre a escolha de parceiro (não uma rota)', r.items[0].partnerAction === true);
  const withPartner = home.buildHomePriorities({ pendingOffersCount: 1, hasPartner: true });
  gate('4. com parceiro, as mesmas propostas são informativas', withPartner.items[0].tone === 'info');
});
gate('5. linha da dupla no status usa CareerStatusBar compacto (mostra "Sem parceiro — toque para escolher")', /<CareerStatusBar compact/.test(homeSource()));
const run = functionalRuns().find((r) => r.state === 'nova');
gate('6. app real, carreira nova sem parceiro: status mostra "Sem parceiro"', run?.checks.some((c) => /Sem parceiro/.test(c.name) && c.ok));
const nova = afterMeasurements().results.filter((r) => r.state === 'nova');
gate('7. app real, sem parceiro: 0 overflow e 0 botão estourado em todas as larguras', nova.length === 4 && nova.every((r) => r.docOverflowPx === 0 && r.clippedCount === 0));
finish();
