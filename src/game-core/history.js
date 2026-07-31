import { localGame } from '@/api/localGameClient.js';
import { safeName, todayForProfile } from './utils';

export async function recordCareerHistory(profile, won, partnerName, score) {
  return localGame.entities.HistoryEntry.create({
    profile_id: profile.id,
    year: Number(todayForProfile(profile).slice(0, 4)),
    event_date: todayForProfile(profile),
    title: won ? 'Vitória em partida treino' : 'Partida treino disputada',
    description: `${safeName(profile)} e ${partnerName}: ${score}`,
    category: 'carreira',
  });
}
