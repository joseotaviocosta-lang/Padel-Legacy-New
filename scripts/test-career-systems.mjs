import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  const { getPendingInterviews } = await server.ssrLoadModule('/src/lib/pressData.js');
  const { COACHES_DATA, canHireCoach } = await server.ssrLoadModule('/src/lib/coaches.js');
  const { getSponsorCategory, validateSponsorSlot } = await server.ssrLoadModule('/src/lib/sponsors.js');
  const profile = { id: 'career-a-player', sport_name: 'Teste', career_date: '2026-01-01', coins: 999999, level: 'Lenda', xp: 999999, fan_appeal: 100, tournaments_won: 20 };
  assert(getPendingInterviews(profile, [], {}).length === 0, 'Carreira nova gerou entrevista.');
  const win = { id: 'win-1', profile_id: profile.id, date: '2026-01-02', tournament_name: 'Teste Open', team_a: ['Teste', 'Dupla'], team_b: ['Rival A', 'Rival B'], winner: 'A' };
  const loss = { ...win, id: 'loss-1', winner: 'B' };
  assert(getPendingInterviews(profile, [win], {})[0]?.questionCategory === 'post_win', 'Vitória real não gerou entrevista única.');
  assert(getPendingInterviews(profile, [loss], {})[0]?.questionCategory === 'post_loss', 'Derrota real não gerou entrevista única.');
  assert(getPendingInterviews(profile, [{ ...win, profile_id: 'other-career' }], {}).length === 0, 'Resultado de outra carreira vazou.');
  const coach = COACHES_DATA[0];
  assert(coach.monthly_cost > 0 && coach.sign_on_bonus > 0, 'Treinador sem custo ou salário.');
  assert(canHireCoach(coach, { ...profile, coins: 0 }).allowed === false, 'Treinador contratado sem saldo.');
  const racketSponsor = { id: 'racket-b', industry: 'Equipamentos' };
  const category = getSponsorCategory(racketSponsor);
  assert(category === 'raquete', 'Categoria comercial incorreta.');
  assert(validateSponsorSlot(racketSponsor, [{ sponsor_category: 'raquete', sponsor_name: 'Marca A' }]).ok === false, 'Slot concorrente não foi bloqueado.');
  console.log('CareerSystemsAuditTest: entrevistas, treinador e slots aprovados.');
} finally {
  await server.close();
}
