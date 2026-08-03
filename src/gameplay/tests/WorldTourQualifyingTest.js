import { createQualifyingState, getQualifyingRoundCount, recordQualifyingResult } from '../worldTour/QualifyingManager.js';

export function runWorldTourQualifyingTest() {
  const tournament = { id: 'test-event', start_date: '2027-03-01', qualifying_size: 16 };
  const profile = { id: 'player-1', sport_name: 'Jogador Teste', world_ranking: 180 };
  const partner = { id: 'partner-1', name: 'Parceiro Teste' };
  let state = createQualifyingState({ tournament, profile, partner, teamRank: 180 });
  console.assert(getQualifyingRoundCount(tournament) === 3, 'Qualifying de 16 vagas deve possuir 3 rodadas');
  console.assert(state.roundLabels.length === 3, 'Estado deve criar três rodadas');
  state = recordQualifyingResult(state, { won: true });
  state = recordQualifyingResult(state, { won: true });
  state = recordQualifyingResult(state, { won: true });
  console.assert(state.status === 'qualified' && state.promoted, 'Três vitórias devem promover à chave principal');
  return { ok: true, state };
}

if (typeof window !== 'undefined') {
  window.PadelWorldTourQualifyingTest = { run: runWorldTourQualifyingTest };
}
