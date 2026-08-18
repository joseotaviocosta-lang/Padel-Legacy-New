// Central de Notificações (docs/ONBOARDING_V3_COMMUNICATIONS.md): QA real
// relatou o sino acumulando relatórios semanais repetidos ("Resumo semanal
// do universo" / "Relatório semanal da comissão" várias vezes em sequência,
// badge 9+). A causa é estrutural: o avanço de calendário tem DOIS pontos de
// entrada independentes para processGameStateDay — avanço de 1 dia
// (dayAdvanceCoordinator) e avanço de vários dias (advanceCareerDays +
// finalizeCareerAdvanceRange) — sem lock compartilhado entre eles. Este
// teste exercita os dois caminhos reais (sem mock do motor) ao longo de 21
// dias, intercala reconciliação de comunicações repetida (abrir/fechar
// Home/Mundo/Comissão) e replays deliberados do mesmo processamento
// (simulando os dois caminhos colidindo na mesma semana/mês), e prova que
// nenhum produtor duplica: nem os já protegidos (resumo semanal, relatório
// semanal da comissão) nem os que só ganharam chave estável nesta correção
// (staff_event, staff_monthly_report, avaliação de patrocínio, avaliação de
// torcida).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay, advanceCareerDays, finalizeCareerAdvanceRange } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { processGameStateDay } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { ensureContextualCareerCommunications } = await server.ssrLoadModule('/src/lib/careerCommunications.js');
  const { evaluateSponsorContracts } = await server.ssrLoadModule('/src/game-core/sponsorLifecycle.js');
  const { evaluateMonthlyFanEngagement } = await server.ssrLoadModule('/src/game-core/fanLifecycle.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-comm-dedup', name: 'QA Comm Dedup' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-player', sport_name: 'QA Player', career_date: '2026-01-20', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, partner_chemistry: 60,
  });
  await localGame.entities.PlayerStaffHire.create({
    id: 'staff-1', profile_id: profile.id, staff_type: 'physical_trainer', contract_status: 'active',
  });

  const countMessages = async (messageType) => {
    const rows = await localGame.entities.CareerMessage.filter({ profile_id: profile.id });
    return rows.filter((row) => row.message_type === messageType).length;
  };

  const refreshProfile = async () => {
    profile = await localGame.entities.PlayerProfile.get(profile.id).catch(() => profile);
    return profile;
  };

  // ── 21 dias reais, pelos DOIS caminhos de entrada independentes ─────────
  // Dias 1-10: avanço de 1 dia por vez (caminho do dayAdvanceCoordinator —
  // processGameStateDay roda a cada dia), intercalado com reconciliação de
  // comunicações repetida (abrir/fechar Home/Mundo/Comissão) e um "reload"
  // simulado (refetch do perfil do zero).
  for (let day = 1; day <= 10; day += 1) {
    profile = await advanceCareerDay(profile, {});
    if (day % 3 === 0) {
      await ensureContextualCareerCommunications(profile, {});
      await ensureContextualCareerCommunications(profile, {}); // reabrir a mesma tela de novo
      await refreshProfile(); // "reload" do app
    }
  }

  // Dias 11-21: avanço de vários dias de uma vez (caminho de
  // advanceCareerDays + finalizeCareerAdvanceRange — o SEGUNDO ponto de
  // entrada, que não compartilha lock com o primeiro).
  const rangeStart = profile.career_date;
  const multiDay = await advanceCareerDays(profile, 11, { stopBeforeCriticalEvent: false });
  profile = multiDay.profile;
  gate('advanceCareerDays avançou os 11 dias pedidos (sem bloqueio inesperado)', multiDay.daysAdvanced === 11);
  profile = await finalizeCareerAdvanceRange(profile, rangeStart, profile.career_date);
  await ensureContextualCareerCommunications(profile, {});

  const weeklySummaryAfter21Days = await countMessages('weekly_summary');
  const staffReportAfter21Days = await countMessages('staff_report');
  console.log(`  [medida] após 21 dias reais (dois caminhos + reconciliação repetida): weekly_summary=${weeklySummaryAfter21Days}, staff_report=${staffReportAfter21Days}`);
  // Não travar num número exato de semanas: weekly_summary usa um índice de
  // semana de carreira (dias desde CAREER_START_DATE) e staff_report usa
  // semana-do-ano-calendário (staffLifecycle.js:weekKey) — épocas diferentes
  // podem legitimamente cruzar 3 ou 4 fronteiras em 21 dias corridos,
  // dependendo do dia da semana em que a carreira começa. O que importa
  // (e é travado com rigor abaixo, no replay) é nunca duplicar dentro da
  // MESMA semana — nunca 6/9/12 por reabertura de tela ou pelos dois
  // caminhos de avanço.
  gate('resumos semanais do universo não explodem em 21 dias (nunca 6/9/12 por reabertura de tela)', weeklySummaryAfter21Days >= 1 && weeklySummaryAfter21Days <= 5);
  gate('relatórios semanais da comissão não explodem em 21 dias', staffReportAfter21Days >= 1 && staffReportAfter21Days <= 5);

  // ── Replay deliberado: simula os dois caminhos colidindo na MESMA janela
  // (exatamente o cenário que gerava duplicatas antes desta correção) ──────
  await processGameStateDay(profile, rangeStart, profile.career_date);
  await processGameStateDay(profile, rangeStart, profile.career_date);
  gate('reprocessar a mesma janela de dias não cria novo resumo semanal (idempotência real, não só teórica)', await countMessages('weekly_summary') === weeklySummaryAfter21Days);
  gate('reprocessar a mesma janela de dias não cria novo relatório da comissão', await countMessages('staff_report') === staffReportAfter21Days);

  // ── Produtores mensais que só ganharam chave estável nesta correção ─────
  const staffEventCount = await countMessages('staff_event');
  const staffMonthlyReportCount = await countMessages('staff_monthly_report');
  console.log(`  [medida] staff_event=${staffEventCount}, staff_monthly_report=${staffMonthlyReportCount} (mês cruzado 1x nos 21 dias)`);
  gate('staff_event nunca duplica dentro do mesmo mês mesmo com dois caminhos de avanço', staffEventCount <= 1);
  gate('staff_monthly_report nunca duplica dentro do mesmo mês', staffMonthlyReportCount <= 1);

  // ── Patrocínio/torcida: disparo por clique (não pelo calendário) — o
  // risco real é um clique duplo rápido, simulado aqui como duas chamadas
  // verdadeiramente concorrentes (Promise.all) para o MESMO mês. ───────────
  await localGame.entities.PlayerContract.create({
    id: 'contract-1', profile_id: profile.id, sponsor_name: 'Patrocinador QA', is_active: true,
    commercial_goals: [], performance_clauses: {}, satisfaction_score: 50,
  });
  await Promise.all([evaluateSponsorContracts(profile), evaluateSponsorContracts(profile)]);
  gate('clique duplo em "avaliar patrocínios" (concorrente) gera no máximo 1 mensagem no mês', await countMessages('sponsor') <= 1);

  await Promise.all([evaluateMonthlyFanEngagement(profile), evaluateMonthlyFanEngagement(profile)]);
  gate('clique duplo em "avaliar torcida" (concorrente) gera no máximo 1 mensagem no mês', await countMessages('fans') <= 1);

  console.log(`\n${gates} gates executados, todos PASS.`);
} finally {
  await server.close();
}
