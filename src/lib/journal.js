import { localGame } from '@/api/localGameClient.js';
import { getTeamRankings } from '@/lib/teamRanking';

export async function generateJournal() {
  try {
    const [matches, tournaments, rankings] = await Promise.all([
      localGame.entities.Match.list('-created_date', 30),
      // Antes: filter({ status: 'finalizado' }). Um torneio resolvido pode
      // ter campeão sem passar por esse status exato — a finalização pelo
      // caminho do JOGADOR (prepareTournamentFinalization) só grava
      // `status`/`champion` quando o jogador VENCE, então um torneio que ele
      // disputou e perdeu depende inteiramente do caminho da IA. Consultar
      // por presença de campeão cobre todas as vias de resolução e não pode
      // perder nada que a consulta anterior encontrava.
      localGame.entities.Tournament.list('-start_date', 2000),
      getTeamRankings(10),
    ]);

    const allMatches = matches || [];

    // Playthrough 4.3 — prioridade editorial por tier. O Jornal do Circuito
    // cobre o mundo inteiro, não só o jogador. Campeões de tiers mais altos
    // aparecem primeiro, sem apagar completamente os tiers menores.
    const TIER_PRIORITY = { Crown: 0, Elite: 1, Masters: 2, Platinum: 3, Gold: 4, Silver: 5, Bronze: 6 };
    const champions = (tournaments || [])
      .filter(t => t.champion)
      .map(t => ({ tournament: t.name, team: t.champion, tier: t.tier, month: t.month, date: t.start_date || '' }))
      .sort((a, b) => {
        const tierDiff = (TIER_PRIORITY[a.tier] ?? 99) - (TIER_PRIORITY[b.tier] ?? 99);
        if (tierDiff !== 0) return tierDiff;
        return String(b.date).localeCompare(String(a.date)) || (b.month || 0) - (a.month || 0);
      })
      .slice(0, 10);

    // Rivalries (teams that appear in multiple matches)
    const rivalryMap = {};
    allMatches.forEach(m => {
      // LOCAL-8E (8D-02): ordenar uma CÓPIA. O repositório devolve cópia rasa
      // dos registros — `.sort()` direto em m.team_a reordenava a dupla dentro
      // da partida salva, e Torneios (que reconhece o jogador por team_a[0])
      // deixava de reconhecer as partidas dele. A ordem é só da apresentação.
      const teamA = [...(m.team_a || [])].sort().join(' & ');
      const teamB = [...(m.team_b || [])].sort().join(' & ');
      const key = [teamA, teamB].sort().join(' vs ');
      if (!rivalryMap[key]) rivalryMap[key] = { count: 0, teamA, teamB, aWins: 0, bWins: 0 };
      rivalryMap[key].count++;
      if (m.winner === 'A') rivalryMap[key].aWins++;
      else rivalryMap[key].bWins++;
    });
    const rivalries = Object.values(rivalryMap)
      .filter(r => r.count >= 2)
      .sort((a, b) => b.count - a.count);

    // Resultados recentes: o Jornal é do CIRCUITO, não um diário do jogador.
    // Antes, `recentResults` vinha 100% de `Match` (só partidas do jogador),
    // então o feed inteiro era sobre ele — e, com os campeões do circuito
    // ausentes por outro bug, não sobrava mais nada. As partidas próprias
    // entram limitadas e dividem espaço com as decisões dos demais torneios,
    // que já existem como campeão/vice em Tournament.
    const ownResults = allMatches.slice(0, 3).map(m => ({
      teamA: (m.team_a || []).join(' & '),
      teamB: (m.team_b || []).join(' & '),
      scoreA: m.score_a,
      scoreB: m.score_b,
      winner: m.winner === 'A' ? (m.team_a || []).join(' & ') : (m.team_b || []).join(' & '),
      tournament: m.tournament_name,
      date: m.created_date || m.date || '',
      scope: 'player',
    }));
    const circuitResults = (tournaments || [])
      .filter(t => t.champion && t.runner_up)
      .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
      .slice(0, 8)
      .map(t => ({
        teamA: t.champion,
        teamB: t.runner_up,
        scoreA: null,
        scoreB: null,
        winner: t.champion,
        tournament: t.name,
        date: t.start_date || '',
        scope: 'circuit',
      }));
    const recentResults = [...ownResults, ...circuitResults]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 8);

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