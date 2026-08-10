import { localGame } from '@/api/localGameClient.js';
import { CAREER_START_DATE, daysBetween } from '@/lib/career';
import { safeName } from './utils';
import { tickWorldAfterMatch } from './world';
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

function monthChanged(oldDate, newDate) {
  return String(oldDate || '').slice(0, 7) !== String(newDate || '').slice(0, 7);
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
export async function processGameStateDay(profile, previousDate, currentDate) {
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
    updatedProfile = await processPartnerDay(updatedProfile, previousDate, currentDate);
    report.partner = { processed: true };
  } catch (error) {
    report.partner = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Parceria não processada:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await simulateWorldDay(updatedProfile, previousDate, currentDate),
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
      await processAiPartnershipMarket(updatedProfile, previousDate, currentDate),
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
      await processAiCareerStrategyMonth(updatedProfile, previousDate, currentDate),
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
      await processWorldCircuit(updatedProfile, previousDate, currentDate),
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
      await processCircuitLifeWeek(updatedProfile, previousDate, currentDate),
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
      await processAthletePersonalityWeek(updatedProfile, previousDate, currentDate),
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
      await processInjuryRecoveryDay(updatedProfile, previousDate, currentDate),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.medical = result.summary;
  } catch (error) {
    report.medical = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Sistema médico não processado:', error);
  }

  try {
    report.relationships = await processRelationshipWeek(updatedProfile, previousDate, currentDate);
  } catch (error) {
    report.relationships = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Relacionamentos não processados:', error);
  }

  try {
    const result = consumeLifecycleResult(
      await processStaffDay(updatedProfile, previousDate, currentDate),
      updatedProfile,
    );
    updatedProfile = result.profile;
    report.staff = result.summary;
  } catch (error) {
    report.staff = { processed: false, error: error?.message || String(error) };
    console.warn('[Game Core] Equipe técnica não processada:', error);
  }

  // Mantém o sistema mundial já existente funcionando em paralelo durante a migração.
  try {
    await tickWorldAfterMatch(updatedProfile);
  } catch (error) {
    console.warn('[Game Core] Tick legado do mundo não processado:', error);
  }

  const elapsed = daysBetween(CAREER_START_DATE, currentDate);
  if (elapsed > 0 && elapsed % 7 === 0) {
    report.weeklySummary = true;
    await createOptional('CareerMessage', {
      profile_id: updatedProfile.id,
      sender_name: 'Equipe Padel Legacy',
      subject: 'Resumo semanal do universo',
      body: `${safeName(updatedProfile)}, você encerrou a semana com ${Number(updatedProfile.energy) || 0} de energia, ${(Number(updatedProfile.coins) || 0).toLocaleString('pt-BR')} moedas e ${Number(updatedProfile.xp) || 0} XP. O circuito mundial também foi atualizado.`,
      status: 'nao_lida',
      message_type: 'weekly_summary',
      created_date: new Date().toISOString(),
    });
  }

  if (monthChanged(previousDate, currentDate)) {
    report.monthStarted = true;
    await createOptional('HistoryEntry', {
      profile_id: updatedProfile.id,
      year: Number(currentDate.slice(0, 4)),
      event_date: currentDate,
      title: `Novo mês da carreira — ${currentDate.slice(0, 7)}`,
      description: `${safeName(updatedProfile)} iniciou um novo mês. Mercado, atletas, contratos e tendências mundiais foram sincronizados pelo GameState.`,
      category: 'carreira',
    });
  }

  if (updatedProfile?.id) {
    try {
      const persistedReport = compactGameStateReport(report).report;
      updatedProfile = await localGame.entities.PlayerProfile.update(updatedProfile.id, {
        game_state_version: '3.5.0',
        game_state_last_processed_date: currentDate,
        game_state_last_report: persistedReport,
      });
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
