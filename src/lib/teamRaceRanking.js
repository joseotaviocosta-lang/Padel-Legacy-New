import { localGame } from '@/api/localGameClient.js';
import {
  dedupeTeamRankingsByCanonicalPair,
  assignTeamRankingPositions,
  teamKey,
} from '@/lib/teamRanking.js';

// Playthrough 5.23, Partes E/F — AUTORIDADE ÚNICA da RACE DE DUPLAS.
//
// Auditoria: não existia nenhuma autoridade de Race por dupla (grep por
// TeamRace/PairRace/team_race/race_pair = 0). A classificação sazonal de
// pares é derivada dos pontos de Race ATUAIS dos membros, exatamente em
// simetria com o Mundial de Duplas (5.22):
//
//   WorldTeamPoints = WorldPoints(A) + WorldPoints(B)   (TeamRanking)
//   RaceTeamPoints  = RacePoints(A)  + RacePoints(B)     (este módulo)
//
// É uma projeção de LEITURA: Race reseta todo ano civil, então persistir uma
// segunda linha por dupla só criaria um snapshot que envelheceria. A
// identidade do par (e o universo) vem do TeamRanking canônico; os pontos
// vêm dos `race_points` atuais dos membros. As duas classificações são
// INDEPENDENTES: uma dupla pode ter World rank e 0 na Race, ou o inverso.
//
// V/D e títulos continuam sendo o histórico da PARCERIA (Partnership/ledger),
// nunca herdados de parcerias anteriores — esta projeção não toca neles.

export function computeTeamRacePoints(raceA, raceB) {
  const a = Number(raceA);
  const b = Number(raceB);
  const safeA = Number.isFinite(a) && a > 0 ? a : 0;
  const safeB = Number.isFinite(b) && b > 0 ? b : 0;
  return Math.round(safeA + safeB);
}

// Resolve os race_points ATUAIS de um membro: AthleteProfile (IA) ou o
// PlayerProfile ativo. Devolve null quando o membro não é resolvível, para
// não confundir "não existe" com "0 pontos".
function buildRacePointResolver({ athletesById, playerId, playerRacePoints }) {
  return (memberId) => {
    if (!memberId) return null;
    const athlete = athletesById.get(memberId);
    if (athlete) {
      const value = Number(athlete.race_points);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    if (playerId && memberId === playerId) {
      const value = Number(playerRacePoints);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    return null;
  };
}

// Classificação sazonal de TODAS as duplas canônicas do universo TeamRanking.
export async function getTeamRaceRankings(limit = 600, { profile = null } = {}) {
  try {
    const [rows, athletes, profiles] = await Promise.all([
      localGame.entities.TeamRanking.list('-ranking_points', 5000).catch(() => []),
      localGame.entities.AthleteProfile.list(null, 5000).catch(() => []),
      localGame.entities.PlayerProfile.list(null, 5).catch(() => []),
    ]);
    const player = profile || (profiles || [])[0] || null;
    const athletesById = new Map((athletes || []).map((a) => [a.id, a]));
    const resolveRace = buildRacePointResolver({
      athletesById,
      playerId: player?.id || null,
      playerRacePoints: player?.race_points,
    });

    const ranked = dedupeTeamRankingsByCanonicalPair(rows || [])
      .map((row) => {
        const a = resolveRace(row.player1_id);
        const b = resolveRace(row.player2_id);
        if (a === null || b === null) return null;
        return { ...row, race_points: computeTeamRacePoints(a, b) };
      })
      .filter(Boolean)
      .sort((a, b) => (Number(b.race_points) || 0) - (Number(a.race_points) || 0)
        || (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0));

    return assignTeamRankingPositions(ranked).slice(0, Math.max(1, limit));
  } catch (error) {
    console.error('getTeamRaceRankings', error);
    return [];
  }
}

// Posição da dupla ATIVA do jogador na Race de Duplas. `unranked` significa
// estritamente "0 + 0 = 0 pontos na Race" (Parte V) — nunca ausência de
// ranking mundial, que é uma classificação independente (Parte W).
export async function getTeamRaceRank(profile, partner, options = {}) {
  const empty = { rank: 0, total: 0, points: 0, unranked: true, displayRank: '—' };
  if (!profile?.id || !partner?.id) return empty;
  try {
    const key = teamKey(profile.id, partner.id);
    const board = await getTeamRaceRankings(5000, { profile });
    const own = board.find((row) => row.team_key === key);
    if (!own) return empty;
    const points = Math.max(0, Number(own.race_points) || 0);
    const competitors = board.filter((row) => row.team_key !== key && Math.max(0, Number(row.race_points) || 0) > 0);
    const unranked = points <= 0;
    const rank = unranked ? 0 : (Number(own.ranking_display_position) || 0);
    return { rank, total: competitors.length + 1, points, unranked, displayRank: unranked ? '—' : String(rank) };
  } catch (error) {
    console.error('getTeamRaceRank', error);
    return empty;
  }
}
