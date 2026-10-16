// Hotfix 5.31-B — filtros da Caixa de entrada (Todas … Treinador): no
// Redmi 12 ficavam espremidos e sobrepostos. Agora: chips com largura do
// rótulo, faixa que rola de verdade, último filtro alcançável inteiro, filtro
// escolhido trazido para a vista, tudo dentro das margens.
import { VIEWPORTS, audit, gateRunner, groupsOf, read, where } from './lib/v531bKit.mjs';

const { gate, finish } = gateRunner('test-partner-inbox-filters-scroll-v531b');
const src = read('src/components/partner/InboxPanel.jsx');
const row = src.slice(src.indexOf('data-inbox-filters'), src.indexOf('{filtered.length === 0'));

gate('1. a faixa de filtros é identificável e acessível (role=group + aria-label)', row.includes('role="group"') && row.includes('aria-label="Filtrar mensagens"'));
gate('2. chips NÃO encolhem (shrink-0) e não quebram linha (whitespace-nowrap) — causa do bug', row.includes('shrink-0 whitespace-nowrap'));
gate('3. rolagem horizontal real e limpa (overflow-x-auto, overscroll contido, sem barra)', row.includes('overflow-x-auto') && row.includes('overscroll-x-contain') && row.includes('scrollbar-none'));
gate('4. folga no fim: espaçador depois do último chip', row.includes('<span aria-hidden="true" className="w-2 shrink-0" />'));
gate('5. o chip escolhido é trazido para a vista e marcado (aria-pressed)', row.includes("scrollIntoView({ block: 'nearest', inline: 'nearest' })") && row.includes('aria-pressed={filter === f.id}'));
gate('6. alvo de toque confortável (min-h-9) e texto legível (text-xs)', row.includes('min-h-9') && row.includes('text-xs'));
gate('7. os 6 filtros continuam os mesmos (Todas, Não lidas, Pendentes, Atletas, Empresário, Treinador)', ['Todas', 'Não lidas', 'Pendentes', 'Atletas', 'Empresário', 'Treinador'].every((label) => src.includes(`label: '${label}'`)));

const after = audit('after');
if (!after) { gate('medições do app real presentes', false); finish(); }
const rows = groupsOf(after, (g) => g.kind === 'inbox-filters');
gate(`8. cobertura: faixa medida em ${VIEWPORTS.join('/')}`, VIEWPORTS.every((v) => rows.some((g) => g.viewport === v)));
gate('9. a faixa fica dentro da margem da página', rows.every((g) => g.insideGutter), where(rows.filter((g) => !g.insideGutter)));
gate('10. no celular (360/390) a faixa rola em vez de espremer', rows.filter((g) => g.viewport === '360' || g.viewport === '390').every((g) => g.scrolls));
gate('11. rolada até o fim, o último filtro entra inteiro, com folga', rows.filter((g) => g.scrolls).every((g) => g.endReachable && g.endGap >= 2), where(rows.filter((g) => g.scrolls && !(g.endReachable && g.endGap >= 2))));
gate('12. nenhum chip com texto quebrado/cortado', rows.every((g) => !g.wrappedChips.length && !g.clippedNoScroll.length));
const last = rows.filter((g) => g.screen === 'partner-inbox-last');
gate('13. ao tocar no ÚLTIMO filtro (Treinador), ele fica ativo e inteiro na vista', last.length >= 4 && last.every((g) => g.activeVisible === true));
finish();
