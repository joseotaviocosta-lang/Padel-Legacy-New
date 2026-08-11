import { createServer } from 'vite';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const { getPendingInterviews } = await server.ssrLoadModule('/src/lib/pressData.js');
  const {
    buildOfficialInterviewProgressPatch,
    isOfficialPlayerTournamentResult,
    isOfficialTournamentMatch,
    isValidPostMatchInterviewMessage,
    postMatchInterviewIdentity,
    postMatchInterviewMessageId,
  } = await server.ssrLoadModule('/src/lib/postMatchInterview.js');

  const profile = {
    id: 'player-interview-test',
    sport_name: 'Atleta Teste',
    career_date: '2026-04-12',
    matches_played: 2,
    wins: 1,
    losses: 1,
    interviews_given: 3,
    media_appearances: 5,
  };

  const practice = {
    id: 'practice-001',
    profile_id: profile.id,
    date: profile.career_date,
    status: 'completed',
    match_type: 'simulada',
    competition_type: 'practice',
    is_official: false,
    tournament_name: 'Partida Treino',
    result: 'vitória',
    winner: 'A',
    score: '6-3, 6-4',
    team_a: [profile.sport_name, 'Parceiro'],
    team_b: ['Rival A', 'Rival B'],
  };

  const official = {
    id: 'tournament-001-qf',
    profile_id: profile.id,
    date: profile.career_date,
    played_date: profile.career_date,
    status: 'completed',
    match_type: 'tournament',
    competition_type: 'tournament',
    is_official: true,
    is_tournament: true,
    match_occurred: true,
    tournament_id: 'masters-buenos-aires-2026',
    tournament_name: 'Masters Buenos Aires',
    tournament_round: 'QF',
    result: 'vitória',
    winner: 'A',
    score: '7-6, 6-4',
    team_a: [profile.sport_name, 'Parceiro'],
    team_b: ['Gómez', 'Alonso'],
  };

  const emptyContext = { calendarEvents: [], registrations: [], partnership: null };

  // 1. Treino concluído nunca cria entrevista.
  assert(getPendingInterviews(profile, [practice], emptyContext).length === 0, 'Treino gerou entrevista pós-jogo.');
  assert(!isOfficialTournamentMatch(practice), 'Treino entrou na whitelist oficial.');

  // 2. Resultado oficial do jogador mantém a entrevista atual.
  const officialInterviews = getPendingInterviews(profile, [official], emptyContext);
  assert(officialInterviews.length === 1, 'Resultado oficial não gerou exatamente uma entrevista.');
  assert(officialInterviews[0].questionCategory === 'post_win', 'Categoria da entrevista oficial está incorreta.');
  assert(isOfficialPlayerTournamentResult(official, profile), 'Resultado oficial do jogador foi rejeitado.');

  // 3. Recarregar/recalcular o treino continua sem criar pendência.
  const practiceAfterReload = JSON.parse(JSON.stringify(practice));
  assert(getPendingInterviews(profile, [practiceAfterReload], emptyContext).length === 0, 'Reload ressuscitou entrevista de treino.');

  // 4. O mesmo matchId repetido produz uma única identidade/pendência.
  const duplicated = getPendingInterviews(profile, [official, { ...official }], emptyContext);
  assert(duplicated.length === 1, 'O mesmo resultado oficial gerou entrevistas duplicadas.');
  assert(duplicated[0].id === postMatchInterviewIdentity(official.id).id, 'Entrevista não usa identidade estável por matchId.');
  assert(postMatchInterviewMessageId(profile.id, official.id) === postMatchInterviewMessageId(profile.id, official.id), 'Mensagem não é idempotente por matchId.');

  // 5. Simulação oficial entre NPCs não pertence ao jogador ativo.
  const npcMatch = { ...official, id: 'npc-vs-npc', profile_id: 'npc-career', team_a: ['NPC A', 'NPC B'] };
  assert(getPendingInterviews(profile, [npcMatch], emptyContext).length === 0, 'NPC vs NPC gerou entrevista do jogador.');

  // 6. Uma entrevista fabricada a partir de treino não libera progressão.
  const practiceIdentity = postMatchInterviewIdentity(practice.id);
  const practiceInterview = { ...practiceIdentity, matchId: practice.id, questionCategory: 'post_win' };
  assert(Object.keys(buildOfficialInterviewProgressPatch(profile, practiceInterview, [practice])).length === 0, 'Treino liberou missão/estatística de entrevista.');
  const legacyPracticeMessage = {
    related_entity_type: 'PressInterview',
    related_entity_id: practiceIdentity.id,
    metadata: { match_id: practice.id, interview_source_id: practiceIdentity.sourceId },
  };
  assert(!isValidPostMatchInterviewMessage(legacyPracticeMessage, [practice], profile), 'Pendência legada de treino permaneceu válida.');

  // 7. Responder a entrevista oficial mantém a progressão normal.
  const progressPatch = buildOfficialInterviewProgressPatch(profile, officialInterviews[0], [official]);
  assert(progressPatch.interviews_given === 4, 'Entrevista oficial não incrementou a estatística de entrevistas.');
  assert(progressPatch.media_appearances === 6, 'Entrevista oficial não incrementou aparições na mídia.');
  assert(Object.keys(buildOfficialInterviewProgressPatch({ ...profile, processed_press_interview_sources: [officialInterviews[0].sourceId] }, officialInterviews[0], [official])).length === 0, 'Retry reaplicou progressão da mesma entrevista.');

  // Casos especiais: cancelamento/WO sem jogo não entrevista; abandono jogado e registrado pode entrevistar.
  const cancelled = { ...official, id: 'cancelled', status: 'cancelled', match_occurred: false };
  const walkover = { ...official, id: 'walkover', result_method: 'walkover', match_occurred: false };
  const retirement = { ...official, id: 'retirement', result: 'derrota', result_method: 'retirement', match_occurred: true };
  assert(!isOfficialPlayerTournamentResult(cancelled, profile), 'Partida cancelada gerou entrevista.');
  assert(!isOfficialPlayerTournamentResult(walkover, profile), 'WO sem jogo gerou entrevista.');
  assert(isOfficialPlayerTournamentResult(retirement, profile), 'Abandono de partida efetivamente jogada foi descartado.');

  console.log('PostMatchInterviewRC: PASS (7 cenários + casos especiais)');
} finally {
  await server.close();
}
