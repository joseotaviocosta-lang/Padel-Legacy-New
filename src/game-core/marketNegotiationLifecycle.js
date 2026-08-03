import { localGame } from '@/api/localGameClient.js';
import { overallRating } from '@/lib/padel';
import { formPartnerContract } from './partnerLifecycle';
import { normalizeAthlete, toLegacyCourtSide } from '@/players/athleteSchema.js';
import { calculatePartnershipInterest, evaluatePartnerCompatibility } from '@/players/teamCompatibility.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value >>> 0);
}

function monthKey(date) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function candidateAsPartner(athlete) {
  const canonical = normalizeAthlete(athlete);
  const overall = clamp(athlete?.overall_rating || 50, 1, 100);
  return {
    ...canonical,
    id: athlete.id,
    name: athlete.name,
    country: athlete.country,
    position: toLegacyCourtSide(canonical.preferred_side),
    play_style: athlete.play_style || 'Equilibrado',
    level: athlete.level || 'Profissional',
    forehand: athlete.forehand || overall,
    backhand: athlete.backhand || overall,
    serve: athlete.serve || overall,
    volley: athlete.volley || overall,
    lob: athlete.lob || overall,
    smash: athlete.smash || overall,
    bandeja: athlete.bandeja || overall,
    speed: athlete.speed || overall,
    stamina: athlete.stamina || overall,
    strength: athlete.strength || overall,
    reflexes: athlete.reflexes || overall,
    tactics: athlete.tactics || overall,
    positioning: athlete.positioning || overall,
    concentration: athlete.concentration || overall,
    resilience: athlete.resilience || overall,
  };
}

export function getNegotiationPreview(profile, athlete, scoutingReport, terms = {}) {
  const playerOverall = clamp(overallRating(profile || {}), 1, 100);
  const athleteOverall = clamp(athlete?.overall_rating || 50, 1, 100);
  const expectedSalary = Math.max(50, Number(athlete?.expected_salary) || athleteOverall * 20);
  const marketValue = Math.max(0, Number(athlete?.market_value) || expectedSalary * 12);
  const salary = Math.max(0, Number(terms.monthlySalary ?? expectedSalary));
  const signingBonus = Math.max(0, Number(terms.signingBonus ?? Math.round(marketValue * 0.08)));
  const durationDays = clamp(terms.durationDays ?? 60, 30, 180);
  const partnerPrizeShare = clamp(terms.partnerPrizeShare ?? 50, 35, 70);

  const salaryScore = clamp(50 + ((salary - expectedSalary) / Math.max(1, expectedSalary)) * 70, 0, 100);
  const bonusTarget = Math.max(100, marketValue * 0.08);
  const bonusScore = clamp((signingBonus / bonusTarget) * 70, 0, 100);
  const rankingGap = (Number(profile?.ranking_position) || 1000) - (Number(athlete?.world_rank) || 1000);
  const sportingScore = clamp(52 + (playerOverall - athleteOverall) * 2 + rankingGap * -0.025, 0, 100);
  const reputationScore = clamp((Number(profile?.reputation) || 10) + (Number(profile?.followers) || 0) / 500, 0, 100);
  const scoutingScore = clamp(Number(scoutingReport?.tactical_fit) || 50, 0, 100);
  const shareScore = clamp(50 + (partnerPrizeShare - 50) * 3, 0, 100);
  const durationScore = durationDays >= 90 ? 72 : durationDays >= 60 ? 60 : 45;
  const compatibility = evaluatePartnerCompatibility(profile, athlete);
  const interest = calculatePartnershipInterest(profile, athlete, compatibility);
  const statusPenalty = athlete?.market_status === 'livre' ? 0 : 35;
  const injuryPenalty = athlete?.current_injury ? 25 : 0;

  const acceptanceChance = clamp(Math.round(
    salaryScore * 0.25 +
    bonusScore * 0.18 +
    sportingScore * 0.20 +
    reputationScore * 0.10 +
    scoutingScore * 0.12 +
    shareScore * 0.10 +
    durationScore * 0.05 +
    (interest.score - 50) * 0.18 -
    statusPenalty -
    injuryPenalty
  ), 3, 97);

  return {
    expectedSalary,
    marketValue,
    monthlySalary: salary,
    signingBonus,
    durationDays,
    partnerPrizeShare,
    acceptanceChance,
    totalImmediateCost: signingBonus,
    monthlyCommitment: salary,
    canAfford: (Number(profile?.coins) || 0) >= signingBonus,
    interest,
    compatibility,
    factors: {
      salary: Math.round(salaryScore),
      bonus: Math.round(bonusScore),
      sporting: Math.round(sportingScore),
      reputation: Math.round(reputationScore),
      tacticalFit: Math.round(scoutingScore),
    },
  };
}

export async function submitPartnerOffer(profile, athlete, scoutingReport, terms = {}) {
  if (!profile?.id || !athlete?.id) throw new Error('Perfil ou atleta inválido.');
  if (athlete.career_status === 'aposentado') throw new Error('Este atleta já está aposentado.');
  if (athlete.market_status !== 'livre') throw new Error('Somente agentes livres podem receber propostas nesta versão.');
  if (athlete.current_injury) throw new Error('O atleta está lesionado e não aceita propostas no momento.');

  const preview = getNegotiationPreview(profile, athlete, scoutingReport, terms);
  if (!preview.canAfford) throw new Error('Saldo insuficiente para pagar o bônus de assinatura.');

  const careerDate = profile.career_date || new Date().toISOString().slice(0, 10);
  const roll = (hash(`${profile.id}:${athlete.id}:${monthKey(careerDate)}:${preview.monthlySalary}:${preview.signingBonus}:${preview.durationDays}:${preview.partnerPrizeShare}`) % 100) + 1;
  const accepted = roll <= preview.acceptanceChance;

  const offerData = {
    profile_id: profile.id,
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    offer_month: monthKey(careerDate),
    offer_date: careerDate,
    monthly_salary: preview.monthlySalary,
    signing_bonus: preview.signingBonus,
    duration_days: preview.durationDays,
    partner_prize_share: preview.partnerPrizeShare,
    acceptance_chance: preview.acceptanceChance,
    decision_roll: roll,
    status: accepted ? 'aceita' : 'recusada',
  };

  let offer;
  try {
    offer = await localGame.entities.PartnerOffer.create(offerData);
  } catch {
    offer = offerData;
  }

  if (!accepted) {
    await Promise.allSettled([
      localGame.entities.CareerMessage.create({
        profile_id: profile.id,
        sender_name: athlete.name,
        subject: 'Proposta de dupla recusada',
        body: `A proposta não atingiu minhas expectativas. Chance estimada: ${preview.acceptanceChance}%.`,
        status: 'nao_lida',
        message_type: 'partner_offer',
        created_date: new Date().toISOString(),
      }),
      localGame.entities.HistoryEntry.create({
        profile_id: profile.id,
        year: Number(careerDate.slice(0, 4)),
        event_date: careerDate,
        title: `Proposta recusada por ${athlete.name}`,
        description: `Oferta de ${preview.monthlySalary.toLocaleString('pt-BR')} moedas mensais e bônus de ${preview.signingBonus.toLocaleString('pt-BR')} moedas.`,
        category: 'mercado',
      }),
    ]);
    return { accepted: false, preview, offer, profile };
  }

  const profileAfterBonus = await localGame.entities.PlayerProfile.update(profile.id, {
    coins: Math.max(0, (Number(profile.coins) || 0) - preview.signingBonus),
  });

  const partner = candidateAsPartner(athlete);
  const result = await formPartnerContract(profileAfterBonus, partner, {
    durationDays: preview.durationDays,
    prizeSplit: 100 - preview.partnerPrizeShare,
    monthlySalary: preview.monthlySalary,
    morale: 75,
  });

  await Promise.allSettled([
    localGame.entities.AthleteProfile.update(athlete.id, {
      market_status: 'contratado',
      current_partner_profile_id: profile.id,
      current_partner_name: profile.name || profile.full_name || 'Jogador',
      last_updated_date: careerDate,
    }),
    localGame.entities.FinancialTransaction.create({
      profile_id: profile.id,
      month: monthKey(careerDate),
      type: 'despesa',
      category: 'mercado',
      description: `Bônus de assinatura de ${athlete.name}`,
      amount: -preview.signingBonus,
      net: -preview.signingBonus,
      date: careerDate,
    }),
    localGame.entities.CareerMessage.create({
      profile_id: profile.id,
      sender_name: athlete.name,
      subject: 'Proposta aceita',
      body: `Aceito formar dupla. Contrato de ${preview.durationDays} dias, salário mensal de ${preview.monthlySalary.toLocaleString('pt-BR')} moedas e ${preview.partnerPrizeShare}% das premiações para mim.`,
      status: 'nao_lida',
      message_type: 'partner_offer',
      created_date: new Date().toISOString(),
    }),
  ]);

  return { accepted: true, preview, offer, profile: result.profile, partnership: result.partnership };
}
