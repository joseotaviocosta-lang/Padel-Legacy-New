import { localGame } from '@/api/localGameClient.js';
import { COACHES_DATA } from '@/lib/coaches';
import { evolveWorldMarket, readWorldMarketSnapshot } from './worldMarketLifecycle';
import { projectCoachMarket, TIER_MINIMUMS } from '@/lib/coachMarket.js';

function monthKey(date) { return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function normalizeName(value) { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }

function normalizeTeam(team, index) {
  const points = Math.max(0, Number(team.ranking_points) || 0);
  const matches = Math.max(0, Number(team.matches_played) || 0);
  return {
    ...team,
    ranking_position: Number(team.ranking_position) || index + 1,
    ranking_points: points,
    matches_played: matches,
    win_rate: matches > 0 ? Math.round((Number(team.wins || 0) / matches) * 100) : 0,
    market_status: team.market_status || 'estavel',
    chemistry: clamp(team.chemistry || 65, 0, 100),
  };
}

// LOCAL-8E (8D-01): leitura dos treinadores para a tela do Mercado, sem
// gravar. Antes a abertura chamava updateCoachMarket (bulkUpdate de todos os
// treinadores a cada visita) e criava os do catálogo que faltassem. Os que
// faltam entram só na projeção (sem id) — a criação continua com a tela de
// Treinadores (coachLifecycle.ensureCoachCatalog).
async function readCoachMarket() {
  const coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  // Identidade pelo catalog_key (nomes repetidos legítimos no catálogo); o
  // nome só vale para linhas legadas sem chave — mesma regra de coachLifecycle.
  const existingKeys = new Set(coaches.map((coach) => coach.catalog_key).filter(Boolean));
  const legacyNames = new Set(coaches.filter((coach) => !coach.catalog_key).map((coach) => normalizeName(coach.name)));
  const missing = COACHES_DATA.filter((coach) => !existingKeys.has(coach.catalog_key) && !legacyNames.has(normalizeName(coach.name))).map((coach) => ({ ...coach }));
  return [...coaches, ...missing];
}

export async function getGlobalMarketSnapshot(profile, date) {
  const careerDate = date || profile?.career_date || new Date().toISOString().slice(0, 10);
  // Abrir o Mercado é somente leitura (LOCAL-8E). O processamento do mês —
  // que grava atletas e treinadores — fica em processGlobalMarketMonth.
  const [athleteMarket, teamsRaw, coachesRaw, events] = await Promise.all([
    readWorldMarketSnapshot(careerDate),
    localGame.entities.TeamRanking.list('-ranking_points', 600).catch(() => []),
    readCoachMarket(),
    localGame.entities.WorldEvent.list('-event_date', 100).catch(() => []),
  ]);
  const teams = (teamsRaw || []).map(normalizeTeam).sort((a, b) => b.ranking_points - a.ranking_points).map((team, index) => ({ ...team, ranking_position: index + 1 }));
  // Fonte única do mercado de treinadores (LOCAL-8F): projeção pura do mês.
  const coaches = projectCoachMarket(coachesRaw || [], careerDate);
  const athletes = athleteMarket?.athletes || [];
  return {
    month: monthKey(careerDate),
    processed: Boolean(athleteMarket?.processed),
    athletes,
    teams,
    coaches,
    recentMovements: (events || []).filter((event) => ['mercado', 'dupla', 'treinador', 'aposentadoria'].some((tag) => (event.tags || []).includes(tag))).slice(0, 20),
    summary: {
      activeAthletes: athletes.filter((athlete) => athlete.career_status !== 'aposentado').length,
      freeAthletes: athletes.filter((athlete) => athlete.market_status === 'livre' && athlete.career_status !== 'aposentado').length,
      activeTeams: teams.length,
      availableCoaches: coaches.filter((coach) => coach.market_available).length,
      beginnerCoaches: coaches.filter((coach) => coach.market_available && coach.tier === 'iniciante').length,
    },
  };
}

export async function processGlobalMarketMonth(profile, date) {
  const careerDate = date || profile?.career_date || new Date().toISOString().slice(0, 10);
  const athleteResult = await evolveWorldMarket(careerDate);
  // LOCAL-8F (8F-06): o mercado de treinadores do mês é uma projeção pura
  // (src/lib/coachMarket.js) — não há mais campos market_* a gravar aqui.
  const snapshot = await getGlobalMarketSnapshot(profile, careerDate);
  return { athleteResult, coaches: snapshot.coaches, snapshot, skipped: athleteResult?.skipped === true };
}

export { TIER_MINIMUMS };
