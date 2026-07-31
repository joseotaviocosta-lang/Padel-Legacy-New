import { base44 } from '@/api/base44Client';
import { todayForProfile } from './utils';

export async function recordMatchEconomy(profile, coinsGain, won) {
  if (!coinsGain) return null;
  return base44.entities.FinancialTransaction.create({
    profile_id: profile.id,
    date: todayForProfile(profile),
    type: 'income',
    category: 'partida',
    description: won ? 'Premiação por vitória em partida treino' : 'Participação em partida treino',
    amount: coinsGain,
  });
}
