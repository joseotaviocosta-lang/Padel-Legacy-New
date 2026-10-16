// Hotfix 5.31-B — abas e sub-abas (Dupla e hubs) dentro das margens:
// nenhuma borda cortando, uma linha por aba, rolagem só quando precisa,
// ativa sempre visível. Inclui a barra Treinador | Comissão, que ficava
// fora do <Page> e ia de borda a borda no celular.
import { VIEWPORTS, audit, gateRunner, groupsOf, read, where } from './lib/v531bKit.mjs';

const { gate, finish } = gateRunner('test-partner-tabs-mobile-containment-v531b');
const tabs = read('src/components/design-system/Tabs.jsx');
const hub = read('src/components/navigation/ConsolidatedHub.jsx');

gate('1. Tabs: faixa única que rola (overflow-x-auto + flex-nowrap) com folga no fim (pr-3)', tabs.includes('flex-nowrap') && tabs.includes('overflow-x-auto') && tabs.includes('pr-3'));
gate('2. Tabs: cada aba mantém a largura do rótulo e não quebra linha (min-w-max shrink-0 whitespace-nowrap)', tabs.includes('min-w-max shrink-0 whitespace-nowrap'));
gate('3. Tabs: rótulo legível (text-xs, sem fonte minúscula)', tabs.includes('text-xs font-bold') && !/text-\[(8|9)px\]/.test(tabs));
gate('4. Hub (Treinador | Comissão…): mesmo respiro lateral do Page', hub.includes("paddingLeft: 'var(--space-page-x)'") && hub.includes("paddingRight: 'var(--space-page-x)'") && hub.includes('max-w-[92rem]'));

const before = audit('before'); const after = audit('after');
if (!after) { gate('medições do app real presentes (tools/audit.mjs --phase=after)', false); finish(); }
const tabGroups = groupsOf(after, (g) => g.kind === 'tabs');
gate(`5. cobertura: ${tabGroups.length} listas de abas medidas em ${VIEWPORTS.join('/')}`, VIEWPORTS.every((v) => tabGroups.some((g) => g.viewport === v)) && tabGroups.length >= 40);
gate('6. todas as listas de abas começam e terminam dentro da margem da página', tabGroups.every((g) => g.insideGutter), where(tabGroups.filter((g) => !g.insideGutter)));
gate('7. nenhuma aba quebra o rótulo em duas linhas', tabGroups.every((g) => !g.wrappedChips.length), where(tabGroups.filter((g) => g.wrappedChips.length)));
gate('8. nenhuma aba cortada sem rolagem possível', tabGroups.every((g) => !g.clippedNoScroll.length), where(tabGroups.filter((g) => g.clippedNoScroll.length)));
gate('9. quando rola, a última aba entra inteira (fim alcançável)', tabGroups.every((g) => g.endReachable));
gate('10. a aba ativa está inteira dentro da faixa', tabGroups.filter((g) => g.activeVisible !== null).every((g) => g.activeVisible));
gate('11. 0 overflow horizontal / 0 fora da tela nas telas medidas', after.results.every((r) => r.docOverflowPx === 0 && r.offscreenCount === 0));
if (before) {
  const hubBefore = groupsOf(before, (g) => g.kind === 'tabs' && /Treinador/.test(g.label)).filter((g) => g.viewport === '360' || g.viewport === '390');
  gate('12. evidência: antes, a barra Treinador | Comissão saía da margem no celular', hubBefore.length > 0 && hubBefore.every((g) => !g.insideGutter));
}
finish();
