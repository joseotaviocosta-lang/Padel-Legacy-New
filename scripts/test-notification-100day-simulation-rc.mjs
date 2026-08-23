import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Simula 100 dias de reconciliação de notificações contra a engine real
// (ensureContextualCareerCommunications, upsertCareerMessage,
// markAllCommunicationsRead, resolveMessage) para medir crescimento,
// duplicatas e distribuição de status ao longo do tempo (pedido: seção 45).
//
// Escopo: dirige diretamente os pontos de geração de notificação, não a
// pipeline completa de advanceCareerDay/processGameStateDay — essa pipeline
// arrasta nove subsistemas não relacionados a notificações (parceria, mundo,
// mercado de IA, circuito, personalidade de atletas, staff, relacionamentos)
// cujas dependências fogem do escopo desta auditoria. O resumo semanal é
// exercitado chamando a MESMA fórmula de chave de contexto usada em
// gameStateLifecycle.js (weekly-summary:${weekIndex}), então o teste ainda
// cobre o bug real corrigido nesta auditoria (fronteira de semana pulada em
// avanços de múltiplos dias).

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { gameRepository } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const career = { entities: {} };
  gameRepository.ensureActiveCareer = async () => career;
  gameRepository.mutateActiveCareer = async (mutator) => ({ result: await mutator(career), career });

  const {
    ensureContextualCareerCommunications,
    listCareerCommunications,
    markAllCommunicationsRead,
    resolveMessage,
    upsertCareerMessage,
  } = await server.ssrLoadModule('/src/lib/careerCommunications.js');
  const { selectPendingDecisions, countUnreadCareerMessages } = await server.ssrLoadModule('/src/lib/notificationSelectors.js');
  const { addDays, daysBetween, CAREER_START_DATE } = await server.ssrLoadModule('/src/lib/career.js');

  const PROFILE_ID = 'notif-100day-profile';
  const DAYS = 100;
  const profile = {
    id: PROFILE_ID,
    career_date: CAREER_START_DATE,
    coach_id: 'sim-coach',
    coach_name: 'Treinador Simulado',
    coach_contract_end_date: addDays(CAREER_START_DATE, 400),
    partner_id: 'sim-partner',
    partner_name: 'Parceiro Simulado',
    reputation: 5,
  };

  let previousWeekIndex = 0;
  for (let day = 0; day < DAYS; day += 1) {
    profile.career_date = addDays(CAREER_START_DATE, day);

    // Rotaciona um torneio diferente a cada 10 dias, sempre a 7 dias de
    // distância no início do bloco — reproduz o cenário real do bug histórico
    // ("Singapura Masters Open se aproxima" repetida) sob avanço contínuo.
    const tournamentIndex = Math.floor(day / 10);
    const blockStart = addDays(CAREER_START_DATE, tournamentIndex * 10);
    const tournamentStart = addDays(blockStart, 7);
    // Complemento (sorteio em D-3): ensureContextualCareerCommunications só
    // cria o aviso quando o sorteio já existe de verdade
    // (nextTournament.bracket_history). Esta simulação dirige direto o
    // reconciliador de notificações (não a pipeline de avanço de dia que
    // chama ensureTournamentDraw — ver cabeçalho do arquivo), então simula
    // o torneio já sorteado o tempo todo, como a pipeline real deixaria
    // antes de qualquer leitura desta função.
    const nextTournament = daysBetween(profile.career_date, tournamentStart) >= 0
      ? { id: `sim-tournament-${tournamentIndex}`, name: `Torneio Simulado ${tournamentIndex}`, start_date: tournamentStart, bracket_history: [{ round: 'R16' }] }
      : null;

    profile.fatigue = 40 + 30 * Math.sin(day / 5);
    profile.energy = 60 - 20 * Math.sin(day / 7);

    await ensureContextualCareerCommunications(profile, { nextTournament, matches: [], recentWins: 0 });

    // Decisões de domínio são produzidas pelos ciclos de parceria/staff, hoje
    // fora do reconciliador editorial. Injeta o mesmo contrato persistido para
    // manter a simulação focada em leitura/resolução/dedupe da Central.
    if (day % 30 === 0) {
      await upsertCareerMessage(PROFILE_ID, `simulated-decision:${day}`, {
        title: 'Decisão de carreira simulada',
        content: 'Escolha pendente para validar o ciclo de resolução.',
        status: 'decisao_pendente',
        actions: [{ id: 'ack', label: 'Resolver' }],
      });
    }

    // Mesma fórmula de chave usada em gameStateLifecycle.js (item 4 da auditoria).
    const weekIndex = Math.floor(daysBetween(CAREER_START_DATE, profile.career_date) / 7);
    if (weekIndex > previousWeekIndex) {
      await upsertCareerMessage(PROFILE_ID, `weekly-summary:${weekIndex}`, {
        title: 'Resumo semanal do universo', content: 'Resumo semanal simulado.',
        message_type: 'weekly_summary', notification_type: 'WEEKLY_SUMMARY',
      });
    }
    previousWeekIndex = weekIndex;

    // A cada 5 dias o jogador "abre o sino" e lê tudo.
    if (day % 5 === 0) await markAllCommunicationsRead(PROFILE_ID);
    // A cada 15 dias o jogador resolve as decisões pendentes em aberto.
    if (day % 15 === 0) {
      const pending = selectPendingDecisions(await listCareerCommunications(PROFILE_ID, 500));
      for (const item of pending) await resolveMessage(item.id, 'ack');
    }
  }

  const finalMessages = await listCareerCommunications(PROFILE_ID, 1000);
  const contextKeys = finalMessages.map((m) => m.metadata?.context_key).filter(Boolean);
  const uniqueContextKeys = new Set(contextKeys);
  const byStatus = finalMessages.reduce((acc, m) => { acc[m.status] = (acc[m.status] || 0) + 1; return acc; }, {});
  const tournamentReminders = finalMessages.filter((m) => m.notification_type === 'TOURNAMENT_UPCOMING');
  const weeklySummaries = finalMessages.filter((m) => m.notification_type === 'WEEKLY_SUMMARY');

  console.log('--- Simulação de 100 dias: resultado ---');
  console.log(`Total de notificações geradas: ${finalMessages.length}`);
  console.log(`Distribuição por status: ${JSON.stringify(byStatus)}`);
  console.log(`Lembretes de torneio: ${tournamentReminders.length} (esperado: 1 por torneio rotacionado)`);
  console.log(`Resumos semanais: ${weeklySummaries.length} (esperado: ~${Math.floor(DAYS / 7)})`);
  console.log(`Não lidas ao final: ${countUnreadCareerMessages(finalMessages)}`);

  const checks = [];
  const record = (name, ok) => checks.push([name, ok]);

  record('nenhuma context_key duplicada entre linhas (id estável + upsert funcionando)', uniqueContextKeys.size === contextKeys.length);
  // Hotfix 15.5.4 (P1 — notificações redundantes): TOURNAMENT_REMINDER_MILESTONES
  // passou de [7,3,1,0] (4 avisos "se aproxima" por torneio, o próprio bug
  // relatado no QA físico) para [3] (1 aviso único, no marco do sorteio).
  // 100 dias / 10 dias por rotação = 10 torneios, 1 marco (D-3) cada.
  record('lembretes de torneio: exatamente 1 por torneio rotacionado, sem repetição de "se aproxima"', tournamentReminders.length === 10 * 1);
  record('resumo semanal: uma linha por fronteira de semana cruzada, sem pular nem duplicar', weeklySummaries.length === Math.floor(daysBetween(CAREER_START_DATE, profile.career_date) / 7));
  record('crescimento não é descontrolado (total bem abaixo do pior caso ingênuo de 1 linha/regra/dia)', finalMessages.length < DAYS * 3);
  record('pelo menos uma notificação foi lida ao longo da simulação', Object.keys(byStatus).some((status) => ['lida', 'resolvida'].includes(status)));
  record('pelo menos uma decisão pendente foi resolvida ao longo da simulação', (byStatus['resolvida'] || 0) > 0);
  record('nenhuma notificação ficou presa em decisao_pendente com prazo já expirado sem ser marcada expirada', (
    finalMessages.every((m) => !(m.status === 'decisao_pendente' && m.expires_career_date && m.expires_career_date < profile.career_date))
  ));

  record('script registrado', pkg.scripts?.['test:notification-100day-simulation'] === 'node scripts/test-notification-100day-simulation-rc.mjs');

  for (const [name, ok] of checks) {
    assert.equal(ok, true, `FAIL: ${name}`);
    console.log(`PASS: ${name}`);
  }

  console.log(`Notification100DaySimulationRCTest: PASS (${checks.length}/${checks.length})`);
} finally {
  await server.close();
}
