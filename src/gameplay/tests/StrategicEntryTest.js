import { evaluateTournamentEntry } from '../worldTour/EntryManager.js';

export function runStrategicEntryTest() {
  const direct = evaluateTournamentEntry({ tier: 'Elite', min_ranking: 120, qualifying_size: 16 }, { rank: 80 });
  const qualifying = evaluateTournamentEntry({ tier: 'Elite', min_ranking: 120, qualifying_size: 16 }, { rank: 180 });
  const blocked = evaluateTournamentEntry({ tier: 'Elite', min_ranking: 120, qualifying_size: 16 }, { rank: 500 });
  if (direct.path !== 'direct') throw new Error('Entrada direta inválida');
  if (qualifying.path !== 'qualifying') throw new Error('Qualifying inválido');
  if (blocked.eligible) throw new Error('Elegibilidade inválida');
  return { direct, qualifying, blocked };
}

if (typeof window !== 'undefined') window.PadelStrategicEntryTest = { run: runStrategicEntryTest };
