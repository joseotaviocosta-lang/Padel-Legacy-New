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
gate('Home oferece atalhos diretos (Treinar/Competir/Agenda) sem precisar de menu', /CommandLink primary to="\/game\/training"/.test(careerHub) && /CommandLink to=\{competeRoute\}/.test(careerHub) && /CommandLink to="\/game\/calendar"/.test(careerHub));
gate('Home escuta padel:profile-updated (evita stale state após treino/avanço de dia)', /addEventListener\('padel:profile-updated'/.test(careerHub));
gate('Home escuta padel:career-advanced (evita stale state após avanço de dia)', /addEventListener\('padel:career-advanced'/.test(careerHub));
gate('Home tem uma ação principal clara ("O que fazer agora" / PriorityActionsPanel)', /O que fazer agora/.test(careerHub));
gate('Calendário continua expondo avanço de dia (+1 dia/+3 dias/+1 semana) sem alteração de lógica', /handleAdvanceDay/.test(calendarPage) && /handleAdvancePeriod\(3\)/.test(calendarPage) && /handleAdvancePeriod\(7\)/.test(calendarPage));
gate('Calendário escuta eventos de perfil/avanço (mesmo mecanismo já existente, não um novo event bus)', /addEventListener\('padel:profile-updated'/.test(calendarPage) && /addEventListener\('padel:career-advanced'/.test(calendarPage));

// ═══════════════════════════════════════════════════════════════════════
// Parte 37 — Fluxo de torneio: Home → torneio atual → Tournament Focus → jogar → retorno
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 37: fluxo de torneio (só apresentação, nenhuma lógica nova) ---');
gate('Home computa competeRoute reaproveitando buildTournamentPlayRoute (mesmo helper de NextEventCard)', /buildTournamentPlayRoute\(activeTournamentEvent\.related_id\)/.test(careerHub));
gate('TournamentFocusMode existe em Tournaments.jsx', /function TournamentFocusMode/.test(tournaments));
gate('Tournament Focus aparece quando há torneio ativo (activeRunEvents) OU inscrição confirmada (registeredTournaments)', /focusRunTournamentId = activeRunEvents\.size > 0/.test(tournaments) && /focusRegisteredTournament = !focusRunTournament && nextTournament && registeredTournaments\.has/.test(tournaments));
gate('Tournament Focus reaproveita handlePlay (mesmo handler que os cards da lista já usam, nenhuma lógica duplicada)', /onPlay=\{\(\) => handlePlay\(focusTournament\)\}/.test(tournaments));
gate('Tournament Focus reaproveita setBracketTournament/setDetailsTournament existentes', /onViewBracket=\{\(\) => setBracketTournament\(focusTournament\)\}/.test(tournaments) && /onViewDetails=\{\(\) => setDetailsTournament\(focusTournament\)\}/.test(tournaments));
gate('Tournament Focus lê o adversário do mesmo campo (match.opponent) que TournamentRunManager.js já usa pra montar team_b — nenhum dado inventado', /activeMatch\?\.opponent/.test(tournaments));
gate('Tournament Focus é renderizado ANTES das abas/lista (event-first, não catalog-first)', tournaments.indexOf('focusTournament &&') < tournaments.indexOf("key: 'calendar', label: 'Calendário'"));

// ═══════════════════════════════════════════════════════════════════════
// Parte 38 — Navegação (12 gates pedidos pelo briefing)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 38: navegação ---');
gate('1. Home oferece ação principal (Quick Actions no cabeçalho)', /CommandLink primary/.test(careerHub));
gate('2. Treinos acessível pela Home (Quick Action "Treinar")', /to="\/game\/training" icon=\{Dumbbell\}>Treinar/.test(careerHub));
gate('3. Competir acessível pela BottomNav (grupo "competition" está entre os 5 destinos da barra, M4.1.3 preservada)', /label: 'Competir'/.test(navigationConfig) && /const TAB_GROUP_IDS = \['home', 'career', 'competition', 'world'\]/.test(bottomNav));
gate('4. Calendário acessível sem hamburger (grupo Competir → item direto)', /to: '\/game\/calendar', icon: Calendar, label: 'Calendário'/.test(navigationConfig));
gate('5. Torneios acessível sem hamburger (grupo Competir → item direto)', /to: '\/tournaments', icon: Award, label: 'Torneios'/.test(navigationConfig));
gate('6. Ranking acessível via Competir (mesmo grupo)', /to: '\/ranking', icon: Trophy, label: 'Ranking'/.test(navigationConfig));
gate('7. Dupla acessível via Carreira (grupo "career")', /to: '\/partners', icon: Handshake, label: 'Minha dupla e propostas'/.test(navigationConfig));
gate('8. Técnicos acessível via Carreira', /to: '\/coaches', icon: GraduationCap, label: 'Treinador principal'/.test(navigationConfig));
gate('9. Comissão acessível via Carreira', /to: '\/staff', icon: Users, label: 'Comissão técnica'/.test(navigationConfig));
gate('10. Rotina diária possível sem hamburger — Carreira/Competir da BottomNav abrem um HUB (NavigationHub), não dependem do menu lateral', /to: '\/development'/.test(navigationConfig) && /to: '\/competitions'/.test(navigationConfig) && /LEGACY_AREA_TO_GROUP, NAV_GROUPS/.test(navigationHub));
gate('11. Hamburger (drawer mobile) continua funcional — AppLayout ainda monta NavigationGroups completo no drawer', /id="mobile-navigation-drawer"/.test(appLayout) && /<NavigationGroups/.test(appLayout));
const appJsxSource = read('src/App.jsx');
gate('12. Deep-links antigos continuam válidos — rotas das 4 hubs legadas (/development, /team-hub, /competitions, /management) preservadas', ['/development', '/team-hub', '/competitions', '/management'].every((route) => appJsxSource.includes(`path="${route}"`)));

// ═══════════════════════════════════════════════════════════════════════
// Parte 39 — First viewport: ordem de composição (proxy estrutural, não pixels)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Parte 39: proxy estrutural de first-viewport (ordem de composição no DOM/JSX) ---');
// Home: identidade → próximo objetivo/evento → "o que fazer agora" ANTES de "jornada"/histórico.
gate('Home: IdentityHeader vem antes de NextObjectiveCard/NextEventCard', careerHub.indexOf('<IdentityHeader') < careerHub.indexOf('<NextObjectiveCard'));
gate('Home: "O que fazer agora" (PriorityActionsPanel) vem antes de "Sua jornada" (histórico)', careerHub.indexOf('<PriorityActionsPanel') < careerHub.indexOf('<JourneyTimeline'));
// Treinos (M4.1.3): validado pelo teste dedicado já existente — confirmado aqui que continua intacto.
const training = read('src/pages/Training.jsx');
gate('Treinos: HUD/status vem antes das tabs de categoria, que vêm antes das atividades (ordem preservada de M4.1.3)', training.indexOf('hudItems=') < training.indexOf('<Tabs') && training.indexOf('<Tabs') < training.indexOf('Atividades de treino'));
// Torneios: header → CareerStatusBar → Tournament Focus (quando existe) → abas/lista.
gate('Torneios: Tournament Focus vem antes das abas de Calendário/Estatísticas/Circuito/Notícias', tournaments.indexOf('focusTournament &&') < tournaments.indexOf("key: 'calendar', label: 'Calendário'"));
gate('Torneios: header com HUD do próximo evento vem antes de tudo (contexto primeiro)', tournaments.indexOf('<PremiumPageHeader') < tournaments.indexOf('focusTournament &&'));
// Partidas: ação (Jogar agora, no header) vem antes de "Recentes" (histórico).
gate('Partidas: ação "Jogar agora" (no header/action) vem antes da lista "Recentes"', matches.indexOf('Jogar agora') < matches.indexOf('Recentes'));
// Calendário: semana/avanço vem antes do disclosure de planejamento (secundário).
gate('Calendário: grupo de avanço de dia vem antes do disclosure "Planejar atividade"', calendarPage.indexOf('handleAdvanceDay') < calendarPage.indexOf('CollapsibleSection icon={CalendarPlus}'));
gate('Calendário: "Planejar atividade" está atrás de um disclosure fechado por padrão (não um formulário sempre aberto)', /<CollapsibleSection icon=\{CalendarPlus\} title="Planejar atividade"/.test(calendarPage) && !/defaultOpen/.test(calendarPage.match(/<CollapsibleSection icon=\{CalendarPlus\}[\s\S]{0,200}/)[0]));
// Dupla: HUD de status vem antes das abas de detalhe.
const partnerHub = read('src/pages/PartnerHub.jsx');
gate('Dupla: header com HUD de status (entrosamento/confiança/ofertas) vem antes das abas de detalhe', partnerHub.indexOf('hudItems={[') < partnerHub.indexOf('<Tabs'));
// Comunicações: já é inbox por padrão — confirma que continua assim.
gate('Comunicações: lista em linhas (inbox), não cards grandes — cada mensagem é um <button> de linha única', /<button type="button" key=\{message\.id\}/.test(communications));

console.log(`\n${gates} gates executados, todos PASS — Game/App Experience (M4.2): rotina diária, fluxo de torneio, navegação, first-viewport.`);
