import { getPendingInterviews } from '@/lib/pressData.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runContextualPressTest() {
  const profile = {
    id: 'player-test',
    sport_name: 'Atleta Teste',
    career_date: '2026-01-01',
    wins: 0,
    losses: 0,
    xp: 0,
    partner_chemistry: 80,
  };

  const initial = getPendingInterviews(profile, [], { calendarEvents: [], partnership: null });
  assert(initial.length === 0, 'Uma carreira sem acontecimentos não deve gerar entrevistas.');

  const winMatch = {
    id: 'match-win',
    profile_id: profile.id,
    date: '2026-01-02',
    tournament_name: 'Legacy Silver Teste',
    team_a: ['Atleta Teste', 'Parceiro'],
    team_b: ['Rival A', 'Rival B'],
    winner: 'A',
  };
  const afterWin = getPendingInterviews(profile, [winMatch], { calendarEvents: [], partnership: null });
  assert(afterWin.length === 1, 'Uma vitória deve gerar somente a entrevista pós-vitória quando não há outros eventos.');
  assert(afterWin[0].questionCategory === 'post_win', 'A vitória foi interpretada incorretamente.');

  const lossMatch = { ...winMatch, id: 'match-loss', winner: 'B' };
  const afterLoss = getPendingInterviews(profile, [lossMatch], { calendarEvents: [], partnership: null });
  assert(afterLoss[0]?.questionCategory === 'post_loss', 'A derrota foi interpretada incorretamente.');

  const otherPlayerMatch = { ...lossMatch, id: 'other', profile_id: 'other-player', team_a: ['Outro', 'Parceiro'] };
  const unrelated = getPendingInterviews(profile, [otherPlayerMatch], { calendarEvents: [], partnership: null });
  assert(unrelated.length === 0, 'Partidas de outros atletas não podem gerar entrevistas para o jogador.');

  const withTournament = getPendingInterviews(profile, [], {
    calendarEvents: [{ id: 'event-1', profile_id: profile.id, event_type: 'tournament', title: 'Legacy Gold', start_date: '2026-01-05', status: 'scheduled' }],
    partnership: null,
  });
  assert(withTournament.some(item => item.questionCategory === 'pre_match'), 'Torneio próximo e agendado deveria gerar coletiva pré-torneio.');

  const withCrisis = getPendingInterviews(profile, [], {
    calendarEvents: [],
    partnership: { id: 'partnership-1', status: 'active', chemistry: 25, partner_name: 'Parceiro' },
  });
  assert(withCrisis.some(item => item.questionCategory === 'rumor'), 'Crise real na dupla deveria gerar entrevista de rumor.');

  return {
    ok: true,
    initialInterviews: initial.length,
    winCategory: afterWin[0].questionCategory,
    lossCategory: afterLoss[0].questionCategory,
    unrelatedInterviews: unrelated.length,
  };
}

if (typeof window !== 'undefined') {
  window.PadelContextualPressTest = { run: runContextualPressTest };
}
