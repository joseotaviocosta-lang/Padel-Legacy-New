import { localGame } from '@/api/localGameClient.js';

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded01(key) {
  return (hashString(key) % 100000) / 100000;
}

export function getCareerEconomyStage(profile = {}) {
  const level = Math.max(1, Number(profile.career_level) || 1);
  const rank = Math.max(1, Number(profile.ranking_position || profile.world_rank || 2000) || 2000);
  const reputation = Math.max(0, Number(profile.reputation || profile.fan_appeal || 0) || 0);
  if (level >= 35 && rank <= 40 && reputation >= 65) return 'elite';
  if (level >= 22 && rank <= 150 && reputation >= 35) return 'international';
  if (level >= 12 && rank <= 500 && reputation >= 15) return 'professional';
  if (level >= 5) return 'regional';
  return 'beginner';
}

const STAGE_MARKET_LIMITS = {
  beginner: { total: 6, tiers: ['Bronze'], maxTierRank: 1 },
  regional: { total: 8, tiers: ['Bronze', 'Prata'], maxTierRank: 2 },
  professional: { total: 10, tiers: ['Bronze', 'Prata', 'Ouro'], maxTierRank: 3 },
  international: { total: 12, tiers: ['Bronze', 'Prata', 'Ouro'], maxTierRank: 3 },
  elite: { total: 14, tiers: ['Bronze', 'Prata', 'Ouro'], maxTierRank: 3 },
};

const TIER_RANK = { Bronze: 1, Prata: 2, Ouro: 3 };

export function getMonthlySponsorMarket(profile, catalog = []) {
  const month = String(profile?.career_date || '2026-01-01').slice(0, 7);
  const stage = getCareerEconomyStage(profile);
  const rules = STAGE_MARKET_LIMITS[stage];
  const rows = (catalog || [])
    .filter(s => s?.id && (TIER_RANK[s.tier] || 1) <= rules.maxTierRank)
    .map((sponsor) => {
      const roll = seeded01(`${profile?.id || 'career'}:${month}:${sponsor.id}`);
      const stageBias = stage === 'beginner' && sponsor.tier === 'Bronze' ? 0.35 : 0;
      const availabilityScore = roll + stageBias - Math.max(0, (TIER_RANK[sponsor.tier] || 1) - 1) * 0.08;
      const marketDemand = Math.round(35 + seeded01(`${month}:${sponsor.id}:demand`) * 55);
      const offerMultiplier = Number((0.9 + seeded01(`${profile?.id}:${month}:${sponsor.id}:offer`) * 0.22).toFixed(3));
      return {
        ...sponsor,
        base_monthly_value: Math.round((Number(sponsor.base_monthly_value) || 0) * offerMultiplier),
        base_sign_bonus: Math.round((Number(sponsor.base_sign_bonus) || 0) * offerMultiplier),
        market_month: month,
        market_demand: marketDemand,
        availability_score: availabilityScore,
        offer_multiplier: offerMultiplier,
      };
    })
    .sort((a, b) => b.availability_score - a.availability_score || a.name.localeCompare(b.name, 'pt-BR'));

  const selected = rows.slice(0, rules.total);
  const beginnerMinimum = catalog.filter(s => s?.tier === 'Bronze').slice(0, 4);
  for (const sponsor of beginnerMinimum) {
    if (!selected.some(item => item.id === sponsor.id) && selected.length < rules.total) selected.push({ ...sponsor, market_month: month, market_demand: 40, availability_score: 1, offer_multiplier: 0.96 });
  }
  return { month, stage, sponsors: selected.slice(0, rules.total) };
}

const CLUB_BLUEPRINTS = [
  ['Madrid Padel Center', 'Madrid', 'Espanha'], ['Barcelona Smash Academy', 'Barcelona', 'Espanha'],
  ['Valencia Padel Lab', 'Valência', 'Espanha'], ['Málaga Costa Padel', 'Málaga', 'Espanha'],
  ['Lisboa Racket Club', 'Lisboa', 'Portugal'], ['Porto Padel House', 'Porto', 'Portugal'],
  ['Roma Padel Arena', 'Roma', 'Itália'], ['Milano Padel Performance', 'Milão', 'Itália'],
  ['Paris Padel Institut', 'Paris', 'França'], ['Lyon Padel Club', 'Lyon', 'França'],
  ['London Padel Academy', 'Londres', 'Inglaterra'], ['Manchester Padel Hub', 'Manchester', 'Inglaterra'],
  ['Buenos Aires Padel Pro', 'Buenos Aires', 'Argentina'], ['Córdoba Padel Base', 'Córdoba', 'Argentina'],
  ['São Paulo Padel Center', 'São Paulo', 'Brasil'], ['Rio Padel Performance', 'Rio de Janeiro', 'Brasil'],
  ['Porto Alegre Padel Club', 'Porto Alegre', 'Brasil'], ['Curitiba Padel Academy', 'Curitiba', 'Brasil'],
  ['Monterrey Padel House', 'Monterrey', 'México'], ['Miami Padel Institute', 'Miami', 'EUA'],
  ['Dubai Padel Elite', 'Dubai', 'Emirados Árabes'], ['Doha Padel Center', 'Doha', 'Catar'],
  ['Stockholm Padel Lab', 'Estocolmo', 'Suécia'], ['Amsterdam Padel Works', 'Amsterdã', 'Países Baixos'],
];

export function buildWorldClubCatalog(target = 72) {
  const suffixes = ['Academy', 'Performance', 'Arena'];
  const rows = [];
  for (let i = 0; i < target; i += 1) {
    const base = CLUB_BLUEPRINTS[i % CLUB_BLUEPRINTS.length];
    const cycle = Math.floor(i / CLUB_BLUEPRINTS.length);
    const name = cycle === 0 ? base[0] : `${base[1]} ${suffixes[(cycle - 1) % suffixes.length]} ${cycle + 1}`;
    const quality = 38 + (hashString(`${name}:quality`) % 58);
    const level = quality >= 86 ? 5 : quality >= 74 ? 4 : quality >= 61 ? 3 : quality >= 48 ? 2 : 1;
    rows.push({
      world_club_key: `world-club-${hashString(name).toString(36)}`,
      name,
      city: base[1],
      country: base[2],
      description: `Centro esportivo de nível ${level}, com foco em desenvolvimento, competição e apoio à carreira.`,
      reputation: quality,
      level,
      monthly_fee: 80 + level * level * 65,
      membership_fee: 120 + level * level * 110,
      court_count: 2 + level,
      facilities: level >= 4 ? ['gym', 'pool', 'pro_shop', 'spa'] : level >= 3 ? ['gym', 'pro_shop'] : level >= 2 ? ['gym'] : [],
      member_count: 18 + level * 17 + (hashString(`${name}:members`) % 35),
      club_points: quality * 8 + level * 120,
      trophies: Math.max(0, level - 2) * (1 + hashString(`${name}:trophies`) % 4),
      staff_count: 1 + level,
      is_world_club: true,
      owner_profile_id: '',
      owner_name: 'Diretoria do clube',
      founded_date: `${1990 + (hashString(name) % 31)}-01-01`,
    });
  }
  return rows;
}

export async function ensureWorldClubCatalog(target = 72) {
  const existing = await localGame.entities.Club.list('-club_points', Math.max(target * 2, 200));
  const keys = new Set((existing || []).map(club => club.world_club_key || `${club.name}|${club.city}`));
  const missing = buildWorldClubCatalog(target).filter(club => !keys.has(club.world_club_key) && !keys.has(`${club.name}|${club.city}`));
  for (const club of missing) await localGame.entities.Club.create(club);
  return { existing: (existing || []).length, created: missing.length, target };
}

export function getEquipmentMarketState(item, profile) {
  const month = String(profile?.career_date || '2026-01-01').slice(0, 7);
  const rarity = String(item?.rarity || 'comum').toLowerCase();
  const alwaysAvailable = ['comum', 'incomum'].includes(rarity);
  const rarityThreshold = { raro: 0.88, epico: 0.72, lendario: 0.5, mitico: 0.32, exclusivo: 0.2 }[rarity] ?? 1;
  const roll = seeded01(`${month}:${item?.id || item?.name}:stock`);
  const released = Number(item?.release_year || 2020) <= Number(month.slice(0, 4));
  const sponsored = (profile?.active_sponsor_names || []).includes(item?.manufacturer);
  const available = released && (alwaysAvailable || sponsored || roll <= rarityThreshold);
  return {
    month,
    available,
    status: !released ? 'future_release' : available ? 'available' : 'out_of_rotation',
    reason: !released ? `Lançamento previsto para ${item.release_year}` : available ? '' : 'Fora da rotação mensal da loja',
  };
}
