const DAY_MS = 86400000;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function daysBetween(from, to) {
  if (!from || !to) return 0;
  return Math.max(0, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY_MS));
}

function stableIndex(seed, length) {
  let hash = 0;
  for (const char of String(seed || 'padel')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % Math.max(1, length);
}

export function getCareerAgent(profile = {}) {
  const names = ['Marina Costa', 'Rafael Duarte', 'Sofia Martín', 'Lucas Moreira', 'Valentina Rossi', 'Miguel Torres'];
  const personalities = [
    { id: 'estrategico', label: 'Estratégico', description: 'Prioriza contratos sustentáveis e crescimento de reputação.' },
    { id: 'negociador', label: 'Negociador', description: 'Busca melhores valores e protege seus contratos.' },
    { id: 'proximo', label: 'Próximo', description: 'Explica decisões e reduz a carga administrativa da carreira.' },
  ];
  const seed = `${profile.id || ''}:${profile.name || profile.sport_name || ''}`;
  const personality = personalities[stableIndex(`${seed}:personality`, personalities.length)];
  return {
    id: `agent-${profile.id || 'career'}`,
    name: profile.agent_name || names[stableIndex(seed, names.length)],
    personality: personality.id,
    personalityLabel: personality.label,
    description: personality.description,
    trust: clamp(profile.agent_trust ?? 55),
    negotiation: clamp(profile.agent_negotiation ?? 52),
  };
}

export function buildCareerMemory(profile = {}, context = {}) {
  const matches = Array.isArray(context.matches) ? context.matches : [];
  const partnership = context.partnership || null;
  const contracts = Array.isArray(context.sponsorContracts) ? context.sponsorContracts : [];
  const completed = matches.filter((match) => {
    const status = String(match.status || '').toLowerCase();
    return ['completed', 'finished', 'concluida', 'concluido'].includes(status) || Boolean(match.winner_id || match.winner_profile_id || match.player_won);
  });
  const wins = completed.filter((match) => match.player_won === true || match.is_winner === true || match.winner_id === profile.id || match.winner_profile_id === profile.id);
  const recent = completed.slice(0, 10);
  const recentWins = recent.filter((match) => match.player_won === true || match.is_winner === true || match.winner_id === profile.id || match.winner_profile_id === profile.id).length;
  const careerDate = profile.career_date || '2026-01-01';
  const partnershipStart = partnership?.started_career_date || partnership?.start_date;
  const partnershipDays = partnershipStart ? daysBetween(partnershipStart, careerDate) : 0;
  const activeContracts = contracts.filter((contract) => contract.is_active !== false);

  return {
    matchesPlayed: completed.length,
    wins: wins.length,
    recentMatches: recent.length,
    recentWins,
    recentWinRate: recent.length ? Math.round((recentWins / recent.length) * 100) : 0,
    partnershipDays,
    partnershipMonths: Math.floor(partnershipDays / 30),
    partnershipMatches: Number(partnership?.shared_matches || 0),
    partnershipWins: Number(partnership?.shared_wins || 0),
    partnershipTitles: Number(partnership?.shared_titles || 0),
    activeSponsorContracts: activeContracts.length,
    coachTrust: clamp(profile.coach_trust ?? 55),
    partnerTrust: clamp(profile.partner_trust ?? partnership?.partner_trust ?? 50),
    energy: clamp(profile.energy ?? 100),
    fatigue: clamp(profile.fatigue ?? 0),
  };
}

export function getMemoryHighlights(profile = {}, memory = {}) {
  const highlights = [];
  if (memory.recentMatches >= 3) highlights.push(`${memory.recentWins} vitórias nas últimas ${memory.recentMatches} partidas`);
  if (memory.partnershipMonths >= 6) highlights.push(`${memory.partnershipMonths} meses de parceria com ${profile.partner_name || 'seu parceiro'}`);
  if (memory.partnershipTitles > 0) highlights.push(`${memory.partnershipTitles} título${memory.partnershipTitles === 1 ? '' : 's'} conquistado${memory.partnershipTitles === 1 ? '' : 's'} pela dupla`);
  if (memory.activeSponsorContracts > 0) highlights.push(`${memory.activeSponsorContracts} contrato${memory.activeSponsorContracts === 1 ? '' : 's'} comercial${memory.activeSponsorContracts === 1 ? '' : 'is'} ativo${memory.activeSponsorContracts === 1 ? '' : 's'}`);
  return highlights.slice(0, 3);
}
