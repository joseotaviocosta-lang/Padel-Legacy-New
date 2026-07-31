import { localGame } from '@/api/localGameClient.js';
import { levelForXp, incrementMissionProgress } from '@/lib/padel';
import { getTournamentRewards } from '@/lib/career';
import { addTeamRankingPoints, addTeamTitle } from '@/lib/teamRanking';
import { getActivePartnership, recordPartnershipTitle } from '@/lib/partnershipSystem';
import { safeName, todayForProfile } from './utils';

function placementLabel(roundsWon, totalRounds, champion) {
  if (champion) return 'Campeão';
  const remaining = Math.max(1, totalRounds - roundsWon);
  if (remaining === 1) return 'Finalista';
  if (remaining === 2) return 'Semifinalista';
  if (remaining === 3) return 'Quartas de final';
  return 'Participante';
}

async function resolveTournamentCalendar(profileId, tournamentId) {
  const events = await localGame.entities.CalendarEvent.filter({
    profile_id: profileId,
    related_id: tournamentId,
    status: 'scheduled',
  });
  if (!events?.length) return null;
  return localGame.entities.CalendarEvent.update(events[0].id, {
    status: 'completed',
    requires_decision: false,
  });
}

export async function finalizeTournamentRun({ profile, tournament, partner, roundsWon, totalRounds }) {
  const rewards = getTournamentRewards(tournament.tier, roundsWon);
  const champion = roundsWon >= totalRounds;
  const newXp = (Number(profile?.xp) || 0) + rewards.xp;
  const updates = {
    coins: (Number(profile?.coins) || 0) + rewards.coins,
    xp: newXp,
    level: levelForXp(newXp),
    tournaments_played: (Number(profile?.tournaments_played) || 0) + 1,
    rank_points: (Number(profile?.rank_points) || 0) + rewards.rankPoints,
  };

  if (champion) {
    updates.tournaments_won = (Number(profile?.tournaments_won) || 0) + 1;
    updates.titles = [...(profile?.titles || []), tournament.name];
    updates.confidence = Math.min(100, (Number(profile?.confidence) || 50) + 8);
    updates.morale = Math.min(100, (Number(profile?.morale) || 70) + 10);
  }

  const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, updates);
  await addTeamRankingPoints(profile, partner, rewards.rankPoints);

  if (champion) {
    await Promise.allSettled([
      incrementMissionProgress(profile.id, 'win_tournament'),
      addTeamTitle(profile, partner, tournament.name),
      localGame.entities.Tournament.update(tournament.id, {
        status: 'finalizado',
        champion: `${safeName(profile)} & ${partner?.name || 'Parceiro'}`,
        current_phase: 'concluido',
      }),
    ]);
    const partnership = await getActivePartnership(profile.id);
    if (partnership) await recordPartnershipTitle(partnership.id);
  }

  const placement = placementLabel(roundsWon, totalRounds, champion);
  const date = todayForProfile(profile);
  await Promise.allSettled([
    resolveTournamentCalendar(profile.id, tournament.id),
    localGame.entities.FinancialTransaction.create({
      profile_id: profile.id,
      date,
      type: 'income',
      category: 'torneio',
      description: `${placement} — ${tournament.name}`,
      amount: rewards.coins,
    }),
    localGame.entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(date.slice(0, 4)),
      event_date: date,
      title: champion ? `Título no ${tournament.name}` : `${placement} no ${tournament.name}`,
      description: `${safeName(profile)} e ${partner?.name || 'Parceiro'} encerraram o torneio como ${placement.toLowerCase()}.`,
      category: 'carreira',
    }),
    localGame.entities.PressArticle.create({
      profile_id: profile.id,
      title: champion
        ? `${safeName(profile)} conquista o ${tournament.name}`
        : `${safeName(profile)} encerra campanha no ${tournament.name}`,
      content: champion
        ? `Ao lado de ${partner?.name || 'seu parceiro'}, ${safeName(profile)} levantou o troféu e somou ${rewards.rankPoints} pontos no ranking.`
        : `A dupla chegou à fase de ${placement.toLowerCase()} e somou experiência para a sequência da temporada.`,
      sentiment: champion ? 'positivo' : 'neutro',
      outlet: 'Padel Legacy News',
      journalist_name: 'Redação PL',
      published_date: date,
    }),
    localGame.entities.Post.create({
      author_name: 'Padel Legacy News',
      author_type: 'media',
      content: champion
        ? `🏆 ${safeName(profile)} e ${partner?.name || 'Parceiro'} são campeões do ${tournament.name}!`
        : `${safeName(profile)} terminou o ${tournament.name} como ${placement.toLowerCase()}.`,
      likes: champion ? 95 : 24,
      comments_count: champion ? 21 : 5,
      created_date: new Date().toISOString(),
    }),
  ]);

  return { updatedProfile, rewards, champion, placement };
}
