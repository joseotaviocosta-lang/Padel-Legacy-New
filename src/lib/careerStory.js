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
export function playerWonMatch(match, profile) {
  if (match?.result === 'vitória') return true;
  if (match?.result === 'derrota') return false;
  if (typeof match?.player_won === 'boolean') return match.player_won;
  if (match?.winner_profile_id && profile?.id) return match.winner_profile_id === profile.id;
  const winner = normalize(match?.winner_name || match?.winning_team_name);
  return [profile?.sport_name, profile?.name, profile?.full_name].map(normalize).filter(Boolean).some((name) => winner.includes(name));
}

// Fase 14 (Parte 8): 3 níveis de importância (MAJOR/IMPORTANT/NORMAL do
// briefing) — a timeline padrão (CareerTimeline.jsx) mostra major+important;
// normal fica atrás de "ver mais" (CollapsibleSection). Mapeado por tipo de
// evento, não por evento individual, pra manter previsível.
const EVENT_IMPORTANCE = {
  start: 'important', match: 'important', win: 'major', title: 'major',
  ranking: 'major', 'ranking-minor': 'important', experience: 'normal',
  partnership: 'important', 'partnership-end': 'important', coach: 'important',
  'coach-change': 'important', retirement: 'major', 'notable-match': 'major',
  'notable-match-minor': 'important', rivalry: 'important',
};

export function buildCareerTimeline(profile, matches = [], extra = {}) {
  if (!profile) return [];
  const { partnerships = [], coachTenures = [], relationships = [] } = extra;
  const events = [];
  const startDate = parseDate(profile.career_started_at || profile.created_date || profile.career_date || '2026-01-01');
  const currentDate = parseDate(profile.career_date) || startDate;
  const playerMatches = (matches || []).filter((match) => matchBelongsToProfile(match, profile) && isOfficialMatch(match)).sort((a, b) => (parseDate(a.date || a.created_date)?.getTime() || 0) - (parseDate(b.date || b.created_date)?.getTime() || 0));
  const firstMatch = playerMatches[0];
  const firstWin = playerMatches.find((match) => playerWonMatch(match, profile));
  const push = (event) => events.push({ ...event, importance: EVENT_IMPORTANCE[event.type] || 'normal' });

  push({ id: 'career-start', date: startDate?.toISOString(), year: startDate?.getFullYear(), type: 'start', title: 'Início da carreira', description: `Aos 16 anos, ${profile.sport_name || profile.name || 'o atleta'} iniciou sua jornada no circuito profissional.`, achieved: true });
  if (firstMatch) push({ id: `first-match-${firstMatch.id || 'known'}`, date: parseDate(firstMatch.date || firstMatch.created_date)?.toISOString(), year: parseDate(firstMatch.date || firstMatch.created_date)?.getFullYear(), type: 'match', title: 'Primeira partida oficial', description: firstMatch.tournament_name ? `Estreia no ${firstMatch.tournament_name}.` : 'A estreia oficial no circuito.', achieved: true });
  if (firstWin) push({ id: `first-win-${firstWin.id || 'known'}`, date: parseDate(firstWin.date || firstWin.created_date)?.toISOString(), year: parseDate(firstWin.date || firstWin.created_date)?.getFullYear(), type: 'win', title: 'Primeira vitória', description: firstWin.tournament_name ? `Primeira vitória conquistada no ${firstWin.tournament_name}.` : 'A vitória que iniciou a ascensão.', achieved: true });

  const titles = Array.isArray(profile.titles) ? profile.titles : [];
  if ((profile.tournaments_won || titles.length) > 0) push({ id: 'first-title', year: currentDate?.getFullYear(), type: 'title', title: 'Primeiro título', description: titles[0] ? `Conquista do ${titles[0]}.` : 'O primeiro troféu da carreira.', achieved: true });

  // Fase 14 (Parte 4): momentos marcantes de partida — reaproveita
  // press_importance já calculado e persistido em cada Match oficial
  // (getNotableMatches), nenhuma heurística nova nesta função.
  getNotableMatches(playerMatches, profile).forEach((m) => push({
    id: `notable-${m.id}`, date: parseDate(m.date)?.toISOString(), year: parseDate(m.date)?.getFullYear(),
    type: m.importance === 'global' ? 'notable-match' : 'notable-match-minor',
    title: m.title,
    description: m.opponentRank ? `${m.won ? 'Vitória' : 'Confronto'} na ${m.round} do ${m.tournamentName}, diante do #${m.opponentRank} do ranking.` : `${m.won ? 'Vitória' : 'Confronto'} na ${m.round} do ${m.tournamentName}.`,
    achieved: true,
  }));

  const rank = Number(profile.ranking_position || profile.world_ranking || profile.ranking || 0);
  // Fase 13 (Parte 3/4/11): achado real — esta lista era uma escada PRÓPRIA
  // e mais curta (500/100/50/20/10/1), diferente da escada de conquistas
  // reach_rank (achievementsData.js, agora 500/250/100/50/30/20/10/5/3/1).
  // Um jogador que cruzasse Top 250/30/5/3 ganhava a conquista mas NENHUM
  // registro na timeline de legado — exatamente a falta de conversa entre
  // sistemas que a Parte 0 pede pra identificar. Unificado com a mesma
  // escada, sem duplicar a fonte (valores literais aqui porque
  // achievementsData.js não é importado por este módulo puro/sem storage;
  // qualquer mudança futura na ladder de reach_rank precisa espelhar aqui).
  [500, 250, 100, 50, 30, 20, 10, 5, 3, 1].forEach((milestone) => {
    if (rank > 0 && rank <= milestone) push({ id: `rank-${milestone}`, year: currentDate?.getFullYear(), type: milestone <= 50 ? 'ranking' : 'ranking-minor', title: milestone === 1 ? 'Número 1 do mundo' : `Entrada no Top ${milestone}`, description: `A carreira alcançou a posição #${rank} do ranking mundial.`, achieved: true });
  });

  const level = careerExperienceLevel(Number(profile.xp || 0));
  [5, 10, 20, 30, 40, 50].forEach((milestone) => {
    if (level >= milestone) push({ id: `experience-${milestone}`, year: currentDate?.getFullYear(), type: 'experience', title: `Experiência de carreira ${milestone}`, description: `Novo estágio profissional alcançado com ${Number(profile.xp || 0).toLocaleString('pt-BR')} XP.`, achieved: true });
  });

  if (profile.partner_id) push({ id: `partnership-${profile.partner_id}`, year: currentDate?.getFullYear(), type: 'partnership', title: 'Formação da dupla atual', description: `Parceria com ${profile.partner_name || 'o parceiro atual'}, construindo química e entrosamento.`, achieved: true });
  if (profile.coach_id) push({ id: `coach-${profile.coach_id}`, year: currentDate?.getFullYear(), type: 'coach', title: 'Treinador principal', description: `${profile.coach_name || 'O treinador atual'} passou a liderar a equipe técnica.`, achieved: true });
  if (profile.retired) push({ id: 'retirement', year: currentDate?.getFullYear(), type: 'retirement', title: 'Aposentadoria', description: 'A carreira foi encerrada e o legado consolidado.', achieved: true });

  // Fase 14 (Parte 6/7): parcerias/treinadores encerrados — só entram na
  // timeline se `extra` trouxer o histórico já buscado pela página (nenhuma
  // consulta nova dentro deste módulo puro).
  (partnerships || []).filter((p) => p.status && p.status !== 'ativa' && p.partner_name).forEach((p) => {
    const end = parseDate(p.ended_career_date);
    push({ id: `partnership-end-${p.id}`, date: end?.toISOString(), year: end?.getFullYear() || currentDate?.getFullYear(), type: 'partnership-end', title: `Fim da parceria com ${p.partner_name}`, description: `${p.shared_matches || 0} partidas, ${p.shared_wins || 0} vitórias${p.shared_titles ? `, ${p.shared_titles} título${p.shared_titles === 1 ? '' : 's'}` : ''} juntos.`, achieved: true });
  });
  (coachTenures || []).filter((t) => t.endedDate).forEach((t) => {
    const end = parseDate(t.endedDate);
    push({ id: `coach-change-${t.coachId}-${t.endedDate}`, date: end?.toISOString(), year: end?.getFullYear() || currentDate?.getFullYear(), type: 'coach-change', title: `Fim do período com ${t.coachName}`, description: t.ovrStart != null && t.ovrEnd != null ? `Overall ${t.ovrStart} → ${t.ovrEnd}${t.titles ? `, ${t.titles} título${t.titles === 1 ? '' : 's'}` : ''} durante o período.` : `${t.titles || 0} título${t.titles === 1 ? '' : 's'} durante o período.`, achieved: true });
  });

  // Fase 14 (Parte 5): rivalidade — um único evento marcando quando o
  // confronto mais frequente cruzou o limiar de "rivalidade real" (3+
  // confrontos, mesmo limiar de getTopRivalry), não um evento por partida.
  const rivalry = getTopRivalry(relationships);
  if (rivalry) push({ id: `rivalry-${rivalry.name}`, year: currentDate?.getFullYear(), type: 'rivalry', title: `Rivalidade com ${rivalry.name}`, description: `${rivalry.matches} confrontos, H2H ${rivalry.wins}–${rivalry.losses}${rivalry.finals ? `, ${rivalry.finals} final${rivalry.finals === 1 ? '' : 'is'}` : ''}.`, achieved: true });

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
    // Fase 14 (Parte 1/8): mesma classe de bug já corrigida em
    // buildCareerTimeline/playerWonMatch — `match.round`/`match.is_final`
    // nunca existiram na Match real (o campo persistido é
    // `tournament_round`, e "ganhou o torneio" é `tournament_outcome ===
    // 'champion'`, não uma heurística de texto do round). "Títulos" na
    // retrospectiva de temporada nunca contava mesmo com títulos reais.
    if (match.tournament_outcome === 'champion') {
      season.titles += 1;
      if (match.tournament_name) season.highlights.push(`Campeão do ${match.tournament_name}`);
    }
    seasons.set(year, season);
  });
  return [...seasons.values()].sort((a, b) => b.year - a.year).map((season) => ({ ...season, winRate: season.matches ? Math.round((season.wins / season.matches) * 100) : 0, summary: season.matches ? `${season.wins} vitórias em ${season.matches} partidas, com ${season.titles} título${season.titles === 1 ? '' : 's'}.` : 'Temporada de preparação e desenvolvimento.' }));
}

// Fase 14 (Parte 5): rivalidade emergente a partir de fatos reais — nunca
// uma pontuação sintética. `Relationship.shared_matches/wins/losses/finals`
// (src/lib/relationships.js, corrigido nesta fase pra também contar do lado
// do adversário e da partida oficial de torneio, não só treino) já é o dado
// real de confronto; esta função só seleciona e formata, sem inventar nada.
// Limitação real e assumida (documentada, não escondida): o adversário é
// identificado por NOME (Match/Relationship não guardam um athlete_id de
// oponente), então dois bots com o mesmo nome apareceriam como um só rival —
// nenhum caso conhecido no catálogo de bots, mas uma limitação real do dado
// disponível hoje, não um bug desta função.
const RIVALRY_MIN_MATCHES = 3;

export function getTopRivalry(relationships = []) {
  const candidates = (relationships || [])
    .filter((r) => Number(r.shared_matches) >= RIVALRY_MIN_MATCHES && r.target_name)
    .sort((a, b) => Number(b.shared_matches) - Number(a.shared_matches));
  const top = candidates[0];
  if (!top) return null;
  return {
    name: top.target_name,
    matches: Number(top.shared_matches) || 0,
    wins: Number(top.shared_wins) || 0,
    losses: Number(top.shared_losses) || 0,
    finals: Number(top.shared_finals) || 0,
  };
}

export function getRivalries(relationships = []) {
  return (relationships || [])
    .filter((r) => Number(r.shared_matches) >= RIVALRY_MIN_MATCHES && r.target_name)
    .sort((a, b) => Number(b.shared_matches) - Number(a.shared_matches))
    .map((r) => ({ name: r.target_name, matches: Number(r.shared_matches) || 0, wins: Number(r.shared_wins) || 0, losses: Number(r.shared_losses) || 0, finals: Number(r.shared_finals) || 0 }));
}

// Fase 14 (Parte 4): "momento marcante" reaproveita `press_importance`
// (src/gameplay/worldTour/TournamentRunManager.js, getRoundPressImportance)
// — já uma pontuação real e não-arbitrária (tier do torneio + rodada +
// upset + vitória), calculada e persistida em CADA Match oficial desde a
// Fase 12. Nenhuma heurística nova: 'high'/'global' -> marcante o
// suficiente pra timeline compacta; 'simple'/'medium' nunca entram (uma
// partida de treino não tem esse campo, então nunca aparece aqui).
export function getNotableMatches(matches = [], profile) {
  return (matches || [])
    .filter((m) => isOfficialMatch(m) && ['high', 'global'].includes(m.press_importance))
    .sort((a, b) => (parseDate(b.date || b.created_date)?.getTime() || 0) - (parseDate(a.date || a.created_date)?.getTime() || 0))
    .map((m) => ({
      id: m.id,
      date: m.date || m.created_date,
      won: playerWonMatch(m, profile),
      tournamentName: m.tournament_name,
      round: m.tournament_round,
      opponentRank: m.opponent_rank || null,
      importance: m.press_importance,
      title: m.tournament_outcome === 'champion' ? `Título no ${m.tournament_name}` : playerWonMatch(m, profile) ? `Vitória marcante no ${m.tournament_name}` : `Confronto marcante no ${m.tournament_name}`,
    }));
}

// Fase 14 (Parte 6): Partnership já preserva histórico real (start/end,
// partidas, vitórias, títulos — src/lib/partnershipSystem.js). Esta função
// só escolhe/formata a partir de linhas já buscadas pela página (mesmo
// princípio de getTopRivalry: nenhuma consulta nova, nenhuma estatística
// inventada). `endedCareerDate` só é confiável a partir da correção do bug
// de endPartnership desta fase — parcerias encerradas ANTES da correção
// continuam com `ended_career_date` igual à data de início (dado antigo
// incorreto, não reconstruível; duração aparecerá como 0 dias para essas).
function partnershipDurationDays(p) {
  const start = parseDate(p.started_career_date);
  const end = parseDate(p.ended_career_date) || parseDate(p.scheduled_end_date);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function describePartnershipHistory(partnerships = []) {
  const rows = (partnerships || []).filter((p) => p.partner_name);
  if (!rows.length) return { bestByTitles: null, mostMatches: null, longest: null };
  const bestByTitles = [...rows].sort((a, b) => (Number(b.shared_titles) || 0) - (Number(a.shared_titles) || 0))[0];
  const mostMatches = [...rows].sort((a, b) => (Number(b.shared_matches) || 0) - (Number(a.shared_matches) || 0))[0];
  const longest = [...rows].sort((a, b) => partnershipDurationDays(b) - partnershipDurationDays(a))[0];
  const format = (p) => p && { name: p.partner_name, matches: Number(p.shared_matches) || 0, wins: Number(p.shared_wins) || 0, titles: Number(p.shared_titles) || 0, durationDays: partnershipDurationDays(p), status: p.status };
  return { bestByTitles: format(bestByTitles), mostMatches: format(mostMatches), longest: format(longest) };
}
