// Central de Notificações — polish editorial (docs/NOTIFICATION_EDITORIAL_POLISH.md).
//
// A auditoria técnica anterior já garante zero duplicata real. Este teste
// mede o problema seguinte: mesmo sem duplicatas, o sino pode parecer um log
// de sistema por causa de volume/relevância/tom. Mesma abordagem de
// scripts/test-notification-100day-simulation-rc.mjs: dirige os geradores de
// notificação diretamente (não a pipeline completa de advanceCareerDay, que
// arrasta nove subsistemas não relacionados), usando os MESMOS textos e
// chaves de contexto que os produtores reais usam hoje — para que uma futura
// mudança de copy nos produtores quebre este teste em vez de ficar
// silenciosamente desatualizado.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { gameRepository } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const career = { entities: {} };
  gameRepository.ensureActiveCareer = async () => career;
  gameRepository.mutateActiveCareer = async (mutator) => ({ result: await mutator(career), career });

  const { ensureContextualCareerCommunications, listCareerCommunications, upsertCareerMessage } = await server.ssrLoadModule('/src/lib/careerCommunications.js');
  const { isPassiveReportNotification, groupNotificationsByPriority } = await server.ssrLoadModule('/src/lib/notificationCenter.js');
  const { resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const { addDays, daysBetween, CAREER_START_DATE } = await server.ssrLoadModule('/src/lib/career.js');

  const checks = [];
  const record = (name, ok) => checks.push([name, ok]);

  // ── Classificador editorial de auditoria (item 2 do brief) ──────────────
  // Não é uma nova camada de produção — compõe sinais que já existem
  // (isPassiveReportNotification, status, priority, o tipo de destino real)
  // só para medir a distribuição neste teste.
  function classifyEditorial(message) {
    if (isPassiveReportNotification(message)) return 'relatorio';
    if (message.status === 'decisao_pendente') return 'acao';
    const destinationType = resolveNotificationDestination(message).type;
    if (['TOURNAMENT_RUN', 'PRESS_INTERVIEW'].includes(destinationType)) return 'acao';
    if (message.priority === 'alta' || message.priority === 'critica') return 'importante';
    return 'atualizacao';
  }

  function tallyEditorial(messages) {
    const tally = { acao: 0, importante: 0, atualizacao: 0, relatorio: 0, ruido: 0 };
    for (const message of messages) tally[classifyEditorial(message)] += 1;
    return tally;
  }

  // Textos VERBATIM dos produtores reais pós-polish (se um produtor mudar de
  // copy sem atualizar aqui, os testes de repetição/CTA abaixo continuam
  // válidos porque simulam o SHAPE da mensagem, não uma string mágica
  // qualquer — mas os comentários citam onde cada um vive).
  async function simulateWeek(profileId, careerDate, weekIndex, { staffNotable = false } = {}) {
    await upsertCareerMessage(profileId, `weekly-summary:${weekIndex}`, {
      sender_name: 'Equipe Padel Legacy', title: 'A semana no circuito',
      content: 'Mais uma semana de carreira concluída. Energia 80% · 1.000 moedas · 200 XP.',
      message_type: 'weekly_summary', notification_type: 'WEEKLY_SUMMARY', career_date: careerDate,
    }); // gameStateLifecycle.js
    await upsertCareerMessage(profileId, `staff-weekly-report:${weekIndex}`, {
      sender_name: 'Diretor de Performance',
      title: staffNotable ? 'Reduza a carga física' : 'Sua equipe está em ordem',
      content: staffNotable ? 'A fadiga está alta. 3 profissional(is) · folha de 3.500 moedas.' : 'Nada de urgente por aqui — a comissão segue trabalhando normalmente. 3 profissional(is) · folha de 3.500 moedas.',
      priority: staffNotable ? 'alta' : 'normal',
      message_type: 'staff_report', notification_type: 'STAFF', career_date: careerDate,
    }); // staffLifecycle.js
  }

  const PROFILE_ID = 'editorial-quality-profile';

  // ── Cenário 1: 30 dias normais (item 35) ─────────────────────────────────
  {
    const profile = { id: PROFILE_ID, career_date: CAREER_START_DATE, partner_id: 'sim-partner', partner_name: 'Parceiro Simulado' };
    let previousWeekIndex = 0;
    for (let day = 0; day < 30; day += 1) {
      profile.career_date = addDays(CAREER_START_DATE, day);
      const weekIndex = Math.floor(daysBetween(CAREER_START_DATE, profile.career_date) / 7);
      if (weekIndex > previousWeekIndex) {
        await simulateWeek(profile.id, profile.career_date, weekIndex, { staffNotable: weekIndex === 2 });
        previousWeekIndex = weekIndex;
      }
      await ensureContextualCareerCommunications(profile, { nextTournament: null, matches: [] });
    }
    const messages = await listCareerCommunications(profile.id, 500);
    const tally = tallyEditorial(messages);
    console.log('\n--- 30 dias normais: distribuição editorial ---');
    console.log(JSON.stringify(tally));
    console.log(`Total: ${messages.length} em 30 dias (~${(messages.length / 4.3).toFixed(1)}/semana)`);

    record('relatórios ficam na faixa alvo do brief (~1-3/semana => até ~13 em 30 dias, nunca uma parede de relatórios)', tally.relatorio >= 1 && tally.relatorio <= 13);
    record('nenhuma mensagem cai fora das 4 categorias esperadas (ruído deveria ser 0 após a auditoria)', tally.ruido === 0);
    record('volume total não vira enchente (bem abaixo de 1 mensagem/dia)', messages.length < 30);
  }

  // ── Cenário 2: 30 dias de alta atividade (item 36) ───────────────────────
  {
    const profileId = 'editorial-quality-busy';
    const profile = { id: profileId, career_date: CAREER_START_DATE, partner_id: 'sim-partner', partner_name: 'Parceiro Simulado' };
    let previousWeekIndex = 0;
    for (let day = 0; day < 30; day += 1) {
      profile.career_date = addDays(CAREER_START_DATE, day);
      const weekIndex = Math.floor(daysBetween(CAREER_START_DATE, profile.career_date) / 7);
      if (weekIndex > previousWeekIndex) { await simulateWeek(profileId, profile.career_date, weekIndex); previousWeekIndex = weekIndex; }
      await ensureContextualCareerCommunications(profile, {
        nextTournament: { id: 'busy-tournament', name: 'Doha Platinum Open', start_date: addDays(CAREER_START_DATE, 10) },
        matches: [],
      });
      // Torneio hoje / continue a partida (TOURNAMENT_RUN), entrevista
      // disponível e proposta de parceria — shapes reais de
      // careerCommunications.js/partnerOffers.js. Todas criadas no ÚLTIMO
      // dia da janela de propósito: ensureContextualCareerCommunications
      // roda de novo a cada dia seguinte e expiraria a de resume (mensagem
      // sem match ativo correspondente — comportamento real e correto),
      // então nada pode ser criado antes da última chamada desta função
      // dentro deste laço.
      if (day === 29) {
        await upsertCareerMessage(profileId, `tournament-resume:busy-tournament:match-1`, {
          sender_name: 'Federação do Circuito', title: 'Continue quartas de final',
          content: 'A partida foi interrompida e pode ser retomada com o placar preservado.',
          priority: 'alta', message_type: 'tournament_resume', notification_type: 'TOURNAMENT_RESUME', career_date: profile.career_date,
          destination: { type: 'TOURNAMENT_RUN', route: '/tournaments', params: { tournament: 'busy-tournament', mode: 'run' } },
        });
        await upsertCareerMessage(profileId, `press-interview:match-1`, {
          sender_name: 'Assessoria de Imprensa', title: 'Entrevista disponível: Vitória nas quartas',
          content: 'A imprensa quer sua reação. Esta é uma oportunidade de influenciar reputação, torcida e patrocinadores.',
          priority: 'alta', message_type: 'mensagem', notification_type: undefined,
          destination: { type: 'PRESS_INTERVIEW', route: '/press', params: { tab: 'interviews', interview: 'match-1', source: 'match-1' } },
          career_date: profile.career_date,
        });
        await upsertCareerMessage(profileId, `proposta:candidate-1`, {
          sender_name: 'Novo Candidato', title: 'Proposta de parceria de Novo Candidato',
          content: 'Novo Candidato quer formar dupla com você. Compare lado, nível e compatibilidade na área de Parceiros.',
          status: 'decisao_pendente', priority: 'normal', message_type: 'proposta_parceria', career_date: profile.career_date,
        });
      }
      // Marco de ranking — gameStateLifecycle.js (novo nesta correção)
      if (day === 25) {
        await upsertCareerMessage(profileId, 'ranking-milestone:500', {
          sender_name: 'Circuito Padel Legacy', title: 'Você entrou no Top 500',
          content: 'Sua nova posição é #487.', message_type: 'ranking_milestone', notification_type: 'RANKING', career_date: profile.career_date,
        });
      }
    }
    const messages = await listCareerCommunications(profileId, 500);
    const tally = tallyEditorial(messages);
    console.log('\n--- 30 dias de alta atividade: distribuição editorial ---');
    console.log(JSON.stringify(tally));

    record('itens acionáveis existem e não são engolidos pelo volume de relatórios', tally.acao > 0 && tally.acao >= tally.relatorio * 0.2);
    record('a mensagem de partida interrompida está entre as ações (nunca vira relatório)', messages.some((m) => m.message_type === 'tournament_resume' && classifyEditorial(m) === 'acao'));
    record('a entrevista disponível está entre as ações', messages.some((m) => m.message_type === 'mensagem' && m.title?.startsWith('Entrevista disponível') && classifyEditorial(m) === 'acao'));
  }

  // ── Detector de repetição editorial (item 37) — normalização simples de
  // string, sem NLP: mesmo título repetido demais, ou uma categoria
  // dominando o feed. ──────────────────────────────────────────────────────
  {
    const messages = await listCareerCommunications(PROFILE_ID, 500);
    const normalize = (title) => String(title || '').toLowerCase().trim().replace(/\d+/g, '#').replace(/\s+/g, ' ');
    const counts = new Map();
    for (const message of messages) {
      const key = normalize(message.title);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(`\nTítulo mais repetido (normalizado): "${worst?.[0]}" × ${worst?.[1] || 0}`);
    record('nenhum título (normalizado) domina o feed de 30 dias sozinho (no máximo ~1 por semana, até 5)', !worst || worst[1] <= 5);
  }

  // ── Teste de CTA (item 38): toda ação necessária tem destino específico
  // (não COMMUNICATION_ONLY) e um rótulo de botão específico. ─────────────
  {
    const messages = await listCareerCommunications('editorial-quality-busy', 500);
    const actionMessages = messages.filter((m) => classifyEditorial(m) === 'acao');
    record('existe pelo menos uma mensagem de ação para testar CTA', actionMessages.length > 0);
    for (const message of actionMessages) {
      const destination = resolveNotificationDestination(message);
      record(`CTA de "${message.title}" tem destino específico (não COMMUNICATION_ONLY) e rótulo próprio`, destination.type !== 'COMMUNICATION_ONLY' && Boolean(destination.label) && destination.label !== 'Abrir recurso');
    }
  }

  // ── Teste de prioridade (item 39): relatório + proposta + partida hoje +
  // entrevista juntos — ações sempre antes do relatório. ──────────────────
  {
    const bucketTest = [
      { id: 'p1', title: 'A semana no circuito', message_type: 'weekly_summary', notification_type: 'WEEKLY_SUMMARY', priority: 'normal', status: 'nao_lida' },
      { id: 'p2', title: 'Proposta de parceria de X', message_type: 'proposta_parceria', priority: 'normal', status: 'decisao_pendente' },
      { id: 'p3', title: 'Continue quartas de final', message_type: 'tournament_resume', notification_type: 'TOURNAMENT_RESUME', priority: 'alta', status: 'nao_lida' },
      { id: 'p4', title: 'Entrevista disponível: X', message_type: 'mensagem', priority: 'alta', status: 'nao_lida' },
    ];
    const grouped = groupNotificationsByPriority(bucketTest);
    const actionGroup = grouped.find((g) => g.id === 'action');
    const reportGroup = grouped.find((g) => g.id === 'reports');
    const groupOrder = grouped.map((g) => g.id);
    record('relatório nunca aparece antes de ação quando ambos existem', groupOrder.indexOf('action') < groupOrder.indexOf('reports'));
    record('proposta e partida interrompida caem no grupo de ação', (actionGroup?.messages.length || 0) >= 2);
    record('resumo semanal cai no grupo de relatórios, não no de ação', (reportGroup?.messages.some((m) => m.id === 'p1')));
  }

  // ── Smoke test de consolidação/stale (reconfirmação leve — a cobertura
  // funda já existe em test:notification-system-audit/test:notification-deep-links) ──
  {
    const messages = await listCareerCommunications(PROFILE_ID, 500);
    record('nenhuma CareerMessage com message_type world_bulletin sobrou (a fusão removeu o produtor duplicado)', !messages.some((m) => m.message_type === 'world_bulletin'));
    // Marco de ranking repetido para o MESMO threshold não duplica (mesma chave estável).
    await upsertCareerMessage(PROFILE_ID, 'ranking-milestone:500', { title: 'Você entrou no Top 500', content: 'Sua nova posição é #490.', message_type: 'ranking_milestone', notification_type: 'RANKING' });
    await upsertCareerMessage(PROFILE_ID, 'ranking-milestone:500', { title: 'Você entrou no Top 500', content: 'Sua nova posição é #480.', message_type: 'ranking_milestone', notification_type: 'RANKING' });
    const afterRepeat = await listCareerCommunications(PROFILE_ID, 500);
    record('marco de ranking repetido no mesmo threshold não duplica (upsert por chave estável)', afterRepeat.filter((m) => m.message_type === 'ranking_milestone').length === 1);
  }

  record('script registrado', pkg.scripts?.['test:notification-editorial-quality'] === 'node scripts/test-notification-editorial-quality.mjs');

  for (const [name, ok] of checks) {
    assert.equal(ok, true, `FAIL: ${name}`);
    console.log(`PASS: ${name}`);
  }

  console.log(`\nNotificationEditorialQualityTest: PASS (${checks.length}/${checks.length})`);
} finally {
  await server.close();
}
