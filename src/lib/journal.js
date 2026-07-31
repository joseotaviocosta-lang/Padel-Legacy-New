import { localGame } from '@/api/localGameClient.js';
import { getTeamRankings } from '@/lib/teamRanking';

export async function generateJournal() {
  try {
    const [matches, tournaments, rankings] = await Promise.all([
      localGame.entities.Match.list('-created_date', 30),
      localGame.entities.Tournament.filter({ status: 'finalizado' }),
      getTeamRankings(10),
    ]);

    const allMatches = matches || [];

    // Recent champions (from finished tournaments only)
    const champions = (tournaments || [])
      .filter(t => t.champion)
      .map(t => ({ tournament: t.name, team: t.champion, tier: t.tier, month: t.month }))
      .sort((a, b) => (b.month || 0) - (a.month || 0));

    // Rivalries (teams that appear in multiple matches)
    const rivalryMap = {};
    allMatches.forEach(m => {
      const teamA = (m.team_a || []).sort().join(' & ');
      const teamB = (m.team_b || []).sort().join(' & ');
      const key = [teamA, teamB].sort().join(' vs ');
      if (!rivalryMap[key]) rivalryMap[key] = { count: 0, teamA, teamB, aWins: 0, bWins: 0 };
      rivalryMap[key].count++;
      if (m.winner === 'A') rivalryMap[key].aWins++;
      else rivalryMap[key].bWins++;
    });
    const rivalries = Object.values(rivalryMap)
      .filter(r => r.count >= 2)
      .sort((a, b) => b.count - a.count);

    // Recent results
    const recentResults = allMatches.slice(0, 6).map(m => ({
      teamA: (m.team_a || []).join(' & '),
      teamB: (m.team_b || []).join(' & '),
      scoreA: m.score_a,
      scoreB: m.score_b,
      winner: m.winner === 'A' ? (m.team_a || []).join(' & ') : (m.team_b || []).join(' & '),
      tournament: m.tournament_name,
    }));

    // Top teams
    const topTeams = (rankings || []).slice(0, 5).map((t, i) => ({
      rank: i + 1,
      team: `${t.player1_name} & ${t.player2_name}`,
      points: t.ranking_points,
      titles: (t.titles || []).length,
    }));

    // Generate headline
    let headline = 'O circuito segue em ritmo intenso';
    if (champions.length > 0) {
      headline = `${champions[0].team} brilha e conquista ${champions[0].tournament}`;
    } else if (topTeams.length > 0) {
      headline = `${topTeams[0].team} lidera o ranking de duplas`;
    }

    // Generate summary
    let summary = '';
    if (topTeams.length > 0) {
      summary = `${topTeams[0].team} comanda o ranking com ${topTeams[0].points} pontos. `;
      if (topTeams.length > 1) {
        summary += `${topTeams[1].team} aparece em segundo com ${topTeams[1].points} pontos. `;
      }
    }
    if (champions.length > 0) {
      summary += `${champions.length} torneio(s) decidido(s) recentemente. `;
    }
    if (rivalries.length > 0) {
      summary += `A rivalidade entre ${rivalries[0].teamA} e ${rivalries[0].teamB} está esquentando com ${rivalries[0].count} confrontos. `;
    }

    return {
      headline,
      summary,
      champions,
      rivalries,
      recentResults,
      topTeams,
      hasContent: allMatches.length > 0 || (rankings || []).length > 0 || champions.length > 0,
    };
  } catch (e) {
    console.error('generateJournal', e);
    return { hasContent: false, headline: '', summary: '', champions: [], rivalries: [], recentResults: [], topTeams: [] };
  }
}