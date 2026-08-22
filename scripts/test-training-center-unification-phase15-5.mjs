import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const read = (path) => readFileSync(path, 'utf8');
const failures = [];
let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) failures.push(`${gates}. ${label}`);
}

const source = {
  app: read('src/App.jsx'),
  routes: read('src/navigation/routes.js'),
  nav: read('src/navigation/navigationConfig.js'),
  bottomNav: read('src/components/BottomNav.jsx'),
  hub: read('src/pages/TrainingCenter.jsx'),
  trainingAdapter: read('src/pages/Training.jsx'),
  matchesAdapter: read('src/pages/Matches.jsx'),
  training: read('src/components/training-center/TrainingView.jsx'),
  match: read('src/components/training-center/PracticeMatchView.jsx'),
  agenda: read('src/components/training-center/TrainingAgendaView.jsx'),
  progress: read('src/components/training-center/TrainingProgressView.jsx'),
  facility: read('src/components/training-center/TrainingFacilityView.jsx'),
  tabs: read('src/components/design-system/Tabs.jsx'),
  simulation: read('src/components/matches/SimulationModal.jsx'),
  trainingSystem: read('src/lib/trainingSystemV2.js'),
  padel: read('src/lib/padel.js'),
  nextAction: read('src/lib/careerNextAction.js'),
  home: read('src/pages/CareerHub.jsx'),
  notifications: read('src/lib/notificationDestinations.js'),
  bell: read('src/components/communications/CommunicationBell.jsx'),
  guide: read('src/onboarding/tutorialSteps.js'),
  introductions: read('src/onboarding/pageIntroductions.js'),
  missions: read('src/components/missions/MissionNotificationBridge.jsx'),
  missionCatalog: read('src/lib/padel.js'),
  layout: read('src/components/AppLayout.jsx'),
  headerHud: read('src/components/career/CareerHud.jsx'),
  headerContext: read('src/components/career/CareerHeaderContext.jsx'),
  dayAdvance: read('src/game-core/dayAdvanceCoordinator.js'),
  persistence: read('src/storage/GameStorage.js'),
  tournament: read('src/components/tournaments/TournamentModal.jsx'),
  partnership: read('src/lib/partnershipSystem.js'),
  interviews: read('src/lib/postMatchInterview.js'),
  overlay: read('src/components/design-system/overlayBackStack.js'),
  overlayHook: read('src/components/design-system/useOverlayBehavior.js'),
  css: read('src/index.css'),
  utilityRail: read('src/components/system/FloatingUtilityRail.jsx'),
  routeModules: read('src/lib/routeModules.js'),
};

const combinedHub = [source.hub, source.training, source.match, source.agenda, source.progress, source.facility].join('\n');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { APP_ROUTES, TRAINING_CENTER_VIEWS, buildTrainingCenterRoute } = await server.ssrLoadModule('/src/navigation/routes.js');
  const { resolveTrainingCenterView } = await server.ssrLoadModule('/src/pages/TrainingCenter.jsx');
  const { DAILY_MATCH_LIMIT, DAILY_TRAINING_LIMIT, canPlayMatchToday, canTrainToday } = await server.ssrLoadModule('/src/lib/padel.js');
  const { formatAttributeGain, formatGameNumber, formatCoinBalance, formatCurrency } = await server.ssrLoadModule('/src/lib/numberFormat.js');
  const { getCareerNextAction } = await server.ssrLoadModule('/src/lib/careerNextAction.js');
  const { resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const { getPageIntroduction } = await server.ssrLoadModule('/src/onboarding/pageIntroductions.js');

  gate('Centro unificado existe', source.hub.includes('data-training-center-hub'));
  gate('Rota canônica existe', APP_ROUTES.TRAINING_CENTER === '/game/training-center');
  gate('APP_ROUTES representa o Centro', source.routes.includes('TRAINING_CENTER: TRAINING_CENTER_PATH'));
  gate('Treino é a view padrão', resolveTrainingCenterView(null) === TRAINING_CENTER_VIEWS.TRAINING);
  gate('View inválida volta para Treino', resolveTrainingCenterView('invalid') === TRAINING_CENTER_VIEWS.TRAINING);
  gate('View Partida existe', resolveTrainingCenterView('match') === 'match');
  gate('View Agenda existe', resolveTrainingCenterView('agenda') === 'agenda');
  gate('View Evolução existe', resolveTrainingCenterView('progress') === 'progress');
  gate('View Centro existe', resolveTrainingCenterView('center') === 'center');
  gate('Existem exatamente cinco views primárias', Object.keys(TRAINING_CENTER_VIEWS).length === 5);
  gate('Deep-link de Treino é canônico', APP_ROUTES.TRAINING === '/game/training-center?view=training');
  gate('Deep-link de Partida é canônico', APP_ROUTES.MATCHES === '/game/training-center?view=match');
  gate('Deep-link de Agenda é canônico', APP_ROUTES.TRAINING_AGENDA === '/game/training-center?view=agenda');
  gate('Deep-link de Evolução é canônico', APP_ROUTES.TRAINING_PROGRESS === '/game/training-center?view=progress');
  gate('Deep-link de Centro é canônico', APP_ROUTES.TRAINING_FACILITIES === '/game/training-center?view=center');
  gate('Builder preserva parâmetros extras', buildTrainingCenterRoute('match', { play: 1 }).includes('view=match') && buildTrainingCenterRoute('match', { play: 1 }).includes('play=1'));
  gate('Router declara o Centro canônico', source.app.includes('path={APP_ROUTES.TRAINING_CENTER}'));
  gate('Rota legada Training continua declarada', source.app.includes('path="/game/training"'));
  gate('Rota legada Matches continua declarada', source.app.includes('path="/matches"'));
  gate('Variante legada /game/matches continua declarada', source.app.includes('path="/game/matches"'));
  gate('Training legado usa Navigate replace', source.trainingAdapter.includes('<Navigate') && source.trainingAdapter.includes('replace'));
  gate('Matches legado usa Navigate replace', source.matchesAdapter.includes('<Navigate') && source.matchesAdapter.includes('replace'));
  gate('Training legado preserva query', source.trainingAdapter.includes('searchParams.forEach'));
  gate('Matches legado preserva query', source.matchesAdapter.includes('searchParams.forEach'));
  gate('Adaptador Training não renderiza a página antiga', !source.trainingAdapter.includes('TrainingActivityCard'));
  gate('Adaptador Matches não renderiza a página antiga', !source.matchesAdapter.includes('SimulationModal'));
  gate('Redirect legado Centro abre infraestrutura', source.app.includes('to={APP_ROUTES.TRAINING_FACILITIES}'));
  gate('Nenhum redirect canônico volta para legado', !/TRAINING_CENTER[^\n]*Navigate[^\n]*game\/training/.test(source.app));
  gate('Mapa de preload conhece o Centro', source.routeModules.includes("'/game/training-center': 'TrainingCenter'"));
  gate('Preload remove query antes do lookup', source.routeModules.includes("split('?')[0]"));

  gate('Hub extrai TrainingView', source.hub.includes("lazy(() => import('@/components/training-center/TrainingView.jsx'))"));
  gate('Hub extrai PracticeMatchView', source.hub.includes("lazy(() => import('@/components/training-center/PracticeMatchView.jsx'))"));
  gate('Hub extrai TrainingAgendaView', source.hub.includes("lazy(() => import('@/components/training-center/TrainingAgendaView.jsx'))"));
  gate('Hub extrai TrainingProgressView', source.hub.includes("lazy(() => import('@/components/training-center/TrainingProgressView.jsx'))"));
  gate('Hub extrai TrainingFacilityView', source.hub.includes("lazy(() => import('@/components/training-center/TrainingFacilityView.jsx'))"));
  gate('Views usam React.lazy', (source.hub.match(/lazy\(\(\) => import/g) || []).length === 5);
  gate('Somente a view ativa é escolhida', source.hub.includes('switch (activeView)'));
  gate('Hub não monta páginas escondidas', !/hidden[^\n]*<(Training|Matches|TrainingCenter)/.test(source.hub));
  gate('Hub não importa páginas completas legadas', !/pages\/(Training|Matches)/.test(source.hub));
  gate('Suspense envolve conteúdo ativo', source.hub.includes('<Suspense') && source.hub.includes('{activeContent}'));
  gate('Perfil é carregado uma vez no host', (source.hub.match(/ensureMyProfile/g) || []).length === 2);
  gate('Views recebem perfil compartilhado', source.hub.includes('const shared = { profile, onProfileUpdate'));
  gate('HUD local mostra treinos', source.hub.includes("label: 'treinos'"));
  gate('HUD local mostra partida', source.hub.includes("label: 'partida'"));
  gate('HUD local mostra energia', source.hub.includes("label: 'energia'"));
  gate('HUD local mostra fadiga', source.hub.includes("label: 'fadiga'"));
  gate('HUD local não duplica moedas', !/label: ['"](moedas|saldo)/i.test(source.hub));
  gate('Atalho de partida existe na view Treino', source.hub.includes('data-practice-match-shortcut'));
  gate('Atalho troca a view internamente', source.hub.includes('selectView(TRAINING_CENTER_VIEWS.MATCH)'));

  gate('Limite de treino permanece 3', DAILY_TRAINING_LIMIT === 3);
  gate('Contador de treino começa 0/3', canTrainToday({ trainings_today: 0 }).remaining === 3);
  gate('Contador de treino reflete 1/3', canTrainToday({ trainings_today: 1 }).remaining === 2);
  gate('Terceiro treino consome o limite', !canTrainToday({ trainings_today: 3 }).allowed);
  gate('Limite de partida permanece 1', DAILY_MATCH_LIMIT === 1);
  gate('Partida começa disponível 0/1', canPlayMatchToday({ practice_matches_today: 0 }).remaining === 1);
  gate('Partida concluída reflete 1/1', !canPlayMatchToday({ practice_matches_today: 1 }).allowed);
  gate('Treino usa executeTraining canônico', source.training.includes('executeTraining(profile'));
  gate('Treino continua debitando custo', source.trainingSystem.includes('coins: currentCoins - preview.cost'));
  gate('Treino não gera moedas', source.trainingSystem.includes('coins_reward: 0'));
  gate('XP do treino continua no registro', source.trainingSystem.includes('xp_reward: scaledXp'));
  gate('Ganhos continuam no trainingSystemV2', source.trainingSystem.includes('attribute_gains: appliedGains'));
  gate('Partida usa SimulationModal canônico', source.match.includes("from '@/components/matches/SimulationModal'"));
  gate('Partida não cria engine paralelo', !/Math\.random|new MatchEngine|simulateMatch/.test(source.match));
  gate('Pós-partida do hub retorna ao Centro', source.simulation.includes('onReturnToTrainingCenter'));
  gate('Pós-partida do hub não oferece replay', source.simulation.includes('Voltar ao Centro de Treinamento'));
  gate('View concluída informa limite consumido', source.match.includes('Partida treino de hoje concluída'));
  gate('Atualização da partida retorna ao perfil compartilhado', source.match.includes("onProfileUpdate(updated, 'training-center:practice-match')"));
  gate('Atualização do treino retorna ao perfil compartilhado', source.training.includes("onProfileUpdate(res.profile, 'training-center:training')"));
  gate('Hub emite atualização canônica do perfil', source.hub.includes("CustomEvent('padel:profile-updated'"));
  gate('Hub escuta avanço de carreira pelo hook canônico', source.hub.includes('useCareerProfileSync(setProfile)'));
  gate('Avançar dia usa coordenador canônico', source.training.includes('advanceCareerDayOnce(profile)'));
  gate('Nenhum refresh/reload foi adicionado', !/location\.reload|window\.reload/.test(combinedHub));

  gate('Agenda reutiliza WeeklyPlanner', source.agenda.includes('<WeeklyPlanner'));
  gate('Agenda não importa a página Calendar', !/pages\/Calendar/.test(source.agenda));
  gate('Agenda aponta ao calendário canônico', source.agenda.includes('to={APP_ROUTES.CALENDAR}'));
  gate('Evolução reutiliza AttributeEvolution', source.progress.includes('<AttributeEvolution'));
  gate('Metas ficam como subseção de Evolução', source.progress.includes("key: 'goals'") && source.progress.includes('<DevelopmentGoals'));
  gate('Histórico fica como subseção de Evolução', source.progress.includes("key: 'history'"));
  gate('Histórico só carrega quando ativo', source.progress.includes("activeSection !== 'history'"));
  gate('Histórico formata ganho de atributo', source.progress.includes('formatAttributeGain(training.attribute_gain)'));
  gate('Float longo é formatado corretamente', formatAttributeGain(35.617000000000004) === '35.62');
  gate('Formato geral remove cauda IEEE-754', formatGameNumber(17.300000000000001) === '17.3');
  gate('Formato de saldo é reutilizado', source.facility.includes('formatCoinBalance'));
  gate('Formato monetário consolidado permanece disponível', typeof formatCurrency(1234) === 'string');
  gate('Infraestrutura reutiliza FacilityCard', source.facility.includes('<FacilityCard'));
  gate('Upgrades de infraestrutura foram preservados', source.facility.includes('handleUpgrade'));
  gate('Custos de upgrade continuam debitados', source.facility.includes('coins: (profile.coins || 0) - nextLevel.cost'));
  gate('Suporte técnico é apenas resumo contextual', source.facility.includes('Ver comissão') && !source.facility.includes('StaffMarket'));

  gate('Categorias possuem scroll-padding', source.tabs.includes('scroll-px-2'));
  gate('Tabs têm nowrap', source.tabs.includes('whitespace-nowrap'));
  gate('Tabs não encolhem', source.tabs.includes('shrink-0'));
  gate('Tabs possuem target mínimo de 44px', source.tabs.includes('min-h-11'));
  gate('Primeira categoria recebe respiro lateral', source.tabs.includes('pl-1'));
  gate('Hub usa layout sem altura portrait fixa', !/h-\[(100vh|100dvh)/.test(combinedHub));
  gate('Estrutura 360 protege overflow horizontal', source.tabs.includes('overflow-x-auto') && source.hub.includes('min-w-0'));
  gate('Estrutura 390 mantém controles de toque', (combinedHub.match(/min-h-11|min-h-12/g) || []).length >= 4);
  gate('Landscape não esconde views por altura', !/@media[^\n]*orientation[^\n]*display:\s*none/.test(source.css + combinedHub));

  const trainingNext = getCareerNextAction({ partner_id: 'p2', energy: 80, trainings_today: 0, practice_matches_today: 1 });
  gate('getCareerNextAction continua único', source.home.includes("from '@/lib/careerNextAction.js'") && !/function getCareerNextAction/.test(source.home));
  gate('Home aponta treino para o hub', trainingNext.route === APP_ROUTES.TRAINING);
  gate('NextEventCard não voltou', !/NextEventCard/.test(source.home));
  gate('ActiveTournamentBanner não voltou', !/ActiveTournamentBanner/.test(source.home));
  gate('Navegação possui uma única entrada Centro de Treinamento', (source.nav.match(/label: 'Centro de treinamento'/g) || []).length === 1);
  gate('Navegação não mantém entrada Treinos', !/label: 'Treinos'/.test(source.nav));
  gate('Navegação não mantém entrada Partidas', !/label: 'Partidas'/.test(source.nav));
  gate('Sidebar deriva da configuração consolidada', source.layout.includes('NAV_GROUPS'));
  gate('BottomNav continua derivando de NAV_GROUPS', source.bottomNav.includes('NAV_GROUPS'));
  gate('BottomNav não ganhou item paralelo', !/TRAINING_CENTER_VIEWS/.test(source.bottomNav));

  gate('Notificação padrão de treino abre o hub', resolveNotificationDestination({ notification_type: 'TRAINING' }).route.startsWith(APP_ROUTES.TRAINING));
  gate('Notificação legada /matches normaliza para Partida', resolveNotificationDestination({ notification_type: 'TRAINING', destination: '/matches' }).route.startsWith(APP_ROUTES.MATCHES));
  gate('Notificação legada /training-center normaliza para Centro', resolveNotificationDestination({ notification_type: 'TRAINING', destination: '/training-center' }).route.startsWith(APP_ROUTES.TRAINING_FACILITIES));
  gate('Notificação de recuperação abre a infraestrutura do Centro', resolveNotificationDestination({ message_type: 'injury_report', related_entity_id: 'injury-qa' }).route.startsWith(APP_ROUTES.TRAINING_FACILITIES));
  gate('Notification Center continua em Portal', source.bell.includes('createPortal(') && source.bell.includes('document.body'));
  gate('Notification Center continua no z-index 80', source.css.includes('--z-notification: 80'));
  gate('Notification fica acima da BottomNav', source.css.includes('--z-bottom-nav: 55'));
  gate('Notification fica acima da FloatingUtilityRail', source.css.includes('--z-floating: 50'));
  gate('Guide Treino aponta para o hub', source.guide.includes("'first-training'") && source.guide.includes('APP_ROUTES.TRAINING'));
  gate('Guide da partida oficial não aponta para treino', source.guide.includes("'first-match'") && source.guide.includes('APP_ROUTES.TOURNAMENTS'));
  gate('Guia contextual possui introdução de Partida treino', getPageIntroduction(APP_ROUTES.TRAINING_CENTER, '?view=match').title === 'Partida treino');
  gate('Guia contextual possui introdução de Infraestrutura', getPageIntroduction(APP_ROUTES.TRAINING_CENTER, '?view=center').title === 'Estrutura');
  gate('Missão de primeiro treino usa destino canônico', source.missionCatalog.includes('tutorial_route: APP_ROUTES.TRAINING'));
  gate('Missão de estrutura usa destino canônico', source.missionCatalog.includes('tutorial_route: APP_ROUTES.TRAINING_FACILITIES'));
  gate('Fatos de missão continuam distintos por objective_type', source.missionCatalog.includes("objective_type: 'complete_training'") && source.missionCatalog.includes("objective_type: 'visit_training_center'"));
  gate('Bridge diferencia view interna pela query', source.missions.includes('location.search') && source.missions.includes('TRAINING_CENTER_VIEWS'));

  gate('Header global continua fora do hub', !/CareerHud|CommunicationBell|CareerDayControl/.test(source.hub));
  gate('Saldo global continua no Header', source.layout.includes('formatCoinBalance(headerProfile?.coins)'));
  gate('Notification não voltou para dentro do hub', !/CommunicationBell/.test(combinedHub));
  gate('overlayBackStack permanece intacto', source.overlay.includes('stack.pop()'));
  gate('Android Back continua registrado pelo overlay hook', source.overlayHook.includes('registerOverlay'));
  gate('FloatingUtilityRail continua no AppLayout', source.layout.includes('<FloatingUtilityRail'));
  gate('Utility rail mantém safe-area', /safe|pl-floating-utilities/.test(source.utilityRail));
  gate('Sem polling novo', !/setInterval\s*\(/.test(combinedHub));
  gate('Sem observer novo', !/MutationObserver|ResizeObserver|IntersectionObserver/.test(combinedHub));
  gate('Sem storage read no render do hub', !/localStorage|sessionStorage|getItem\(/.test(combinedHub));
  gate('Sem schema/save novo', !/schemaVersion|format_version|save_schema/.test(combinedHub));
  gate('M3.7 continua fora do escopo do hub', !/GameStorage|flushQueue|commitDay/.test(combinedHub));
  gate('Persistência mantém serialização canônica de escritas', source.persistence.includes('writeLocks = new Map()'));
  gate('Torneios não foram acoplados ao hub', !/TrainingCenterView|TRAINING_CENTER_VIEWS/.test(source.tournament));
  gate('Partnership não foi acoplada ao hub', !/TrainingCenterView|TRAINING_CENTER_VIEWS/.test(source.partnership));
  gate('Entrevistas continuam excluindo treino', source.interviews.includes("'training'"));
  gate('Nenhum Math.random novo no hub', !/Math\.random\s*\(/.test(combinedHub));
  gate('Hierarquia z-index preserva header 40', source.css.includes('--z-header: 40'));
  gate('Hierarquia z-index preserva modais 100', source.css.includes('--z-modal: 100'));
  gate('Hierarquia z-index preserva toast 120', source.css.includes('--z-toast: 120'));
  gate('Suíte supera 85 gates', gates > 85);

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL — ${failure}`));
    assert.fail(`Fase 15.5 falhou: ${failures.length}/${gates} gate(s)`);
  }
  console.log(`test:training-center-unification-phase15-5 OK — ${gates} gates`);
} finally {
  await server.close();
}
