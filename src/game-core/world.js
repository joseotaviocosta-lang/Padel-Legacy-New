import { base44 } from '@/api/base44Client';

export async function tickWorldAfterMatch(profile) {
  const athletes = await base44.entities.AthleteProfile.list('-ranking_points', 40);
  const sample = (athletes || []).slice(0, 12);
  await Promise.all(sample.map((athlete) => {
    const change = Math.floor(Math.random() * 9) - 3;
    return base44.entities.AthleteProfile.update(athlete.id, {
      ranking_points: Math.max(0, (Number(athlete.ranking_points) || 0) + change),
      form: Math.max(0, Math.min(100, (Number(athlete.form) || 50) + (Math.floor(Math.random() * 5) - 2))),
    });
  }));
  return { processed: sample.length, date: profile?.career_date };
}
