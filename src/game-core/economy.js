import { localGame } from '@/api/localGameClient.js';
import { todayForProfile } from './utils';

export async function recordMatchEconomy(profile, coinsGain, won) {
  if (!coinsGain) return null;
  return localGame.entities.FinancialTransaction.create({
    profile_id: profile.id,
    date: todayForProfile(profile),
    type: 'income',
    category: 'partida',
    description: won ? 'Premiação por vitória em partida treino' : 'Participação em partida treino',
    amount: coinsGain,
  });
}
