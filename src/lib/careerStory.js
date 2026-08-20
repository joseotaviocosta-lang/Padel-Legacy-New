function careerExperienceLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const maxLevel = 50;
  const maxXp = 100000;
  const curve = 1.85;
  if (safeXp >= maxXp) return maxLevel;
  let low = 1;
  let high = maxLevel;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const ratio = (mid - 1) / (maxLevel - 1);
    const threshold = Math.round(maxXp * Math.pow(ratio, curve));
    if (threshold <= safeXp) low = mid; else high = mid - 1;
  }
  return low;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function matchBelongsToProfile(match, profile) {
  const names = [profile?.sport_name, profile?.name, profile?.full_name].map(normalize).filter(Boolean);
  if (match?.profile_id && profile?.id) return match.profile_id === profile.id;
  const haystack = [match?.player_name, match?.team_a_name, match?.team_b_name, match?.winner_name, match?.notes].map(normalize).join(' ');
  return names.some((name) => haystack.includes(name));
}

// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 4/7): bug real encontrado na
// auditoria — nem buildCareerTimeline nem buildSeasonRetrospectives nunca
// distinguiam partida de treino de partida oficial. "Primeira partida
// OFICIAL"/"Primeira vitória" podiam disparar numa partida de treino
// qualquer, e a retrospectiva de temporada somava partidas/vitórias/títulos
// de treino junto com os reais — a mesma classe de bug que a Fase 12 já
// tinha corrigido pro motor de conquistas (game-core/progression.js conta
// só treino; a fonte real é Match.competition_type/is_official). Mesmo
// critério aqui, reaproveitado — nenhum contador novo.
export function isOfficialMatch(match) {
  return match?.competition_type === 'tournament' && match?.is_official === true;
}

// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 4/7): achado real durante a
// auditoria — a linha real de Match (TournamentModal.jsx, finalização
// oficial) nunca escreve player_won/winner_profile_id/winner_name; escreve
// só `winner: 'A'|'B'` (código de lado, não nome) e `result:'vitória'|
// 'derrota'`. Isso deixava playerWonMatch SEMPRE falso pra toda partida real
// já jogada — "Primeira vitória" na timeline e toda contagem de
// vitórias/títulos da retrospectiva de temporada nunca disparavam, mesmo
// com partidas oficiais vencidas de verdade (o mesmo "produz número mas
// nenhuma consequência" da Parte 0, item 5). Corrigido pra checar primeiro
// `result` — o mesmo campo que achievementContext.js já usa com sucesso
// pra win_official_match (`m.result === 'vitória'`) — antes dos heurísticos
// antigos, mantidos só como fallback pra formatos de dado que não escrevem
// `result` (nenhum caso real conhecido, mas inofensivo manter).
function playerWonMatch(match, profile) {
  if (match?.result === 'vitória') return true;
  if (match?.result === 'derrota') return false;
  if (typeof match?.player_won === 'boolean') return match.player_won;
  if (match?.winner_profile_id && profile?.id) return match.winner_profile_id === profile.id;
  const winner = normalize(match?.winner_name || match?.winning_team_name);
  return [profile?.sport_name, profile?.name, profile?.full_name].map(normalize).filter(Boolean).some((name) => winner.includes(name));
}

export function buildCareerTimeline(profile, matches = []) {
  if (!profile) return [];
  const events = [];
  const startDate = parseDate(profile.career_started_at || profile.created_date || profile.career_date || '2026-01-01');
  const currentDate = parseDate(profile.career_date) || startDate;
  const playerMatches = (matches || []).filter((match) => matchBelongsToProfile(match, profile) && isOfficialMatch(match)).sort((a, b) => (parseDate(a.date || a.created_date)?.getTime() || 0) - (parseDate(b.date || b.created_date)?.getTime() || 0));
  const firstMatch = playerMatches[0];
  const firstWin = playerMatches.find((match) => playerWonMatch(match, profile));

  events.push({ id: 'career-start', date: startDate?.toISOString(), year: startDate?.getFullYear(), type: 'start', title: 'Início da carreira', description: `Aos 16 anos, ${profile.sport_name || profile.name || 'o atleta'} iniciou sua jornada no circuito profissional.`, achieved: true });
  if (firstMatch) events.push({ id: `first-match-${firstMatch.id || 'known'}`, date: parseDate(firstMatch.date || firstMatch.created_date)?.toISOString(), year: parseDate(firstMatch.date || firstMatch.created_date)?.getFullYear(), type: 'match', title: 'Primeira partida oficial', description: firstMatch.tournament_name ? `Estreia no ${firstMatch.tournament_name}.` : 'A estreia oficial no circuito.', achieved: true });
  if (firstWin) events.push({ id: `first-win-${firstWin.id || 'known'}`, date: parseDate(firstWin.date || firstWin.created_date)?.toISOString(), year: parseDate(firstWin.date || firstWin.created_date)?.getFullYear(), type: 'win', title: 'Primeira vitória', description: firstWin.tournament_name ? `Primeira vitória conquistada no ${firstWin.tournament_name}.` : 'A vitória que iniciou a ascensão.', achieved: true });

  const titles = Array.isArray(profile.titles) ? profile.titles : [];
  if ((profile.tournaments_won || titles.length) > 0) events.push({ id: 'first-title', year: currentDate?.getFullYear(), type: 'title', title: 'Primeiro título', description: titles[0] ? `Conquista do ${titles[0]}.` : 'O primeiro troféu da carreira.', achieved: true });

  const rank = Number(profile.ranking_position || profile.world_ranking || profile.ranking || 0);
  [500, 100, 50, 20, 10, 1].forEach((milestone) => {
    if (rank > 0 && rank <= milestone) events.push({ id: `rank-${milestone}`, year: currentDate?.getFullYear(), type: 'ranking', title: milestone === 1 ? 'Número 1 do mundo' : `Entrada no Top ${milestone}`, description: `A carreira alcançou a posição #${rank} do ranking mundial.`, achieved: true });
  });

  const level = careerExperienceLevel(Number(profile.xp || 0));
  [5, 10, 20, 30, 40, 50].forEach((milestone) => {
    if (level >= milestone) events.push({ id: `experience-${milestone}`, year: currentDate?.getFullYear(), type: 'experience', title: `Experiência de carreira ${milestone}`, description: `Novo estágio profissional alcançado com ${Number(profile.xp || 0).toLocaleString('pt-BR')} XP.`, achieved: true });
  });

  if (profile.partner_id) events.push({ id: `partnership-${profile.partner_id}`, year: currentDate?.getFullYear(), type: 'partnership', title: 'Formação da dupla atual', description: `Parceria com ${profile.partner_name || 'o parceiro atual'}, construindo química e entrosamento.`, achieved: true });
  if (profile.coach_id) events.push({ id: `coach-${profile.coach_id}`, year: currentDate?.getFullYear(), type: 'coach', title: 'Treinador principal', description: `${profile.coach_name || 'O treinador atual'} passou a liderar a equipe técnica.`, achieved: true });
  if (profile.retired) events.push({ id: 'retirement', year: currentDate?.getFullYear(), type: 'retirement', title: 'Aposentadoria', description: 'A carreira foi encerrada e o legado consolidado.', achieved: true });

  return events.sort((a, b) => (parseDate(a.date)?.getTime() || (a.year || 0) * 31557600000) - (parseDate(b.date)?.getTime() || (b.year || 0) * 31557600000));
}

export function buildSeasonRetrospectives(profile, matches = []) {
  if (!profile) return [];
  const seasons = new Map();
  (matches || []).filter((match) => matchBelongsToProfile(match, profile) && isOfficialMatch(match)).forEach((match) => {
    const date = parseDate(match.date || match.created_date);
    if (!date) return;
    const year = date.getFullYear();
    const season = seasons.get(year) || { year, matches: 0, wins: 0, losses: 0, titles: 0, highlights: [] };
    season.matches += 1;
    if (playerWonMatch(match, profile)) season.wins += 1; else season.losses += 1;
    const round = normalize(match.round || match.stage || match.notes);
    if (playerWonMatch(match, profile) && (round.includes('final') || match.is_final)) {
      season.titles += 1;
      if (match.tournament_name) season.highlights.push(`Campeão do ${match.tournament_name}`);
    }
    seasons.set(year, season);
  });
  return [...seasons.values()].sort((a, b) => b.year - a.year).map((season) => ({ ...season, winRate: season.matches ? Math.round((season.wins / season.matches) * 100) : 0, summary: season.matches ? `${season.wins} vitórias em ${season.matches} partidas, com ${season.titles} título${season.titles === 1 ? '' : 's'}.` : 'Temporada de preparação e desenvolvimento.' }));
}
