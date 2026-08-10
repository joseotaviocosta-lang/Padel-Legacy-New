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

async function completeTournamentRegistration(profileId, tournamentId) {
  const rows = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: tournamentId });
  await Promise.all((rows || []).filter((item) => ['pending', 'confirmed'].includes(item.status)).map((item) => (
    localGame.entities.TournamentRegistration.update(item.id, { status: 'completed', completed_at: new Date().toISOString() })
  )));
}

export async function finalizeTournamentRun({ profile, tournament, partner, roundsWon, totalRounds, runId = null, bracketHistory = null, runnerUp = null }) {
  const rewards = getTournamentRewards(tournament.tier, roundsWon);
  const champion = roundsWon >= totalRounds;
  const finalizationKey = String(runId || `${profile.id}:${tournament.id}:${tournament.start_date || 'edition'}`);
  const processedRuns = Array.isArray(profile?.processed_tournament_runs) ? profile.processed_tournament_runs : [];
  const alreadyProcessed = processedRuns.includes(finalizationKey);
  const newXp = (Number(profile?.xp) || 0) + rewards.xp;
  const updates = {
    coins: (Number(profile?.coins) || 0) + rewards.coins,
    xp: newXp,
    level: levelForXp(newXp),
    tournaments_played: (Number(profile?.tournaments_played) || 0) + 1,
    rank_points: (Number(profile?.rank_points) || 0) + rewards.rankPoints,
    processed_tournament_runs: [...processedRuns, finalizationKey].slice(-100),
  };

  if (champion) {
    updates.tournaments_won = (Number(profile?.tournaments_won) || 0) + 1;
    updates.titles = [...(profile?.titles || []), tournament.name];
    updates.confidence = Math.min(100, (Number(profile?.confidence) || 50) + 8);
    updates.morale = Math.min(100, (Number(profile?.morale) || 70) + 10);
  }

  const updatedProfile = alreadyProcessed ? profile : await localGame.entities.PlayerProfile.update(profile.id, updates);
  if (!alreadyProcessed) await addTeamRankingPoints(profile, partner, rewards.rankPoints);

  if (champion) {
    if (!alreadyProcessed) {
      await Promise.allSettled([
        incrementMissionProgress(profile.id, 'win_tournament'),
        addTeamTitle(profile, partner, tournament.name),
      ]);
      const partnership = await getActivePartnership(profile.id);
      if (partnership) await recordPartnershipTitle(partnership.id);
    }
    await localGame.entities.Tournament.update(tournament.id, {
      status: 'finalizado',
      champion: `${safeName(profile)} & ${partner?.name || 'Parceiro'}`,
      runner_up: runnerUp || 'Dupla finalista',
      ...(Array.isArray(bracketHistory) ? { bracket_history: bracketHistory } : {}),
      current_phase: 'concluido',
    });
  }

  const placement = placementLabel(roundsWon, totalRounds, champion);
  const date = todayForProfile(profile);
  const recordKey = String(finalizationKey).replace(/[^a-zA-Z0-9_-]/g, '-');
  await Promise.allSettled([
    resolveTournamentCalendar(profile.id, tournament.id),
    completeTournamentRegistration(profile.id, tournament.id),
    localGame.entities.FinancialTransaction.upsert(`tournament-prize-${recordKey}`, {
      profile_id: profile.id,
      date,
      type: 'income',
      category: 'torneio',
      description: `${placement} — ${tournament.name}`,
      amount: rewards.coins,
    }),
    localGame.entities.HistoryEntry.upsert(`tournament-history-${recordKey}`, {
      profile_id: profile.id,
      year: Number(date.slice(0, 4)),
      event_date: date,
      title: champion ? `Título no ${tournament.name}` : `${placement} no ${tournament.name}`,
      description: `${safeName(profile)} e ${partner?.name || 'Parceiro'} encerraram o torneio como ${placement.toLowerCase()}.`,
      category: 'carreira',
    }),
    localGame.entities.PressArticle.upsert(`tournament-press-${recordKey}`, {
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
    localGame.entities.Post.upsert(`tournament-post-${recordKey}`, {
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

  return { updatedProfile, rewards, champion, placement, idempotent: alreadyProcessed };
}
