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
// Playthrough 5.20-B — Training.jsx e Matches.jsx saem desta lista porque
// DEIXARAM DE SER PAGINAS: a consolidacao os transformou em adaptadores de rota
// que so devolvem <Navigate> para o hub correspondente, sem UI propria. Exigir
// "PageHeader denso" de quem nao renderiza nada era o motivo de o gate falhar —
// falha pre-existente, que so apareceu quando a bateria parou de capturar o
// codigo de saida depois de um pipeline (e por isso lia sempre 0).
//
// Eles nao sao apagados: ADAPTER_PATHS, abaixo, passa a AFIRMAR que continuam
// adaptadores. Se algum voltar a ser pagina de verdade, o gate cobra o
// cabecalho denso outra vez.
const pagePaths = [
  'src/pages/CareerHub.jsx',
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

// Rotas legadas que hoje apenas redirecionam para o hub que absorveu a tela.
const ADAPTER_PATHS = ['src/pages/Training.jsx', 'src/pages/Matches.jsx'];
const css = read('src/index.css');

console.log('\n--- M4.1: HUD e cabeçalhos de contexto ---');
const gameHud = read('src/components/design-system/GameHud.jsx');
const pageHeader = read('src/components/design-system/PageHeader.jsx');
const dsIndex = read('src/components/design-system/index.js');
gate('GameHud é um primitive compartilhado e exportado', gameHud.includes('data-game-hud') && dsIndex.includes("from './GameHud'"));
gate('GameHud usa faixa com separadores, sem Surface/card próprio', gameHud.includes('pl-game-hud-item') && !gameHud.includes('<Surface'));
// Playthrough 5.22-E tornou o chip do HUD opcionalmente interativo; o nome
// acessível passou a ser o `ariaLabel` computado (label + valor), aplicado no
// span e no botão.
gate('cada item do HUD expõe valor e rótulo separados com nome acessível', gameHud.includes('pl-game-hud-value') && gameHud.includes('pl-game-hud-label') && gameHud.includes('aria-label={ariaLabel}'));
gate('PageHeader aceita hudItems/hudLabel e compõe GameHud', pageHeader.includes('hudItems') && pageHeader.includes('<GameHud'));
gate('PageHeader denso remove o hero visual no mobile', css.includes('.pl-page-hero--dense') && css.includes('background: transparent') && css.includes('box-shadow: none'));
gate('título operacional mobile permanece abaixo de 40px', css.includes('font-size: 1.35rem'));
gate('HUD compartilha tokens de gap/padding/ícone/valor/rótulo', ['--game-hud-gap', '--game-hud-padding-x', '--game-hud-icon-size', '--game-hud-value-size', '--game-hud-label-size'].every((token) => css.includes(token)));
gate('estrutura base do HUD é aplicada antes dos breakpoints desktop/mobile', css.indexOf('.pl-game-hud {') < css.indexOf('@media (min-width: 768px)'));
// Correção UI (Fase 1, cabeçalho estourando): `flex-wrap: nowrap` numa
// única linha era exatamente a causa raiz do bug real — com 4-5 chips
// (ex.: "Dupla ativa · Facundo Benítez"), a "uma linha operacional" não
// cabia e os chips vazavam/sobrepunham. Mudança deliberada desta fase:
// os chips agora quebram para a linha de baixo (flex-wrap: wrap) em vez de
// tentar caber numa linha só.
gate('HUD desktop compacta o hero em duas colunas e os chips quebram linha em vez de vazar', css.includes('@media (min-width: 768px)') && css.includes('grid-template-columns: minmax(12rem, auto) minmax(0, 1fr)') && css.includes('flex-wrap: wrap'));
gate('HUD mobile preserva 44px e usa colunas horizontais sem colar valor/rótulo', css.includes('min-height: 2.75rem') && css.includes('grid-auto-flow: column') && css.includes('gap: var(--game-hud-gap)'));
gate('Calendário usa data compacta 08 JAN · Quinta', (() => { const value = getCareerHudDatePresentation('2026-01-08'); return value.date === '08 JAN' && value.weekday === 'Quinta'; })());
for (const adapterPath of ADAPTER_PATHS) {
  const adapterSource = read(adapterPath);
  gate(adapterPath + ' segue adaptador de rota (sem UI propria)',
    adapterSource.includes('<Navigate') && !adapterSource.includes('PageHeader'));
}
for (const [path, source] of Object.entries(pages)) {
  // Fase 5.29 — Torneios trocou PageHeader+HUD pelo cartão de competição
  // (estado curto + ação no mesmo bloco). O princípio do gate é o mesmo.
  if (path === 'src/pages/Tournaments.jsx') {
    gate(`${path} integra estado curto + ação no cartão de competição (5.29)`, source.includes('<CompetitionHeroCard') && source.includes('data-competition-hero'));
  } else if (path === 'src/pages/Ranking.jsx') {
    // Fase 5.32-A — o Ranking trocou PageHeader+HUD pelo cartão "Sua
    // posição" (estado curto no topo, POSITION FIRST); no celular o hub já
    // nomeia a página. Mesmo princípio do gate.
    gate(`${path} integra estado curto no cartão de posição (5.32)`, source.includes('data-ranking-hero={kind}') && source.includes('data-ranking-view-switch') && !source.includes('hudItems='));
  } else if (path === 'src/pages/CareerHub.jsx') {
    // Fase 5.30 — a Home trocou PageHeader+HUD pelo bloco de status da
    // carreira (estado curto no topo, sem repetir ranking/OVR do header).
    gate(`${path} integra estado curto no bloco de status da carreira (5.30)`, source.includes('<HomeStatusCard') && source.includes('data-home-status'));
  } else {
    gate(`${path} usa PageHeader denso`, /<\w*PageHeader\s+[\s\S]{0,80}?dense/.test(source));
    // Fase 5.31: em Minha dupla e Treinador o HUD repetia o cartão logo
    // abaixo; o estado curto passou a ser o próprio cartão (hero).
    const heroSummary = {
      'src/pages/PartnerHub.jsx': () => read('src/components/partner/PartnerOverview.jsx').includes('data-partner-hero="active"'),
      'src/pages/Coaches.jsx': () => source.includes('data-coach-hero="active"'),
    }[path];
    if (heroSummary) gate(`${path} integra estado curto no cartão da página (5.31)`, heroSummary() && !source.includes('hudItems='));
    else gate(`${path} integra estado curto no HUD`, source.includes('hudItems='));
  }
  gate(`${path} não mantém CompactStats separado`, !source.includes('<CompactStats'));
}

console.log('\n--- M4.1: hierarquia de ação nas páginas-alvo ---');
// Playthrough 5.20-B — a consolidacao moveu Treinos e Partidas para dentro do
// hub unificado: o cabecalho com HUD e abas ficou em TrainingCenter.jsx e o
// conteudo em TrainingView/PracticeMatchView. Os gates abaixo continuam
// cobrando a MESMA hierarquia de acao, agora no lugar onde a tela vive.
const trainingHub = read('src/pages/TrainingCenter.jsx');
const trainingView = read('src/components/training-center/TrainingView.jsx');
const practiceView = read('src/components/training-center/PracticeMatchView.jsx');
const tournaments = pages['src/pages/Tournaments.jsx'];
const home = pages['src/pages/CareerHub.jsx'];
// 5.29: o HUD virou o painel "Hoje" (medidores) — continua antes das abas.
gate('Treinos: painel de estado (Hoje) vem antes das abas no hub', trainingHub.indexOf('data-training-today') > -1 && trainingHub.indexOf('data-training-today') < trainingHub.indexOf('<Tabs'));
gate('Treinos: atividade principal vem antes das seções secundárias', trainingView.indexOf('Atividades de treino') < trainingView.indexOf('Estado do atleta'));
gate('Treinos: custo/ganho e botão continuam no TrainingActivityCard', (() => { const source = read('src/components/training/TrainingActivityCard.jsx'); return source.includes('energyCost') && source.includes('prediction.gains') && source.includes('Treinar'); })());
gate('Partidas: a ação de jogar vem antes do histórico', practiceView.indexOf('Jogar partida treino') < practiceView.indexOf('Histórico recente'));
// 5.29: evento/status/ação no mesmo bloco — agora o cartão de competição.
gate('Torneios: evento/status/ação estão no mesmo bloco (cartão de competição)', tournaments.includes('<CompetitionHeroCard') && tournaments.includes('Próximo evento') && tournaments.includes('Abrir evento'));
// Playthrough 5.20-B, Partes C/D — OS DOIS GATES ANTERIORES DESCREVIAM A HOME
// DE ANTES DA 5.20-A: uma fileira fixa de botoes (Treinar/Competir/Agenda) e
// um Surface que mesclava objetivo e proximo evento. A 5.20-A substituiu isso
// por um modelo de proxima-acao contextual, e os gates passaram a falhar —
// mascarados por uma bateria que lia o codigo de saida depois de um pipeline.
//
// Nao foram reescritos para caber no que a tela ja fazia: a 5.20-B primeiro
// DECIDIU a hierarquia (o compromisso acionavel antes da meta de temporada, no
// maximo 3 pendencias visiveis) e so entao estes gates passaram a cobra-la.
// 5.30: a hierarquia decidida na 5.20-B continua — o compromisso acionável
// ("O que vem agora") vem antes das metas de temporada (agora no progresso).
gate('Home: o que fazer agora vem antes do proximo objetivo',
  home.indexOf('<HomeNextCommitment') > -1 && home.indexOf('<HomeNextCommitment') < home.indexOf('<HomeProgress'));
gate('Home: no maximo 3 pendencias visiveis, com o excedente alcancavel',
  home.includes('VISIBLE_PRIORITY_ACTIONS = 3') && home.includes('ver mais {hiddenCount}'));

console.log('\n--- M4.1: menos cards, listas de jogo e detalhes progressivos ---');
gate('Ranking usa linhas compartilhadas de leaderboard', pages['src/pages/Ranking.jsx'].includes('CompactListItem'));
gate('Atletas usa scouting rows clicáveis', read('src/components/athletes/AthleteCard.jsx').includes('pl-scout-row'));
// Playthrough 4.8, Parte H/I — decisão revertida de propósito: as roster
// rows full-width faziam cada técnico ocupar quase uma tela inteira; agora
// o card segue o mesmo padrão compacto (glass, grid de 2 colunas) já usado
// pela tela de propostas de dupla, exatamente como pedido nesta fase.
gate('Técnicos usa cards compactos (glass), padronizado com a vitrine de duplas', (() => { const source = read('src/components/coaches/CoachCard.jsx'); return source.includes('glass') && source.includes('rounded-2xl'); })());
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
gate('Header global compacto preserva aria-label completo do evento', headerContext.includes("max-w-[6.75rem]") && headerContext.includes('context.ariaLabel || label') && headerContext.includes('aria-label={ariaLabel}'));
gate('Shell usa tokens de header/bottom-nav e safe areas', appLayout.includes('--pl-header-h') && appLayout.includes('--pl-bottom-nav-h') && appLayout.includes('safe-area-inset-bottom'));
// M4.1.3 (docs/MOBILE_M4_1_3_VISUAL_HOTFIX.md, Parte 2): folga acima da nav
// aumentada de 0.5rem para 0.875rem — QA físico achou o botão "muito
// próximo" da barra. Continua estritamente ACIMA de toda a altura da nav,
// só com mais respiro; gate atualizado para o valor real e correto.
gate('GuideButton fica acima da nav e o conteúdo reserva espaço adicional', guide.includes('var(--pl-bottom-nav-h)+env(safe-area-inset-bottom)+0.875rem') && appLayout.includes('+3.5rem'));
for (const [path, source] of Object.entries(pages)) {
  gate(`${path} não cria ação fixed concorrente`, !/className="[^"]*\bfixed\b[^"]*bottom-/.test(source));
}
gate('host mobile bloqueia overflow horizontal da página', css.includes('.design-system-page-host') && /overflow-x:\s*(?:clip|hidden)/.test(css));
gate('landscape curto recebe compactação específica e leve', css.includes('@media (orientation: landscape) and (max-height: 520px)'));

console.log('\n--- M4.1: proxy estrutural de DOM antes/depois ---');
const baselines = {
  'src/pages/CareerHub.jsx': { dom: 94, containers: 44, cards: 36 },
  // Playthrough 5.20-B — os numeros continuam os MESMOS; muda so onde a tela
  // e medida. Treinos e Partidas viraram adaptadores de rota, e medir um
  // adaptador vazio daria uma reducao estrutural falsa de quase 100%. A
  // comparacao passa a ser feita contra a view que absorveu cada tela.
  'src/components/training-center/TrainingView.jsx': { dom: 23, containers: 16, cards: 9 },
  'src/components/training-center/PracticeMatchView.jsx': { dom: 18, containers: 9, cards: 4 },
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
// read(), e nao pages[], porque parte das telas agora vive em componentes.
const after = Object.fromEntries(Object.keys(baselines).map((path) => [path, structuralMetrics(read(path))]));
for (const path of Object.keys(baselines)) {
  const before = baselines[path];
  const current = after[path];
  console.log(`${path}: JSX tags ${before.dom} -> ${current.dom}; containers ${before.containers} -> ${current.containers}; card signals ${before.cards} -> ${current.cards}`);
}
// =========================================================================
// DEPRECATED_BY_DIRECT_DOM_MEASUREMENT  (Playthrough 5.20-C, item 2)
//
// Os tres gates agregados que ficavam aqui contavam TAGS JSX NO FONTE como
// proxy da complexidade da tela. Foram descontinuados, e nao apagados sem
// explicacao, porque o motivo importa para quem ler o historico:
//
//   A 5.20-B transformou Torneios numa agenda por mes. Isso SOMOU 3 tags ao
//   fonte (o cabecalho de mes fechado e marcacao nova) enquanto o DOM caiu
//   de 333 para 76 cards e a pagina de 54.779px para 7.249px em 360px. O
//   proxy reprovava a mudanca que melhorou a tela em sete vezes.
//
//   O proxy tambem premiava o movimento errado: mover marcacao para um
//   componente noutro arquivo "melhorava" a metrica sem alterar nada do que
//   chega ao navegador.
//
// A medida direta vive em test-mobile-rendered-complexity-v520c.mjs, que
// mede overflow, conteudo escondido, CTA duplicado e densidade no DOM
// renderizado, em 360x800 e 390x844.
//
// A comparacao com os baselines da M4.1 continua sendo IMPRESSA acima como
// registro historico da evolucao do arquivo, mas nao reprova mais ninguem.
// =========================================================================

console.log(`\n${gates} gates estruturais executados — Mobile M4.1.`);
console.log('Complexidade renderizada: ver test-mobile-rendered-complexity-v520c.mjs (medida direta de DOM).');
console.log('Gates físicos NÃO automatizados: viewport 390x800, landscape real, toque, scroll e colisão visual do GuideButton.');
