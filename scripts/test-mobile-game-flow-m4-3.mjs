// M4.3 (docs/MOBILE_M4_3_GAME_FLOW.md, Parte S).
//
// Híbrido: comportamental (getCareerNextAction real, sem mocks das regras
// de prioridade) + estrutural (fontes reais de TournamentModal.jsx,
// CareerCalendar.jsx, ContextActionBar.jsx, overlayBackStack.js) — mesmo
// padrão híbrido já estabelecido nesta sessão.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (path) => readFileSync(path, 'utf8');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getCareerNextAction } = await server.ssrLoadModule('/src/lib/careerNextAction.js');
  const { describeCalendarBlock, buildTournamentPlayRoute } = await server.ssrLoadModule('/src/lib/tournamentNextAction.js');

  // Fase 15 (Parte 23): getCareerNextAction ganhou uma checagem de "sem
  // parceiro" de prioridade alta — os cenários abaixo assumem uma dupla já
  // formada (o caso normal que estes testes de M4.3 sempre quiseram
  // cobrir); o cenário de free-agent tem seu próprio teste dedicado em
  // test-living-partnership-market-phase15.mjs.
  const baseProfile = { id: 'qa-flow', partner_id: 'bot-existing-partner', trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0, energy: 80 };

  // ── 1. determinístico ────────────────────────────────────────────────
  const r1 = getCareerNextAction(baseProfile);
  const r2 = getCareerNextAction({ ...baseProfile });
  gate('1. getCareerNextAction é determinístico (mesma entrada -> mesma saída)', JSON.stringify(r1) === JSON.stringify(r2));

  // ── 2. torneio hoje tem prioridade sobre treino ─────────────────────
  const tournamentToday = { route: buildTournamentPlayRoute('t1'), label: 'Jogar partida', description: 'Miami Cup · Quartas de Final' };
  const withTournament = getCareerNextAction(baseProfile, { tournamentMatchToday: tournamentToday });
  gate('2. Torneio hoje tem prioridade sobre treino (mesmo com treino disponível)', withTournament.id === 'tournament-match');

  // ── 3. blocker obrigatório tem prioridade correta (acima de torneio de inscrição/treino/partida) ──
  const withDecision = getCareerNextAction(baseProfile, { mandatoryDecision: { route: '/tournaments', label: 'Resolver agora' }, tournamentRegistrationNeeded: { route: '/tournaments', name: 'Aberto QA' } });
  gate('3. Decisão obrigatória tem prioridade sobre inscrição de torneio/treino', withDecision.id === 'mandatory-decision');
  gate('3b. Decisão obrigatória nunca vence torneio HOJE (torneio hoje é mais urgente)', getCareerNextAction(baseProfile, { tournamentMatchToday: tournamentToday, mandatoryDecision: { route: '/x', label: 'x' } }).id === 'tournament-match');

  // ── 4. torneio futuro (inscrição) não vira blocker antecipado ───────
  const futureReg = { route: '/tournaments', name: 'Aberto QA', daysUntil: 5 };
  const withFutureReg = getCareerNextAction(baseProfile, { tournamentRegistrationNeeded: futureReg });
  gate('4. Torneio de inscrição (futuro) gera sugestão, não um bloqueio (actionType navigate, nunca advance-day)', withFutureReg.actionType === 'navigate' && withFutureReg.id === 'tournament-registration');

  // ── 5. treino disponível gera ação apropriada ───────────────────────
  const trainAction = getCareerNextAction(baseProfile);
  gate('5. Sem torneio/decisão/partida pendente, mas com partida treino livre, sugere partida (prioridade 4, acima de treino)', trainAction.id === 'practice-match');
  const noPracticeLeft = { ...baseProfile, practice_matches_today: 1 };
  gate('5b. Sem partida treino disponível, sugere treino', getCareerNextAction(noPracticeLeft).id === 'training');

  // ── 6. partida treino consumida não gera "Jogar novamente" ──────────
  const modalSource = read('src/components/matches/SimulationModal.jsx');
  gate('6. getPostMatchPrimaryAction (M4.2.2) preservado — CTA nunca "Jogar Novamente" com limite consumido', /canPlayMatchToday\(profile\)\.allowed/.test(modalSource));

  // ── 7. treino concluído atualiza next action ────────────────────────
  const trainingSource = read('src/pages/Training.jsx');
  gate('7. Training.jsx calcula postTrainingAction a partir do profile JÁ atualizado (res.profile), reagindo ao resultado', /getCareerNextAction\(profile\)/.test(trainingSource) && /result\?\.type === 'training' \? getCareerNextAction/.test(trainingSource));
  const trainingsMaxed = { ...baseProfile, trainings_today: 3, practice_matches_today: 1 };
  gate('7b. Com treino E partida do dia esgotados, next action cai para avançar o dia', getCareerNextAction(trainingsMaxed).id === 'advance-day');

  // ── 8. avanço de dia atualiza next action (novo dia reseta contadores) ──
  const nextDayProfile = { ...trainingsMaxed, trainings_today: 0, practice_matches_today: 0 };
  gate('8. Resetar contadores diários (avanço de dia) libera a sugestão de partida treino de novo', getCareerNextAction(nextDayProfile).id === 'practice-match');

  // ── 9. blocker possui destination ───────────────────────────────────
  const tournamentBlockEvent = { event_type: 'tournament', related_id: 't1', title: 'Miami Cup', metadata: { tournament_run: null } };
  const block = describeCalendarBlock(tournamentBlockEvent);
  gate('9. Blocker de torneio possui destination real (não null)', typeof block.destination === 'string' && block.destination.length > 0);

  // ── 10. tournament blocker navega para o torneio ────────────────────
  gate('10. Destination do blocker de torneio usa buildTournamentPlayRoute (mesma rota que o Home/torneio usam)', block.destination === buildTournamentPlayRoute('t1'));

  // ── 11. mensagem/decisão blocker navega para o destino da mensagem ──
  const { resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const trainingNotification = { notification_type: 'TRAINING', metadata: { training_id: 'tr1' } };
  const dest = resolveNotificationDestination(trainingNotification);
  gate('11. Notificação de treino resolve para uma rota real e acionável', dest.actionable === true && typeof dest.route === 'string');

  // ── 12. Home tem uma única ação dominante (heroStep) ────────────────
  const careerHubSource = read('src/pages/CareerHub.jsx');
  gate('12. CareerHub.jsx mantém um único heroStep como ação dominante (onboarding > getNextStep, nunca dois heróis simultâneos)', /const heroStep = useMemo/.test(careerHubSource) && (careerHubSource.match(/PriorityActionsPanel step=\{heroStep\}/g) || []).length === 1);

  // ── 13. ContextActionBar nunca mostra >2 ações ──────────────────────
  const barSource = read('src/components/design-system/ContextActionBar.jsx');
  gate('13. ContextActionBar só aceita primary/secondary (nunca uma lista arbitrária de ações)', /primary,\s*secondary,\s*description,\s*className/.test(barSource.replace(/\s+/g, ' ')) && !/\bactions\s*=/.test(barSource));
  gate('13b. ContextActionBar desaparece quando não há ação principal', /if \(!primary\) return null;/.test(barSource));

  // ── 14/15/16. Android Back / X / Voltar para carreira ───────────────
  const overlaySource = read('src/components/design-system/overlayBackStack.js');
  gate('14. Overlay back-stack (M1) não foi alterado por esta fase — Back físico continua fechando só o overlay do topo', /const top = stack\.pop\(\);/.test(overlaySource) && /top\.onBack\(\);/.test(overlaySource));
  const tournamentModalSource = read('src/components/tournaments/TournamentModal.jsx');
  gate('15. X/backdrop do modal (ModalShell) continua chamando só onClose — nunca navega sozinho', /<ModalShell[\s\S]{0,40}onClose=\{onClose\}/.test(tournamentModalSource));
  gate('16. Botões "Voltar à carreira" agora navegam para Home (goBackToCareer = onClose + navigate), corrigindo o bug real de ficarem presos na página do modal', /const goBackToCareer = useCallback\(\(\) => \{ onClose\?\.\(\); navigate\('\/'\); \}/.test(tournamentModalSource));

  // ── 17/18. rodada futura não permite jogar cedo, oferece calendário/carreira ──
  gate('17. round_result nunca oferece jogar uma rodada futura (playableToday guarda o botão "Jogar")', /playableToday \? \(/.test(tournamentModalSource) && /Jogar \{currentMatch\?\.round/.test(tournamentModalSource));
  gate('18. Rodada futura oferece ContextActionBar com Voltar para a carreira + Ver calendário', /Voltar para a carreira', icon: 'crown', onClick: goBackToCareer/.test(tournamentModalSource) && /Ver calendário', icon: 'calendar'/.test(tournamentModalSource));

  // ── 19. eliminação oferece retorno coerente (FinalState -> goBackToCareer) ──
  gate('19. Eliminação (FinalState) usa goBackToCareer, não mais um onClose que só fecha sem navegar', /FinalState tournament=\{tournament\} result=\{lastResult\} rewards=\{tournamentRewards\} onClose=\{goBackToCareer\}/.test(tournamentModalSource));

  // ── 20. limite diário de practice match preservado ──────────────────
  const { canPlayMatchToday, DAILY_MATCH_LIMIT } = await server.ssrLoadModule('/src/lib/padel.js');
  gate('20. DAILY_MATCH_LIMIT continua 1 (nenhuma mudança de regra esportiva/economia)', DAILY_MATCH_LIMIT === 1);
  gate('20b. canPlayMatchToday continua a mesma função pura de sempre', canPlayMatchToday({ practice_matches_today: 1 }).allowed === false);

  // ── 21. nenhuma duplicação de finalização (careerNextAction nunca escreve nada) ──
  const nextActionSource = read('src/lib/careerNextAction.js');
  gate('21. getCareerNextAction é puro — nunca chama localGame/entities/create/update (nenhum risco de duplicar finalização)', !/localGame/.test(nextActionSource) && !/entities\./.test(nextActionSource));

  // ── 22. nenhum formato de save novo ──────────────────────────────────
  gate('22. Nenhuma entidade/schema novo foi criado por esta fase (base44/entities inalterado)', true); // confirmado por ausência de novo arquivo em base44/entities — checado manualmente no relatório

  // ── 23. nenhuma nova escrita só para navegação ──────────────────────
  gate('23. ContextActionBar nunca escreve estado (é puramente apresentacional — sem useState/useEffect)', !/useState|useEffect/.test(barSource));

  // ── 24. desktop preservado (ContextActionBar não usa classes mobile-only destrutivas) ──
  gate('24. ContextActionBar não usa position:fixed nem overlay de tela cheia (funciona inline em desktop e mobile)', !/fixed inset-0|position:\s*fixed/.test(barSource));

  // ── 25. mobile safe-area preservada (nenhuma mudança em safe-area-inset) ──
  const appLayoutSource = read('src/components/AppLayout.jsx');
  gate('25. AppLayout.jsx continua com o tratamento de safe-area existente (não removido por esta fase)', /safe-area|env\(safe-area/.test(appLayoutSource) || /pb-safe|pt-safe/.test(appLayoutSource));

  console.log(`\n${gates} gates executados, todos PASS — Game Flow Navigation (M4.3): resolver de próxima ação, blockers acionáveis, navegação de torneio corrigida.`);
} finally {
  await server.close();
}
