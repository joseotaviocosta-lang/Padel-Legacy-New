// Fase 5.30 — ações da Home: 4 atalhos (ícone + rótulo curto) para destinos
// reais; CTA do compromisso, item da agenda, ação rápida e retorno à Home
// testados com cliques reais.
import { componentSource, functionalRuns, gateRunner, read } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-actions-v530');
const quick = componentSource('HomeQuickActions');
const routes = [...quick.matchAll(/\{ to: ([^,]+), icon: (\w+), label: /g)].map((m) => m[1]);
gate('1. exatamente 4 ações rápidas', routes.length === 4, routes.join(' | '));
gate('2. destinos: Treinar, Dupla, Objetivos, Mundo (rotas existentes)', routes.join() === ["APP_ROUTES.TRAINING", "'/partners'", 'APP_ROUTES.MISSIONS', "'/world'"].join());
const routesSrc = read('src/navigation/routes.js');
gate('3. APP_ROUTES.TRAINING e APP_ROUTES.MISSIONS existem', /TRAINING:/.test(routesSrc) && /MISSIONS:/.test(routesSrc));
gate('4. atalhos não são cartões grandes (grid de 4, rótulo curto truncável)', quick.includes('grid-cols-4') && quick.includes('truncate'));
for (const run of functionalRuns()) {
  const by = (re) => run.checks.find((c) => re.test(c.name));
  gate(`5. [${run.state}] CTA do próximo compromisso navega`, by(/CTA do próximo compromisso/)?.ok);
  gate(`6. [${run.state}] retorno à Home`, by(/Retorno à Home/)?.ok);
  gate(`7. [${run.state}] ação rápida abre o destino`, by(/Ação rápida/)?.ok);
  gate(`8. [${run.state}] item da agenda (detalhe ou inscrição sem confirmar) funciona`, Boolean(by(/Item da agenda/)?.ok || by(/Inscrever-se \(agenda\)/)?.ok));
  gate(`9. [${run.state}] sem erro de JavaScript`, by(/Sem erro de JavaScript/)?.ok);
}
finish();
