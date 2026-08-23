const COMPLETED_TOURNAMENT_STATUSES = new Set(['finalizado', 'completed', 'concluido', 'finished', 'champion']);
const TERMINAL_MATCH_STATUSES = new Set(['completed', 'finished', 'played', 'concluido', 'finalizado']);

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function teamName(value) {
  if (Array.isArray(value)) return value.map((member) => member?.name || member).filter(Boolean).join(' & ') || null;
  const name = String(value || '').trim();
  return name || null;
}

function rawTeam(match, side) {
  return teamName(side === 'a' ? (match?.team_a || match?.a) : (match?.team_b || match?.b));
}

function winnerMatchesEntrant(match) {
  const winner = teamName(match?.winner);
  return Boolean(winner && [rawTeam(match, 'a'), rawTeam(match, 'b')].includes(winner));
}

function matchHasReachedCareerDate(match, round, careerDate) {
  const today = normalizeDate(careerDate);
  const matchDate = normalizeDate(match?.date || round?.date);
  return Boolean(today && matchDate && matchDate <= today);
}

function isTerminalBracketResult(match, round, careerDate, tournamentCompleted) {
  if (!winnerMatchesEntrant(match)) return false;
  const status = String(match?.status || round?.status || '').toLocaleLowerCase('pt-BR');
  if (tournamentCompleted) return TERMINAL_MATCH_STATUSES.has(status) || Boolean(match?.score);
  return TERMINAL_MATCH_STATUSES.has(status) && matchHasReachedCareerDate(match, round, careerDate);
}

function placeholder(matchNumber) {
  return `Vencedor Jogo ${matchNumber}`;
}

function isPlaceholder(value) {
  return /^Vencedor Jogo \d+$/.test(String(value || ''));
}

export function isTournamentCompletedAt(tournament, careerDate) {
  const status = String(tournament?.status || '').toLocaleLowerCase('pt-BR');
  const phase = String(tournament?.current_phase || '').toLocaleLowerCase('pt-BR');
  const date = normalizeDate(tournament?.start_date);
  const today = normalizeDate(careerDate);
  if (today && date && date > today) return false;
  return COMPLETED_TOURNAMENT_STATUSES.has(status)
    || COMPLETED_TOURNAMENT_STATUSES.has(phase)
    || Boolean(tournament?.completed_date && (!today || tournament.completed_date <= today));
}

export function isTournamentFutureOrPending(tournament, careerDate) {
  return !isTournamentCompletedAt(tournament, careerDate);
}

/**
 * Projeção temporal pura da chave. O histórico persistido permanece intacto;
 * somente resultados terminais alcançados pela data da carreira podem abrir
 * o caminho classificatório da rodada seguinte.
 */
export function getVisibleTournamentBracketState(tournament, careerDate) {
  const history = Array.isArray(tournament?.bracket_history) ? tournament.bracket_history : [];
  const completed = isTournamentCompletedAt(tournament, careerDate);
  if (!history.length) {
    return { drawn: false, completed, rounds: [], champion: null, focusRoundIndex: 0 };
  }

  const rounds = [];
  for (let roundIndex = 0; roundIndex < history.length; roundIndex += 1) {
    const rawRound = history[roundIndex] || {};
    const rawMatches = Array.isArray(rawRound.matches) ? rawRound.matches : [];
    const previous = rounds[roundIndex - 1] || null;
    const structurallyLinked = Boolean(previous && previous.matches.length === rawMatches.length * 2);

    const matches = rawMatches.map((rawMatch, matchIndex) => {
      let teamA = rawTeam(rawMatch, 'a');
      let teamB = rawTeam(rawMatch, 'b');

      if (roundIndex > 0 && structurallyLinked) {
        teamA = previous.matches[matchIndex * 2]?.winner || placeholder((matchIndex * 2) + 1);
        teamB = previous.matches[(matchIndex * 2) + 1]?.winner || placeholder((matchIndex * 2) + 2);
      } else if (roundIndex > 0 && previous) {
        // tournament_run registra apenas o caminho da dupla do jogador. Nesse
        // formato 1→1, o próximo confronto só passa a existir quando a vitória
        // anterior é terminal; o rival pré-gerado fica oculto até a data real.
        const previousWinner = previous.matches.find((match) => match.winner)?.winner || null;
        const reached = matchHasReachedCareerDate(rawMatch, rawRound, careerDate);
        const currentRoundIsReal = Boolean(previousWinner && reached);
        teamA = previousWinner || placeholder(1);
        teamB = currentRoundIsReal ? rawTeam(rawMatch, 'b') : placeholder(2);
      }

      teamA ||= roundIndex === 0 ? 'Participante a definir' : placeholder((matchIndex * 2) + 1);
      teamB ||= roundIndex === 0 ? 'Participante a definir' : placeholder((matchIndex * 2) + 2);

      const candidate = { ...rawMatch, team_a: teamA, team_b: teamB };
      const entrantsResolved = !isPlaceholder(teamA) && !isPlaceholder(teamB)
        && teamA !== 'Participante a definir' && teamB !== 'Participante a definir';
      const terminal = entrantsResolved
        && isTerminalBracketResult(candidate, rawRound, careerDate, completed)
        && [teamA, teamB].includes(teamName(rawMatch.winner));
      return {
        ...candidate,
        date: rawMatch.date || rawRound.date || null,
        status: terminal ? 'completed' : 'scheduled',
        winner: terminal ? teamName(rawMatch.winner) : null,
        score: terminal ? rawMatch.score || null : null,
        eliminated: terminal ? rawMatch.eliminated || null : null,
        champion: terminal ? rawMatch.champion || null : null,
        terminal,
      };
    });

    rounds.push({
      ...rawRound,
      round: rawRound.round || rawRound.label || `Rodada ${roundIndex + 1}`,
      status: matches.length > 0 && matches.every((match) => match.terminal) ? 'completed' : 'scheduled',
      matches,
    });
  }

  const finalMatch = rounds.at(-1)?.matches?.[0] || null;
  const champion = completed && finalMatch?.terminal ? finalMatch.winner : null;
  const firstIncomplete = rounds.findIndex((round) => round.matches.some((match) => !match.terminal));
  const focusRoundIndex = firstIncomplete >= 0 ? firstIncomplete : Math.max(0, rounds.length - 1);
  return { drawn: true, completed, rounds, champion, focusRoundIndex };
}

export function sanitizeBracketHistory(tournament, careerDate) {
  return getVisibleTournamentBracketState(tournament, careerDate).rounds;
}

export function visibleTournamentChampion(tournament, careerDate) {
  const state = getVisibleTournamentBracketState(tournament, careerDate);
  if (state.drawn) return state.champion;
  return state.completed ? teamName(tournament?.champion) : null;
}
