import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  // A carreira ativa real (Tauri/GameStorage) não existe neste ambiente de
  // teste. O singleton gameRepository usado por todos os adaptadores de
  // entidade é substituído por um "career" em memória — mesma técnica de
  // injeção usada em scripts/test-career-systems.mjs, aplicada ao singleton
  // em vez de a uma instância isolada de CareerEntityRepository, já que
  // careerCommunications.js sempre passa por @/api/localGameClient.js.
  const { gameRepository } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const career = { entities: {} };
  gameRepository.ensureActiveCareer = async () => career;
  gameRepository.mutateActiveCareer = async (mutator) => ({ result: await mutator(career), career });

  const {
    ensureContextualCareerCommunications,
    listCareerCommunications,
    markCareerCommunicationRead,
    resolveAndOpenNotification,
    resolveMessage,
    upsertCareerMessage,
  } = await server.ssrLoadModule('/src/lib/careerCommunications.js');
  const { resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const { countUnreadCareerMessages, selectPendingDecisions } = await server.ssrLoadModule('/src/lib/notificationSelectors.js');

  const bell = read('src/components/communications/CommunicationBell.jsx');
  const communications = read('src/pages/Communications.jsx');
  const careerHub = read('src/pages/CareerHub.jsx');
  const careerAssistant = read('src/components/career/CareerAssistant.jsx');
  const partnerHub = read('src/pages/PartnerHub.jsx');
  const inboxPanel = read('src/components/partner/InboxPanel.jsx');
  const partnershipSystem = read('src/lib/partnershipSystem.js');

  const checks = [];
  const record = (name, ok) => checks.push([name, ok]);

  const PROFILE_ID = 'notif-audit-profile';
  const profile = { id: PROFILE_ID, career_date: '2026-01-01' };

  // ── Cenário 1: criar notificação aumenta o badge ──────────────────────────
  const created1 = await ensureContextualCareerCommunications(profile, {
    nextTournament: { id: 'tournament-singapura', name: 'Singapura Masters Open', start_date: '2026-01-08' },
  });
  record('cenário 1: reconciliação cria o lembrete de torneio (marco de 7 dias)', created1.length === 1);
  let messages = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 1: badge sobe para 1 após a criação', countUnreadCareerMessages(messages) === 1);

  // ── Cenários 2/3: clicar marca como lida e o badge desce ──────────────────
  const tournamentReminder = messages[0];
  await markCareerCommunicationRead(tournamentReminder);
  messages = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 2: clicar marca a notificação como lida', messages[0].is_read === true && messages[0].status === 'lida');
  record('cenário 3: badge desce para 0 após a leitura', countUnreadCareerMessages(messages) === 0);

  // ── Cenário 4: reload preserva a leitura ───────────────────────────────────
  const reloaded = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 4: reload (nova consulta) preserva o estado lido', countUnreadCareerMessages(reloaded) === 0 && Boolean(reloaded[0].read_at));

  // ── Cenário 5: clique repetido é idempotente ───────────────────────────────
  const readAtFirstClick = reloaded[0].read_at;
  await markCareerCommunicationRead(reloaded[0]);
  const afterSecondClick = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 5: clique duplo não altera read_at nem duplica leitura', afterSecondClick[0].read_at === readAtFirstClick);

  // ── Cenário 7: torneio abre direto (usa o objeto real gerado no cenário 1) ─
  record('cenário 7: torneio abre direto nos detalhes do torneio', resolveNotificationDestination(tournamentReminder).route === '/tournaments?tournament=tournament-singapura&mode=details');

  // ── Cenário 6: entrevista abre direto ──────────────────────────────────────
  const interviewNotification = {
    id: 'n-interview', related_entity_type: 'PressInterview', related_entity_id: 'interview-9',
    destination: { type: 'PRESS_INTERVIEW', route: '/press', params: { tab: 'interviews', interview: 'interview-9', source: 'match-4' } },
  };
  record('cenário 6: entrevista abre direto na entrevista específica', resolveNotificationDestination(interviewNotification).route === '/press?tab=interviews&interview=interview-9&source=match-4');

  // ── Cenário 8: proposta de dupla abre direto ───────────────────────────────
  const offerNotification = { id: 'n-offer', message_type: 'proposta_parceria', related_entity_id: 'offer-3' };
  record('cenário 8: proposta de dupla abre direto na proposta', resolveNotificationDestination(offerNotification).route === '/partners?view=offers&offer=offer-3');

  // ── Cenário 9: relatório mensal abre direto ────────────────────────────────
  const reportNotification = { id: 'n-report', notification_type: 'MONTHLY_REPORT', related_entity_id: 'monthly-career-report:player-1:2026-01' };
  record('cenário 9: relatório mensal abre direto no relatório do mês', resolveNotificationDestination(reportNotification).route === '/game/monthly-reports?report=monthly-career-report%3Aplayer-1%3A2026-01');

  // ── Cenário 10: missão abre direto ─────────────────────────────────────────
  const missionNotification = { id: 'n-mission', message_type: 'mission_completed', related_entity_id: 'mission-7' };
  record('cenário 10: missão abre direto na missão específica', resolveNotificationDestination(missionNotification).route === '/game/missions?mission=mission-7');

  // ── Cenário 11: lesão abre direto (mesmo formato gravado por injuryRecoveryLifecycle.js) ─
  const injuryNotification = {
    id: 'n-injury', message_type: 'injury_report', notification_type: 'INJURY',
    destination: { type: 'INJURY', route: '/game/calendar', params: { focus: 'recovery' } },
  };
  record('cenário 11: lesão abre direto na recuperação', resolveNotificationDestination(injuryNotification).route === '/game/calendar?focus=recovery');

  // ── Cenário 12: notificação resolvida não aparece mais como pendente ──────
  const coachCondition = await ensureContextualCareerCommunications(
    { ...profile, coach_id: 'coach-1', coach_name: 'Treinador Teste', fatigue: 80 },
    {},
  );
  const pendingBefore = selectPendingDecisions(await listCareerCommunications(PROFILE_ID, 50));
  record('cenário 12: decisão pendente do treinador foi criada', pendingBefore.some((m) => m.id === coachCondition[0]?.id));
  await resolveMessage(coachCondition[0].id, 'follow_recovery');
  const pendingAfter = selectPendingDecisions(await listCareerCommunications(PROFILE_ID, 50));
  record('cenário 12: notificação resolvida some da lista de pendências', !pendingAfter.some((m) => m.id === coachCondition[0]?.id));

  // ── Cenário 13: duplicata é bloqueada (mesma condição, nova chamada) ──────
  const beforeDuplicateCount = (await listCareerCommunications(PROFILE_ID, 50)).length;
  const duplicateAttempt = await ensureContextualCareerCommunications(profile, {
    nextTournament: { id: 'tournament-singapura', name: 'Singapura Masters Open', start_date: '2026-01-08' },
  });
  const afterDuplicateCount = (await listCareerCommunications(PROFILE_ID, 50)).length;
  record('cenário 13: reprocessar a mesma condição não cria uma segunda linha', duplicateAttempt.length === 0 && afterDuplicateCount === beforeDuplicateCount);
  record('cenário 13b: upsert direto com a mesma context key não duplica', await (async () => {
    await upsertCareerMessage(PROFILE_ID, 'dedupe-key-A', { title: 'A', content: 'A' });
    const countAfterFirst = (await listCareerCommunications(PROFILE_ID, 50)).length;
    await upsertCareerMessage(PROFILE_ID, 'dedupe-key-A', { title: 'A (atualizado)', content: 'A' });
    const countAfterSecond = (await listCareerCommunications(PROFILE_ID, 50)).length;
    return countAfterFirst === countAfterSecond;
  })());

  // ── Cenário 14: eventos distintos não são deduplicados entre si ──────────
  const countBeforeDistinct = (await listCareerCommunications(PROFILE_ID, 50)).length;
  await upsertCareerMessage(PROFILE_ID, 'dedupe-key-B', { title: 'B', content: 'B' });
  const countAfterDistinct = (await listCareerCommunications(PROFILE_ID, 50)).length;
  record('cenário 14: uma context key diferente cria uma nova linha', countAfterDistinct === countBeforeDistinct + 1);

  // ── Cenário 15: fallback para Comunicações funciona ────────────────────────
  const unknownNotification = { id: 'n-unknown', message_type: 'algo_nao_mapeado' };
  const unknownDestination = resolveNotificationDestination(unknownNotification);
  record('cenário 15: tipo desconhecido cai no fallback de Comunicações', unknownDestination.type === 'COMMUNICATION_ONLY' && unknownDestination.route === '/communications?message=n-unknown');

  // ── Cenário 16: notificação inválida/expirada não quebra o jogo ──────────
  let noCrashOnEmpty = true;
  try { resolveNotificationDestination(undefined); resolveNotificationDestination({}); } catch { noCrashOnEmpty = false; }
  record('cenário 16a: resolver não quebra com notificação vazia/indefinida', noCrashOnEmpty);
  const expiredNotification = { id: 'n-expired', status: 'expirada' };
  const expiredDestination = resolveNotificationDestination(expiredNotification);
  record('cenário 16b: notificação expirada cai no histórico sem tentar abrir o recurso', expiredDestination.actionable === false && expiredDestination.route === '/communications?message=n-expired');
  const invalidatedNotification = { id: 'n-invalidated', status: 'invalidada', message_type: 'proposta_parceria', related_entity_id: 'offer-9' };
  record('cenário 16c: notificação invalidada também cai no histórico (não tenta abrir a proposta)', resolveNotificationDestination(invalidatedNotification).route === '/communications?message=n-invalidated');

  // ── Regra de expiração automática: decisão pendente com prazo vencido ────
  await upsertCareerMessage(PROFILE_ID, 'expiring-offer-test', {
    title: 'Proposta expirando', content: 'Teste', status: 'decisao_pendente', expires_career_date: '2025-12-31',
  });
  await ensureContextualCareerCommunications(profile, {});
  const afterExpirySweep = await listCareerCommunications(PROFILE_ID, 50);
  const expiredRow = afterExpirySweep.find((m) => m.metadata?.context_key === 'expiring-offer-test');
  record('regra de expiração: decisão pendente com prazo vencido vira "expirada" automaticamente', expiredRow?.status === 'expirada');
  record('regra de expiração: notificação expirada não aparece mais como pendência ativa', !selectPendingDecisions(afterExpirySweep).some((m) => m.id === expiredRow?.id));

  // ── Lembrete de torneio expira quando o próximo torneio muda ──────────────
  const afterTournamentChange = await ensureContextualCareerCommunications(profile, {
    nextTournament: { id: 'tournament-rio', name: 'Rio Open', start_date: '2026-01-08' },
  });
  const rowsAfterTournamentChange = await listCareerCommunications(PROFILE_ID, 50);
  const oldTournamentReminder = rowsAfterTournamentChange.find((m) => m.metadata?.tournament_id === 'tournament-singapura');
  const newTournamentReminder = rowsAfterTournamentChange.find((m) => m.metadata?.tournament_id === 'tournament-rio');
  record('regra de expiração: lembrete do torneio anterior expira quando o próximo torneio muda', oldTournamentReminder?.status === 'expirada');
  record('regra de expiração: lembrete do novo torneio é criado normalmente', Boolean(newTournamentReminder) && afterTournamentChange.some((m) => m.metadata?.tournament_id === 'tournament-rio'));

  // ── Mobile M2 (docs/MOBILE_M2_SHELL.md): comportamento real do handler
  //    central, não só a string "resolveNotificationDestination" existindo em
  //    algum arquivo. O bug real (marca como lida mas não navega) só seria
  //    pego testando a FUNÇÃO executando, com um navigate falso capturando
  //    chamadas — por isso os cenários 17-20 chamam resolveAndOpenNotification
  //    de verdade em vez de só ler o código-fonte como texto. ───────────────
  await upsertCareerMessage(PROFILE_ID, 'm2-mission-test', {
    title: 'Missão concluída', content: 'Teste M2', message_type: 'mission_completed', related_entity_id: 'mission-m2',
  });
  const missionMessage = (await listCareerCommunications(PROFILE_ID, 50)).find((m) => m.metadata?.context_key === 'm2-mission-test');
  const navCalls17 = [];
  const dest17 = await resolveAndOpenNotification(missionMessage, { navigate: (route) => navCalls17.push(route) });
  record('cenário 17: notificação com destino navega no primeiro toque (mesmo handler do sino e da Central)', navCalls17.length === 1 && navCalls17[0] === '/game/missions?mission=mission-m2' && dest17.route === '/game/missions?mission=mission-m2');
  const afterMissionRead = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 17b: markAsRead não substitui navigate — os dois acontecem no mesmo toque', afterMissionRead.find((m) => m.id === missionMessage.id)?.is_read === true);

  const navCalls18 = [];
  await resolveAndOpenNotification(missionMessage, { navigate: (route) => navCalls18.push(route) });
  record('cenário 18: notificação já lida não perde a ação de navegar ao tocar de novo', navCalls18.length === 1 && navCalls18[0] === '/game/missions?mission=mission-m2');

  await upsertCareerMessage(PROFILE_ID, 'm2-plain-test', { title: 'Aviso do sistema', content: 'Sem destino específico' });
  const plainMessage = (await listCareerCommunications(PROFILE_ID, 50)).find((m) => m.metadata?.context_key === 'm2-plain-test');
  const navCalls19 = [];
  await resolveAndOpenNotification(plainMessage, { navigate: (route) => navCalls19.push(route) });
  const afterPlainRead = await listCareerCommunications(PROFILE_ID, 50);
  record('cenário 19: notificação sem destino específico não navega arbitrariamente (nem para Home)', navCalls19.length === 0);
  record('cenário 19b: mesmo sem destino, ainda marca como lida', afterPlainRead.find((m) => m.id === plainMessage.id)?.is_read === true);

  const navCalls20 = [];
  let noCrashOnInvalid = true;
  try {
    await resolveAndOpenNotification({ id: 'n-m2-invalid', status: 'expirada' }, { navigate: (route) => navCalls20.push(route) });
  } catch { noCrashOnInvalid = false; }
  record('cenário 20: destino inválido/expirado não lança exceção (fallback seguro, sem tela branca)', noCrashOnInvalid);
  record('cenário 20b: destino inválido/expirado não navega', navCalls20.length === 0);

  record('sino e Central de Comunicações usam o mesmo handler central (resolveAndOpenNotification)', bell.includes('resolveAndOpenNotification') && communications.includes('resolveAndOpenNotification'));

  // ── Estrutural: 1 contador único (5 pontos de leitura usam o mesmo seletor) ─
  record('contador único: sino usa notificationSelectors.js', bell.includes("from '@/lib/notificationSelectors.js'") && bell.includes('countUnreadCareerMessages'));
  record('contador único: Comunicações usa notificationSelectors.js', communications.includes("from '@/lib/notificationSelectors.js'"));
  record('contador único: CareerHub usa notificationSelectors.js', careerHub.includes("from '@/lib/notificationSelectors.js'"));
  record('contador único: CareerAssistant usa notificationSelectors.js', careerAssistant.includes("from '@/lib/notificationSelectors.js'"));
  record('contador único: PartnerHub usa notificationSelectors.js', partnerHub.includes("from '@/lib/notificationSelectors.js'"));

  // ── Estrutural: 1 única superfície de leitura/resolução (partnershipSystem não duplica mais) ─
  record('fonte única: partnershipSystem.js não exporta mais getInbox/getUnreadCount/markMessageRead/resolveMessage/dismissMessage', (
    !partnershipSystem.includes('export async function getInbox')
    && !partnershipSystem.includes('export async function getUnreadCount')
    && !partnershipSystem.includes('export async function markMessageRead')
    && !partnershipSystem.includes('export async function resolveMessage')
    && !partnershipSystem.includes('export async function dismissMessage')
  ));
  record('fonte única: InboxPanel usa careerCommunications.js para ler/marcar/resolver', (
    inboxPanel.includes("from '@/lib/careerCommunications.js'")
    && inboxPanel.includes('listCareerCommunications')
    && inboxPanel.includes('markCareerCommunicationRead')
  ));

  // ── Script registrado ───────────────────────────────────────────────────
  record('script registrado', pkg.scripts?.['test:notification-system-audit'] === 'node scripts/test-notification-system-audit-rc.mjs');

  for (const [name, ok] of checks) {
    assert.equal(ok, true, `FAIL: ${name}`);
    console.log(`PASS: ${name}`);
  }

  console.log(`NotificationSystemAuditRCTest: PASS (${checks.length}/${checks.length})`);
} finally {
  await server.close();
}
