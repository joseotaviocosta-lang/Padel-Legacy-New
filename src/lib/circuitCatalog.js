import { createTournamentEditionId } from './tournamentIntegrity.js';

export const WORLD_TOUR_VERSION = '0.5.0-alpha.1';
export const WORLD_PLAYER_CAPACITY = 5000;

export const TOURNAMENT_TIER_CONFIG = Object.freeze({
  Silver: Object.freeze({
    label: 'Legacy Silver', shortLabel: 'Silver', order: 0,
    description: 'Porta de entrada do circuito mundial, com campos amplos e oportunidades constantes de pontuar.',
    entryFee: 20, prize: 650, xp: 220, rankPoints: 55, difficultyModifier: -2,
    mainDrawSize: 16, qualifyingSize: 16, minLevel: 'Iniciante', minRanking: 0,
    prestige: 22, exposure: 18, tradition: 25, durationDays: 4,
  }),
  Gold: Object.freeze({
    label: 'Legacy Gold', shortLabel: 'Gold', order: 1,
    description: 'Evento internacional de desenvolvimento, com boa relação entre risco, pontos e custos.',
    entryFee: 45, prize: 1300, xp: 420, rankPoints: 180, difficultyModifier: -1,
    mainDrawSize: 32, qualifyingSize: 24, minLevel: 'Iniciante', minRanking: 0,
    prestige: 38, exposure: 32, tradition: 40, durationDays: 5,
  }),
  Platinum: Object.freeze({
    label: 'Legacy Platinum', shortLabel: 'Platinum', order: 2,
    description: 'Principal nível do circuito de acesso, capaz de transformar uma temporada com um grande resultado.',
    entryFee: 90, prize: 2800, xp: 760, rankPoints: 350, difficultyModifier: 0,
    mainDrawSize: 32, qualifyingSize: 32, minLevel: 'Amador', minRanking: 450,
    prestige: 56, exposure: 52, tradition: 58, durationDays: 6,
  }),
  Masters: Object.freeze({
    label: 'Legacy Masters', shortLabel: 'Masters', order: 3,
    description: 'Primeiro nível da elite mundial, com chaves profundas e presença frequente de atletas de ponta.',
    entryFee: 180, prize: 6200, xp: 1250, rankPoints: 900, difficultyModifier: 1,
    mainDrawSize: 64, qualifyingSize: 32, minLevel: 'Competitivo', minRanking: 220,
    prestige: 72, exposure: 70, tradition: 68, durationDays: 7,
  }),
  Elite: Object.freeze({
    label: 'Legacy Elite', shortLabel: 'Elite', order: 4,
    description: 'Grandes eventos da temporada, reservados às melhores duplas ou a convidados de alto prestígio.',
    entryFee: 320, prize: 12500, xp: 2200, rankPoints: 1400, difficultyModifier: 2,
    mainDrawSize: 64, qualifyingSize: 24, minLevel: 'Avançado', minRanking: 120,
    prestige: 88, exposure: 88, tradition: 82, durationDays: 7,
  }),
  Crown: Object.freeze({
    label: 'Legacy Crown', shortLabel: 'Crown', order: 5,
    description: 'Os eventos máximos do Padel Legacy World Tour, onde história, pressão e legado se encontram.',
    entryFee: 500, prize: 24000, xp: 3600, rankPoints: 2200, difficultyModifier: 3,
    mainDrawSize: 64, qualifyingSize: 16, minLevel: 'Avançado', minRanking: 64,
    prestige: 100, exposure: 100, tradition: 96, durationDays: 8,
  }),
});

export const WORLD_TOUR_CITIES = Object.freeze([
  { code:'LIS', city:'Lisboa', country:'Portugal', region:'Europa', surface:'indoor' },
  { code:'MAD', city:'Madri', country:'Espanha', region:'Europa', surface:'vidro' },
  { code:'BCN', city:'Barcelona', country:'Espanha', region:'Europa', surface:'vidro' },
  { code:'PAR', city:'Paris', country:'França', region:'Europa', surface:'indoor' },
  { code:'ROM', city:'Roma', country:'Itália', region:'Europa', surface:'cimento' },
  { code:'MIL', city:'Milão', country:'Itália', region:'Europa', surface:'indoor' },
  { code:'AMS', city:'Amsterdã', country:'Países Baixos', region:'Europa', surface:'indoor' },
  { code:'STO', city:'Estocolmo', country:'Suécia', region:'Europa', surface:'indoor' },
  { code:'CPH', city:'Copenhague', country:'Dinamarca', region:'Europa', surface:'indoor' },
  { code:'BER', city:'Berlim', country:'Alemanha', region:'Europa', surface:'indoor' },
  { code:'VIE', city:'Viena', country:'Áustria', region:'Europa', surface:'indoor' },
  { code:'PRA', city:'Praga', country:'Tchéquia', region:'Europa', surface:'indoor' },
  { code:'ATH', city:'Atenas', country:'Grécia', region:'Europa', surface:'outdoor' },
  { code:'IST', city:'Istambul', country:'Turquia', region:'Europa/Ásia', surface:'indoor' },
  { code:'LON', city:'Londres', country:'Reino Unido', region:'Europa', surface:'indoor' },
  { code:'DUB', city:'Dubai', country:'Emirados Árabes Unidos', region:'Oriente Médio', surface:'indoor' },
  { code:'DOH', city:'Doha', country:'Catar', region:'Oriente Médio', surface:'indoor' },
  { code:'RIY', city:'Riad', country:'Arábia Saudita', region:'Oriente Médio', surface:'indoor' },
  { code:'CAI', city:'Cairo', country:'Egito', region:'África', surface:'outdoor' },
  { code:'CAS', city:'Casablanca', country:'Marrocos', region:'África', surface:'outdoor' },
  { code:'CPT', city:'Cidade do Cabo', country:'África do Sul', region:'África', surface:'outdoor' },
  { code:'NAI', city:'Nairóbi', country:'Quênia', region:'África', surface:'outdoor' },
  { code:'TOK', city:'Tóquio', country:'Japão', region:'Ásia', surface:'indoor' },
  { code:'OSA', city:'Osaka', country:'Japão', region:'Ásia', surface:'indoor' },
  { code:'SEO', city:'Seul', country:'Coreia do Sul', region:'Ásia', surface:'indoor' },
  { code:'SHA', city:'Xangai', country:'China', region:'Ásia', surface:'indoor' },
  { code:'SIN', city:'Singapura', country:'Singapura', region:'Ásia', surface:'indoor' },
  { code:'BKK', city:'Bangkok', country:'Tailândia', region:'Ásia', surface:'indoor' },
  { code:'MUM', city:'Mumbai', country:'Índia', region:'Ásia', surface:'indoor' },
  { code:'SYD', city:'Sydney', country:'Austrália', region:'Oceania', surface:'outdoor' },
  { code:'MEL', city:'Melbourne', country:'Austrália', region:'Oceania', surface:'indoor' },
  { code:'AKL', city:'Auckland', country:'Nova Zelândia', region:'Oceania', surface:'outdoor' },
  { code:'MIA', city:'Miami', country:'Estados Unidos', region:'América do Norte', surface:'outdoor' },
  { code:'NYC', city:'Nova York', country:'Estados Unidos', region:'América do Norte', surface:'indoor' },
  { code:'LAX', city:'Los Angeles', country:'Estados Unidos', region:'América do Norte', surface:'outdoor' },
  { code:'TOR', city:'Toronto', country:'Canadá', region:'América do Norte', surface:'indoor' },
  { code:'MEX', city:'Cidade do México', country:'México', region:'América do Norte', surface:'outdoor' },
  { code:'CUN', city:'Cancún', country:'México', region:'América do Norte', surface:'outdoor' },
  { code:'SAO', city:'São Paulo', country:'Brasil', region:'América do Sul', surface:'indoor' },
  { code:'RIO', city:'Rio de Janeiro', country:'Brasil', region:'América do Sul', surface:'outdoor' },
  { code:'BUE', city:'Buenos Aires', country:'Argentina', region:'América do Sul', surface:'vidro' },
  { code:'COR', city:'Córdoba', country:'Argentina', region:'América do Sul', surface:'indoor' },
  { code:'MON', city:'Montevidéu', country:'Uruguai', region:'América do Sul', surface:'outdoor' },
  { code:'SAN', city:'Santiago', country:'Chile', region:'América do Sul', surface:'outdoor' },
  { code:'LIM', city:'Lima', country:'Peru', region:'América do Sul', surface:'outdoor' },
  { code:'BOG', city:'Bogotá', country:'Colômbia', region:'América do Sul', surface:'indoor' },
]);

const WEEK_PROGRAM = Object.freeze([
  [2,['Silver','Gold']], [3,['Silver','Silver']], [4,['Gold','Platinum']],
  [5,['Silver','Masters']], [6,['Silver','Gold','Platinum']], [7,['Silver','Gold']],
  [8,['Silver','Elite']], [9,['Gold','Platinum']], [10,['Silver','Silver']],
  [11,['Gold','Masters']], [12,['Silver','Platinum','Elite']], [13,['Silver','Gold']],
  [14,['Gold','Crown']], [15,['Silver','Platinum']], [16,['Silver','Gold','Masters']],
  [17,['Silver','Gold']], [18,['Platinum','Elite']], [19,['Silver','Silver']],
  [20,['Gold','Masters']], [21,['Silver','Platinum']], [22,['Silver','Gold','Elite']],
  [23,['Silver','Gold']], [24,['Platinum','Crown']], [25,['Silver','Masters']],
  [26,['Silver','Gold','Platinum']], [27,['Silver','Gold']], [28,['Gold','Elite']],
  [29,['Silver','Platinum']], [30,['Silver','Gold','Masters']], [31,['Silver','Gold']],
  [32,['Platinum','Elite']], [33,['Silver','Silver']], [34,['Gold','Masters']],
  [35,['Silver','Platinum','Crown']], [36,['Silver','Gold']], [37,['Gold','Elite']],
  [38,['Silver','Platinum']], [39,['Silver','Gold','Masters']], [40,['Silver','Gold']],
  [41,['Platinum','Elite']], [42,['Silver','Silver']], [43,['Gold','Masters']],
  [44,['Silver','Platinum','Crown']], [45,['Silver','Gold']], [46,['Gold','Elite']],
  [47,['Silver','Platinum']], [48,['Gold','Masters']],
]);

const EVENT_BRANDS = Object.freeze({
  Silver: ['Open','International','Challenge','Cup'],
  Gold: ['Gold Series','World Gold','Championship','Classic'],
  Platinum: ['Platinum Open','World Platinum','Grand Prix','Championship'],
  Masters: ['World Masters','Masters Open','Champions Masters'],
  Elite: ['World Elite','Elite Open','Champions Trophy'],
  Crown: ['Crown Championship','World Crown','Legacy Crown'],
});

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededIndex(seed, length) { return length ? hashString(seed) % length : 0; }
function pad(value) { return String(value).padStart(2, '0'); }

function dateFromIsoWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + ((week - 1) * 7));
  monday.setUTCDate(monday.getUTCDate() + 3); // quinta-feira
  return monday.toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getTournamentTierConfig(tier) {
  return TOURNAMENT_TIER_CONFIG[tier] || TOURNAMENT_TIER_CONFIG.Silver;
}

export function buildSeasonTournaments(year, seasonId = null) {
  const usedCities = new Map();
  const events = [];
  let order = 0;

  WEEK_PROGRAM.forEach(([week, tiers]) => {
    const startDate = dateFromIsoWeek(year, week);
    tiers.forEach((tier, slot) => {
      const config = getTournamentTierConfig(tier);
      const cityIndex = seededIndex(`${year}:${week}:${slot}:${tier}`, WORLD_TOUR_CITIES.length);
      let city = WORLD_TOUR_CITIES[cityIndex];
      for (let offset = 0; offset < WORLD_TOUR_CITIES.length; offset += 1) {
        const candidate = WORLD_TOUR_CITIES[(cityIndex + offset) % WORLD_TOUR_CITIES.length];
        const lastWeek = usedCities.get(candidate.code) || -99;
        if (week - lastWeek >= 5) { city = candidate; break; }
      }
      usedCities.set(city.code, week);
      const brands = EVENT_BRANDS[tier];
      const brand = brands[seededIndex(`${year}:${city.code}:${tier}`, brands.length)];
      const code = `${city.code}-${tier.slice(0,3).toUpperCase()}-W${pad(week)}-${slot + 1}`;
      const conflictGroup = `${year}-W${pad(week)}`;
      const prestigeVariance = (seededIndex(`${code}:prestige`, 9) - 4);
      const traditionVariance = (seededIndex(`${code}:tradition`, 13) - 6);
      const exposureVariance = (seededIndex(`${code}:exposure`, 11) - 5);
      const estimatedField = config.mainDrawSize + config.qualifyingSize;

      events.push({
        id: createTournamentEditionId({ year, circuitCode: code }),
        circuit_code: code,
        name: `${city.city} ${brand}`,
        description: `${config.description} Evento global realizado em ${city.city}, ${city.country}.`,
        tier,
        tier_label: config.label,
        circuit_level: config.order,
        circuit_name: 'Padel Legacy World Tour',
        format: 'eliminacao_simples',
        status: 'inscricoes',
        start_date: startDate,
        end_date: addDays(startDate, config.durationDays - 1),
        registration_deadline: addDays(startDate, -1),
        registration_open_date: addDays(startDate, -30),
        week,
        month: Number(startDate.slice(5, 7)),
        year,
        conflict_group: conflictGroup,
        concurrent_events: tiers.length,
        strategic_choice_required: tiers.length > 1,
        bot_difficulty_modifier: config.difficultyModifier,
        max_participants: config.mainDrawSize,
        main_draw_size: config.mainDrawSize,
        qualifying_size: config.qualifyingSize,
        estimated_field_size: estimatedField,
        expected_world_player_pool: WORLD_PLAYER_CAPACITY,
        participant_generation_mode: 'lazy',
        simulation_batch_size: Math.min(128, estimatedField),
        prize_coins: config.prize,
        xp_reward: config.xp,
        rank_points: config.rankPoints,
        season_id: seasonId,
        surface: city.surface,
        entry_fee: config.entryFee,
        min_ranking: config.minRanking,
        min_level: config.minLevel,
        current_phase: 'inscricoes',
        location: `${city.city}, ${city.country}`,
        city: city.city,
        country: city.country,
        world_region: city.region,
        prestige: Math.max(1, Math.min(100, config.prestige + prestigeVariance)),
        tradition: Math.max(1, Math.min(100, config.tradition + traditionVariance)),
        exposure: Math.max(1, Math.min(100, config.exposure + exposureVariance)),
        participants: [],
        calendar_order: order++,
        is_development_tournament: tier === 'Silver' || tier === 'Gold' || tier === 'Platinum',
        world_tour_event: true,
      });
    });
  });

  return events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.circuit_level - b.circuit_level);
}

export function groupTournamentConflicts(tournaments = []) {
  const groups = new Map();
  tournaments.forEach((tournament) => {
    const key = tournament.conflict_group || tournament.start_date;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tournament);
  });
  return [...groups.entries()]
    .map(([conflictGroup, events]) => ({ conflictGroup, events: events.sort((a,b) => b.circuit_level - a.circuit_level) }))
    .filter((group) => group.events.length > 1);
}

export function getTournamentChoiceProfile(tournament, teamRank = 0) {
  const config = getTournamentTierConfig(tournament?.tier);
  const rankingFit = teamRank > 0 && config.minRanking > 0
    ? Math.max(0, Math.min(100, ((config.minRanking - teamRank + 40) / 80) * 100))
    : tournament?.tier === 'Silver' || tournament?.tier === 'Gold' ? 75 : 45;
  const titleChance = Math.round(Math.max(2, Math.min(78, rankingFit * 0.55 + (100 - config.prestige) * 0.18)));
  const expectedPoints = Math.round(config.rankPoints * (0.12 + titleChance / 170));
  const expectedNet = Math.round(config.prize * (0.08 + titleChance / 140) - config.entryFee);
  return {
    titleChance,
    expectedPoints,
    expectedNet,
    prestige: tournament?.prestige ?? config.prestige,
    exposure: tournament?.exposure ?? config.exposure,
    risk: Math.max(1, Math.min(100, 100 - titleChance + config.order * 5)),
  };
}

export function getSeasonCircuitSummary(tournaments = []) {
  const summary = { total: tournaments.length, Silver:0, Gold:0, Platinum:0, Masters:0, Elite:0, Crown:0 };
  tournaments.forEach((tournament) => {
    if (Object.prototype.hasOwnProperty.call(summary, tournament?.tier)) summary[tournament.tier] += 1;
  });
  summary.development = summary.Silver + summary.Gold + summary.Platinum;
  summary.premier = summary.Masters + summary.Elite + summary.Crown;
  summary.conflictWeeks = groupTournamentConflicts(tournaments).length;
  summary.countries = new Set(tournaments.map((t) => t.country).filter(Boolean)).size;
  summary.regions = new Set(tournaments.map((t) => t.world_region).filter(Boolean)).size;
  return summary;
}
