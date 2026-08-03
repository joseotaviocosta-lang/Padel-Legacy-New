import { localGame } from '@/api/localGameClient.js';
import { executeTraining } from '@/lib/trainingSystemV2';
import { safeName } from './utils';

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function trainingTitle(activity) {
  return activity?.label || 'Sessão de treino';
}

export async function finalizeTrainingSession(profile, activity, intensityId, coachBonus = {}) {
  const result = await executeTraining(profile, activity, intensityId, coachBonus);
  if (result?.error || !result?.profile) return result;

  const updated = result.profile;
  const date = updated.career_date || profile?.career_date;
  const athleteName = safeName(updated);
  const attribute = Object.keys(result.gains || {}).join(', ') || result.activity?.attribute || activity?.attribute || 'atributos';
  const gain = Number(result.gain) || 0;

  const jobs = [
    localGame.entities.HistoryEntry.create({
      profile_id: updated.id,
      year: Number(String(date || '').slice(0, 4)) || new Date().getFullYear(),
      event_date: date,
      title: trainingTitle(result.activity || activity),
      description: result.injured
        ? `${athleteName} sofreu uma lesão durante o treino e ficará em recuperação por ${result.recoveryDays || 1} dia(s).`
        : `${athleteName} concluiu um treino ${result.intensity?.label || intensityId}. Evolução de +${gain} em ${attribute}.`,
      category: result.injured ? 'lesao' : 'treino',
    }),
  ];

  if (result.injured) {
    jobs.push(
      localGame.entities.CareerMessage.create({
        profile_id: updated.id,
        sender_name: 'Departamento Médico',
        subject: 'Relatório de lesão',
        body: `A lesão sofrida no treino exige ${result.recoveryDays || 1} dia(s) de recuperação. Evite novas atividades até a liberação médica.`,
        status: 'nao_lida',
        message_type: 'injury_report',
        created_date: new Date().toISOString(),
      }),
      localGame.entities.PressArticle.create({
        title: `${athleteName} sofre lesão durante treinamento`,
        subtitle: `Atleta deve ficar afastado por ${result.recoveryDays || 1} dia(s).`,
        content: `${athleteName} interrompeu a preparação após sentir uma lesão durante ${trainingTitle(result.activity || activity).toLowerCase()}.`,
        category: 'lesao',
        published_date: date,
        related_profile_id: updated.id,
      }),
    );
  } else if (gain > 0 && (updated.trainings_today || 0) === 1) {
    jobs.push(localGame.entities.CareerMessage.create({
      profile_id: updated.id,
      sender_name: 'Equipe Técnica',
      subject: 'Treino concluído',
      body: `Boa sessão: +${gain} em ${attribute}. Energia atual: ${updated.energy ?? 0}; fadiga: ${updated.fatigue ?? 0}.`,
      status: 'nao_lida',
      message_type: 'training_feedback',
      created_date: new Date().toISOString(),
    }));
  }

  // Treinos táticos e mentais também ajudam a estabilidade da dupla.
  if (updated.partner_id && activity?.category === 'mental') {
    const chemistry = clamp((updated.partner_chemistry ?? 50) + 1);
    jobs.push(localGame.entities.PlayerProfile.update(updated.id, { partner_chemistry: chemistry }));
    updated.partner_chemistry = chemistry;
  }

  await Promise.allSettled(jobs);
  return { ...result, profile: updated };
}

export async function registerRecovery(profile, recovery) {
  if (!profile?.id || !recovery) return profile;
  const date = profile.career_date;
  await Promise.allSettled([
    localGame.entities.HistoryEntry.create({
      profile_id: profile.id,
      year: Number(String(date || '').slice(0, 4)) || new Date().getFullYear(),
      event_date: date,
      title: recovery.label || 'Recuperação física',
      description: `Recuperação concluída. Energia restaurada em ${recovery.energyGain || 0} ponto(s).`,
      category: 'recuperacao',
    }),
  ]);
  return profile;
}
