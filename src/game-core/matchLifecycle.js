import { localGame } from '@/api/localGameClient.js';
import { CORE_BALANCE } from './config';
import { calculatePracticeProgress } from './progression';
import { calculatePostMatchCondition } from './condition';
import { recordMatchEconomy } from './economy';
import { publishMatchNews } from './news';
import { recordCareerHistory } from './history';
import { updateLocalTeamRanking } from './ranking';
import { tickWorldAfterMatch } from './world';

export async function finalizePracticeMatch({ profile, won, partnerName, opponents, score }) {
  const balance = CORE_BALANCE.practice;
  const progress = calculatePracticeProgress(profile, won, balance);
  const condition = calculatePostMatchCondition(profile, won, balance);
  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
    ...progress.updates,
    ...condition,
    rank_points: (Number(profile?.rank_points) || 0) + (won ? CORE_BALANCE.ranking.practiceWin : CORE_BALANCE.ranking.practiceLoss),
  });

  await Promise.allSettled([
    recordMatchEconomy(profile, progress.coinsGain, won),
    publishMatchNews(profile, won, partnerName, opponents, score),
    recordCareerHistory(profile, won, partnerName, score),
    updateLocalTeamRanking(profile, partnerName, won ? 2 : 0, won),
    tickWorldAfterMatch(updated),
  ]);

  return { updatedProfile: updated, rewards: { xp: progress.xpGain, coins: progress.coinsGain } };
}
