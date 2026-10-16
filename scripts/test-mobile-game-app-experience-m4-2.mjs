// M4.2 — Game/App Experience (docs/MOBILE_M4_2_GAME_APP_EXPERIENCE.md).
//
// Puramente estrutural/source-text, no mesmo padrão já estabelecido pelas
// fases M4.1.x — screenshot-driven QA física continua sendo a fonte da
// verdade para "parece um jogo, não um site" (Parte 44); este script prova
// que o código real contém os elementos/atalhos/handlers que a auditoria
// (Parte 2) e as mudanças (Partes 6/7/10/11/13/19/20) declaram existir.
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');

const careerHub = read('src/pages/CareerHub.jsx');
const tournaments = read('src/pages/Tournaments.jsx');
const calendarPage = read('src/pages/CalendarPage.jsx');
const calendarPlanner = read('src/components/calendar/CalendarPlanner.jsx');
const navigationHub = read('src/pages/NavigationHub.jsx');
const navigationConfig = read('src/navigation/navigationConfig.js');
const bottomNav = read('src/components/BottomNav.jsx');
const appLayout = read('src/components/AppLayout.jsx');
const matches = read('src/pages/Matches.jsx');
const communications = read('src/pages/Communications.jsx');

// ═══════════════════════════════════════════════════════════════════════
// Parte 36 — Rotina diária: Home → Treinos → treino → Home → Calendário → avança dia → Home
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 36: rotina diária ---');
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): atalhos diretos da Home = HomeQuickActions (Treinar) + agenda pelo atalho de data do header + Competir na barra inferior.
gate('Home oferece atalhos diretos (Treinar na Home, Agenda no atalho de data do header, Competir na barra inferior) sem precisar de menu', /data-home-quick-actions/.test(careerHub) && /\{ to: APP_ROUTES\.TRAINING, icon: Dumbbell, label: 'Treinar' \}/.test(careerHub) && /navigate\(APP_ROUTES\.CALENDAR\)/.test(read('src/components/career/CareerDayControl.jsx')) && /'\/competitions'|competition/.test(bottomNav + navigationConfig));
gate('Home escuta padel:profile-updated (evita stale state após treino/avanço de dia)', /addEventListener\('padel:profile-updated'/.test(careerHub));
gate('Home escuta padel:career-advanced (evita stale state após avanço de dia)', /addEventListener\('padel:career-advanced'/.test(careerHub));
gate('Home tem uma ação principal clara ("O que fazer agora" / PriorityActionsPanel)', /O que fazer agora/.test(careerHub));
gate('Calendário continua expondo avanço de dia (+1 dia/+3 dias/+1 semana) sem alteração de lógica', /handleAdvanceDay/.test(calendarPage) && /handleAdvancePeriod\(3\)/.test(calendarPage) && /handleAdvancePeriod\(7\)/.test(calendarPage));
gate('Calendário escuta eventos de perfil/avanço (mesmo mecanismo já existente, não um novo event bus)', /addEventListener\('padel:profile-updated'/.test(calendarPage) && /addEventListener\('padel:career-advanced'/.test(calendarPage));

// ═══════════════════════════════════════════════════════════════════════
// Parte 37 — Fluxo de torneio: Home → torneio atual → Tournament Focus → jogar → retorno
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 37: fluxo de torneio (só apresentação, nenhuma lógica nova) ---');
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): o CTA de torneio ativo da Home reaproveita buildTournamentPlayRoute.
gate('Home computa a rota de competir reaproveitando buildTournamentPlayRoute (mesmo helper do deep link)', /buildTournamentPlayRoute\(activeRun\.event\.related_id\)/.test(careerHub));
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): o modo foco virou o CompetitionHeroCard (5.29).
gate('Foco de competição (CompetitionHeroCard) existe em Tournaments.jsx', /function CompetitionHeroCard/.test(tournaments) && tournaments.includes('data-competition-hero'));
gate('Tournament Focus aparece quando há torneio ativo (activeRunEvents) OU inscrição confirmada (registeredTournaments)', /focusRunTournamentId = activeRunEvents\.size > 0/.test(tournaments) && /focusRegisteredTournament = !focusRunTournament && nextTournament && registeredTournaments\.has/.test(tournaments));
gate('Tournament Focus reaproveita handlePlay (mesmo handler que os cards da lista já usam, nenhuma lógica duplicada)', /onPlay=\{\(\) => handlePlay\(focusTournament\)\}/.test(tournaments));
gate('Foco de competição reaproveita setBracketTournament/setDetailsTournament existentes', /onViewBracket=\{\(t\) => setBracketTournament\(t\)\}/.test(tournaments) && /onViewDetails=\{\(t\) => setDetailsTournament\(t\)\}/.test(tournaments));
gate('Tournament Focus lê o adversário do mesmo campo (match.opponent) que TournamentRunManager.js já usa pra montar team_b — nenhum dado inventado', /activeMatch\?\.opponent/.test(tournaments));
gate('Foco de competição é renderizado ANTES das abas/lista (event-first, não catalog-first)', tournaments.indexOf('<CompetitionHeroCard') > -1 && tournaments.indexOf('<CompetitionHeroCard') < tournaments.indexOf('<Tabs'));

// ═══════════════════════════════════════════════════════════════════════
// Parte 38 — Navegação (12 gates pedidos pelo briefing)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 38: navegação ---');
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): ação principal = HomeNextCommitment (hero único) + HomeQuickActions.
gate('1. Home oferece ação principal (próximo compromisso) e ações rápidas', /<HomeNextCommitment commitment=\{homeCommitment\} step=\{heroStep\}/.test(careerHub) && /<HomeQuickActions /.test(careerHub));
gate('2. Treinos acessível pela Home (ação rápida "Treinar")', /\{ to: APP_ROUTES\.TRAINING, icon: Dumbbell, label: 'Treinar' \}/.test(careerHub));
gate('3. Competir acessível pela BottomNav (grupo "competition" está entre os 5 destinos da barra, M4.1.3 preservada)', /label: 'Competir'/.test(navigationConfig) && /const TAB_GROUP_IDS = \['home', 'career', 'competition', 'world'\]/.test(bottomNav));
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): Calendário sai do menu e fica no atalho de data do header (1 toque) e como alias de Competir.
gate('4. Calendário acessível sem hamburger (atalho de data no header, alias do grupo Competir)', /navigate\(APP_ROUTES\.CALENDAR\)/.test(read('src/components/career/CareerDayControl.jsx')) && /aliases: \['\/game\/calendar'/.test(navigationConfig));
gate('5. Torneios acessível sem hamburger (grupo Competir → item direto)', /to: '\/tournaments', icon: Award, label: 'Torneios'/.test(navigationConfig));
gate('6. Ranking acessível via Competir (mesmo grupo)', /to: '\/ranking', icon: Trophy, label: 'Ranking'/.test(navigationConfig));
gate('7. Dupla acessível via Carreira (grupo "career")', /\{ to: '\/partners', icon: Handshake, label: 'Minha dupla' \}/.test(navigationConfig));
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): Técnicos e Comissão vivem no hub Carreira → Equipe.
gate('8. Técnicos acessível via Carreira (Equipe → Treinador)', /to: APP_ROUTES\.CAREER_TEAM, icon: GraduationCap, label: 'Equipe'/.test(navigationConfig) && /key: 'coach'|label: 'Treinador'/.test(read('src/pages/hubs/TeamHub.jsx')));
gate('9. Comissão acessível via Carreira (Equipe → Comissão)', /key: 'staff', label: 'Comissão'/.test(read('src/pages/hubs/TeamHub.jsx')));
gate('10. Rotina diária possível sem hamburger — Carreira/Competir da BottomNav abrem um HUB (NavigationHub), não dependem do menu lateral', /to: '\/development'/.test(navigationConfig) && /to: '\/competitions'/.test(navigationConfig) && /LEGACY_AREA_TO_GROUP, NAV_GROUPS/.test(navigationHub));
gate('11. Hamburger (drawer mobile) continua funcional — AppLayout ainda monta NavigationGroups completo no drawer', /id="mobile-navigation-drawer"/.test(appLayout) && /<NavigationGroups/.test(appLayout));
const appJsxSource = read('src/App.jsx');
gate('12. Deep-links antigos continuam válidos — rotas das 4 hubs legadas (/development, /team-hub, /competitions, /management) preservadas', ['/development', '/team-hub', '/competitions', '/management'].every((route) => appJsxSource.includes(`path="${route}"`)));

// ═══════════════════════════════════════════════════════════════════════
// Parte 39 — First viewport: ordem de composição (proxy estrutural, não pixels)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 39: proxy estrutural de first-viewport (ordem de composição no DOM/JSX) ---');
// Home: identidade → próximo objetivo/evento → "o que fazer agora" ANTES de "jornada"/histórico.
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): identidade/estado (HomeStatusCard) antes do próximo compromisso.
gate('Home: estado do atleta (HomeStatusCard) vem antes do próximo compromisso (HomeNextCommitment)', careerHub.indexOf('<HomeStatusCard') > -1 && careerHub.indexOf('<HomeStatusCard') < careerHub.indexOf('<HomeNextCommitment'));
gate('Home: prioridades (HomePriorities) vêm antes da agenda e do progresso (histórico)', careerHub.indexOf('<HomePriorities') > -1 && careerHub.indexOf('<HomePriorities') < careerHub.indexOf('<HomeAgenda') && careerHub.indexOf('<HomeAgenda') < careerHub.indexOf('<HomeProgress'));
// Treinos (M4.1.3): validado pelo teste dedicado já existente — confirmado aqui que continua intacto.
const training = read('src/pages/Training.jsx');
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): Treinos vivem no Centro de Treinamento: painel "Hoje" (hub) antes das abas; atividades em TrainingView.
gate('Treinos: estado (painel Hoje) vem antes das abas, e as atividades existem no conteúdo da aba', read('src/pages/TrainingCenter.jsx').indexOf('data-training-today') > -1 && read('src/pages/TrainingCenter.jsx').indexOf('data-training-today') < read('src/pages/TrainingCenter.jsx').indexOf('<Tabs') && read('src/components/training-center/TrainingView.jsx').includes('Atividades de treino'));
// Torneios: header → CareerStatusBar → Tournament Focus (quando existe) → abas/lista.
gate('Torneios: foco de competição vem antes das abas', tournaments.indexOf('<CompetitionHeroCard') > -1 && tournaments.indexOf('<CompetitionHeroCard') < tournaments.indexOf('<Tabs'));
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): o gate antigo passava por acaso (indexOf de '<PremiumPageHeader' = -1). O contexto agora é o próprio CompetitionHeroCard, o primeiro bloco.
gate('Torneios: contexto do próximo evento (CompetitionHeroCard) é o primeiro bloco de conteúdo', tournaments.indexOf('<CompetitionHeroCard') > -1 && tournaments.indexOf('<CompetitionHeroCard') < tournaments.indexOf('<Tabs') && tournaments.includes('Próximo evento'));
// Partidas: ação (Jogar agora, no header) vem antes de "Recentes" (histórico).
// CLOUD-2 (substituído — Home 5.30 / Torneios 5.29 / navegação em hubs): Partidas = PracticeMatchView (Matches.jsx só redireciona).
gate('Partidas: ação "Jogar partida treino" vem antes do "Histórico recente"', read('src/components/training-center/PracticeMatchView.jsx').indexOf('Jogar partida treino') > -1 && read('src/components/training-center/PracticeMatchView.jsx').indexOf('Jogar partida treino') < read('src/components/training-center/PracticeMatchView.jsx').indexOf('Histórico recente'));
// Calendário: semana/avanço vem antes do disclosure de planejamento (secundário).
gate('Calendário: grupo de avanço de dia vem antes do disclosure "Planejar atividade"', calendarPage.indexOf('handleAdvanceDay') < calendarPage.indexOf('CollapsibleSection icon={CalendarPlus}'));
gate('Calendário: "Planejar atividade" está atrás de um disclosure fechado por padrão (não um formulário sempre aberto)', /<CollapsibleSection icon=\{CalendarPlus\} title="Planejar atividade"/.test(calendarPage) && !/defaultOpen/.test(calendarPage.match(/<CollapsibleSection icon=\{CalendarPlus\}[\s\S]{0,200}/)[0]));
// Dupla: HUD de status vem antes das abas de detalhe.
const partnerHub = read('src/pages/PartnerHub.jsx');
gate('Dupla: header com HUD de status (entrosamento/confiança/ofertas) vem antes das abas de detalhe', partnerHub.indexOf('hudItems={[') < partnerHub.indexOf('<Tabs'));
// Comunicações: já é inbox por padrão — confirma que continua assim.
gate('Comunicações: lista em linhas (inbox), não cards grandes — cada mensagem é um <button> de linha única', /<button type="button" key=\{message\.id\}/.test(communications));

console.log(`\n${gates} gates executados, todos PASS — Game/App Experience (M4.2): rotina diária, fluxo de torneio, navegação, first-viewport.`);
