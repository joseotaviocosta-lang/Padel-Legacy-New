import { localGame } from '@/api/localGameClient.js';
import { levelForXp } from '@/lib/padel';
import { getTournamentRewards } from '@/lib/career';
import { teamKey } from '@/lib/teamRanking';
import { buildPartnershipTitlePatch, getActivePartnership } from '@/lib/partnershipSystem';
import { safeName, todayForProfile } from './utils';
import { RANKING_RESULT_ENTITY, buildLegacySeedRow, needsLegacySeed, computeRollingPoints } from './rankingWindow.js';

function placementLabel(roundsWon, totalRounds, champion) {
  if (champion) return 'Campeão';
  const remaining = Math.max(1, totalRounds - roundsWon);
  if (remaining === 1) return 'Finalista';
  if (remaining === 2) return 'Semifinalista';
  if (remaining === 3) return 'Quartas de final';
  return 'Participante';
}

export async function prepareTournamentFinalization({ profile, tournament, partner, roundsWon, totalRounds, runId = null, bracketHistory = null, runnerUp = null }) {
  const rewards = getTournamentRewards(tournament.tier, roundsWon, profile);
  const champion = roundsWon >= totalRounds;
  const finalizationKey = String(runId || `${profile.id}:${tournament.id}:${tournament.start_date || 'edition'}`);
  const processedRuns = Array.isArray(profile.processed_tournament_runs) ? profile.processed_tournament_runs : [];
  const alreadyProcessed = processedRuns.includes(finalizationKey);
  const date = todayForProfile(profile);
  const rankingKey = partner?.id ? teamKey(profile.id, partner.id) : null;
  const [calendarEvents, registrations, rankingRows, partnership, playerResultRows] = await Promise.all([
    localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id, status: 'scheduled' }),
    localGame.entities.TournamentRegistration.filter({ profile_id: profile.id, tournament_id: tournament.id }),
    rankingKey ? localGame.entities.TeamRanking.filter({ team_key: rankingKey }) : Promise.resolve([]),
    champion ? getActivePartnership(profile.id) : Promise.resolve(null),
    localGame.entities[RANKING_RESULT_ENTITY].filter({ athlete_id: profile.id }),
  ]);

  const newXp = (Number(profile.xp) || 0) + rewards.xp;

  // Fase 4 (ranking rolling de 52 semanas): rank_points do jogador deixa de
  // ser incrementado pra sempre — grava um resultado datado nesta MESMA
  // finalização (AthleteRankingResult, coleção própria, nunca no
  // PlayerProfile clonado a cada escrita — mesmo motivo do ranking_history
  // na Fase 4.0) e recalcula o total como soma dos 22 melhores dentro dos
  // últimos 364 dias, igual a qualquer atleta de IA (circuitLifecycle.js).
  // Só roda quando a finalização é nova — idempotente, `alreadyProcessed`
  // continua barrando reprocessamento como sempre barrou.
  let nextRankPoints = Number(profile.rank_points) || 0;
  let playerLegacySeed = null;
  let playerResultRow = null;
  if (!alreadyProcessed) {
    const priorRows = playerResultRows || [];
    const lifetimeFallback = Math.max(0, Number(profile.rank_points ?? profile.world_ranking_points) || 0);
    playerLegacySeed = needsLegacySeed(priorRows, lifetimeFallback) ? buildLegacySeedRow(profile.id, lifetimeFallback, date) : null;
    playerResultRow = {
      id: `${profile.id}:${tournament.id}`,
      athlete_id: profile.id,
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      tier: tournament.tier,
      date,
      points: rewards.rankPoints,
      finish: champion ? 'champion' : placementLabel(roundsWon, totalRounds, champion),
    };
    const extraRows = playerLegacySeed ? [playerLegacySeed, playerResultRow] : [playerResultRow];
    nextRankPoints = computeRollingPoints(priorRows, extraRows, date);
  }

  const playerPatch = alreadyProcessed ? {} : {
    coins: (Number(profile.coins) || 0) + rewards.coins,
    xp: newXp,
    level: levelForXp(newXp),
    tournaments_played: (Number(profile.tournaments_played) || 0) + 1,
    rank_points: nextRankPoints,
    world_ranking_points: nextRankPoints,
    // Correção UI/cronologia — Fase 3: race_points (temporada em andamento)
    // cresce junto com o Circuito (rank_points) a cada torneio real disputado,
    // mas é um campo isolado, zerado à parte na virada do ano civil — nunca
    // copiado/derivado do Circuito acumulado. Fase 4A.3: Race não entra na
    // janela rolling — continua um acumulador simples do ano civil.
    race_points: Math.max(0, Number(profile.race_points) || 0) + rewards.rankPoints,
    processed_tournament_runs: [...processedRuns, finalizationKey].slice(-100),
    ...(champion ? {
      tournaments_won: (Number(profile.tournaments_won) || 0) + 1,
      titles: [...(profile.titles || []), tournament.name],
      confidence: Math.min(100, (Number(profile.confidence) || 50) + 8),
      morale: Math.min(100, (Number(profile.morale) || 70) + 10),
    } : {}),
  };
  const operations = [];

  if (!alreadyProcessed && playerResultRow) {
    if (playerLegacySeed) operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: playerLegacySeed.id, data: playerLegacySeed });
    operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: playerResultRow.id, data: playerResultRow });
  }

  if (!alreadyProcessed && rankingKey && partner) {
    const ranking = rankingRows?.[0];
    const players = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
    // Fase 4 (achado #21, razão atualizada): a linha de TeamRanking do
    // jogador tinha o MESMO bug do carryover de temporada um nível abaixo
    // — incrementava pra sempre. Vira média dos dois totais rolling
    // ATUAIS (o do jogador já recalculado acima; o do parceiro, se for de
    // IA, já é rolling desde circuitLifecycle.js) — mesmo padrão que
    // duplas de IA já seguem em updateTeamRankings.
    const partnerPoints = Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);
    operations.push({ type: 'upsert', entityName: 'TeamRanking', id: ranking?.id || `team-ranking-${rankingKey}`, data: {
      team_key: rankingKey,
      player1_id: players[0].id,
      player1_name: players[0].sport_name || players[0].name,
      player2_id: players[1].id,
      player2_name: players[1].sport_name || players[1].name,
      ranking_points: Math.round((nextRankPoints + partnerPoints) / 2),
      matches_played: Number(ranking?.matches_played || 0),
      wins: Number(ranking?.wins || 0),
      losses: Number(ranking?.losses || 0),
      titles: champion ? [...(ranking?.titles || []), tournament.name] : (ranking?.titles || []),
    } });
  }
  if (!alreadyProcessed && champion && partnership) {
    const partnershipPatch = buildPartnershipTitlePatch(partnership, date);
    operations.push({ type: 'update', entityName: 'Partnership', id: partnership.id, data: partnershipPatch });
    Object.assign(playerPatch, {
      partner_chemistry: partnershipPatch.chemistry,
      partner_trust: partnershipPatch.partner_trust,
      partner_morale: partnershipPatch.partner_morale,
    });
  }
  // Playthrough 4, item 1 (Londres Challenge: chave e Jornal anunciando
  // campeões DIFERENTES para o mesmo torneio). O Tournament só era atualizado
  // quando o jogador era CAMPEÃO. Perdendo, o evento seguia com
  // `status !== 'finalizado'` e sem `world_tour_resolved` — exatamente o
  // predicado de pendência de resolveCompletedWorldTourEvents
  // (WorldTourLifecycle.js) — e o circuito da IA re-resolvia o MESMO torneio
  // no avanço de dia seguinte: sobrescrevia `champion`/`runner_up`, publicava
  // a notícia do Jornal e distribuía os pontos de Race do título para uma
  // dupla que nunca entrou na chave. Duas verdades para um evento só; a
  // chave, que tem o placar real da partida disputada, é a certa. Agora a
  // campanha do jogador SEMPRE encerra o Tournament.
  const finalRound = Array.isArray(bracketHistory) ? bracketHistory[bracketHistory.length - 1] : null;
  const finalMatch = finalRound?.is_final ? finalRound.matches?.[0] : null;
  // A final só está decidida se o jogador chegou até ela (como campeão ou
  // como vice, com a derrota já registrada). Eliminado antes, o título é
  // decidido numa parte do quadro que o `tournament_run` não modela (item
  // 8b) — nesse caso `world_tour_resolved` NÃO é marcado e o circuito da IA
  // continua sendo quem define o campeão, sem nada a contradizer, porque a
  // chave agora termina na eliminação (buildTournamentBracketHistory).
  const finalDecided = Boolean(finalMatch?.winner);
  operations.push({ type: 'update', entityName: 'Tournament', id: tournament.id, data: {
    status: 'finalizado',
    current_phase: 'concluido',
    player_participated: true,
    ...(Array.isArray(bracketHistory) ? { bracket_history: bracketHistory } : {}),
    ...(finalDecided ? {
      world_tour_resolved: true,
      player_decided_result: true,
      resolved_at: date,
      champion: finalMatch.winner,
      runner_up: (finalMatch.team_a === finalMatch.winner ? finalMatch.team_b : finalMatch.team_a) || runnerUp || 'Dupla finalista',
    } : {}),
  } });
  for (const event of calendarEvents || []) operations.push({ type: 'update', entityName: 'CalendarEvent', id: event.id, data: { status: 'completed', requires_decision: false } });
  for (const registration of (registrations || []).filter((item) => ['pending', 'confirmed'].includes(item.status))) {
    operations.push({ type: 'update', entityName: 'TournamentRegistration', id: registration.id, data: { status: 'completed', completed_at: new Date().toISOString() } });
  }

  const placement = placementLabel(roundsWon, totalRounds, champion);
  const recordKey = finalizationKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  operations.push(
    { type: 'upsert', entityName: 'FinancialTransaction', id: `tournament-prize-${recordKey}`, data: { profile_id: profile.id, date, type: 'income', category: 'torneio', description: `${placement} — ${tournament.name}`, amount: rewards.coins } },
    { type: 'upsert', entityName: 'HistoryEntry', id: `tournament-history-${recordKey}`, data: { profile_id: profile.id, year: Number(date.slice(0, 4)), event_date: date, title: champion ? `Título no ${tournament.name}` : `${placement} no ${tournament.name}`, description: `${safeName(profile)} e ${partner?.name || 'Parceiro'} encerraram o torneio como ${placement.toLowerCase()}.`, category: 'carreira' } },
    { type: 'upsert', entityName: 'PressArticle', id: `tournament-press-${recordKey}`, data: { profile_id: profile.id, title: champion ? `${safeName(profile)} conquista o ${tournament.name}` : `${safeName(profile)} encerra campanha no ${tournament.name}`, content: champion ? `Ao lado de ${partner?.name || 'seu parceiro'}, ${safeName(profile)} levantou o troféu e somou ${rewards.rankPoints} pontos no ranking.` : `A dupla chegou à fase de ${placement.toLowerCase()} e somou experiência para a sequência da temporada.`, sentiment: champion ? 'positivo' : 'neutro', outlet: 'Padel Legacy News', journalist_name: 'Redação PL', published_date: date } },
    { type: 'upsert', entityName: 'Post', id: `tournament-post-${recordKey}`, data: { author_name: 'Padel Legacy News', author_type: 'media', content: champion ? `🏆 ${safeName(profile)} e ${partner?.name || 'Parceiro'} são campeões do ${tournament.name}!` : `${safeName(profile)} terminou o ${tournament.name} como ${placement.toLowerCase()}.`, likes: champion ? 95 : 24, comments_count: champion ? 21 : 5, created_date: new Date().toISOString() } },
  );

  return { operations, playerPatch, updatedProfile: { ...profile, ...playerPatch }, rewards, champion, placement, idempotent: alreadyProcessed };
}

export async function finalizeTournamentRun(input) {
  const prepared = await prepareTournamentFinalization(input);
  const operations = [...prepared.operations];
  if (!prepared.idempotent) operations.push({ type: 'playerUpdate', id: input.profile.id, data: prepared.playerPatch });
  const transaction = await localGame.batch(operations);
  return { ...prepared, updatedProfile: transaction.player || prepared.updatedProfile, writes: 1 };
}
