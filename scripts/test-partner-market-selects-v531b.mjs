// Hotfix 5.31-B — Lado + Ordenar na Busca: "Ordenar: Compatibilidade" não
// cabia no select e encostava na margem. O rótulo essencial virou legenda
// fixa; o select mostra só o valor (único texto que pode truncar). Lado a
// lado a partir de 360px, dentro do contêiner.
import { PROFILE, primaryCount } from './lib/v531UiKit.mjs';
import { VIEWPORTS, audit, gateRunner, groupsOf, read, textOf, where, withUi } from './lib/v531bKit.mjs';

const { gate, finish } = gateRunner('test-partner-market-selects-v531b');
const src = read('src/components/partner/PartnerSearch.jsx');

await withUi({ search: '/src/components/partner/PartnerSearch.jsx' }, async ({ search, render }) => {
  const html = render(search.default, { profile: PROFILE, relationships: [], onInvite() {} });
  const block = html.slice(html.indexOf('data-partner-search-selects'));
  const text = textOf(block).slice(0, 200);
  gate('1. legendas fixas "Lado" e "Ordenar" acima dos selects', /^.*Lado .*Ordenar /.test(text), text);
  gate('2. o valor de ordenação não repete o rótulo ("Ordenar: …" saiu das opções)', !/Ordenar: /.test(html) && />Compatibilidade</.test(html));
  gate('3. os dois selects ocupam a largura da sua coluna e podem encolher (w-full min-w-0)', (block.match(/<select[^>]*class="[^"]*w-full min-w-0/g) || []).length === 2);
  gate('4. grade de 2 colunas que pode encolher (min-w-0)', html.includes('grid min-w-0 grid-cols-2 gap-2'));
  gate('5. nenhum CTA primário no topo da busca', primaryCount(html.slice(0, html.indexOf('data-partner-search-selects') + 2000)) === 0);
});
gate('6. mesmos filtros e mesmos valores (lado: all/right/left/flex; ordem: compat/rating/name)', ["['all', 'Todos os lados']", "['right', 'Direita']", "['left', 'Esquerda']", "['flex', 'Versátil']", "['compat', 'Compatibilidade']", "['rating', 'Overall']", "['name', 'Nome']"].every((t) => src.includes(t)));
gate('7. mesmos estados (sideFilter/sort) e aria-labels preservados', src.includes('aria-label="Filtrar por lado preferido"') && src.includes('aria-label="Ordenar candidatos"') && src.includes('setSideFilter(e.target.value)') && src.includes('setSort(e.target.value)'));

const before = audit('before'); const after = audit('after');
if (after) {
  const rows = groupsOf(after, (g) => g.kind === 'selects');
  gate(`8. cobertura: selects medidos em ${VIEWPORTS.join('/')}`, VIEWPORTS.every((v) => rows.some((g) => g.viewport === v)));
  gate('9. o grupo fica dentro da margem e nenhum select sai do contêiner', rows.every((g) => g.insideGutter && !g.selectsOut.length), where(rows.filter((g) => !g.insideGutter || g.selectsOut.length)));
  gate('10. continuam lado a lado em 360 (grade fixa de 2 colunas, sem empilhar) e dentro da margem', src.includes('grid min-w-0 grid-cols-2 gap-2') && !/grid-cols-1[^"]*grid-cols-2" data-partner-search-selects/.test(src) && rows.filter((g) => g.viewport === '360').every((g) => g.insideGutter && !g.selectsOut.length));
}
if (before) {
  const old = groupsOf(before, (g) => g.kind === 'select' && /Ordenar/.test(g.label)).filter((g) => g.viewport === '390');
  gate('11. evidência: antes, "Ordenar: Compatibilidade" encostava na margem em 390 (borda a 8px da tela; no Redmi 12 aparecia cortado)', old.some((g) => g.selectsOut.length > 0));
}
finish();
