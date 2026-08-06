import { localGame } from '@/api/localGameClient.js';
import { buildCareerMemory, getCareerAgent } from '@/lib/careerMemory.js';

export const COMMUNICATION_CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'treinador', label: 'Treinador' },
  { id: 'atleta', label: 'Parceiro' },
  { id: 'empresario', label: 'Empresário' },
  { id: 'federacao', label: 'Federação' },
  { id: 'patrocinador', label: 'Patrocinadores' },
  { id: 'clube', label: 'Clube' },
  { id: 'imprensa', label: 'Imprensa' },
  { id: 'sistema', label: 'Sistema' },
];

export function normalizeCareerMessage(message = {}) {
  return {
    ...message,
    title: message.title || message.subject || message.sender_name || 'Nova comunicação',
    content: message.content || message.body || message.message || '',
    sender_name: message.sender_name || senderLabel(message.sender_type),
    sender_type: message.sender_type || 'sistema',
    status: message.status || (message.is_read ? 'lida' : 'nao_lida'),
    priority: message.priority || 'normal',
  };
}

export async function listCareerCommunications(profileId, limit = 120) {
  if (!profileId) return [];
  const rows = await localGame.entities.CareerMessage.filter({ profile_id: profileId }, '-created_date', limit).catch(() => []);
  return (rows || []).map(normalizeCareerMessage);
}

export async function markAllCommunicationsRead(profileId) {
  const rows = await listCareerCommunications(profileId, 200);
  const unread = rows.filter((row) => row.status === 'nao_lida');
  await Promise.all(unread.map((row) => localGame.entities.CareerMessage.update(row.id, { status: 'lida', is_new: false }).catch(() => null)));
  return unread.length;
}

export async function ensureContextualCareerCommunications(profile, context = {}) {
  if (!profile?.id) return [];
  const created = [];
  const careerDate = profile.career_date || '2026-01-01';
  const existing = await listCareerCommunications(profile.id, 200);
  const existingKeys = new Set(existing.map((row) => row.metadata?.context_key).filter(Boolean));
  const memory = buildCareerMemory(profile, context);
  const agent = getCareerAgent(profile);

  const createOnce = async (contextKey, payload) => {
    if (!contextKey || existingKeys.has(contextKey)) return null;
    const row = await localGame.entities.CareerMessage.create({
      profile_id: profile.id,
      message_type: payload.message_type || 'mensagem',
      sender_name: payload.sender_name || senderLabel(payload.sender_type),
      sender_type: payload.sender_type || 'sistema',
      title: payload.title,
      content: payload.content,
      status: payload.status || 'nao_lida',
      priority: payload.priority || 'normal',
      career_date: careerDate,
      related_entity_type: payload.related_entity_type,
      related_entity_id: payload.related_entity_id,
      related_entity_name: payload.related_entity_name,
      actions: payload.actions || [],
      metadata: { ...(payload.metadata || {}), context_key: contextKey },
    }).catch(() => null);
    if (row) {
      created.push(normalizeCareerMessage(row));
      existingKeys.add(contextKey);
    }
    return row;
  };

  if (profile.coach_id) {
    const fatigue = Number(profile.fatigue) || 0;
    const energy = Number(profile.energy) || 0;
    if (fatigue >= 65 || energy <= 30) {
      await createOnce(`coach-condition:${careerDate}:${fatigue >= 65 ? 'fatigue' : 'energy'}`, {
        sender_type: 'treinador', sender_name: profile.coach_name || 'Treinador principal',
        title: fatigue >= 65 ? 'Precisamos reduzir a carga' : 'Sua energia está baixa',
        content: fatigue >= 65
          ? `Sua fadiga chegou a ${Math.round(fatigue)}. Recomendo priorizar recuperação e evitar treinos intensos nos próximos dias.`
          : `Sua energia está em ${Math.round(energy)}. Um dia livre agora pode melhorar a qualidade dos próximos treinos.`,
        priority: fatigue >= 80 || energy <= 15 ? 'alta' : 'normal',
        status: 'decisao_pendente',
        actions: [
          { id: 'follow_recovery', label: 'Seguir recomendação', description: 'Fortalece a confiança com o treinador.', effect: { coachTrust: 2 } },
          { id: 'review_later', label: 'Revisar depois', description: 'Sem impacto imediato.', effect: {} },
        ],
        metadata: { memory_type: 'physical_condition', fatigue, energy },
      });
    }
  }

  const nextTournament = context.nextTournament;
  if (nextTournament?.id && nextTournament.start_date) {
    const days = daysBetween(careerDate, nextTournament.start_date);
    if (days >= 0 && days <= 7) {
      await createOnce(`federation-tournament:${nextTournament.id}:${careerDate}`, {
        sender_type: 'federacao', sender_name: 'Federação do Circuito',
        title: `${nextTournament.name || 'Próximo torneio'} se aproxima`,
        content: days === 0 ? 'A competição começa hoje. Confira sua inscrição, energia e planejamento.' : `Faltam ${days} dia${days === 1 ? '' : 's'} para o início. Revise sua preparação e os compromissos no calendário.`,
        related_entity_type: 'Tournament', related_entity_id: nextTournament.id, related_entity_name: nextTournament.name,
      });
    }
  }

  const recentWins = Number(context.recentWins ?? memory.recentWins ?? 0);
  if (profile.partner_id && recentWins >= 3) {
    await createOnce(`partner-streak:${careerDate}:${recentWins}`, {
      sender_type: 'atleta', sender_name: context.partnerName || profile.partner_name || 'Seu parceiro',
      title: 'Estamos em uma boa sequência',
      content: `Vencemos ${recentWins} partidas recentes. Sinto que nossa comunicação em quadra está evoluindo.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'celebrate_together', label: 'Valorizar a parceria', description: 'Fortalece confiança e moral da dupla.', effect: { partnerTrust: 2, partnerMorale: 2 } },
        { id: 'stay_focused', label: 'Manter o foco', description: 'Resposta profissional, com pequeno ganho de confiança.', effect: { partnerTrust: 1 } },
      ],
      metadata: { memory_type: 'recent_form', recent_wins: recentWins },
    });
  }

  if (profile.partner_id && memory.partnershipMonths >= 6) {
    const milestone = Math.floor(memory.partnershipMonths / 6) * 6;
    await createOnce(`partner-longevity:${profile.partner_id}:${milestone}`, {
      sender_type: 'atleta', sender_name: context.partnerName || profile.partner_name || 'Seu parceiro',
      title: `${milestone} meses construindo esta dupla`,
      content: `Já são ${milestone} meses trabalhando juntos${memory.partnershipMatches ? ` e ${memory.partnershipMatches} partidas compartilhadas` : ''}. Essa continuidade está criando uma identidade própria para nossa dupla.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'renew_commitment', label: 'Reafirmar compromisso', description: 'Aumenta a confiança da parceria.', effect: { partnerTrust: 3, partnerMorale: 1 } },
        { id: 'acknowledge', label: 'Reconhecer o momento', description: 'Mantém a relação positiva.', effect: { partnerTrust: 1 } },
      ],
      metadata: { memory_type: 'partnership_milestone', months: milestone },
    });
  }

  const contractEnd = profile.coach_contract_end_date;
  if (contractEnd) {
    const days = daysBetween(careerDate, contractEnd);
    if (days >= 0 && days <= 30) {
      await createOnce(`manager-coach-contract:${contractEnd}`, {
        sender_type: 'empresario', sender_name: profile.agent_name || 'Seu empresário',
        title: 'Contrato do treinador perto do fim',
        content: `O vínculo com ${profile.coach_name || 'seu treinador'} termina em ${days} dia${days === 1 ? '' : 's'}. Planeje a renovação ou avalie o mercado.`,
        priority: days <= 7 ? 'alta' : 'normal',
      });
    }
  }

  if (memory.activeSponsorContracts === 0 && Number(profile.reputation || 0) >= 8) {
    const month = careerDate.slice(0, 7);
    await createOnce(`agent-sponsor-search:${month}`, {
      sender_type: 'empresario', sender_name: agent.name,
      title: 'Vou mapear oportunidades comerciais',
      content: `Sua reputação já permite iniciar conversas com marcas compatíveis. Meu perfil ${agent.personalityLabel.toLowerCase()} priorizará propostas que façam sentido para o momento da carreira.`,
      status: 'decisao_pendente',
      actions: [
        { id: 'prioritize_value', label: 'Priorizar melhor valor', description: 'Aumenta a confiança do empresário.', effect: { agentTrust: 1 } },
        { id: 'prioritize_fit', label: 'Priorizar marcas compatíveis', description: 'Fortalece a relação de longo prazo.', effect: { agentTrust: 2 } },
      ],
      metadata: { memory_type: 'agent_strategy', agent_personality: agent.personality },
    });
  }

  if (memory.matchesPlayed >= 10) {
    const milestone = Math.floor(memory.matchesPlayed / 10) * 10;
    await createOnce(`coach-match-memory:${milestone}`, {
      sender_type: 'treinador', sender_name: profile.coach_name || 'Treinador principal',
      title: `${milestone} partidas analisadas`,
      content: memory.recentWinRate >= 60
        ? `Nosso aproveitamento recente está em ${memory.recentWinRate}%. O padrão de jogo está mais consistente; vamos preservar o que funciona e ajustar os detalhes.`
        : `Já reunimos dados de ${milestone} partidas. O aproveitamento recente está em ${memory.recentWinRate}%, então vou reforçar decisões mais seguras no próximo plano semanal.`,
      metadata: { memory_type: 'match_milestone', matches: milestone, recent_win_rate: memory.recentWinRate },
    });
  }

  return created;
}

export async function applyCareerCommunicationAction(profile, message, action) {
  if (!profile?.id || !action) return profile;
  const current = { ...profile };
  const patch = {};
  const effect = action.effect || {};
  if (effect.coachTrust) patch.coach_trust = Math.max(0, Math.min(100, Number(current.coach_trust ?? 55) + effect.coachTrust));
  if (effect.partnerTrust) patch.partner_trust = Math.max(0, Math.min(100, Number(current.partner_trust ?? 50) + effect.partnerTrust));
  if (effect.partnerMorale) patch.partner_morale = Math.max(0, Math.min(100, Number(current.partner_morale ?? 70) + effect.partnerMorale));
  if (effect.agentTrust) patch.agent_trust = Math.max(0, Math.min(100, Number(current.agent_trust ?? 55) + effect.agentTrust));
  if (effect.confidence) patch.confidence = Math.max(0, Math.min(100, Number(current.confidence ?? 60) + effect.confidence));
  if (Object.keys(patch).length === 0) return current;
  return await localGame.entities.PlayerProfile.update(profile.id, patch).catch(() => ({ ...current, ...patch }));
}

export function senderLabel(senderType) {
  const labels = {
    treinador: 'Treinador principal', atleta: 'Parceiro', empresario: 'Empresário', federacao: 'Federação',
    patrocinador: 'Patrocinador', clube: 'Clube', imprensa: 'Imprensa', sistema: 'Sistema',
  };
  return labels[senderType] || 'Sistema';
}

function daysBetween(from, to) {
  if (!from || !to) return 0;
  return Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
}
