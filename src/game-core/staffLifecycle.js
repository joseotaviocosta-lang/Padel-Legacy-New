import { localGame } from '@/api/localGameClient.js';
import { STAFF_ROLE_DEFINITIONS, normalizeStaffMember, scaleStaffEffects } from '@/lib/staffCatalog.js';
import { getFacilityEffects, getActiveStaffSynergies, getSynergyEffects } from '@/lib/staffFacilities.js';
import { normalizeFatigue } from './physicalStats.js';

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function dayChanged(previousDate, currentDate) { return String(previousDate || '').slice(0, 10) !== String(currentDate || '').slice(0, 10); }
function monthKey(date) { return String(date || '2026-01-01').slice(0, 7); }
function weekKey(date) {
  const d = new Date(`${date}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-${Math.floor((d - start) / 604800000)}`;
}
function hashText(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function seeded01(value) { return (hashText(value) % 100000) / 100000; }
async function safeCreate(entityName, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch (error) {
    console.warn(`[Comissão Técnica] Falha não crítica em ${entityName}:`, error?.message || error);
    return null;
  }
}

function combineEffects(staff) {
  const combined = {};
  for (const member of staff || []) {
    for (const [key, value] of Object.entries(scaleStaffEffects(member))) {
      combined[key] = (combined[key] || 0) + Number(value || 0);
    }
  }
  return combined;
}

export async function getStaffSnapshot(profile) {
  if (!profile?.id) return { staff: [], monthlyCost: 0, bonuses: [], effects: {}, types: [] };
  let rawStaff = [];
  try {
    rawStaff = await localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id });
  } catch (error) {
    console.warn('[Comissão Técnica] Não foi possível carregar a equipe:', error);
  }
  const staff = (rawStaff || []).filter(Boolean).map(normalizeStaffMember).filter(member => !['terminated', 'expired'].includes(member.contract_status));
  const staffEffects = combineEffects(staff);
  const facilityEffects = getFacilityEffects(profile);
  const synergyEffects = getSynergyEffects(profile, staff);
  const effects = { ...staffEffects };
  for (const source of [facilityEffects, synergyEffects]) {
    for (const [key, value] of Object.entries(source || {})) effects[key] = (effects[key] || 0) + Number(value || 0);
  }
  const synergies = getActiveStaffSynergies(profile, staff);
  return {
    staff,
    effects,
    staffEffects, facilityEffects, synergyEffects, synergies,
    monthlyCost: staff.reduce((sum, member) => sum + Math.max(0, asNumber(member.monthly_cost)), 0),
    bonuses: staff.map(member => `${member.role_name} (${member.specialty_name}): ${member.summary}`),
    types: staff.map(member => member.staff_type),
  };
}

export function getStaffEffectPatch(snapshot = {}) {
  const effects = snapshot.effects || {};
  return {
    staff_monthly_cost: snapshot.monthlyCost || 0,
    staff_count: snapshot.staff?.length || 0,
    staff_injury_risk_multiplier: clamp(1 - asNumber(effects.injuryReduction), 0.42, 1),
    staff_training_gain_multiplier: 1 + clamp(asNumber(effects.allTraining), 0, 0.24),
    staff_court_training_multiplier: 1 + clamp(asNumber(effects.courtTraining), 0, 0.22),
    staff_physical_training_multiplier: 1 + clamp(asNumber(effects.physicalTraining), 0, 0.25),
    staff_mental_training_multiplier: 1 + clamp(asNumber(effects.mentalTraining), 0, 0.25),
    staff_tactical_training_multiplier: 1 + clamp(asNumber(effects.tacticalTraining), 0, 0.25),
    staff_training_energy_multiplier: clamp(1 - asNumber(effects.trainingEnergyReduction), 0.72, 1),
    staff_bonus_manager: clamp(asNumber(effects.sponsorBonus), 0, 0.30),
    staff_bonus_accountant: clamp(asNumber(effects.expenseReduction), 0, 0.18),
    staff_analysis_level: Math.round(asNumber(effects.analysisLevel)),
    staff_scout_level: Math.round(asNumber(effects.scoutLevel)),
    staff_negotiation_power: clamp(asNumber(effects.sponsorBonus) + asNumber(effects.expenseReduction) * 0.35, 0, 0.45),
    staff_active_synergies: (snapshot.synergies || []).filter(item => item.active).map(item => item.id),
  };
}

export async function syncStaffEffects(profile) {
  if (!profile?.id) return profile;
  const snapshot = await getStaffSnapshot(profile);
  const patch = getStaffEffectPatch(snapshot);
  try {
    return await localGame.entities.PlayerProfile.update(profile.id, patch);
  } catch (error) {
    console.warn('[Comissão Técnica] Não foi possível sincronizar os efeitos:', error);
    return profile;
  }
}

function getMemberGrowth(member, profile, month) {
  if (member.last_growth_month === month) return null;
  const room = Math.max(0, asNumber(member.potential, member.quality) - asNumber(member.quality));
  const ageFactor = member.age <= 35 ? 1 : member.age <= 45 ? 0.7 : 0.35;
  const tenureMonths = Math.max(0, Math.round((new Date(`${month}-01T12:00:00`) - new Date(`${member.contract_started_date || `${month}-01`}T12:00:00`)) / 2629800000));
  const workFactor = Math.min(1.25, 0.8 + tenureMonths * 0.025);
  const roll = seeded01(`${profile.id}:${member.staff_id}:${month}:growth`);
  const xpGain = Math.round((18 + member.quality * 0.25) * ageFactor * workFactor);
  const qualityGain = room > 0 && roll < Math.min(0.65, 0.18 + room / 80) ? 1 : 0;
  const satisfactionDelta = profile.coins < member.monthly_cost ? -4 : profile.career_level >= member.minCareerLevel ? 1 : 0;
  return {
    quality: clamp(member.quality + qualityGain, 1, member.potential),
    staff_xp: member.staff_xp + xpGain,
    staff_level: Math.max(1, Math.floor((member.staff_xp + xpGain) / 250) + 1),
    satisfaction: clamp(member.satisfaction + satisfactionDelta, 0, 100),
    last_growth_month: month,
  };
}


async function processStaffMonthlyEvent(profile, snapshot, month) {
  if (!snapshot.staff.length) return null;
  const roll = seeded01(`${profile.id}:${month}:staff-event`);
  if (roll > 0.42) return null;
  const member = snapshot.staff[Math.floor(seeded01(`${profile.id}:${month}:member`) * snapshot.staff.length)];
  const activeSynergies = (snapshot.synergies || []).filter(item => item.active);
  let subject = 'Bastidores da comissão';
  let body = `${member.staff_name} destacou a evolução da estrutura de trabalho neste mês.`;
  let patch = {};
  if (member.satisfaction < 45) {
    subject = 'Insatisfação na comissão';
    body = `${member.staff_name} demonstrou insatisfação com o momento atual. Renovação, salário e estrutura podem influenciar sua permanência.`;
    patch = { satisfaction: clamp(member.satisfaction - 2, 0, 100) };
  } else if (activeSynergies.length) {
    const synergy = activeSynergies[0];
    subject = `Sinergia ativa: ${synergy.name}`;
    body = `${synergy.description} A comissão percebeu melhora na integração entre profissionais e estrutura.`;
    patch = { satisfaction: clamp(member.satisfaction + 2, 0, 100) };
  } else if (profile.staff_negotiation_power >= 0.12) {
    subject = 'Boa fase nas negociações';
    body = 'A equipe de gestão identificou melhor poder de negociação com patrocinadores e parceiros comerciais.';
  }
  if (Object.keys(patch).length) await localGame.entities.PlayerStaffHire.update(member.id, patch);
  await safeCreate('CareerMessage', {
    profile_id: profile.id, sender_name: 'Diretor de Performance', sender_type: 'sistema', subject, body, title: subject, content: body,
    status: 'nao_lida', message_type: 'staff_event', notification_type: 'STAFF', destination: { type: 'STAFF', route: '/staff' },
    created_date: new Date().toISOString(),
  });
  return { subject, memberId: member.id };
}

export async function processStaffMonth(profile, currentDate) {
  if (!profile?.id) return { processed: false, updates: [] };
  const month = monthKey(currentDate);
  const snapshot = await getStaffSnapshot(profile);
  const updates = [];

  for (const member of snapshot.staff) {
    if (member.contract_status === 'terminated') continue;
    if (member.contract_end_date && member.contract_end_date < String(currentDate).slice(0, 10)) {
      await localGame.entities.PlayerStaffHire.update(member.id, {
        contract_status: 'expired', satisfaction: clamp(member.satisfaction - 10, 0, 100),
      });
      updates.push({ id: member.id, type: 'expired', name: member.staff_name });
      continue;
    }
    const growth = getMemberGrowth(member, profile, month);
    if (!growth) continue;
    await localGame.entities.PlayerStaffHire.update(member.id, growth);
    updates.push({ id: member.id, type: 'growth', name: member.staff_name, qualityGain: growth.quality - member.quality, xpGain: growth.staff_xp - member.staff_xp });
  }

  if (updates.length > 0) {
    const evolved = updates.filter(item => item.qualityGain > 0);
    const expired = updates.filter(item => item.type === 'expired');
    const parts = [];
    if (evolved.length) parts.push(`${evolved.map(item => item.name).join(', ')} evoluiu profissionalmente.`);
    if (expired.length) parts.push(`${expired.map(item => item.name).join(', ')} chegou ao fim do contrato.`);
    if (!parts.length) parts.push('A comissão acumulou experiência de trabalho neste mês.');
    await safeCreate('CareerMessage', {
      profile_id: profile.id,
      sender_name: 'Diretor de Performance',
      sender_type: 'sistema',
      subject: `Evolução da comissão · ${month}`,
      body: parts.join(' '),
      title: `Evolução da comissão · ${month}`,
      content: parts.join(' '),
      status: 'nao_lida', message_type: 'staff_monthly_report', notification_type: 'STAFF',
      destination: { type: 'STAFF', route: '/staff' },
      created_date: new Date().toISOString(),
    });
  }
  const refreshed = await getStaffSnapshot(profile);
  const event = await processStaffMonthlyEvent(profile, refreshed, month);
  return { processed: true, month, updates, event };
}

export function getStaffWeeklyRecommendations(profile, snapshot) {
  const recommendations = [];
  const roles = new Set(snapshot.types || []);
  if (asNumber(profile.fatigue) >= 60) recommendations.push({ priority: 'high', title: 'Reduza a carga física', body: 'A fadiga está alta. Reserve um dia livre ou priorize recuperação antes do próximo compromisso.' });
  else if (asNumber(profile.energy, 100) < 45) recommendations.push({ priority: 'high', title: 'Recupere energia', body: 'Evite sessões intensas enquanto a energia estiver abaixo de 45.' });
  if (!roles.has('physical_trainer')) recommendations.push({ priority: 'medium', title: 'Considere um preparador físico', body: 'Esse profissional reduz o custo energético e melhora a regularidade dos treinos.' });
  if (!roles.has('performance_analyst') && asNumber(profile.matches_played) >= 5) recommendations.push({ priority: 'medium', title: 'Adicione análise de desempenho', body: 'Com mais partidas disputadas, um analista transforma o histórico em decisões melhores.' });
  if (!roles.has('manager') && asNumber(profile.reputation) >= 20) recommendations.push({ priority: 'low', title: 'Profissionalize sua imagem', body: 'Um empresário pode transformar reputação em propostas e patrocínios melhores.' });
  if (snapshot.monthlyCost > asNumber(profile.coins) * 0.35) recommendations.push({ priority: 'high', title: 'Revise a folha salarial', body: 'O custo mensal da comissão está elevado em relação ao saldo atual.' });
  const activeSynergies = (snapshot.synergies || []).filter(item => item.active);
  if (!activeSynergies.length && (snapshot.staff || []).length >= 3) recommendations.push({ priority: 'medium', title: 'Monte uma sinergia', body: 'Sua comissão já tem tamanho para combinar especialidades e instalações. Veja a aba Sinergias.' });
  if ((snapshot.facilityEffects?.analysisLevel || 0) < 1 && roles.has('performance_analyst')) recommendations.push({ priority: 'low', title: 'Melhore o laboratório de análise', body: 'O analista renderá mais com uma estrutura de dados compatível.' });
  if (!recommendations.length) recommendations.push({ priority: 'low', title: 'Estrutura equilibrada', body: 'A comissão está coerente com o momento atual. Continue acompanhando contratos e especialidades.' });
  return recommendations.slice(0, 4);
}

export async function processStaffDay(profile, previousDate, currentDate) {
  if (!profile?.id || !dayChanged(previousDate, currentDate)) return { profile, processed: false, staffCount: 0 };

  let snapshot = await getStaffSnapshot(profile);
  const effects = snapshot.effects || {};
  const patch = { ...getStaffEffectPatch(snapshot), staff_last_processed_date: currentDate };

  const dailyEnergy = clamp(asNumber(effects.dailyEnergy), 0, 10);
  const dailyFatigue = clamp(asNumber(effects.dailyFatigue), 0, 12);
  const dailyMorale = clamp(asNumber(effects.dailyMorale), 0, 4);
  const dailyConfidence = clamp(asNumber(effects.dailyConfidence), 0, 4);
  if (dailyEnergy > 0) patch.energy = clamp(asNumber(profile.energy, 100) + dailyEnergy, 0, 100);
  if (dailyFatigue > 0) patch.fatigue = normalizeFatigue(asNumber(profile.fatigue, 0) - dailyFatigue);
  if (dailyMorale > 0) patch.morale = clamp(asNumber(profile.morale, 70) + dailyMorale, 0, 100);
  if (dailyConfidence > 0) patch.confidence = clamp(asNumber(profile.confidence, 70) + dailyConfidence, 0, 100);

  let updatedProfile = profile;
  try { updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, patch); }
  catch (error) { console.warn('[Comissão Técnica] Bônus diários não foram salvos:', error); }

  if (monthKey(previousDate) !== monthKey(currentDate)) {
    await processStaffMonth(updatedProfile, currentDate);
    snapshot = await getStaffSnapshot(updatedProfile);
  }

  const currentWeek = weekKey(currentDate);
  if (snapshot.staff.length > 0 && profile.staff_last_summary_week !== currentWeek) {
    const recommendations = getStaffWeeklyRecommendations(updatedProfile, snapshot);
    const mainBenefits = snapshot.bonuses.slice(0, 3).join('; ');
    const advice = recommendations.map(item => `${item.title}: ${item.body}`).join(' ');
    const weeklyBody = `Equipe: ${snapshot.staff.length} profissional(is), folha de ${snapshot.monthlyCost.toLocaleString('pt-BR')} moedas. Benefícios: ${mainBenefits}. Recomendações: ${advice}`;
    await safeCreate('CareerMessage', {
      profile_id: profile.id,
      sender_name: 'Diretor de Performance',
      sender_type: 'sistema',
      subject: 'Relatório semanal da comissão',
      body: weeklyBody,
      title: 'Relatório semanal da comissão',
      content: weeklyBody,
      status: 'nao_lida', message_type: 'staff_report', notification_type: 'STAFF',
      destination: { type: 'STAFF', route: '/staff' },
      created_date: new Date().toISOString(),
      metadata: { recommendations },
    });
    try { updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, { staff_last_summary_week: currentWeek }); }
    catch (error) { console.warn('[Comissão Técnica] Semana do relatório não foi salva:', error); }
  }

  return { profile: updatedProfile, processed: true, staffCount: snapshot.staff.length, monthlyCost: snapshot.monthlyCost, bonuses: snapshot.bonuses };
}

export function getStaffCatalog() { return STAFF_ROLE_DEFINITIONS; }
