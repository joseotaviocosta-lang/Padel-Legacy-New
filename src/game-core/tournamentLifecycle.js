import { localGame } from '@/api/localGameClient.js';
import { levelForXp } from '@/lib/padel';
import { getTournamentRewards } from '@/lib/career';
import { teamKey } from '@/lib/teamRanking';
import { buildPartnershipTitlePatch, getActivePartnership } from '@/lib/partnershipSystem';
import { safeName, todayForProfile } from './utils';

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
  const [calendarEvents, registrations, rankingRows, partnership] = await Promise.all([
    localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id, status: 'scheduled' }),
    localGame.entities.TournamentRegistration.filter({ profile_id: profile.id, tournament_id: tournament.id }),
    rankingKey ? localGame.entities.TeamRanking.filter({ team_key: rankingKey }) : Promise.resolve([]),
    champion ? getActivePartnership(profile.id) : Promise.resolve(null),
  ]);

  const newXp = (Number(profile.xp) || 0) + rewards.xp;
  const playerPatch = alreadyProcessed ? {} : {
    coins: (Number(profile.coins) || 0) + rewards.coins,
    xp: newXp,
    level: levelForXp(newXp),
    tournaments_played: (Number(profile.tournaments_played) || 0) + 1,
    rank_points: (Number(profile.rank_points) || 0) + rewards.rankPoints,
    // Correção UI/cronologia — Fase 3: race_points (temporada em andamento)
    // cresce junto com o Circuito (rank_points) a cada torneio real disputado,
    // mas é um campo isolado, zerado à parte na virada do ano civil — nunca
    // copiado/derivado do Circuito acumulado.
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

  if (!alreadyProcessed && rankingKey && partner) {
    const ranking = rankingRows?.[0];
    const players = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
    operations.push({ type: 'upsert', entityName: 'TeamRanking', id: ranking?.id || `team-ranking-${rankingKey}`, data: {
      team_key: rankingKey,
      player1_id: players[0].id,
      player1_name: players[0].sport_name || players[0].name,
      player2_id: players[1].id,
      player2_name: players[1].sport_name || players[1].name,
      ranking_points: (Number(ranking?.ranking_points) || 0) + rewards.rankPoints,
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
  if (champion) {
    operations.push({ type: 'update', entityName: 'Tournament', id: tournament.id, data: {
      status: 'finalizado',
      champion: `${safeName(profile)} & ${partner?.name || 'Parceiro'}`,
      runner_up: runnerUp || 'Dupla finalista',
      ...(Array.isArray(bracketHistory) ? { bracket_history: bracketHistory } : {}),
      current_phase: 'concluido',
    } });
  }
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
