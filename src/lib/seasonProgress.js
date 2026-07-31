const normalize = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');

const includesPlayer = (team, playerName) => {
  const needle = normalize(playerName);
  if (!needle) return false;
  if (Array.isArray(team)) return team.some((name) => normalize(name) === needle);
  return normalize(team).split(/\s*(?:&|\/|,| e )\s*/i).some((name) => name === needle);
};

const yearOf = (value) => {
  const year = Number(String(value || '').slice(0, 4));
  return Number.isFinite(year) ? year : 0;
};

export function getSeasonWindow(careerDate) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(careerDate || '') ? careerDate : '2026-01-01';
  const year = Number(safeDate.slice(0, 4));
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const current = new Date(`${safeDate}T12:00:00`);
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const elapsed = Math.max(0, Math.floor((current - startDate) / 86400000));
  const total = Math.max(1, Math.floor((endDate - startDate) / 86400000) + 1);
  const remaining = Math.max(0, Math.ceil((endDate - current) / 86400000));
  return {
    year,
    start,
    end,
    elapsed,
    total,
    remaining,
    progress: Math.max(0, Math.min(100, Math.round(((elapsed + 1) / total) * 100))),
  };
}

export function buildSeasonSnapshot({ profile, matches = [], tournaments = [], worldRank }) {
  const playerName = profile?.sport_name || profile?.name || '';
  const window = getSeasonWindow(profile?.career_date);

  const playerMatches = (matches || []).filter((match) => {
    if (yearOf(match?.date || match?.created_date) !== window.year) return false;
    return includesPlayer(match?.team_a, playerName) || includesPlayer(match?.team_b, playerName);
  });

  let wins = 0;
  let losses = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let runningStreak = 0;

  [...playerMatches]
    .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')))
    .forEach((match) => {
      const playerOnA = includesPlayer(match?.team_a, playerName);
      const won = (playerOnA && match?.winner === 'A') || (!playerOnA && match?.winner === 'B');
      if (won) {
        wins += 1;
        runningStreak += 1;
        bestStreak = Math.max(bestStreak, runningStreak);
      } else {
        losses += 1;
        runningStreak = 0;
      }
    });
  currentStreak = runningStreak;

  const finishedTournaments = (tournaments || []).filter((tournament) => {
    const tournamentYear = Number(tournament?.year) || yearOf(tournament?.start_date);
    return tournamentYear === window.year && tournament?.status === 'finalizado';
  });
  const titles = finishedTournaments.filter((tournament) => normalize(tournament?.champion).includes(normalize(playerName))).length;
  const finals = finishedTournaments.filter((tournament) => {
    const name = normalize(playerName);
    return normalize(tournament?.champion).includes(name) || normalize(tournament?.runner_up).includes(name);
  }).length;
  const rankPoints = Math.max(0, Number(profile?.rank_points ?? profile?.world_ranking_points ?? 0) || 0);
  const matchesPlayed = wins + losses;
  const winRate = matchesPlayed ? Math.round((wins / matchesPlayed) * 100) : 0;

  return {
    ...window,
    matchesPlayed,
    wins,
    losses,
    winRate,
    titles,
    finals,
    currentStreak,
    bestStreak,
    rankPoints,
    worldRank: Number(worldRank?.rank || 0),
    worldTotal: Number(worldRank?.total || 0),
  };
}

const LEVEL_SCALE = {
  Iniciante: 0,
  Amador: 1,
  Competitivo: 2,
  Avançado: 3,
  Elite: 4,
  Lenda: 5,
};

export function buildAdaptiveSeasonGoals(profile, snapshot) {
  const levelIndex = LEVEL_SCALE[profile?.level] ?? 0;
  const matchTarget = [8, 14, 22, 30, 38, 45][levelIndex];
  const winTarget = [3, 7, 12, 18, 25, 32][levelIndex];
  const titleTarget = [0, 1, 1, 2, 3, 4][levelIndex];
  const rankTarget = [100, 75, 50, 30, 15, 5][levelIndex];
  const pointsTarget = [150, 400, 850, 1400, 2200, 3500][levelIndex];

  return [
    {
      id: 'season_matches',
      label: `Disputar ${matchTarget} partidas`,
      description: 'Construa ritmo competitivo ao longo da temporada.',
      value: snapshot.matchesPlayed,
      target: matchTarget,
      type: 'matches',
    },
    {
      id: 'season_wins',
      label: `Vencer ${winTarget} partidas`,
      description: 'Transforme participação em resultados consistentes.',
      value: snapshot.wins,
      target: winTarget,
      type: 'wins',
    },
    titleTarget > 0
      ? {
          id: 'season_titles',
          label: `Conquistar ${titleTarget} título${titleTarget > 1 ? 's' : ''}`,
          description: 'Chegue ao topo nos torneios da temporada.',
          value: snapshot.titles,
          target: titleTarget,
          type: 'titles',
        }
      : {
          id: 'season_finals',
          label: 'Chegar a uma final',
          description: 'Dê o primeiro grande passo no circuito.',
          value: snapshot.finals,
          target: 1,
          type: 'titles',
        },
    {
      id: 'season_points',
      label: `Somar ${pointsTarget.toLocaleString('pt-BR')} pontos`,
      description: 'Acumule pontos para subir no ranking mundial.',
      value: snapshot.rankPoints,
      target: pointsTarget,
      type: 'points',
    },
    {
      id: 'season_rank',
      label: `Alcançar o Top ${rankTarget}`,
      description: 'Sua meta de posição para encerrar o ano.',
      value: snapshot.worldRank > 0 ? Math.max(0, rankTarget - snapshot.worldRank + 1) : 0,
      target: 1,
      type: 'rank',
      displayValue: snapshot.worldRank > 0 ? `#${snapshot.worldRank}` : '—',
      done: snapshot.worldRank > 0 && snapshot.worldRank <= rankTarget,
    },
  ];
}

export function getSeasonGrade(goals) {
  const completed = goals.filter((goal) => goal.done ?? goal.value >= goal.target).length;
  if (completed === goals.length) return { grade: 'S', label: 'Temporada histórica', completed };
  if (completed >= 4) return { grade: 'A', label: 'Temporada excelente', completed };
  if (completed >= 3) return { grade: 'B', label: 'Boa temporada', completed };
  if (completed >= 2) return { grade: 'C', label: 'Em evolução', completed };
  return { grade: 'D', label: 'Construindo a base', completed };
}
