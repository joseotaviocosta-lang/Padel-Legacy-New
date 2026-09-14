import { buildAthleteEntryContext, ENTRY_PATHS, evaluateTournamentEntry, PRIORITY_WINDOW_N } from '../worldTour/EntryManager.js';
import { getTournamentTierConfig } from '@/lib/circuitCatalog.js';
import { hasScheduleConflict } from '@/lib/calendarSystem.js';

export function runWorldTourEntryFlowTest() {
  const elite = { id: 'elite-1', tier: 'Elite', min_ranking: 120, qualifying_size: 16, country: 'Espanha', start_date: '2028-03-10' };
  const direct = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 80, elite));
  const qualifying = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 180, elite));
  const blocked = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 500, elite));
  const wildcard = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25, wildcard_tokens: 1 }, 500, elite));
  const conflicts = hasScheduleConflict([
    { id: 'a', status: 'scheduled', start_date: '2028-03-10', end_date: '2028-03-16' },
  ], '2028-03-12', '2028-03-15');

  // Fase 8.1, item 4 — cenário do pedido: jogador com rank RUIM (fora até
  // do qualifying, rank 5000 num tier cujo `qualifyingLimit` do `elite`
  // acima é 240), sem nenhuma das outras exceções. Antes desta fase,
  // `blocked` (rank 500) e este caso (rank 5000) eram idênticos:
  // INELIGIBLE, sem NENHUM caminho de volta — exatamente a espiral de
  // exclusão da Fase 7, nunca corrigida pro jogador (achado da Fase 8 §3).
  const noRecourse = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25 }, 5000, elite));
  // Com `priority_window_remaining` ativo (concedido ao vencer o
  // qualifying, ver TournamentModal.jsx), o MESMO jogador de rank 5000
  // entra garantido — resolve a situação em UMA inscrição, não exige
  // reconstruir rank primeiro (a mesma lógica validada pra IA na Fase
  // 7.3/7.4, agora reaproveitada aqui via `PRIORITY_WINDOW_N`, EntryManager.js).
  const priorityWindow = evaluateTournamentEntry(elite, buildAthleteEntryContext({ age: 25, priority_window_remaining: PRIORITY_WINDOW_N }, 5000, elite));

  // Fase 8.1, item 2 — antes desta fase, só Crown tinha `qualifyingSize`
  // configurado no catálogo real (TOURNAMENT_TIER_CONFIG); Gold/Platinum/
  // Masters/Elite não tinham NENHUM caminho de qualifying pro jogador,
  // mesmo com rank badly acima do corte direto. Lido do catálogo de
  // verdade (não um mock ad-hoc como `elite` acima), confirma que a
  // extensão pegou nos 4 tiers.
  const goldConfig = getTournamentTierConfig('Gold');
  const goldTournament = { id: 'gold-1', tier: 'Gold' };
  const goldQualifying = evaluateTournamentEntry(goldTournament, buildAthleteEntryContext({ age: 25 }, 500, goldTournament));

  const checks = {
    direct: direct.path === ENTRY_PATHS.DIRECT && direct.eligible,
    qualifying: qualifying.path === ENTRY_PATHS.QUALIFYING && qualifying.eligible,
    blocked: blocked.path === ENTRY_PATHS.INELIGIBLE && !blocked.eligible,
    wildcard: wildcard.path === ENTRY_PATHS.WILDCARD && wildcard.eligible,
    conflict: conflicts.length === 1,
    noRecourseStillBlocked: noRecourse.path === ENTRY_PATHS.INELIGIBLE && !noRecourse.eligible,
    priorityWindowResolves: priorityWindow.path === ENTRY_PATHS.PRIORITY_WINDOW && priorityWindow.eligible,
    goldQualifyingSizeConfigured: Number(goldConfig.qualifyingSize) > 0,
    goldQualifyingPathAvailable: goldQualifying.path === ENTRY_PATHS.QUALIFYING && goldQualifying.eligible,
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

if (typeof window !== 'undefined') window.PadelWorldTourEntryFlowTest = { run: runWorldTourEntryFlowTest };
