import { localGame } from '@/api/localGameClient.js';
import { CORE_BALANCE } from './config';
import { calculatePracticeProgress } from './progression';
import { calculatePostMatchCondition } from './condition';
import { safeName, todayForProfile } from './utils';
import {
  buildCompactMatchRecord,
  createMatchEndProfiler,
  makeMatchFinalizationKey,
  scheduleSecondaryMatchWork,
} from './matchFinalization';

function teamKeyFor(profile, partnerName) {
  return [profile.sport_name || 'jogador', partnerName || 'parceiro']
    .map((value) => String(value).toLowerCase().replace(/\s+/g, '-'))
    .sort().join('__');
}

async function buildSecondaryOperations({ profile, won, partnerName, opponents, score, coinsGain, finalizationKey }) {
  const teamKey = teamKeyFor(profile, partnerName);
  const [rankingRows, athletes] = await Promise.all([
    localGame.entities.TeamRanking.filter({ team_key: teamKey }),
    localGame.entities.AthleteProfile.list('-ranking_points', 40),
  ]);
  const currentRanking = rankingRows?.[0];
  const date = todayForProfile(profile);
  const recordId = finalizationKey.replaceAll(':', '-');
  const playerName = safeName(profile);
  const newsTitle = won
    ? `${playerName} vence ao lado de ${partnerName}`
    : `${playerName} é superado em partida equilibrada`;
  const newsContent = won
    ? `${playerName} e ${partnerName} venceram ${opponents.join(' e ')} por ${score}. A dupla segue ganhando entrosamento.`
    : `${playerName} e ${partnerName} perderam para ${opponents.join(' e ')} por ${score}, mas ganharam experiência para a sequência da temporada.`;

  /** @type {any[]} */
  const operations = [
    {
      type: 'upsert', entityName: 'FinancialTransaction', id: `finance-${recordId}`,
      data: { profile_id: profile.id, date, type: 'income', category: 'partida', description: won ? 'Premiação por vitória em partida treino' : 'Participação em partida treino', amount: coinsGain },
    },
    {
      type: 'upsert', entityName: 'HistoryEntry', id: `history-${recordId}`,
      data: { profile_id: profile.id, year: Number(date.slice(0, 4)), event_date: date, title: won ? 'Vitória em partida treino' : 'Partida treino disputada', description: `${playerName} e ${partnerName}: ${score}`, category: 'carreira' },
    },
    {
      type: 'upsert', entityName: 'PressArticle', id: `press-${recordId}`,
      data: { profile_id: profile.id, title: newsTitle, content: newsContent, sentiment: won ? 'positivo' : 'neutro', outlet: 'Padel Legacy News', journalist_name: 'Redação PL', published_date: date },
    },
    {
      type: 'upsert', entityName: 'Post', id: `post-${recordId}`,
      data: { author_name: 'Padel Legacy News', author_type: 'media', content: newsTitle, likes: won ? 24 : 9, comments_count: won ? 6 : 2, created_date: new Date().toISOString() },
    },
    {
      type: 'upsert', entityName: 'TeamRanking', id: currentRanking?.id || `team-ranking-${teamKey}`,
      data: { team_key: teamKey, player1_name: profile.sport_name || 'Jogador', player2_name: partnerName, ranking_position: currentRanking?.ranking_position || 999, rank_points: (Number(currentRanking?.rank_points) || 0) + (won ? 2 : 0), wins: (Number(currentRanking?.wins) || 0) + (won ? 1 : 0), losses: (Number(currentRanking?.losses) || 0) + (won ? 0 : 1) },
    },
  ];
  for (const athlete of (athletes || []).slice(0, 12)) {
    operations.push({
      type: 'update', entityName: 'AthleteProfile', id: athlete.id,
      data: {
        ranking_points: Math.max(0, (Number(athlete.ranking_points) || 0) + Math.floor(Math.random() * 9) - 3),
        form: Math.max(0, Math.min(100, (Number(athlete.form) || 50) + Math.floor(Math.random() * 5) - 2)),
      },
    });
  }
  return operations;
}

export async function finalizePracticeMatch({ profile, matchState, partnerName, opponents, liveCoachSettings }) {
  if (!profile?.id || !matchState?.finished) throw new Error('Partida concluída e perfil são obrigatórios.');
  const profiler = createMatchEndProfiler();
  const won = matchState.winner === 'A';
  const score = (matchState.setScores || []).map((set) => `${set.gamesA}-${set.gamesB}`).join(', ');
  const balance = CORE_BALANCE.practice;
  const progress = await profiler.measure('aggregateStats', async () => calculatePracticeProgress(profile, won, balance));
  const condition = await profiler.measure('energy', async () => calculatePostMatchCondition(profile, won, balance));
  const finalizationKey = makeMatchFinalizationKey(profile, matchState);
  const matchId = `match-${finalizationKey.replaceAll(':', '-')}`;
  const matchRecord = await profiler.measure('createMatchRecord', async () => buildCompactMatchRecord({
    id: matchId,
    profile,
    matchState,
    partnerName,
    opponents,
  }));
  const appliedSuggestions = Number(matchState.liveCoachReport?.suggestionsApplied || 0);
  const playerPatch = {
    ...progress.updates,
    ...condition,
    rank_points: (Number(profile.rank_points) || 0) + (won ? CORE_BALANCE.ranking.practiceWin : CORE_BALANCE.ranking.practiceLoss),
    live_coach_settings: liveCoachSettings || profile.live_coach_settings,
    live_coach_history: matchState.liveCoachReport ? [...(profile.live_coach_history || []), matchState.liveCoachReport].slice(-100) : profile.live_coach_history,
    coach_match_observations: [...(profile.coach_match_observations || []), ...(matchState.liveCoach?.observations || [])].slice(-500),
    tactical_adjustment_history: [...(profile.tactical_adjustment_history || []), ...(matchState.liveCoach?.adjustments || [])].slice(-300),
    coach_trust: Math.min(100, (Number(profile.coach_trust) || 50) + (won ? 1 : 0) + (appliedSuggestions > 0 ? 1 : 0)),
    coach_tactical_understanding: Math.min(100, (Number(profile.coach_tactical_understanding) || 20) + 1),
  };

  const coreResult = await profiler.measure('persistSave', async () => localGame.batch([
    { type: 'upsert', entityName: 'Match', id: matchId, data: matchRecord },
    { type: 'playerUpdate', id: profile.id, data: playerPatch },
  ], { idempotencyKey: finalizationKey }));

  const updatedProfile = coreResult.player || { ...profile, ...playerPatch };
  const secondary = coreResult.skipped
    ? Promise.resolve({ skipped: true, writes: 0 })
    : scheduleSecondaryMatchWork(async () => {
      const operations = await buildSecondaryOperations({ profile: updatedProfile, won, partnerName, opponents, score, coinsGain: progress.coinsGain, finalizationKey });
      const result = await localGame.batch(operations);
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:match-finalized', { detail: { matchId, won, type: 'practice' } }));
      return result;
    });

  const timings = profiler.finish();
  return {
    updatedProfile,
    rewards: { xp: progress.xpGain, coins: progress.coinsGain },
    matchRecord,
    recapSnapshot: matchRecord.recap_snapshot,
    finalizationKey,
    skipped: coreResult.skipped,
    writes: coreResult.skipped ? 0 : 1,
    secondary,
    timings,
  };
}
