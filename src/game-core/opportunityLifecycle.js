import { base44 } from '@/api/base44Client';

export const CAREER_OPPORTUNITIES = [
  {
    id: 'private_lesson',
    name: 'Aula particular',
    description: 'Dê uma aula para jogadores iniciantes do clube.',
    reward: 350,
    energyCost: 8,
    minLevel: 1,
    reputationGain: 1,
    followersGain: 2,
  },
  {
    id: 'local_exhibition',
    name: 'Exibição local',
    description: 'Participe de uma partida de exibição para o público local.',
    reward: 650,
    energyCost: 14,
    minLevel: 1,
    minReputation: 5,
    reputationGain: 1,
    followersGain: 10,
  },
  {
    id: 'padel_clinic',
    name: 'Clínica de padel',
    description: 'Organize uma clínica técnica patrocinada por um clube regional.',
    reward: 1000,
    energyCost: 20,
    minLevel: 3,
    reputationGain: 2,
    followersGain: 20,
  },
  {
    id: 'social_campaign',
    name: 'Campanha publicitária',
    description: 'Grave conteúdo para uma pequena campanha nas redes sociais.',
    reward: 1400,
    energyCost: 12,
    minLevel: 2,
    minFollowers: 200,
    reputationGain: 2,
    followersGain: 35,
  },
];

const DAILY_LIMIT = 2;

function careerDay(profile) {
  return profile?.career_date || new Date().toISOString().slice(0, 10);
}

function usesToday(profile) {
  return profile?.opportunity_date === careerDay(profile)
    ? Number(profile?.opportunity_uses_today || 0)
    : 0;
}

function stableReward(profile, opportunity) {
  const seed = `${profile?.id || 'player'}:${careerDay(profile)}:${opportunity.id}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const variation = 0.9 + (Math.abs(hash) % 21) / 100;
  return Math.round(opportunity.reward * variation);
}

export function getOpportunityStatus(profile, opportunity) {
  const currentUses = usesToday(profile);
  const energy = Number(profile?.energy ?? 0);
  const level = Number(profile?.level ?? 1);
  const reputation = Number(profile?.reputation ?? 0);
  const followers = Number(profile?.followers ?? 0);

  let reason = null;
  if (currentUses >= DAILY_LIMIT) reason = 'Limite diário atingido';
  else if (energy < opportunity.energyCost) reason = 'Energia insuficiente';
  else if (level < (opportunity.minLevel || 1)) reason = `Requer nível ${opportunity.minLevel}`;
  else if (reputation < (opportunity.minReputation || 0)) reason = `Requer ${opportunity.minReputation} de reputação`;
  else if (followers < (opportunity.minFollowers || 0)) reason = `Requer ${opportunity.minFollowers} seguidores`;

  return {
    available: !reason,
    reason,
    usesToday: currentUses,
    remainingToday: Math.max(0, DAILY_LIMIT - currentUses),
    estimatedReward: stableReward(profile, opportunity),
  };
}

export function getDailyOpportunityStatus(profile) {
  const currentUses = usesToday(profile);
  return {
    limit: DAILY_LIMIT,
    used: currentUses,
    remaining: Math.max(0, DAILY_LIMIT - currentUses),
    date: careerDay(profile),
  };
}

async function safeCreate(entityName, payload) {
  try {
    const entity = base44.entities?.[entityName];
    if (entity?.create) return await entity.create(payload);
  } catch (error) {
    console.warn(`[Game Core] Não foi possível registrar ${entityName}:`, error);
  }
  return null;
}

export async function completeCareerOpportunity(profile, opportunityId) {
  const opportunity = CAREER_OPPORTUNITIES.find((item) => item.id === opportunityId);
  if (!opportunity) throw new Error('Oportunidade não encontrada.');

  const status = getOpportunityStatus(profile, opportunity);
  if (!status.available) throw new Error(status.reason || 'Esta oportunidade não está disponível.');

  const reward = status.estimatedReward;
  const day = careerDay(profile);
  const updatedData = {
    coins: Number(profile.coins || 0) + reward,
    energy: Math.max(0, Number(profile.energy || 0) - opportunity.energyCost),
    reputation: Number(profile.reputation || 0) + Number(opportunity.reputationGain || 0),
    followers: Number(profile.followers || 0) + Number(opportunity.followersGain || 0),
    opportunity_date: day,
    opportunity_uses_today: status.usesToday + 1,
  };

  const updatedProfile = await base44.entities.PlayerProfile.update(profile.id, updatedData);

  await safeCreate('FinancialTransaction', {
    profile_id: profile.id,
    month: day,
    income: reward,
    expenses: 0,
    net: reward,
    description: opportunity.name,
    category: 'career_opportunity',
    breakdown: {
      opportunity_income: reward,
      opportunity_name: opportunity.name,
    },
  });

  await safeCreate('CareerHistory', {
    profile_id: profile.id,
    career_date: day,
    event_type: 'career_opportunity',
    title: opportunity.name,
    description: `Atividade concluída. Receita de ${reward.toLocaleString('pt-BR')} moedas.`,
    metadata: { opportunity_id: opportunity.id, reward },
  });

  return {
    profile: updatedProfile || { ...profile, ...updatedData },
    opportunity,
    reward,
    remainingToday: Math.max(0, DAILY_LIMIT - (status.usesToday + 1)),
  };
}
