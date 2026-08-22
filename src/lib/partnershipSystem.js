import { localGame } from '@/api/localGameClient.js';
import { overallRating, levelForXp, LEVELS, ATTRIBUTE_KEYS, incrementMissionProgress } from '@/lib/padel';
import { getAvailablePartners, getPartnerBot, canChangePartner, daysUntilPartnerUnlock, CAREER_START_DATE, addDays, daysBetween } from '@/lib/career';
import { getRelationshipEffects, getOrCreateRelationship, getPartnerChemistryBonus } from '@/lib/relationships';
import { evaluatePartnerCompatibility } from '@/players/teamCompatibility.js';
import { applyPartnerBondEvent, derivePartnershipIdentity, getPartnerConversationEffect } from '@/lib/partnerBondSystem.js';

// ─── Compatibility Calculation ──────────────────────────────────────────────
// Computes a 0-100 compatibility score with per-factor breakdown.
export function computeCompatibility(profile, partnerBot, relationships = []) {
  if (!profile || !partnerBot) return { total: 0, breakdown: {} };

  // Position: opposite sides complement
  const tacticalFit = evaluatePartnerCompatibility(profile, partnerBot);
  const positionScore = tacticalFit.breakdown.position;

  // Play style: complementary styles score higher
  const STYLE_PAIRS = {
    'Agressivo-Defensivo': 100, 'Defensivo-Agressivo': 100,
    'Equilibrado-Equilibrado': 85, 'Agressivo-Agressivo': 70,
    'Potencia-Tatico': 80, 'Tatico-Potencia': 80,
    'Defensivo-Defensivo': 60, 'Agressivo-Equilibrado': 75,
    'Defensivo-Equilibrado': 75, 'Equilibrado-Tatico': 80,
  };
  const styleKey = `${profile.play_style}-${partnerBot.play_style}`;
  let styleScore = tacticalFit.breakdown.style ?? STYLE_PAIRS[styleKey];
  if (styleScore === undefined) {
    styleScore = profile.play_style === partnerBot.play_style ? 70 : 65;
  }

  // Personality: inferred from play style + discipline (proxy)
  const playerPers = inferPersonalityKey(profile);
  const partnerPers = partnerBot.personality || inferPersonalityKey(partnerBot);
  let personalityScore = playerPers === partnerPers ? 60 : 70;
  // Diverse personalities can complement in doubles
  if (playerPers !== partnerPers) personalityScore = 75;

  // Level proximity: similar levels mesh better
  const playerLevel = levelForXp(profile.xp || 0);
  const playerLevelIdx = LEVELS.indexOf(playerLevel);
  const partnerLevelIdx = LEVELS.indexOf(partnerBot.level || 'Iniciante');
  const levelDiff = Math.abs(playerLevelIdx - partnerLevelIdx);
  let levelScore = levelDiff === 0 ? 100 : levelDiff === 1 ? 85 : levelDiff === 2 ? 60 : 35;

  // Schedule/energy: partner availability (proxy via fatigue/injury)
  let scheduleScore = 80;
  if (partnerBot.fatigue && partnerBot.fatigue > 60) scheduleScore -= 20;
  if (partnerBot.current_injury) scheduleScore = 30;

  // Existing relationship chemistry
  const relBonus = getPartnerChemistryBonus(relationships, partnerBot.name);
  const chemScore = Math.max(0, Math.min(100, 50 + relBonus));

  // Overall rating proximity — closer ratings = better balance
  const playerOvr = overallRating(profile);
  const partnerOvr = overallRating(partnerBot);
  const ovrDiff = Math.abs(playerOvr - partnerOvr);
  const ovrScore = ovrDiff <= 5 ? 100 : ovrDiff <= 10 ? 80 : ovrDiff <= 20 ? 55 : 30;

  // Weighted total
  const total = Math.round(
    positionScore * 0.18 +
    styleScore * 0.16 +
    personalityScore * 0.12 +
    levelScore * 0.14 +
    scheduleScore * 0.10 +
    chemScore * 0.15 +
    ovrScore * 0.15
  );

  return {
    total: Math.max(0, Math.min(100, total)),
    breakdown: {
      position: positionScore,
      style: styleScore,
      personality: personalityScore,
      level: levelScore,
      schedule: scheduleScore,
      chemistry: chemScore,
      overall: ovrScore,
    },
    sideResolution: tacticalFit.sideResolution,
    strengths: tacticalFit.strengths,
    warnings: tacticalFit.warnings,
  };
}

function inferPersonalityKey(profile) {
  const style = profile?.play_style || 'Equilibrado';
  const map = { Agressivo: 'competitivo', Defensivo: 'analitico', Equilibrado: 'equilibrado', Tático: 'estrategista', Potência: 'competitivo' };
  return map[style] || 'equilibrado';
}

export function compatibilityLabel(score) {
  if (score >= 85) return { label: 'Excelente', color: 'text-primary', bg: 'bg-primary/15' };
  if (score >= 70) return { label: 'Boa', color: 'text-green-400', bg: 'bg-green-500/15' };
  if (score >= 55) return { label: 'Razoável', color: 'text-cyan-400', bg: 'bg-cyan-500/15' };
  if (score >= 40) return { label: 'Baixa', color: 'text-amber-400', bg: 'bg-amber-500/15' };
  return { label: 'Ruim', color: 'text-red-400', bg: 'bg-red-500/15' };
}

// ─── Partnership Lifecycle ──────────────────────────────────────────────────

export async function getActivePartnership(profileId) {
  if (!profileId) return null;
  try {
    const list = await localGame.entities.Partnership.filter(
      { profile_id: profileId, status: 'ativa' },
      '-started_career_date', 1
    );
    return list && list.length > 0 ? list[0] : null;
  } catch { return null; }
}

export async function getPartnershipHistory(profileId) {
  if (!profileId) return [];
  try {
    const list = await localGame.entities.Partnership.filter(
      { profile_id: profileId },
      '-started_career_date', 50
    );
    return (list || []).filter(p => p.status !== 'ativa');
  } catch { return []; }
}

export async function startPartnership(profile, bot, durationDays = 60, prizeSplit = 50) {
  if (!profile || !bot) return null;
  const careerDate = profile.career_date || CAREER_START_DATE;
  const endDate = addDays(careerDate, durationDays);

  // End any existing active partnership
  const existing = await getActivePartnership(profile.id);
  if (existing) {
    await endPartnership(existing.id, 'encerrada_jogador', 'Nova parceria formada', careerDate);
  }

  const relationships = await localGame.entities.Relationship.filter({ profile_id: profile.id }, null, 200).catch(() => []);
  const compat = computeCompatibility(profile, bot, relationships || []);

  const partnership = await localGame.entities.Partnership.create({
    profile_id: profile.id,
    partnership_type: 'player',
    scope: 'career',
    athlete_a_id: profile.id,
    athlete_b_id: bot.id,
    athlete_ids: [profile.id, bot.id],
    athlete_a_name: profile.sport_name || profile.name || 'Jogador',
    athlete_b_name: bot.name,
    partner_bot_id: bot.id,
    partner_name: bot.name,
    partner_country: bot.country,
    partner_level: bot.level,
    partner_position: bot.position,
    partner_play_style: bot.play_style,
    started_career_date: careerDate,
    negotiated_duration_days: durationDays,
    scheduled_end_date: endDate,
    status: 'ativa',
    prize_split_pct: prizeSplit,
    chemistry: Math.max(30, Math.min(70, compat.total)),
    natural_chemistry: compat.total,
    partner_trust: Math.max(40, Math.min(70, Math.round(compat.total * 0.75))),
    partner_morale: 72,
    partnership_identity: derivePartnershipIdentity({ shared_matches: 0, chemistry: compat.total, partner_trust: compat.total * 0.75, partner_play_style: bot.play_style }),
    compatibility_score: compat.total,
    compatibility_breakdown: compat.breakdown,
    chemistry_history: [{ date: careerDate, chemistry: Math.max(30, Math.min(70, compat.total)), event: 'Parceria iniciada' }],
    shared_goals: generateDefaultGoals(bot),
  });

  // Update PlayerProfile partner fields
  const updated = await localGame.entities.PlayerProfile.update(profile.id, {
    partner_id: bot.id,
    partner_name: bot.name,
    partner_locked_until: endDate,
    partner_chemistry: partnership.chemistry,
    partner_trust: partnership.partner_trust,
    partner_morale: partnership.partner_morale,
  });
  await localGame.entities.AthleteProfile.update(bot.id, {
    current_partner_profile_id: profile.id,
    contracted_to_profile_id: profile.id,
    market_status: 'contratado',
  }).catch(() => null);

  // Create or upgrade relationship to 'parceiro'
  const rel = await getOrCreateRelationship(profile.id, bot.id, bot.name, bot.country);
  if (rel) {
    await localGame.entities.Relationship.update(rel.id, {
      relationship_type: 'parceiro',
      score: Math.max(rel.score || 0, 40),
      chemistry: partnership.chemistry,
    });
  }

  await incrementMissionProgress(profile.id, 'select_partner', 1, careerDate);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:onboarding-refresh'));

  return { partnership, profile: updated };
}

// Fase 14 (docs/FASE_14_CAREER_IDENTITY.md, Parte 6): bug real encontrado na
// auditoria — nenhum dos 4 call sites passava uma data real de término, e o
// fallback aqui usava `p.started_career_date` como se fosse a data de FIM,
// fazendo `ended_career_date` sempre igual à data de início (ou
// CAREER_START_DATE). Toda parceria encerrada no jogo mostrava "período
// junto" igual a zero dias, inviabilizando "parceria mais longa"/"melhor
// parceria" (Parte 6). Corrigido para receber a data real da carreira no
// momento do encerramento; mantém o fallback antigo só se nenhuma data for
// passada (nenhum caso real esperado, inofensivo manter).
export async function endPartnership(partnershipId, endStatus, reason, endedCareerDate) {
  if (!partnershipId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const careerDate = endedCareerDate || p.started_career_date || CAREER_START_DATE;
    const updated = await localGame.entities.Partnership.update(partnershipId, {
      status: endStatus,
      contract_status: 'encerrado',
      end_reason: reason,
      ended_career_date: careerDate,
    });
    if (p.partnership_type !== 'npc' && p.partner_bot_id) {
      await localGame.entities.AthleteProfile.update(p.partner_bot_id, {
        current_partner_profile_id: null,
        contracted_to_profile_id: null,
        market_status: 'livre',
      }).catch(() => null);
    }
    return updated;
  } catch (e) { console.error('endPartnership', e); return null; }
}

export function buildPartnershipMatchPatch(partnership, won, tournamentName, date = new Date().toISOString().slice(0, 10)) {
  const p = partnership || {};
  const eventEffect = won
    ? { chemistry: 2, trust: 2, morale: 3 }
    : { chemistry: 1, trust: 0, morale: -2 };
  const bond = applyPartnerBondEvent(p, eventEffect);
  const sharedMatches = (p.shared_matches || 0) + 1;
  const sharedWins = won ? (p.shared_wins || 0) + 1 : (p.shared_wins || 0);
  const sharedLosses = !won ? (p.shared_losses || 0) + 1 : (p.shared_losses || 0);
  return {
    chemistry: bond.chemistry,
    partner_trust: bond.trust,
    partner_morale: bond.morale,
    partnership_identity: derivePartnershipIdentity({ ...p, ...bond, shared_matches: sharedMatches, shared_wins: sharedWins, shared_losses: sharedLosses }),
    shared_matches: sharedMatches,
    shared_wins: sharedWins,
    shared_losses: sharedLosses,
    shared_tournaments: tournamentName ? (p.shared_tournaments || 0) + 1 : p.shared_tournaments,
    chemistry_history: [...(p.chemistry_history || []), {
      date,
      chemistry: bond.chemistry,
      trust: bond.trust,
      morale: bond.morale,
      event: won ? 'Vitória juntos' : 'Derrota juntos',
    }].slice(-40),
  };
}

export async function recordPartnershipMatch(partnershipId, won, tournamentName) {
  if (!partnershipId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const patch = buildPartnershipMatchPatch(p, won, tournamentName);
    const updatedPartnership = await localGame.entities.Partnership.update(partnershipId, patch);
    if (p.profile_id) {
      await localGame.entities.PlayerProfile.update(p.profile_id, {
        partner_chemistry: patch.chemistry,
        partner_trust: patch.partner_trust,
        partner_morale: patch.partner_morale,
      }).catch(() => {});
    }
    return updatedPartnership;
  } catch (e) { console.error('recordPartnershipMatch', e); return null; }
}

export function buildPartnershipTitlePatch(partnership, date = new Date().toISOString().slice(0, 10)) {
  const p = partnership || {};
  const bond = applyPartnerBondEvent(p, { chemistry: 5, trust: 6, morale: 8 });
  const sharedTitles = (p.shared_titles || 0) + 1;
  return {
    chemistry: bond.chemistry,
    partner_trust: bond.trust,
    partner_morale: bond.morale,
    shared_titles: sharedTitles,
    partnership_identity: derivePartnershipIdentity({ ...p, ...bond, shared_titles: sharedTitles }),
    chemistry_history: [...(p.chemistry_history || []), { date, chemistry: bond.chemistry, trust: bond.trust, morale: bond.morale, event: 'Título conquistado!' }].slice(-40),
  };
}

export async function recordPartnershipTitle(partnershipId) {
  if (!partnershipId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const patch = buildPartnershipTitlePatch(p);
    const updatedPartnership = await localGame.entities.Partnership.update(partnershipId, patch);
    if (p.profile_id) {
      await localGame.entities.PlayerProfile.update(p.profile_id, {
        partner_chemistry: patch.chemistry,
        partner_trust: patch.partner_trust,
        partner_morale: patch.partner_morale,
      }).catch(() => {});
    }
    return updatedPartnership;
  } catch (e) { return null; }
}

export async function addConflict(partnershipId, title, description, severity = 'media') {
  if (!partnershipId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const chemDrop = severity === 'alta' ? -8 : severity === 'media' ? -5 : -2;
    const newChem = Math.max(0, (p.chemistry || 50) + chemDrop);
    return await localGame.entities.Partnership.update(partnershipId, {
      chemistry: newChem,
      conflicts: [...(p.conflicts || []), { date: new Date().toISOString().slice(0, 10), title, description, severity, resolved: false }].slice(-20),
      chemistry_history: [...(p.chemistry_history || []), { date: new Date().toISOString().slice(0, 10), chemistry: newChem, event: `Conflito: ${title}` }].slice(-30),
    });
  } catch (e) { return null; }
}

export async function addConversation(partnershipId, speaker, text, tone = 'neutro') {
  if (!partnershipId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const effect = getPartnerConversationEffect(tone);
    const bond = applyPartnerBondEvent(p, effect);
    const updatedPartnership = await localGame.entities.Partnership.update(partnershipId, {
      chemistry: bond.chemistry,
      partner_trust: bond.trust,
      partner_morale: bond.morale,
      partnership_identity: derivePartnershipIdentity({ ...p, ...bond }),
      conversations: [...(p.conversations || []), { date: new Date().toISOString().slice(0, 10), speaker, text, tone, effect }].slice(-40),
    });
    if (p.profile_id) {
      await localGame.entities.PlayerProfile.update(p.profile_id, {
        partner_chemistry: bond.chemistry,
        partner_trust: bond.trust,
        partner_morale: bond.morale,
      }).catch(() => {});
    }
    return updatedPartnership;
  } catch (e) { return null; }
}

// ─── Shared Goals ───────────────────────────────────────────────────────────

function generateDefaultGoals(partner) {
  return [
    { id: 'g1', title: 'Primeira vitória juntos', target: 1, progress: 0, completed: false },
    { id: 'g2', title: 'Ganhar 5 partidas', target: 5, progress: 0, completed: false },
    { id: 'g3', title: 'Alcançar entrosamento 70', target: 70, progress: 50, completed: false },
    { id: 'g4', title: 'Conquistar um título', target: 1, progress: 0, completed: false },
  ];
}

export async function updateGoalProgress(partnershipId, goalId, newProgress) {
  if (!partnershipId || !goalId) return null;
  try {
    const p = await localGame.entities.Partnership.get(partnershipId);
    if (!p) return null;
    const goals = (p.shared_goals || []).map(g => {
      if (g.id !== goalId) return g;
      const completed = newProgress >= g.target;
      return { ...g, progress: Math.min(g.target, newProgress), completed };
    });
    return await localGame.entities.Partnership.update(partnershipId, { shared_goals: goals });
  } catch (e) { return null; }
}

// ─── Prize Split ────────────────────────────────────────────────────────────

export function calculatePrizeSplit(totalPrize, splitPct) {
  const playerShare = Math.round(totalPrize * (splitPct / 100));
  const partnerShare = totalPrize - playerShare;
  return { playerShare, partnerShare };
}

export async function negotiatePrizeSplit(partnershipId, newSplit) {
  if (!partnershipId) return null;
  try {
    return await localGame.entities.Partnership.update(partnershipId, { prize_split_pct: Math.max(20, Math.min(80, newSplit)) });
  } catch (e) { return null; }
}

// ─── Partner Instability (frequent switching consequences) ──────────────────

export async function getPartnerSwitchCount(profileId) {
  if (!profileId) return 0;
  try {
    const history = await getPartnershipHistory(profileId);
    // Count partnerships that ended by player's choice (not expired)
    return history.filter(p => p.status === 'encerrada_jogador').length;
  } catch { return 0; }
}

export function getInstabilityPenalty(switchCount) {
  if (switchCount <= 1) return { penalty: 0, label: 'Estável', color: 'text-green-400', desc: 'Sua reputação como parceiro é sólida.' };
  if (switchCount === 2) return { penalty: 3, label: 'Leve desconfiança', color: 'text-cyan-400', desc: 'Alguns atletas notam que você troca de dupla com frequência.' };
  if (switchCount === 3) return { penalty: 7, label: 'Reputação abalada', color: 'text-amber-400', desc: 'Parceiros em potencial hesitam em se comprometer.' };
  if (switchCount >= 4) return { penalty: 12, label: 'Mercenário', color: 'text-red-400', desc: 'Sua imagem no circuito está prejudicada. Patrocinadores observam.' };
  return { penalty: 0, label: 'Estável', color: 'text-green-400', desc: '' };
}

// ─── Career Messages / Inbox ────────────────────────────────────────────────
// Leitura, marcação de lida e resolução/dispensa de CareerMessage vivem em
// @/lib/careerCommunications.js (listCareerCommunications, markCareerCommunicationRead,
// resolveMessage, dismissMessage) — fonte única para todas as caixas de
// entrada da carreira (sino, Central de Comunicações e InboxPanel).

export async function sendMessage(profileId, msg) {
  if (!profileId) return null;
  try {
    return await localGame.entities.CareerMessage.create({
      profile_id: profileId,
      message_type: msg.message_type || 'mensagem',
      sender_name: msg.sender_name || 'Sistema',
      sender_type: msg.sender_type || 'sistema',
      sender_avatar: msg.sender_avatar,
      title: msg.title,
      content: msg.content,
      related_entity_type: msg.related_entity_type,
      related_entity_id: msg.related_entity_id,
      related_entity_name: msg.related_entity_name,
      status: msg.status || 'nao_lida',
      is_read: false,
      is_new: true,
      priority: msg.priority || 'normal',
      career_date: msg.career_date,
      expires_career_date: msg.expires_career_date,
      actions: msg.actions || [],
      metadata: msg.metadata,
      destination: msg.destination,
    });
  } catch (e) { console.error('sendMessage', e); return null; }
}

// ─── Partner Proposal Generation ────────────────────────────────────────────
// Generates inbound partnership proposals from interested athletes.

export async function generatePartnerProposals(profile, availablePartners) {
  if (!profile || !availablePartners || availablePartners.length === 0) return [];
  const existingMsgs = await localGame.entities.CareerMessage.filter(
    { profile_id: profile.id, message_type: 'proposta_parceria', status: 'nao_lida' }, null, 20
  ).catch(() => []);

  const proposals = [];
  // Pick up to 3 candidates not yet proposed
  const candidates = availablePartners
    .filter(b => !existingMsgs?.find(m => m.related_entity_id === b.id))
    .slice(0, 3);

  for (const bot of candidates) {
    const relationships = await localGame.entities.Relationship.filter({ profile_id: profile.id, target_athlete_id: bot.id }, null, 1).catch(() => []);
    const compat = computeCompatibility(profile, bot, relationships || []);
    if (compat.total < 45) continue; // only interested if reasonable compatibility

    const durations = [45, 60, 90];
    const duration = durations[Math.floor(Math.random() * durations.length)];
    const splitOptions = [50, 45, 55];

    proposals.push({
      bot,
      compatibility: compat,
      proposedDuration: duration,
      proposedSplit: splitOptions[Math.floor(Math.random() * splitOptions.length)],
    });
  }
  return proposals;
}

export async function createProposalMessage(profile, proposal) {
  const { bot, compatibility, proposedDuration, proposedSplit } = proposal;
  return await sendMessage(profile.id, {
    message_type: 'proposta_parceria',
    sender_name: bot.name,
    sender_type: 'atleta',
    title: `Proposta de parceria de ${bot.name}`,
    content: `Olá! Notei seu jogo recente e gostaria de formar dupla. Tenho compatibilidade de ${compatibility.total}% com você. Proponho ${proposedDuration} dias de parceria com divisão de ${proposedSplit}%/${100 - proposedSplit}% da premiação. O que acha?`,
    related_entity_type: 'partnership_proposal',
    related_entity_id: bot.id,
    related_entity_name: bot.name,
    status: 'decisao_pendente',
    priority: compatibility.total >= 75 ? 'alta' : 'normal',
    career_date: profile.career_date,
    actions: [
      { id: 'accept', label: 'Aceitar', type: 'accept_partnership', payload: { bot, duration: proposedDuration, split: proposedSplit } },
      { id: 'counter', label: 'Negociar', type: 'counter_proposal', payload: { bot, duration: proposedDuration, split: proposedSplit } },
      { id: 'decline', label: 'Recusar', type: 'decline_partnership' },
    ],
    metadata: { compatibility: compatibility.total, duration: proposedDuration, split: proposedSplit },
  });
}

// ─── Advisor Recommendations ────────────────────────────────────────────────
// Empresário, treinador e equipe de apoio — non-mandatory advice.

export async function generateAdvisorTips(profile, activePartnership, proposals, switchCount) {
  const tips = [];
  const normalizedProposals = (Array.isArray(proposals) ? proposals : []).map((proposal) => {
    const bot = proposal?.bot || proposal?.candidate_snapshot;
    if (!bot?.id) return null;
    const stored = proposal?.compatibility || proposal?.compatibility_snapshot;
    const compatibility = Number.isFinite(Number(stored?.total))
      ? { ...stored, total: Number(stored.total), breakdown: stored.breakdown || {} }
      : computeCompatibility(profile, bot);
    return { ...proposal, bot, compatibility };
  }).filter(Boolean);

  // Empresário (agent) — focuses on career/economics/reputation
  if (!activePartnership) {
    if (normalizedProposals.length > 0) {
      const best = normalizedProposals.reduce((a, b) => a.compatibility.total > b.compatibility.total ? a : b);
      tips.push({
        advisor: 'empresario',
        title: 'Proposta com potencial',
        text: `Seu empresário sugere avaliar a proposta de ${best.bot.name}. Compatibilidade de ${best.compatibility.total}%. Lembre-se: parcerias duradouras constroem reputação.`,
        icon: 'Briefcase',
      });
    } else {
      tips.push({
        advisor: 'empresario',
        title: 'Sem parceiro definido',
        text: 'Seu empresário recomenda buscar uma dupla o quanto antes. Sem parceiro, você fica de fora de torneios em dupla.',
        icon: 'Briefcase',
      });
    }
    if (switchCount >= 2) {
      const inst = getInstabilityPenalty(switchCount);
      tips.push({
        advisor: 'empresario',
        title: 'Reputação no circuito',
        text: `${inst.label}: ${inst.desc} Seu empresário aconselha estabilidade para preservar patrocinadores.`,
        icon: 'Briefcase',
      });
    }
  }

  // Treinador (coach) — focuses on gameplay/style compatibility
  if (profile.coach_id) {
    if (activePartnership) {
      const chem = activePartnership.chemistry || 50;
      if (chem < 40) {
        tips.push({
          advisor: 'treinador',
          title: 'Entrosamento baixo',
          text: `Seu treinador nota que o entrosamento com ${activePartnership.partner_name} está em ${chem}. Considere treinos juntos ou conversas para alinhar expectativas.`,
          icon: 'GraduationCap',
        });
      } else if (chem >= 75) {
        tips.push({
          advisor: 'treinador',
          title: 'Dupla em sintonia',
          text: `Excelente química com ${activePartnership.partner_name} (${chem}). Seu treinador recomenda focar em torneios de tier alto para capitalizar o momento.`,
          icon: 'GraduationCap',
        });
      }
    } else if (normalizedProposals.length > 0) {
      const best = normalizedProposals.reduce((a, b) => a.compatibility.total > b.compatibility.total ? a : b);
      const bd = best.compatibility.breakdown;
      const weakFactor = Object.entries(bd).sort((a, b) => a[1] - b[1])[0] || ['geral', best.compatibility.total];
      tips.push({
        advisor: 'treinador',
        title: 'Análise técnica',
        text: `Seu treinador analisou ${best.bot.name}: compatibilidade ${best.compatibility.total}%. Ponto fraco: ${factorLabel(weakFactor[0])} (${weakFactor[1]}%).`,
        icon: 'GraduationCap',
      });
    }
  }

  // Equipe de apoio (support team) — focuses on schedule/health/conflicts
  if (activePartnership) {
    const unresolved = (activePartnership.conflicts || []).filter(c => !c.resolved);
    if (unresolved.length > 0) {
      tips.push({
        advisor: 'equipe',
        title: 'Conflitos pendentes',
        text: `Sua equipe de apoio detectou ${unresolved.length} conflito(s) não resolvido(s) com ${activePartnership.partner_name}. Recomendam uma conversa franca.`,
        icon: 'Users',
      });
    }
    const goals = (activePartnership.shared_goals || []).filter(g => !g.completed);
    if (goals.length > 0 && (activePartnership.shared_matches || 0) > 0) {
      tips.push({
        advisor: 'equipe',
        title: 'Objetivos em progresso',
        text: `Vocês têm ${goals.length} objetivo(s) compartilhado(s) em aberto. Foco e consistência levarão ao cumprimento.`,
        icon: 'Users',
      });
    }
  }

  return tips;
}

function factorLabel(key) {
  const map = { position: 'Posição', style: 'Estilo', personality: 'Personalidade', level: 'Nível', schedule: 'Agenda', chemistry: 'Química', overall: 'Overall' };
  return map[key] || key;
}

export const ADVISOR_META = {
  empresario: { label: 'Empresário', icon: 'Briefcase', color: 'text-amber-400', desc: 'Foco em carreira, reputação e finanças' },
  treinador: { label: 'Treinador', icon: 'GraduationCap', color: 'text-primary', desc: 'Foco em compatibilidade técnica e tática' },
  equipe: { label: 'Equipe de Apoio', icon: 'Users', color: 'text-cyan-400', desc: 'Foco em saúde, conflitos e agenda' },
};
