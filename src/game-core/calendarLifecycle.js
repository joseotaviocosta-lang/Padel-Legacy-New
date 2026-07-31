import { advanceDay, CAREER_START_DATE } from '@/lib/career';
import { processGameStateDay } from './gameStateLifecycle';

/**
 * Única porta de entrada para avançar o calendário do jogador.
 * A partir da versão 2.2, os demais sistemas são coordenados pelo GameState.
 */
export async function advanceCareerDay(profile) {
  const oldDate = profile?.career_date || CAREER_START_DATE;
  const advancedProfile = await advanceDay(profile);
  const newDate = advancedProfile?.career_date || oldDate;
  const result = await processGameStateDay(advancedProfile, oldDate, newDate);
  return result.profile || advancedProfile;
}
