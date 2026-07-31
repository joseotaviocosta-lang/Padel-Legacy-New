import { base44 } from '@/api/base44Client';

const STAFF_CATALOG = {
  accountant: { name: 'Contador', monthlyCost: 800, bonus: 'Despesas mensais -15%' },
  manager: { name: 'Empresário', monthlyCost: 1500, bonus: 'Patrocínios +25%' },
  physio: { name: 'Fisioterapeuta', monthlyCost: 1200, bonus: 'Recuperação física e risco de lesão' },
  nutritionist: { name: 'Nutricionista', monthlyCost: 900, bonus: 'Recuperação diária de energia' },
  mental_coach: { name: 'Treinador Mental', monthlyCost: 1100, bonus: 'Confiança, moral e XP de treino' },
};

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dayChanged(previousDate, currentDate) {
  return String(previousDate || '').slice(0, 10) !== String(currentDate || '').slice(0, 10);
}

function weekKey(date) {
  const d = new Date(`${date}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-${Math.floor((d - start) / 604800000)}`;
}

async function safeCreate(entityName, payload) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch (error) {
    console.warn(`[Equipe Técnica] Falha não crítica em ${entityName}:`, error?.message || error);
    return null;
  }
}

export async function getStaffSnapshot(profile) {
  if (!profile?.id) return { staff: [], monthlyCost: 0, bonuses: [] };
  let staff = [];
  try {
    staff = await base44.entities.PlayerStaffHire.filter({ profile_id: profile.id });
  } catch (error) {
    console.warn('[Equipe Técnica] Não foi possível carregar a equipe:', error);
  }

  const normalized = (staff || []).filter(Boolean).map((member) => {
    const catalog = STAFF_CATALOG[member.staff_type] || {};
    return {
      ...member,
      staff_name: member.staff_name || catalog.name || 'Profissional',
      monthly_cost: Math.max(0, asNumber(member.monthly_cost, catalog.monthlyCost || 0)),
      bonus_description: catalog.bonus || 'Bônus profissional',
    };
  });

  return {
    staff: normalized,
    monthlyCost: normalized.reduce((sum, member) => sum + member.monthly_cost, 0),
    bonuses: normalized.map((member) => member.bonus_description),
    types: normalized.map((member) => member.staff_type),
  };
}

export async function processStaffDay(profile, previousDate, currentDate) {
  if (!profile?.id || !dayChanged(previousDate, currentDate)) {
    return { profile, processed: false, staffCount: 0 };
  }

  const snapshot = await getStaffSnapshot(profile);
  const types = new Set(snapshot.types || []);
  const patch = {
    staff_monthly_cost: snapshot.monthlyCost,
    staff_count: snapshot.staff.length,
    staff_last_processed_date: currentDate,
    staff_bonus_manager: types.has('manager') ? 0.25 : 0,
    staff_bonus_accountant: types.has('accountant') ? 0.15 : 0,
    staff_injury_risk_multiplier: types.has('physio') ? 0.5 : 1,
    staff_training_xp_multiplier: types.has('mental_coach') ? 1.2 : 1,
  };

  if (types.has('nutritionist')) {
    patch.energy = clamp(asNumber(profile.energy, 100) + 2, 0, 110);
  }
  if (types.has('physio')) {
    patch.fatigue = clamp(asNumber(profile.fatigue, 0) - 2, 0, 100);
  }
  if (types.has('mental_coach')) {
    patch.morale = clamp(asNumber(profile.morale, 70) + 1, 0, 100);
    patch.confidence = clamp(asNumber(profile.confidence, 70) + 1, 0, 100);
  }

  let updatedProfile = profile;
  try {
    updatedProfile = await base44.entities.PlayerProfile.update(profile.id, patch);
  } catch (error) {
    console.warn('[Equipe Técnica] Bônus diários não foram salvos:', error);
  }

  const currentWeek = weekKey(currentDate);
  if (snapshot.staff.length > 0 && profile.staff_last_summary_week !== currentWeek) {
    await safeCreate('CareerMessage', {
      profile_id: profile.id,
      sender_name: 'Diretor de Performance',
      subject: 'Relatório da equipe técnica',
      body: `Sua equipe possui ${snapshot.staff.length} profissional(is), com custo mensal de ${snapshot.monthlyCost.toLocaleString('pt-BR')} moedas. Benefícios ativos: ${snapshot.bonuses.join('; ')}.`,
      status: 'nao_lida',
      message_type: 'staff_report',
      created_date: new Date().toISOString(),
    });
    try {
      updatedProfile = await base44.entities.PlayerProfile.update(profile.id, {
        staff_last_summary_week: currentWeek,
      });
    } catch (error) {
      console.warn('[Equipe Técnica] Semana do relatório não foi salva:', error);
    }
  }

  return {
    profile: updatedProfile,
    processed: true,
    staffCount: snapshot.staff.length,
    monthlyCost: snapshot.monthlyCost,
    bonuses: snapshot.bonuses,
  };
}

export function getStaffCatalog() {
  return STAFF_CATALOG;
}
