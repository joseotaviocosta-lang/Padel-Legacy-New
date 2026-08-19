// Mobile M4.1 — Game / App Feel Polish.
//
// Esta suíte é deliberadamente estrutural. Ela valida o código real do shell,
// primitives e páginas, mas não se apresenta como teste visual de um aparelho.
// Os gates físicos de 390x800 e landscape ficam no relatório/checklist.
import { readFileSync } from 'node:fs';
import { getCareerHudDatePresentation } from '../src/lib/careerDatePresentation.js';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');
const pagePaths = [
  'src/pages/CareerHub.jsx',
  'src/pages/Training.jsx',
  'src/pages/Matches.jsx',
  'src/pages/Tournaments.jsx',
  'src/pages/Ranking.jsx',
  'src/pages/Athletes.jsx',
  'src/pages/PartnerHub.jsx',
  'src/pages/Staff.jsx',
  'src/pages/Missions.jsx',
  'src/pages/CalendarPage.jsx',
  'src/pages/Coaches.jsx',
  'src/pages/Communications.jsx',
  'src/pages/Press.jsx',
];
const pages = Object.fromEntries(pagePaths.map((path) => [path, read(path)]));
const css = read('src/index.css');

console.log('\n--- M4.1: HUD e cabeçalhos de contexto ---');
const gameHud = read('src/components/design-system/GameHud.jsx');
const pageHeader = read('src/components/design-system/PageHeader.jsx');
const dsIndex = read('src/components/design-system/index.js');
gate('GameHud é um primitive compartilhado e exportado', gameHud.includes('data-game-hud') && dsIndex.includes("from './GameHud'"));
gate('GameHud usa faixa com separadores, sem Surface/card próprio', gameHud.includes('pl-game-hud-item') && !gameHud.includes('<Surface'));
gate('cada item do HUD expõe valor e rótulo separados com nome acessível', gameHud.includes('pl-game-hud-value') && gameHud.includes('pl-game-hud-label') && gameHud.includes('aria-label={item.label'));
gate('PageHeader aceita hudItems/hudLabel e compõe GameHud', pageHeader.includes('hudItems') && pageHeader.includes('<GameHud'));
gate('PageHeader denso remove o hero visual no mobile', css.includes('.pl-page-hero--dense') && css.includes('background: transparent') && css.includes('box-shadow: none'));
gate('título operacional mobile permanece abaixo de 40px', css.includes('font-size: 1.35rem'));
gate('HUD compartilha tokens de gap/padding/ícone/valor/rótulo', ['--game-hud-gap', '--game-hud-padding-x', '--game-hud-icon-size', '--game-hud-value-size', '--game-hud-label-size'].every((token) => css.includes(token)));
gate('estrutura base do HUD é aplicada antes dos breakpoints desktop/mobile', css.indexOf('.pl-game-hud {') < css.indexOf('@media (min-width: 768px)'));
gate('HUD desktop não quebra valores e compacta o hero em uma linha operacional', css.includes('@media (min-width: 768px)') && css.includes('grid-template-columns: minmax(12rem, auto) minmax(0, 1fr)') && css.includes('flex-wrap: nowrap'));
gate('HUD mobile preserva 44px e usa colunas horizontais sem colar valor/rótulo', css.includes('min-height: 2.75rem') && css.includes('grid-auto-flow: column') && css.includes('gap: var(--game-hud-gap)'));
gate('Calendário usa data compacta 08 JAN · Quinta', (() => { const value = getCareerHudDatePresentation('2026-01-08'); return value.date === '08 JAN' && value.weekday === 'Quinta'; })());
for (const [path, source] of Object.entries(pages)) {
  gate(`${path} usa PageHeader denso`, /<\w*PageHeader\s+[\s\S]{0,80}?dense/.test(source));
  gate(`${path} integra estado curto no HUD`, source.includes('hudItems='));
  gate(`${path} não mantém CompactStats separado`, !source.includes('<CompactStats'));
}

console.log('\n--- M4.1: hierarquia de ação nas páginas-alvo ---');
const training = pages['src/pages/Training.jsx'];
const matches = pages['src/pages/Matches.jsx'];
const tournaments = pages['src/pages/Tournaments.jsx'];
const home = pages['src/pages/CareerHub.jsx'];
gate('Treinos: tabs e atividade principal vêm depois do HUD e antes das seções secundárias', training.indexOf('hudItems=') < training.indexOf('<Tabs') && training.indexOf('Atividades de treino') < training.indexOf('Estado do atleta'));
gate('Treinos: custo/ganho e botão continuam no TrainingActivityCard', (() => { const source = read('src/components/training/TrainingActivityCard.jsx'); return source.includes('energyCost') && source.includes('prediction.gains') && source.includes('Treinar'); })());
gate('Partidas: Jogar agora vem antes de Recentes', matches.indexOf('Jogar agora') < matches.indexOf('Recentes'));
gate('Torneios: evento/status/ação estão no mesmo cabeçalho', tournaments.includes('hudLabel="Próximo evento"') && tournaments.includes('Abrir evento'));
gate('Home: Treinar é a ação primária e precede Competir/Agenda', home.indexOf('primary to="/game/training"') < home.indexOf('>Competir<') && home.indexOf('>Competir<') < home.indexOf('>Agenda<'));
gate('Home: objetivo e próximo evento foram mesclados em uma Surface com separador', /<Surface padding="none" className="grid overflow-hidden/.test(home) && home.includes('xl:border-r'));

console.log('\n--- M4.1: menos cards, listas de jogo e detalhes progressivos ---');
gate('Ranking usa linhas compartilhadas de leaderboard', pages['src/pages/Ranking.jsx'].includes('CompactListItem'));
gate('Atletas usa scouting rows clicáveis', read('src/components/athletes/AthleteCard.jsx').includes('pl-scout-row'));
gate('Técnicos usa roster rows, não glass cards individuais', (() => { const source = read('src/components/coaches/CoachCard.jsx'); return source.includes('pl-roster-row') && !source.includes('glass'); })());
gate('Comunicações agrupa mensagens numa lista com separadores', pages['src/pages/Communications.jsx'].includes('last:border-b-0'));
gate('Imprensa agrupa artigos numa lista com separadores', read('src/components/press/ArticleCard.jsx').includes('last:border-b-0'));
gate('Missões agrupa quests em lista e mantém concluídas em detalhe', pages['src/pages/Missions.jsx'].includes('last:border-b-0') && pages['src/pages/Missions.jsx'].includes('CollapsibleSection'));
gate('Comissão removeu o hero/grade de métricas duplicados do StaffPanel', (() => { const source = read('src/components/economy/StaffPanel.jsx'); return !source.includes('Estrutura de alta performance') && !source.includes('CompactStats'); })());

console.log('\n--- M4.1: tabs, botões, shell e áreas seguras ---');
const tabs = read('src/components/design-system/Tabs.jsx');
const button = read('src/components/design-system/Button.jsx');
const baseButton = read('src/components/ui/button.jsx');
const bottomNav = read('src/components/BottomNav.jsx');
const appLayout = read('src/components/AppLayout.jsx');
const guide = read('src/components/onboarding/OnboardingGuide.jsx');
const headerContext = read('src/components/career/CareerHeaderContext.jsx');
gate('Tabs compartilhadas usam segmented control compacto', tabs.includes('pl-game-tabs') && css.includes(".pl-game-tabs [role='tab']"));
gate('Tabs preservam alvo de toque mínimo', tabs.includes('pl-tab-trigger') && css.includes('--pl-touch-min: 2.75rem'));
gate('Ação primária tem estado pressed próprio', button.includes('pl-game-primary') && css.includes('.pl-game-primary:active:not(:disabled)'));
gate('Botões preservam feedback disabled e loading existente', baseButton.includes('disabled:pointer-events-none') && read('src/components/design-system/ActionFeedback.jsx').includes("loading:"));
gate('Bottom nav preserva cinco grupos e altura tokenizada', bottomNav.includes('grid-cols-5') && bottomNav.includes('--pl-bottom-nav-h'));
gate('Bottom nav dá mais peso ao ícone e label menor', bottomNav.includes("h-[1.35rem]") && bottomNav.includes('text-[8.5px]'));
gate('Bottom nav ativa é clara e a transição é curta', bottomNav.includes('bg-primary/15') && bottomNav.includes("duration: 0.15"));
gate('Header global compacto preserva aria-label completo do evento', headerContext.includes("max-w-[6.75rem]") && headerContext.includes('aria-label={context.ariaLabel'));
gate('Shell usa tokens de header/bottom-nav e safe areas', appLayout.includes('--pl-header-h') && appLayout.includes('--pl-bottom-nav-h') && appLayout.includes('safe-area-inset-bottom'));
gate('GuideButton fica acima da nav e o conteúdo reserva espaço adicional', guide.includes('var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+0.5rem') && appLayout.includes('+3.5rem'));
for (const [path, source] of Object.entries(pages)) {
  gate(`${path} não cria ação fixed concorrente`, !/className="[^"]*\bfixed\b[^"]*bottom-/.test(source));
}
gate('host mobile bloqueia overflow horizontal da página', css.includes('.design-system-page-host') && /overflow-x:\s*(?:clip|hidden)/.test(css));
gate('landscape curto recebe compactação específica e leve', css.includes('@media (orientation: landscape) and (max-height: 520px)'));

console.log('\n--- M4.1: proxy estrutural de DOM antes/depois ---');
const baselines = {
  'src/pages/CareerHub.jsx': { dom: 94, containers: 44, cards: 36 },
  'src/pages/Training.jsx': { dom: 23, containers: 16, cards: 9 },
  'src/pages/Matches.jsx': { dom: 18, containers: 9, cards: 4 },
  'src/pages/Tournaments.jsx': { dom: 51, containers: 21, cards: 9 },
  'src/pages/CalendarPage.jsx': { dom: 34, containers: 14, cards: 5 },
};
function structuralMetrics(source) {
  return {
    dom: (source.match(/<(?:div|section|header|nav|main|article|ul|li|button|a|span|p|h[1-6]|label|input|select)\b/g) || []).length,
    containers: (source.match(/<(?:div|section|header|nav|main|article|ul)\b/g) || []).length,
    cards: (source.match(/(?:<Surface|<CompactStats|<StatCard|\bglass\b|rounded-(?:xl|2xl|3xl))/g) || []).length,
  };
}
const after = Object.fromEntries(Object.keys(baselines).map((path) => [path, structuralMetrics(pages[path])]));
for (const path of Object.keys(baselines)) {
  const before = baselines[path];
  const current = after[path];
  console.log(`${path}: JSX tags ${before.dom} -> ${current.dom}; containers ${before.containers} -> ${current.containers}; card signals ${before.cards} -> ${current.cards}`);
}
const operational = ['src/pages/Training.jsx', 'src/pages/Matches.jsx', 'src/pages/Tournaments.jsx', 'src/pages/CalendarPage.jsx'];
const sum = (map, key) => operational.reduce((total, path) => total + map[path][key], 0);
gate('páginas operacionais reduzem tags JSX agregadas', sum(after, 'dom') < sum(baselines, 'dom'));
gate('páginas operacionais reduzem containers agregados', sum(after, 'containers') < sum(baselines, 'containers'));
gate('páginas operacionais reduzem sinais de cards agregados', sum(after, 'cards') < sum(baselines, 'cards'));

console.log(`\n${gates} gates estruturais executados, todos PASS — Mobile M4.1.`);
console.log('Gates físicos NÃO automatizados: viewport 390x800, landscape real, toque, scroll e colisão visual do GuideButton.');
