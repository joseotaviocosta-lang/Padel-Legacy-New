import { localGame } from '@/api/localGameClient.js';

const ENTITY_NAMES = [
  'AthleteProfile', 'Partnership', 'Coach', 'PlayerStaffHire', 'Tournament',
  'TournamentRegistration', 'Match', 'Sponsor', 'PlayerContract', 'WorldEvent',
  'CareerMessage', 'TeamRanking', 'Club',
];

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const index = (clean.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return clean[low];
  return clean[low] + (clean[high] - clean[low]) * (index - low);
}

function calculateAge(record, referenceDate) {
  const birth = record?.birth_date || record?.date_of_birth;
  if (!birth) return safeNumber(record?.age, NaN);
  const birthDate = new Date(`${birth}T00:00:00`);
  const current = new Date(`${referenceDate || '2026-01-01'}T00:00:00`);
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(current.getTime())) return NaN;
  let age = current.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = current.getMonth() < birthDate.getMonth()
    || (current.getMonth() === birthDate.getMonth() && current.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function athleteOverall(athlete) {
  if (Number.isFinite(Number(athlete?.overall))) return Number(athlete.overall);
  const keys = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  const values = keys.map(key => Number(athlete?.[key])).filter(Number.isFinite);
  return values.length ? average(values) : 0;
}

async function listEntity(name) {
  const entity = localGame.entities?.[name];
  if (!entity?.list) return [];
  try { return await entity.list('-created_date', 10000) || []; }
  catch (error) {
    console.warn(`[simulation-health] Falha ao ler ${name}`, error);
    return [];
  }
}

function issue(id, severity, title, detail, count = 1) {
  return { id, severity, title, detail, count };
}

export async function collectWorldHealth({ career } = {}) {
  const entries = await Promise.all(ENTITY_NAMES.map(async name => [name, await listEntity(name)]));
  const data = Object.fromEntries(entries);
  const referenceDate = career?.career_date || '2026-01-01';
  const athletes = data.AthleteProfile || [];
  const partnerships = data.Partnership || [];
  const coaches = data.Coach || [];
  const staffHires = data.PlayerStaffHire || [];
  const matches = data.Match || [];
  const contracts = data.PlayerContract || [];
  const rankings = data.TeamRanking || [];

  const ages = athletes.map(item => calculateAge(item, referenceDate)).filter(Number.isFinite);
  const overalls = athletes.map(athleteOverall).filter(value => value > 0);
  const points = athletes.map(item => safeNumber(item.ranking_points ?? item.points, 0));
  const balances = athletes.map(item => safeNumber(item.coins ?? item.balance ?? item.money, NaN)).filter(Number.isFinite);
  const injuries = athletes.filter(item => item.is_injured || item.injury_status === 'injured' || safeNumber(item.injury_days, 0) > 0);
  const retired = athletes.filter(item => item.retired || item.status === 'retired');
  const activeAthletes = athletes.filter(item => !item.retired && item.status !== 'retired');
  const freeCoaches = coaches.filter(item => !item.club_id && !item.team_id && !item.hired_by && item.available !== false);

  const issues = [];
  const duplicateAthleteIds = athletes.length - new Set(athletes.map(item => item.id).filter(Boolean)).size;
  if (duplicateAthleteIds > 0) issues.push(issue('duplicate-athletes', 'blocker', 'IDs duplicados de atletas', 'Registros duplicados podem corromper ranking, duplas e histórico.', duplicateAthleteIds));

  const invalidPoints = athletes.filter(item => safeNumber(item.ranking_points ?? item.points, 0) < 0).length;
  if (invalidPoints) issues.push(issue('negative-points', 'high', 'Pontuação negativa no ranking', 'Atletas com pontos negativos devem ser normalizados para zero.', invalidPoints));

  const zeroPointTopRanks = athletes.filter(item => safeNumber(item.ranking_position ?? item.rank, 99999) <= 100 && safeNumber(item.ranking_points ?? item.points, 0) <= 0).length;
  if (zeroPointTopRanks) issues.push(issue('zero-point-top100', 'high', 'Top 100 sem pontos', 'Há atletas posicionados entre os 100 melhores sem pontuação competitiva.', zeroPointTopRanks));

  const invalidPartnerships = partnerships.filter(item => {
    const a = item.player1_id || item.athlete1_id || item.player_a_id;
    const b = item.player2_id || item.athlete2_id || item.player_b_id;
    return !a || !b || a === b;
  }).length;
  if (invalidPartnerships) issues.push(issue('invalid-partnerships', 'high', 'Duplas inválidas', 'Duplas sem dois atletas distintos foram encontradas.', invalidPartnerships));

  const activeWithoutCoach = partnerships.filter(item => item.active !== false && !item.coach_id && !item.head_coach_id && !item.trainer_id).length;
  if (activeWithoutCoach) issues.push(issue('partnerships-without-coach', 'medium', 'Duplas ativas sem treinador vinculado', 'A dupla deve possuir um treinador principal obrigatório.', activeWithoutCoach));

  const expiredActiveContracts = contracts.filter(item => {
    const end = item.end_date || item.contract_end;
    return item.active !== false && end && end < referenceDate;
  }).length;
  if (expiredActiveContracts) issues.push(issue('expired-contracts', 'medium', 'Contratos vencidos ainda ativos', 'Contratos precisam ser encerrados ou renovados na virada da data.', expiredActiveContracts));

  const repeatedWorldEvents = (data.WorldEvent || []).length - new Set((data.WorldEvent || []).map(item => item.context_key || item.event_key || `${item.type}|${item.date}|${item.title}`)).size;
  if (repeatedWorldEvents > 0) issues.push(issue('duplicate-world-events', 'medium', 'Eventos mundiais repetidos', 'Acontecimentos duplicados poluem notícias e linha do tempo.', repeatedWorldEvents));

  const repeatedMessages = (data.CareerMessage || []).length - new Set((data.CareerMessage || []).map(item => item.context_key || `${item.profile_id}|${item.created_date}|${item.subject || item.title}`)).size;
  if (repeatedMessages > 0) issues.push(issue('duplicate-messages', 'low', 'Comunicações potencialmente repetidas', 'Mensagens com a mesma chave contextual devem ser idempotentes.', repeatedMessages));

  if (activeAthletes.length < 1000) issues.push(issue('small-world', 'medium', 'População competitiva pequena', 'O circuito deveria manter pelo menos 1.000 atletas ativos.', activeAthletes.length));
  if (freeCoaches.length < 10) issues.push(issue('coach-supply', 'medium', 'Poucos treinadores disponíveis', 'O mercado pode deixar carreiras novas sem opções acessíveis.', freeCoaches.length));

  const severityWeight = { blocker: 40, high: 18, medium: 7, low: 2 };
  const penalty = issues.reduce((sum, item) => sum + severityWeight[item.severity] * Math.min(3, Math.max(1, item.count)), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const ageBands = [
    { label: '16–18', value: ages.filter(value => value >= 16 && value <= 18).length },
    { label: '19–22', value: ages.filter(value => value >= 19 && value <= 22).length },
    { label: '23–27', value: ages.filter(value => value >= 23 && value <= 27).length },
    { label: '28–32', value: ages.filter(value => value >= 28 && value <= 32).length },
    { label: '33+', value: ages.filter(value => value >= 33).length },
  ];

  return {
    generatedAt: new Date().toISOString(),
    referenceDate,
    score,
    status: score >= 90 ? 'Saudável' : score >= 75 ? 'Atenção' : score >= 55 ? 'Instável' : 'Crítico',
    counts: {
      athletes: athletes.length,
      activeAthletes: activeAthletes.length,
      retiredAthletes: retired.length,
      partnerships: partnerships.length,
      coaches: coaches.length,
      freeCoaches: freeCoaches.length,
      staffHires: staffHires.length,
      clubs: (data.Club || []).length,
      tournaments: (data.Tournament || []).length,
      matches: matches.length,
      injuries: injuries.length,
      sponsors: (data.Sponsor || []).length,
      contracts: contracts.length,
      rankings: rankings.length,
    },
    averages: {
      age: Number(average(ages).toFixed(1)),
      overall: Number(average(overalls).toFixed(1)),
      rankingPoints: Math.round(average(points)),
      balance: balances.length ? Math.round(average(balances)) : null,
    },
    distributions: {
      ageBands,
      overall: {
        p10: Number(quantile(overalls, 0.1).toFixed(1)),
        median: Number(quantile(overalls, 0.5).toFixed(1)),
        p90: Number(quantile(overalls, 0.9).toFixed(1)),
      },
      rankingPoints: {
        p10: Math.round(quantile(points, 0.1)),
        median: Math.round(quantile(points, 0.5)),
        p90: Math.round(quantile(points, 0.9)),
      },
    },
    issues: issues.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)),
  };
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function projectWorldHealth(report, seasons = 10) {
  const years = Math.max(1, Math.min(100, Math.floor(Number(seasons) || 10)));
  const random = mulberry32((report?.counts?.activeAthletes || 1000) + years * 7919);
  let active = report?.counts?.activeAthletes || 1000;
  let retired = report?.counts?.retiredAthletes || 0;
  let averageAge = report?.averages?.age || 25;
  let averageOverall = report?.averages?.overall || 65;
  let injuries = report?.counts?.injuries || 0;
  const yearly = [];

  for (let year = 1; year <= years; year += 1) {
    const entrants = Math.round(active * (0.075 + random() * 0.025));
    const retirements = Math.round(active * Math.max(0.025, 0.02 + Math.max(0, averageAge - 26) * 0.006 + random() * 0.012));
    active = Math.max(500, active + entrants - retirements);
    retired += retirements;
    averageAge = Math.max(22, Math.min(29, averageAge + 0.3 - (entrants / Math.max(1, active)) * 3.2));
    averageOverall = Math.max(55, Math.min(78, averageOverall + (random() - 0.48) * 0.7));
    injuries = Math.round(active * (0.012 + random() * 0.012));
    yearly.push({ year, active, entrants, retirements, averageAge: Number(averageAge.toFixed(1)), averageOverall: Number(averageOverall.toFixed(1)), injuries });
  }

  const warnings = [];
  if (active < 850) warnings.push('A população ativa tende a cair abaixo do alvo de 1.000 atletas.');
  if (active > 2500) warnings.push('A população ativa cresce demais e pode afetar desempenho e mercado.');
  if (averageAge > 28) warnings.push('O circuito envelhece mais rápido do que a entrada de jovens.');
  if (injuries / Math.max(1, active) > 0.025) warnings.push('A projeção indica prevalência elevada de lesões.');

  return {
    generatedAt: new Date().toISOString(),
    seasons: years,
    methodology: 'Projeção estatística determinística; não altera o save.',
    start: { active: report?.counts?.activeAthletes || 0, averageAge: report?.averages?.age || 0, averageOverall: report?.averages?.overall || 0 },
    end: { active, retired, averageAge: Number(averageAge.toFixed(1)), averageOverall: Number(averageOverall.toFixed(1)), injuries },
    warnings,
    yearly,
  };
}


function newestFirst(a, b) {
  const left = new Date(a?.updated_date || a?.created_date || a?.date || 0).getTime() || 0;
  const right = new Date(b?.updated_date || b?.created_date || b?.date || 0).getTime() || 0;
  return right - left;
}

function duplicateIds(records, keyBuilder) {
  const groups = new Map();
  for (const record of records) {
    const key = keyBuilder(record);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const ids = [];
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    items.sort(newestFirst);
    ids.push(...items.slice(1).map(item => item.id).filter(Boolean));
  }
  return ids;
}

export async function buildWorldRepairPlan({ career } = {}) {
  const entries = await Promise.all(ENTITY_NAMES.map(async name => [name, await listEntity(name)]));
  const data = Object.fromEntries(entries);
  const referenceDate = career?.career_date || '2026-01-01';
  const athletes = data.AthleteProfile || [];
  const contracts = data.PlayerContract || [];
  const partnerships = data.Partnership || [];

  const operations = [];
  for (const athlete of athletes) {
    const points = safeNumber(athlete.ranking_points ?? athlete.points, 0);
    if (points < 0 && athlete.id) {
      operations.push({ entity: 'AthleteProfile', action: 'update', id: athlete.id, patch: { ranking_points: 0, points: 0 }, reason: 'Normalizar pontos negativos' });
    }
    const rank = safeNumber(athlete.ranking_position ?? athlete.rank, 99999);
    if (rank <= 100 && points <= 0 && athlete.id) {
      operations.push({ entity: 'AthleteProfile', action: 'update', id: athlete.id, patch: { ranking_position: 1001, rank: 1001 }, reason: 'Retirar atleta sem pontos do Top 100' });
    }
  }

  for (const contract of contracts) {
    const end = contract.end_date || contract.contract_end;
    if (contract.id && contract.active !== false && end && end < referenceDate) {
      operations.push({ entity: 'PlayerContract', action: 'update', id: contract.id, patch: { active: false, status: 'expired', expired_at: referenceDate }, reason: 'Encerrar contrato vencido' });
    }
  }

  for (const partnership of partnerships) {
    const a = partnership.player1_id || partnership.athlete1_id || partnership.player_a_id;
    const b = partnership.player2_id || partnership.athlete2_id || partnership.player_b_id;
    if (partnership.id && partnership.active !== false && (!a || !b || a === b)) {
      operations.push({ entity: 'Partnership', action: 'update', id: partnership.id, patch: { active: false, status: 'invalid', ended_at: referenceDate }, reason: 'Desativar dupla estruturalmente inválida' });
    }
  }

  const duplicateWorldEventIds = duplicateIds(data.WorldEvent || [], item => item.context_key || item.event_key || `${item.type || ''}|${item.date || ''}|${item.title || ''}`);
  duplicateWorldEventIds.forEach(id => operations.push({ entity: 'WorldEvent', action: 'delete', id, reason: 'Remover evento mundial duplicado' }));

  const duplicateMessageIds = duplicateIds(data.CareerMessage || [], item => item.context_key || `${item.profile_id || ''}|${item.created_date || ''}|${item.subject || item.title || ''}`);
  duplicateMessageIds.forEach(id => operations.push({ entity: 'CareerMessage', action: 'delete', id, reason: 'Remover comunicação duplicada' }));

  const byReason = operations.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    referenceDate,
    safeOnly: true,
    total: operations.length,
    byReason,
    operations,
    skippedRecommendations: [
      'Duplas ativas sem treinador exigem vínculo contextual e não são corrigidas automaticamente.',
      'População pequena e oferta de treinadores devem ser corrigidas pelos geradores oficiais do mundo.',
    ],
  };
}

export async function applyWorldRepairPlan(plan) {
  const operations = Array.isArray(plan?.operations) ? plan.operations : [];
  const results = [];
  for (const operation of operations) {
    const entity = localGame.entities?.[operation.entity];
    if (!entity || !operation.id) {
      results.push({ ...operation, status: 'skipped', error: 'Entidade ou ID indisponível' });
      continue;
    }
    try {
      if (operation.action === 'delete' && entity.delete) await entity.delete(operation.id);
      else if (operation.action === 'update' && entity.update) await entity.update(operation.id, operation.patch || {});
      else throw new Error('Ação não suportada');
      results.push({ ...operation, status: 'applied' });
    } catch (error) {
      results.push({ ...operation, status: 'failed', error: error?.message || String(error) });
    }
  }
  return {
    completedAt: new Date().toISOString(),
    total: results.length,
    applied: results.filter(item => item.status === 'applied').length,
    failed: results.filter(item => item.status === 'failed').length,
    skipped: results.filter(item => item.status === 'skipped').length,
    results,
  };
}
