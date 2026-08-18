import { localGame } from '@/api/localGameClient.js';
import { CAREER_START_DATE, daysBetween } from '@/lib/career';
import { safeName } from './utils';
import { processLivingWorldDay, getWeeklyRelevantHighlights } from '@/lib/livingWorldEngine.js';
import { processPartnerDay } from './partnerLifecycle';
import { simulateWorldDay } from './worldSimulationLifecycle';
import { processAiPartnershipMarket } from './aiPartnershipLifecycle';
import { processAiCareerStrategyMonth } from './aiCareerStrategyLifecycle';
import { processWorldCircuit } from './circuitLifecycle';
import { processAthletePersonalityWeek } from './athletePersonalityLifecycle';
import { processInjuryRecoveryDay } from './injuryRecoveryLifecycle';
import { processRelationshipWeek } from './relationshipLifecycle';
import { processStaffDay } from './staffLifecycle';
import { processCircuitLifeWeek } from './circuitLifeLifecycle';
import { compactGameStateReport } from './gameStateReport.js';
import { upsertCareerMessage } from '@/lib/careerCommunications.js';

function monthChanged(oldDate, newDate) {
  return String(oldDate || '').slice(0, 7) !== String(newDate || '').slice(0, 7);
}

// Polish editorial da Central (docs/NOTIFICATION_EDITORIAL_POLISH.md, item 4):
// nenhum produtor de "sua posição no ranking mudou" existia antes desta
// mensagem — pequenas variações (920 -> 918) nunca devem virar notificação;
// só a entrada em uma faixa nova (Top 500/100/10 ou #1). Do menor para o
// maior threshold, para que um salto grande relate só a conquista mais
// exclusiva (não uma notificação por faixa cruzada de uma vez).
const RANKING_MILESTONES = [1, 10, 100, 500];
function rankingMilestoneCrossed(previousPosition, currentPosition) {
  if (!Number.isFinite(currentPosition) || currentPosition <= 0) return null;
  const previous = Number.isFinite(previousPosition) ? previousPosition : Infinity;
  const crossed = RANKING_MILESTONES.filter((threshold) => currentPosition <= threshold && previous > threshold);
  return crossed.length ? Math.min(...crossed) : null;
}

async function createOptional(entityName, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch (error) {
    console.warn(`[Game Core] Falha não crítica em ${entityName}:`, error?.message || error);
    return null;
  }
}

function consumeLifecycleResult(result, fallbackProfile) {
  const nextProfile = result?.profile || fallbackProfile;
  return {
    profile: nextProfile,
    summary: compactGameStateReport(result).report,
  };
}

/**
 * Processa todos os sistemas que devem reagir ao avanço de um dia.
 * Esta função é o ponto central do estado global do jogo a partir da versão 2.2.
 */
export async function processGameStateDay(profile, previousDate, currentDate, { profiler = null } = {}) {
  const stage = profiler ? profiler.measure : (_name, task) => task();
  let updatedProfile = profile;
  const report = {
    previousDate,
    currentDate,
    partner: null,
    world: null,
    aiPartnerships: null,
    aiCareerStrategy: null,
    circuit: null,
    circuitLife: null,
    athleteIntelligence: null,
    medical: null,
    relationships: null,
    staff: null,
    weeklySummary: false,
    monthStarted: false,
  };

  try {
    updatedProfile = await stage('partner', () => processPartnerDay(updatedProfile, previousDate, currentDate));
    report.partner = { processed: true };
  } catch (error) {
    report.partner = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Parceria não processada:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('world', () => simulateWorldDay(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.world = result.summary;
  } catch (error) {
    report.world = { processed: 0, error: error?.message || String(error) };
    console.warn('[Game Core] Mundo não processado:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('aiPartnerships', () => processAiPartnershipMarket(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.aiPartnerships = result.summary;
  } catch (error) {
    report.aiPartnerships = { formed: 0, dissolved: 0, error: error?.message || String(error) };
    console.warn('[Game Core] Mercado de duplas da IA não processado:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('aiCareerStrategy', () => processAiCareerStrategyMonth(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.aiCareerStrategy = result.summary;
  } catch (error) {
    report.aiCareerStrategy = { processed: 0, error: error?.message || String(error) };
    console.warn('[Game Core] Estratégia de carreira da IA não processada:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('circuit', () => processWorldCircuit(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.circuit = result.summary;
  } catch (error) {
    report.circuit = { athletesProcessed: 0, error: error?.message || String(error) };
    console.warn('[Game Core] Circuito mundial não processado:', error);
  }
  try {
    const result = consumeLifecycleResult(
      await stage('circuitLife', () => processCircuitLifeWeek(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.circuitLife = result.summary;
  } catch (error) {
    report.circuitLife = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Vida do circuito nao processada:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('athleteIntelligence', () => processAthletePersonalityWeek(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.athleteIntelligence = result.summary;
  } catch (error) {
    report.athleteIntelligence = { processed: 0, error: error?.message || String(error) };
    console.warn('[Game Core] Inteligência dos atletas não processada:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('medical', () => processInjuryRecoveryDay(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.medical = result.summary;
  } catch (error) {
    report.medical = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Sistema médico não processado:', error);
  }

  try {
    report.relationships = await stage('relationships', () => processRelationshipWeek(updatedProfile, previousDate, currentDate));
  } catch (error) {
    report.relationships = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Relacionamentos não processados:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await stage('staff', () => processStaffDay(updatedProfile, previousDate, currentDate)),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.staff = result.summary;
  } catch (error) {
    report.staff = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Equipe técnica não processada:', error);
  }

  try {
    const summary = await stage('livingWorld', () => processLivingWorldDay(updatedProfile, currentDate));
    report.livingWorld = compactGameStateReport(summary).report;
  } catch (error) {
    report.livingWorld = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Universo vivo não processado:', error);
  }

  // Compara o índice de semana entre previousDate e currentDate (não apenas
  // a data final) para que um avanço de vários dias que cruze 1+ fronteiras
  // de semana não pule silenciosamente o resumo — e usa upsert por chave de
  // contexto estável para nunca duplicar mesmo se chamado mais de uma vez
  // para a mesma transição de data.
  const previousWeekIndex = Math.floor(daysBetween(CAREER_START_DATE, previousDate) / 7);
  const currentWeekIndex = Math.floor(daysBetween(CAREER_START_DATE, currentDate) / 7);
  if (currentWeekIndex > previousWeekIndex) {
    report.weeklySummary = true;
    // Polish editorial da Central (docs/NOTIFICATION_EDITORIAL_POLISH.md):
    // primeira frase conta o que aconteceu, não metadata; números vêm depois
    // em formato compacto. Também absorve os destaques relevantes do mundo
    // (getWeeklyRelevantHighlights, livingWorldEngine.js) — o boletim
    // semanal do circuito parou de gerar uma segunda notificação própria
    // ("Resumo da semana") para não duplicar este resumo.
    const statsLine = `Energia ${Math.round(Number(updatedProfile.energy) || 0)}% · ${(Number(updatedProfile.coins) || 0).toLocaleString('pt-BR')} moedas · ${Number(updatedProfile.xp) || 0} XP`;
    const highlights = await stage('notifications', () => getWeeklyRelevantHighlights(currentDate, { limit: 2 }));
    const highlightsLine = highlights.length ? ` Também no circuito: ${highlights.join('; ')}.` : '';
    const summaryText = `Mais uma semana de carreira concluída. ${statsLine}.${highlightsLine}`;
    await stage('notifications', () => upsertCareerMessage(updatedProfile.id, `weekly-summary:${currentWeekIndex}`, {
      sender_name: 'Equipe Padel Legacy',
      sender_type: 'sistema',
      title: 'A semana no circuito',
      content: summaryText,
      status: 'nao_lida',
      message_type: 'weekly_summary',
      notification_type: 'WEEKLY_SUMMARY',
      career_date: currentDate,
    }));

    const currentPosition = Number(updatedProfile.ranking_position);
    const milestone = rankingMilestoneCrossed(updatedProfile.last_ranking_milestone_position, currentPosition);
    if (milestone) {
      const title = milestone === 1 ? 'Você é o novo #1' : `Você entrou no Top ${milestone}`;
      await stage('notifications', () => upsertCareerMessage(updatedProfile.id, `ranking-milestone:${milestone}`, {
        sender_name: 'Circuito Padel Legacy',
        sender_type: 'federacao',
        title,
        content: `Sua nova posição é #${currentPosition}.`,
        status: 'nao_lida',
        message_type: 'ranking_milestone',
        notification_type: 'RANKING',
        career_date: currentDate,
      }));
      try {
        updatedProfile = await stage('notifications', () => localGame.entities.PlayerProfile.update(updatedProfile.id, { last_ranking_milestone_position: currentPosition }));
      } catch (error) {
        console.warn('[Game Core] Marco de ranking não foi salvo:', error);
      }
    }
  }

  if (monthChanged(previousDate, currentDate)) {
    report.monthStarted = true;
    await stage('notifications', () => createOptional('HistoryEntry', {
      profile_id: updatedProfile.id,
      year: Number(currentDate.slice(0, 4)),
      event_date: currentDate,
      title: `Novo mês da carreira — ${currentDate.slice(0, 7)}`,
      description: `${safeName(updatedProfile)} iniciou um novo mês. Mercado, atletas, contratos e tendências mundiais foram sincronizados pelo GameState.`,
      category: 'carreira',
    }));
  }

  if (updatedProfile?.id) {
    try {
      const persistedReport = compactGameStateReport(report).report;
      updatedProfile = await stage('persist', () => localGame.entities.PlayerProfile.update(updatedProfile.id, {
        game_state_version: '3.5.0',
        game_state_last_processed_date: currentDate,
        game_state_last_report: persistedReport,
      }));
    } catch (error) {
      console.warn('[Game Core] Metadados do GameState não foram salvos:', error);
    }
  }

  return { profile: updatedProfile, report };
}

export function getGameStateSummary(profile) {
  return {
    version: profile?.game_state_version || '2.8.0',
    lastProcessedDate: profile?.game_state_last_processed_date || null,
    lastReport: profile?.game_state_last_report || null,
    worldLastProcessedDate: profile?.last_world_simulation_date || null,
    worldLastSummary: profile?.last_world_simulation_summary || null,
  };
}
