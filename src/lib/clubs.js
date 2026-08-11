import { localGame } from '@/api/localGameClient.js';

// ── Catalogs ──────────────────────────────────────────────────────────────

export const FACILITIES = [
  { id: 'reception', name: 'Recepção', icon: 'Building2', cost: 5000, description: 'Área de recepção para membros' },
  { id: 'gym', name: 'Academia', icon: 'Dumbbell', cost: 20000, description: 'Academia para condicionamento' },
  { id: 'pool', name: 'Piscina', icon: 'Waves', cost: 50000, description: 'Piscina para recuperação' },
  { id: 'restaurant', name: 'Restaurante', icon: 'UtensilsCrossed', cost: 30000, description: 'Restaurante e bar' },
  { id: 'pro_shop', name: 'Pro Shop', icon: 'ShoppingBag', cost: 15000, description: 'Loja de equipamentos' },
  { id: 'spa', name: 'Spa', icon: 'Sparkles', cost: 40000, description: 'Spa e fisioterapia' },
];

export const CLUB_STAFF_TYPES = [
  { id: 'manager', name: 'Gerente', icon: 'Briefcase', monthly_cost: 3000, bonus: '+5 reputação/mês' },
  { id: 'coach', name: 'Treinador', icon: 'GraduationCap', monthly_cost: 2500, bonus: '+10% evolução de membros' },
  { id: 'physio', name: 'Fisioterapeuta', icon: 'HeartPulse', monthly_cost: 2000, bonus: 'Recuperação de membros' },
  { id: 'receptionist', name: 'Recepcionista', icon: 'UserCheck', monthly_cost: 1200, bonus: '+3 reputação/mês' },
  { id: 'groundskeeper', name: 'Zelador', icon: 'Wrench', monthly_cost: 1000, bonus: 'Manutenção de quadras' },
];

export const EVENT_TYPES = [
  { id: 'social', name: 'Social', icon: 'Users' },
  { id: 'tournament', name: 'Torneio Interno', icon: 'Trophy' },
  { id: 'clinic', name: 'Clínica', icon: 'GraduationCap' },
  { id: 'exhibition', name: 'Exibição', icon: 'Star' },
];

const BOT_NAMES = [
  'Carlos Eduardo', 'Mariana Silva', 'Pedro Santos', 'Ana Oliveira',
  'Rafael Costa', 'Juliana Ferreira', 'Bruno Almeida', 'Camila Rocha',
  'Diego Martins', 'Fernanda Lima', 'Gustavo Ribeiro', 'Patrícia Souza',
  'Rodrigo Barbosa', 'Beatriz Carvalho', 'Thiago Araújo', 'Letícia Gomes',
  'Marcelo Pinto', 'Amanda Nunes', 'Felipe Cardoso', 'Bruna Moraes',
];

function generateBotMembers(clubId, count) {
  const members = [];
  for (let i = 0; i < count; i++) {
    members.push({
      club_id: clubId,
      member_name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
      role: 'membro',
      ranking_points: Math.floor(Math.random() * 400) + 50,
      is_bot: true,
    });
  }
  return members;
}

// ── Actions ────────────────────────────────────────────────────────────────

export async function createClub(profile, clubData) {
  if (profile?.club_id) throw new Error('Você já possui um clube principal.');
  const foundedDate = profile?.career_date || new Date().toISOString().slice(0, 10);
  const club = await localGame.entities.Club.create({
    ...clubData,
    reputation: 50,
    monthly_fee: 100,
    court_count: 2,
    facilities: [],
    level: 1,
    owner_profile_id: profile?.id || '',
    owner_name: profile?.sport_name || '',
    founded_date: foundedDate,
    member_count: 1,
    club_points: 0,
    trophies: 0,
    staff_count: 0,
  });

  const bots = generateBotMembers(club.id, 5 + Math.floor(Math.random() * 6));
  if (bots.length > 0) await localGame.entities.ClubMember.bulkCreate(bots);

  await localGame.entities.ClubMember.create({
    club_id: club.id,
    profile_id: profile?.id || '',
    member_name: profile?.sport_name || 'Presidente',
    role: 'presidente',
    ranking_points: Math.floor((profile?.xp || 0) / 10),
    is_bot: false,
    joined_date: foundedDate,
  });

  const updatedClub = await localGame.entities.Club.update(club.id, { member_count: bots.length + 1 });
  if (profile?.id) await localGame.entities.PlayerProfile.update(profile.id, {
    club_id: club.id, club_name: club.name, club_joined_date: foundedDate,
    club_monthly_fee: 0, club_training_bonus: 0.04, club_recovery_bonus: 1,
    club_affiliation_status: 'owner',
  });
  return updatedClub;
}

export async function joinClub(profile, club) {
  if (profile.club_id && profile.club_id !== club.id) throw new Error('Você já possui um clube principal. Saia dele antes de trocar.');
  const existing = await localGame.entities.ClubMember.filter({ club_id: club.id, profile_id: profile.id });
  if (existing && existing.length > 0) return existing[0];
  const membershipFee = Math.max(0, Number(club.membership_fee ?? (club.monthly_fee || 100) * 2));
  if ((profile.coins || 0) < membershipFee) throw new Error(`Saldo insuficiente. A filiação custa ${membershipFee} moedas.`);

  const member = await localGame.entities.ClubMember.create({
    club_id: club.id,
    profile_id: profile.id,
    member_name: profile.sport_name || 'Membro',
    role: 'membro',
    ranking_points: Math.floor((profile.xp || 0) / 10),
    is_bot: false,
    joined_date: profile.career_date || new Date().toISOString().slice(0, 10),
  });

  await localGame.entities.Club.update(club.id, { member_count: (club.member_count || 0) + 1 });
  const level = Math.max(1, Number(club.level) || 1);
  await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) - membershipFee,
    club_id: club.id,
    club_name: club.name,
    club_joined_date: profile.career_date,
    club_monthly_fee: Math.max(0, Number(club.monthly_fee) || 0),
    club_training_bonus: Math.min(0.12, 0.03 + level * 0.01),
    club_recovery_bonus: Math.min(5, level),
    club_affiliation_status: 'active',
  });
  return member;
}

export async function leaveClub(member, club, profile) {
  await localGame.entities.ClubMember.delete(member.id);
  await localGame.entities.Club.update(club.id, { member_count: Math.max(0, (club.member_count || 1) - 1) });
  if (profile?.id) await localGame.entities.PlayerProfile.update(profile.id, {
    club_id: null, club_name: null, club_monthly_fee: 0, club_training_bonus: 0,
    club_recovery_bonus: 0, club_affiliation_status: 'inactive',
    club_history: [...(profile.club_history || []), { club_id: club.id, club_name: club.name, joined_date: profile.club_joined_date, left_date: profile.career_date }].slice(-20),
  });
}

export async function hireClubStaff(club, staffType) {
  await localGame.entities.ClubStaff.create({
    club_id: club.id,
    staff_type: staffType.id,
    staff_name: staffType.name,
    monthly_cost: staffType.monthly_cost,
    bonus_description: staffType.bonus,
  });
  return await localGame.entities.Club.update(club.id, { staff_count: (club.staff_count || 0) + 1 });
}

export async function fireClubStaff(staffRecord, club) {
  await localGame.entities.ClubStaff.delete(staffRecord.id);
  return await localGame.entities.Club.update(club.id, { staff_count: Math.max(0, (club.staff_count || 1) - 1) });
}

export async function hostEvent(club, eventData) {
  return await localGame.entities.ClubEvent.create({
    club_id: club.id,
    ...eventData,
    status: 'agendado',
  });
}

export async function addCourt(club, profile) {
  const cost = 25000 + (club.court_count || 2) * 10000;
  if ((profile.coins || 0) < cost) throw new Error('Moedas insuficientes');
  const updated = await localGame.entities.PlayerProfile.update(profile.id, { coins: profile.coins - cost });
  const updatedClub = await localGame.entities.Club.update(club.id, { court_count: (club.court_count || 2) + 1 });
  return { profile: updated, club: updatedClub };
}

export async function buildFacility(club, facility, profile) {
  if ((profile.coins || 0) < facility.cost) throw new Error('Moedas insuficientes');
  const facilities = [...(club.facilities || []), facility.id];
  const updated = await localGame.entities.PlayerProfile.update(profile.id, { coins: profile.coins - facility.cost });
  const updatedClub = await localGame.entities.Club.update(club.id, { facilities });
  return { profile: updated, club: updatedClub };
}

// ── Monthly Evolution ──────────────────────────────────────────────────────

export async function processClubMonthlyUpdate(club, { commit = true } = {}) {
  const [staff, members] = await Promise.all([
    localGame.entities.ClubStaff.filter({ club_id: club.id }),
    localGame.entities.ClubMember.filter({ club_id: club.id }),
  ]);

  const facilities = club.facilities || [];
  let reputation = club.reputation || 50;

  reputation += 2;
  if (staff.some(s => s.staff_type === 'manager')) reputation += 5;
  if (staff.some(s => s.staff_type === 'receptionist')) reputation += 3;
  if (staff.some(s => s.staff_type === 'coach')) reputation += 2;
  reputation += facilities.length;
  if (staff.length === 0) reputation -= 3;
  reputation = Math.max(0, Math.min(100, reputation));

  const growthRate = reputation > 60 ? 2 : reputation > 40 ? 1 : reputation < 30 ? -1 : 0;
  const botMembers = members.filter(m => m.is_bot);
  let memberCount = members.length;

  if (growthRate > 0) {
    const newMembers = generateBotMembers(club.id, growthRate);
    if (newMembers.length > 0) {
      await localGame.entities.ClubMember.bulkCreate(newMembers);
      memberCount += newMembers.length;
    }
  } else if (growthRate < 0 && botMembers.length > 0) {
    const toRemove = botMembers.slice(0, Math.min(Math.abs(growthRate), botMembers.length));
    for (const m of toRemove) {
      await localGame.entities.ClubMember.delete(m.id);
      memberCount--;
    }
  }

  const clubPoints = memberCount * 5 + reputation * 3 + (club.trophies || 0) * 20;
  const level = clubPoints >= 2000 ? 5 : clubPoints >= 1000 ? 4 : clubPoints >= 500 ? 3 : clubPoints >= 200 ? 2 : 1;
  const patch = { reputation, member_count: memberCount, club_points: clubPoints, level, staff_count: staff.length };

  if (!commit) return { id: club.id, ...patch };
  return await localGame.entities.Club.update(club.id, patch);
}

export async function processAllClubsMonthly() {
  try {
    const clubs = await localGame.entities.Club.list();
    // Cada clube gravava seu próprio Club.update individual todo mês — até
    // 72 escritas completas do save. Calcula os patches em paralelo (o
    // crescimento de sócios de cada clube já é resolvido aqui, via
    // ClubMember.bulkCreate/delete) e grava os clubes em uma única bulkUpdate.
    const patches = await Promise.all(
      (clubs || []).map(c => processClubMonthlyUpdate(c, { commit: false }).catch(() => null)),
    );
    const validPatches = patches.filter(Boolean);
    if (validPatches.length) await localGame.entities.Club.bulkUpdate(validPatches);
  } catch (e) { console.error('processAllClubsMonthly', e); }
}
