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

const sources = {
  home: read('src/pages/CareerHub.jsx'),
  layout: read('src/components/AppLayout.jsx'),
  bell: read('src/components/communications/CommunicationBell.jsx'),
  headerContext: read('src/components/career/CareerHeaderContext.jsx'),
  dayControl: read('src/components/career/CareerDayControl.jsx'),
  hud: read('src/components/career/CareerHud.jsx'),
  overlayHook: read('src/components/design-system/useOverlayBehavior.js'),
  overlayStack: read('src/components/design-system/overlayBackStack.js'),
  bottomNav: read('src/components/BottomNav.jsx'),
  utilityRail: read('src/components/system/FloatingUtilityRail.jsx'),
  guide: read('src/components/onboarding/OnboardingGuide.jsx'),
  css: read('src/index.css'),
  tokens: read('src/design/tokens.js'),
  routes: read('src/navigation/routes.js'),
  numberFormat: read('src/lib/numberFormat.js'),
  daySummary: read('src/components/calendar/DayAdvanceSummary.jsx'),
  dayEvents: read('src/components/calendar/DayEventList.jsx'),
  training: read('src/components/training-center/TrainingView.jsx'),
  evolution: read('src/components/training/AttributeEvolution.jsx'),
  tournamentModal: read('src/components/tournaments/TournamentModal.jsx'),
  press: read('src/pages/Press.jsx'),
  interviewModal: read('src/components/press/InterviewModal.jsx'),
  postInterview: read('src/lib/postMatchInterview.js'),
  bracketView: read('src/lib/tournamentBracketView.js'),
  calendarPolicy: read('src/game-core/calendarAdvancePolicy.js'),
  dayAdvance: read('src/game-core/dayAdvanceCoordinator.js'),
  partnership: read('src/lib/partnershipSystem.js'),
  livingCircuit: read('src/game-core/livingCircuitRules.js'),
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { APP_ROUTES } = await server.ssrLoadModule('/src/navigation/routes.js');
  const { formatGameNumber, formatAttributeGain, formatCurrency, formatSignedGameNumber } = await server.ssrLoadModule('/src/lib/numberFormat.js');
  const { formatPercent } = await server.ssrLoadModule('/src/game-core/physicalStats.js');
  const { getCareerNextAction } = await server.ssrLoadModule('/src/lib/careerNextAction.js');
  const { buildCareerHeaderContext } = await server.ssrLoadModule('/src/lib/careerHeaderContext.js');
  const { isOfficialTournamentMatch, postMatchInterviewIdentity, postMatchInterviewMessageId } = await server.ssrLoadModule('/src/lib/postMatchInterview.js');
  const { getTournamentRunPhase } = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { sanitizeBracketHistory, visibleTournamentChampion } = await server.ssrLoadModule('/src/lib/tournamentBracketView.js');

  // Home e ação dominante.
  gate('Home usa o resolver canônico de próxima ação', sources.home.includes("from '@/lib/careerNextAction.js'"));
  gate('Home não mantém o resolver legado getNextStep', !/function getNextStep\s*\(/.test(sources.home));
  gate('Home não renderiza o card duplicado NextEventCard', !/function NextEventCard|<NextEventCard/.test(sources.home));
  gate('Home não renderiza ActiveTournamentBanner concorrente', !/function ActiveTournamentBanner|<ActiveTournamentBanner/.test(sources.home));
  gate('Home preserva Próximo objetivo', sources.home.includes('title="Próximo objetivo"'));
  gate('Home preserva ranking no HUD do atleta', sources.home.includes("label: 'ranking'"));
  gate('Home possui uma única instância da ação dominante', (sources.home.match(/PriorityActionsPanel step=\{heroStep\}/g) || []).length === 1);
  gate('Home removeu os CommandLinks Treinar/Competir/Agenda do hero', !/function CommandLink|<CommandLink/.test(sources.home));
  gate('Ações rápidas não repetem Calendário', !/QuickActionsBar[\s\S]*>Calendário</.test(sources.home));
  gate('Ações rápidas não repetem Torneios', !/QuickActionsBar[\s\S]*>Torneios</.test(sources.home));
  gate('Home usa gaps compactos no bloco principal', sources.home.includes('grid gap-3 xl:grid-cols-12'));
  gate('Painel dominante usa padding compacto', sources.home.includes('<Surface variant="elevated" padding="compact">'));

  const baseProfile = { id: 'phase15-4', partner_id: 'partner', energy: 80, practice_matches_today: 1, trainings_today: 0 };
  gate('Ação normal distinta de torneio futuro é treino', getCareerNextAction(baseProfile).id === 'training');
  gate('Torneio hoje domina treino', getCareerNextAction(baseProfile, { tournamentMatchToday: { route: '/tournaments?tournament=t1' } }).id === 'tournament-match');
  gate('Inscrição pendente domina treino', getCareerNextAction(baseProfile, { tournamentRegistrationNeeded: { route: APP_ROUTES.TOURNAMENTS, name: 'QA Open', daysUntil: 4 } }).id === 'tournament-registration');
  gate('Decisão obrigatória domina inscrição', getCareerNextAction(baseProfile, { mandatoryDecision: { route: APP_ROUTES.CALENDAR }, tournamentRegistrationNeeded: { route: APP_ROUTES.TOURNAMENTS } }).id === 'mandatory-decision');
  gate('Entrevista obrigatória domina treino', getCareerNextAction(baseProfile, { urgentMessage: { route: `${APP_ROUTES.PRESS}?interview=i1` } }).id === 'message');
  gate('Entrevista usa o destino existente', getCareerNextAction(baseProfile, { urgentMessage: { route: `${APP_ROUTES.PRESS}?interview=i1` } }).route.includes('interview=i1'));
  gate('Resolver continua puro e sem storage', !/localStorage|sessionStorage|entities\./.test(read('src/lib/careerNextAction.js')));
  gate('Limite diário de treino continua referenciado pelo resolver', read('src/lib/careerNextAction.js').includes('DAILY_TRAINING_LIMIT'));

  // Header global e fonte canônica de torneio.
  gate('Menu mobile abre NavigationHub', sources.layout.includes('setMobileOpen(true)') && sources.layout.includes('aria-controls="mobile-navigation-drawer"'));
  gate('Menu tem aria-label', sources.layout.includes('aria-label="Abrir navegação"'));
  gate('Torneio do header usa Link', sources.headerContext.includes('<Link'));
  gate('Fallback do torneio usa APP_ROUTES.TOURNAMENTS', sources.headerContext.includes('to={APP_ROUTES.TOURNAMENTS}'));
  gate('Economia mobile usa rota canônica', sources.layout.includes('to={APP_ROUTES.ECONOMY}'));
  gate('Economia desktop usa rota canônica', sources.hud.includes('to: APP_ROUTES.ECONOMY'));
  gate('Data usa rota canônica do calendário', sources.dayControl.includes('navigate(APP_ROUTES.CALENDAR)'));
  gate('Avançar preserva advanceCareerDayOnce', sources.dayControl.includes('advanceCareerDayOnce(profile)'));
  gate('Sino preserva aria-haspopup dialog', sources.bell.includes('aria-haspopup="dialog"'));
  gate('Controles de ícone usam alvo global de 44px', sources.css.includes('.pl-icon-tap { min-height: var(--pl-touch-min); min-width: var(--pl-touch-min); }'));
  gate('Token de toque permanece 44px', sources.css.includes('--pl-touch-min: 2.75rem'));
  gate('Header 360 mantém saldo textual visível', sources.layout.includes('<span className="min-w-0 truncate">{formatCoinBalance(headerProfile?.coins)}</span>'));
  gate('Header 390 libera label compacta de avançar', sources.dayControl.includes('min-[390px]:inline'));
  gate('Header protege o contexto com min-w-0', sources.layout.includes('min-w-0 flex-1'));
  gate('Desktop continua exibindo o contexto de torneio', sources.layout.includes('flex min-w-0 flex-1 items-center'));
  gate('Moedas vêm do profile reativo em memória', sources.layout.includes('formatCoinBalance(headerProfile?.coins)'));
  gate('Header não introduziu setInterval', !/setInterval\s*\(/.test(sources.layout + sources.headerContext + sources.dayControl + sources.bell));
  gate('Header não lê storage durante render do HUD financeiro', !/localStorage|getItem\(/.test(sources.hud));

  const profile = { id: 'p1', career_date: '2026-02-07', energy: 80, fatigue: 20 };
  const future = { id: 'future', name: 'Singapura Masters', start_date: '2026-02-19' };
  const futureHeader = buildCareerHeaderContext({ profile, tournaments: [future] });
  gate('Próximo torneio futuro usa nome correto', futureHeader.label.compact.includes('Singapura Masters'));
  gate('Próximo torneio futuro usa distância correta', futureHeader.daysUntil === 12);
  const run = { status: 'scheduled', currentRound: 1, tournamentName: 'Lisboa Open', matches: [{ date: '2026-02-06', round: 'R16' }, { id: 'qf', date: '2026-02-08', round: 'QF' }] };
  const event = { related_id: 'lisboa', related_name: 'Legado errado', start_date: '2026-02-06', metadata: { tournament_run: run } };
  const activeHeader = buildCareerHeaderContext({ profile, tournaments: [future], calendarEvents: [event] });
  gate('tournament_run ativo vence torneio futuro', activeHeader.tournamentId === 'lisboa');
  gate('Header usa rodada atual, não anterior', activeHeader.label.full.includes('QF') && !activeHeader.label.full.includes('R16'));
  gate('Header usa data da rodada atual, não CalendarEvent legado', activeHeader.daysUntil === 1);
  gate('Evento encerrado não aparece como ativo', buildCareerHeaderContext({ profile, tournaments: [future], calendarEvents: [{ ...event, metadata: { tournament_run: { ...run, status: 'eliminated' } } }] }).tournamentId === 'future');
  gate('Sem evento aplicável, fallback é Torneios', buildCareerHeaderContext({ profile, tournaments: [] }).label.compact === 'Torneios');

  // Overlay de notificações e hierarquia.
  gate('Notification Center usa createPortal', sources.bell.includes('createPortal('));
  gate('Portal monta diretamente em document.body', sources.bell.includes('document.body'));
  gate('Painel não usa mais position absolute relativo ao header', !sources.bell.includes('top-[calc(100%+0.6rem)]'));
  gate('Backdrop cobre 100dvw', sources.bell.includes('w-[100dvw]'));
  gate('Backdrop cobre 100dvh', sources.bell.includes('h-[100dvh]'));
  gate('Overlay bloqueia pointer events da página', sources.bell.includes('pointer-events-auto'));
  gate('Overlay declara scroll lock', sources.bell.includes('data-scroll-lock="body"'));
  gate('Hook compartilhado trava body scroll', sources.overlayHook.includes("document.body.style.overflow = 'hidden'"));
  gate('Lista de notificações tem scroll próprio', sources.bell.includes('data-notification-scroll'));
  gate('Lista contém overscroll-contain', sources.bell.includes('overscroll-contain'));
  gate('Painel respeita safe-area top', sources.bell.includes('pl-safe-t'));
  gate('Painel respeita safe-area bottom', sources.bell.includes('pl-safe-b'));
  gate('Fechar respeita safe-area right', sources.bell.includes('var(--pl-safe-r)'));
  gate('X tem alvo de 44px', sources.bell.includes('h-11 w-11'));
  gate('Android Back registra overlay compartilhado', sources.overlayHook.includes('registerOverlay(overlayId'));
  gate('Back fecha somente o topo', sources.overlayStack.includes('const top = stack.pop()') && sources.overlayStack.includes('top.onBack()'));
  gate('Deep-link fecha painel antes de navegar', /setOpen\(false\);[\s\S]{0,120}resolveAndOpenNotification/.test(sources.bell));
  gate('Badge continua derivado de selector reativo', sources.bell.includes('countUnreadCareerMessages(messages)'));
  gate('Badge continua renderizado no sino', sources.bell.includes('<NotificationBadge count={unread}'));
  gate('Notification layer tem token próprio', sources.css.includes('--z-notification: 80'));
  gate('Token JS espelha notification=80', sources.tokens.includes('notification: 80'));
  gate('Header fica abaixo de notification', sources.css.indexOf('--z-header: 40') >= 0 && sources.css.indexOf('--z-notification: 80') >= 0);
  gate('Floating UI fica abaixo de notification', sources.css.indexOf('--z-floating: 50') >= 0);
  gate('BottomNav fica abaixo de notification', sources.css.indexOf('--z-bottom-nav: 55') >= 0);
  gate('Modais ficam acima de notification', sources.css.indexOf('--z-modal: 100') >= 0);
  gate('Toasts ficam acima de modais', sources.css.indexOf('--z-toast: 120') >= 0);
  gate('Não existe z-[9999] no Notification Center', !/z-\[9999\]/.test(sources.bell));
  gate('FloatingUtilityRail usa layer inferior canônica', sources.utilityRail.includes('pl-floating-utilities'));
  gate('GuideButton usa dropdown=60, inferior a notifications', sources.guide.includes('z-[var(--z-dropdown)]'));

  // Números de UI.
  gate('17.300000000000001 vira 17.3', formatGameNumber(17.300000000000001) === '17.3');
  gate('42.875 vira 43%', formatPercent(42.875) === 43);
  gate('43.806000000000004 vira 43.81', formatAttributeGain(43.806000000000004) === '43.81');
  gate('35.617000000000004 vira 35.62', formatAttributeGain(35.617000000000004) === '35.62');
  gate('Ganho mantém no máximo duas casas', /^\d+\.\d{2}$/.test(formatAttributeGain(2.844)));
  gate('Moedas não exibem fração', formatCurrency(1234.8) === '1.235');
  gate('Número assinado positivo recebe +', formatSignedGameNumber(17.300000000000001) === '+17.3');
  gate('Número assinado negativo não duplica sinal', formatSignedGameNumber(-4.25, { maximumFractionDigits: 2 }) === '-4.25');
  gate('Modal de novo dia usa helper canônico', sources.daySummary.includes('formatSignedGameNumber(item.value'));
  gate('Modal limita energia/fadiga a uma casa', sources.daySummary.includes("['energy', 'fatigue'].includes(item.key) ? 1 : 2"));
  gate('Modal protege overflow entre cards', sources.daySummary.includes('min-w-0 truncate'));
  gate('Calendário não imprime attribute_gain cru', !sources.dayEvents.includes('+{item.attribute_gain}'));
  gate('Training formata penalidade de fadiga', sources.training.includes('formatGameNumber(result.fatiguePenalty'));
  gate('Evolution usa formatAttributeGain', sources.evolution.includes('formatAttributeGain'));
  gate('Precisão interna não é mutada pelo helper', (() => { const value = 17.300000000000001; formatGameNumber(value); return value === 17.300000000000001; })());

  // Pós-jogo e idempotência da entrevista.
  const identity = postMatchInterviewIdentity('match-qa');
  gate('Entrevista tem identidade determinística por match', identity.id === 'interview_match_match-qa');
  gate('Source da entrevista é determinística', identity.sourceId === 'match:match-qa');
  gate('Mensagem da entrevista é determinística', postMatchInterviewMessageId('p1', 'match-qa') === postMatchInterviewMessageId('p1', 'match-qa'));
  gate('Vitória não terminal mantém CTA Dar entrevista', sources.tournamentModal.includes('phase === \'round_result\'') && sources.tournamentModal.includes('onClick={openPostMatchInterview}'));
  gate('Derrota terminal recebe onInterview', /phase === 'eliminated'[\s\S]{0,420}onInterview=\{openPostMatchInterview\}/.test(sources.tournamentModal));
  gate('Título recebe onInterview equivalente', /phase === 'champion'[\s\S]{0,420}onInterview=\{openPostMatchInterview\}/.test(sources.tournamentModal));
  gate('FinalState exibe Dar entrevista', /function FinalState[\s\S]*Dar entrevista/.test(sources.tournamentModal));
  gate('Derrota mostra Eliminado do torneio', sources.tournamentModal.includes("title={champion ? 'CAMPEÃO!' : 'Eliminado do torneio'}"));
  gate('Fluxo terminal retorna à Home após entrevista', sources.tournamentModal.includes(': APP_ROUTES.HOME'));
  gate('Fluxo de vitória intermediária retorna ao torneio', sources.tournamentModal.includes('buildTournamentReturnRoute(tournament.id)'));
  gate('Abertura reutiliza postMatchInterviewIdentity', sources.tournamentModal.includes('postMatchInterviewIdentity(lastResult.match.id)'));
  gate('Persistência usa upsert para mensagem', /type: 'upsert', entityName: 'CareerMessage'/.test(sources.tournamentModal));
  gate('Batch de rodada mantém chave idempotente', sources.tournamentModal.includes('idempotencyKey: `tournament:${freshMatch.id}`'));
  gate('Press marca mensagem lida ao abrir direto', sources.press.includes("status: 'lida', is_read: true, is_new: false"));
  gate('Press resolve mensagem após resposta', read('src/lib/careerCommunications.js').includes("status: 'resolvida', is_read: true, is_new: false"));
  gate('Efeitos são guardados por processed source', sources.press.includes('processed_press_interview_sources'));
  gate('Retry não reaplica efeitos', sources.press.includes('if (answered && alreadyProcessed)'));
  gate('CTA final pós-derrota diz Voltar para a carreira', sources.press.includes("'Voltar para a carreira'"));
  gate('Treino não é partida oficial', !isOfficialTournamentMatch({ id: 'practice', match_type: 'practice', tournament_id: 'fake' }));
  gate('Partida tournament é oficial', isOfficialTournamentMatch({ id: 'official', match_type: 'tournament', tournament_id: 't1' }));
  gate('Whitelist oficial exclui training', sources.postInterview.includes("'training'"));

  // Rotas, torneios futuros e invariantes de regressão.
  gate('Rota canônica Home', APP_ROUTES.HOME === '/game');
  gate('Rota canônica Training', APP_ROUTES.TRAINING === `${APP_ROUTES.TRAINING_CENTER}?view=training`);
  gate('Rota canônica Economy', APP_ROUTES.ECONOMY === '/game/economy');
  gate('Rota canônica Calendar', APP_ROUTES.CALENDAR === '/game/calendar');
  gate('Rota canônica Press', APP_ROUTES.PRESS === '/press');
  gate('Rota canônica Communications', APP_ROUTES.COMMUNICATIONS === '/communications');
  gate('Arquivos tocados não usam rota /training inválida', !/['"]\/training['"]/.test([sources.home, sources.layout, sources.bell, sources.training].join('\n')));
  gate('Arquivos tocados não usam rota /economy inválida', !/['"]\/economy['"]/.test([sources.home, sources.layout, sources.bell].join('\n')));
  gate('Arquivos tocados não usam rota /partnership inválida', !/['"]\/partnership['"]/.test([sources.home, sources.layout, sources.bell].join('\n')));
  const futureTournament = { start_date: '2026-03-01', status: 'inscricoes', champion: 'inválido', bracket_history: [{ round: 'Final', matches: [{ score: '6-0 6-0', winner: 'A' }] }] };
  const sanitized = sanitizeBracketHistory(futureTournament, '2026-02-01');
  gate('Torneio futuro não mostra score', sanitized[0].matches[0].score === null);
  gate('Torneio futuro não mostra winner', sanitized[0].matches[0].winner === null);
  gate('Torneio futuro não mostra champion', visibleTournamentChampion(futureTournament, '2026-02-01') === null);
  gate('Rodada futura permanece waiting', getTournamentRunPhase({ status: 'scheduled', currentRound: 0, meetingsCompleted: { preTournament: true }, matches: [{ date: '2026-02-09', preparationCompleted: false }] }, '2026-02-08') === 'waiting');
  gate('Round atual na data correta não fica waiting', getTournamentRunPhase({ status: 'scheduled', currentRound: 0, meetingsCompleted: { preTournament: true }, matches: [{ date: '2026-02-09', preparationCompleted: false }] }, '2026-02-09') === 'round_preparation');
  gate('Calendário continua usando dueToday', sources.calendarPolicy.includes("DUE_TODAY: 'dueToday'"));
  gate('Avanço continua coordenado por transação única', sources.dayAdvance.includes('advanceCareerDayOnce'));
  gate('Partnership não foi acoplada ao overlay/header', !/CommunicationBell|CareerHeaderContext/.test(sources.partnership));
  gate('Progressão NPC continua no livingCircuitRules', sources.livingCircuit.includes('evolveAthleteCareerMonth'));
  gate('Nenhum Math.random novo em arquivos tocados da UI', !/Math\.random\(/.test([sources.home, sources.layout, sources.bell, sources.tournamentModal, sources.press].join('\n')));
  gate('Nenhum polling novo em arquivos tocados', !/setInterval\s*\(/.test([sources.home, sources.layout, sources.bell, sources.tournamentModal, sources.press].join('\n')));
  gate('Nenhum schema/save novo nos componentes tocados', !/save_schema|format_version|schemaVersion/.test([sources.home, sources.layout, sources.bell, sources.tournamentModal, sources.press].join('\n')));

  gate('Suíte possui pelo menos 70 gates', gates >= 70);

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL — ${failure}`));
    assert.fail(`Fase 15.4 falhou: ${failures.length}/${gates} gate(s)`);
  }
  console.log(`test:phase15-4-mobile-flow-polish OK — ${gates} gates`);
} finally {
  await server.close();
}
