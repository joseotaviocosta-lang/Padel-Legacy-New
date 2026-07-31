export const TOURNAMENT_TIER_CONFIG = Object.freeze({
  Regional: Object.freeze({
    label: 'Regional',
    order: 0,
    description: 'Circuito de entrada com adversários de clube e pontuação reduzida.',
    entryFee: 0,
    prize: 220,
    xp: 90,
    rankPoints: 35,
    difficultyModifier: -2,
    maxParticipants: 8,
    minLevel: 'Iniciante',
    minRanking: 0,
  }),
  Challenger: Object.freeze({
    label: 'Challenger',
    order: 1,
    description: 'Etapa de desenvolvimento para construir ranking e experiência.',
    entryFee: 25,
    prize: 500,
    xp: 180,
    rankPoints: 110,
    difficultyModifier: -1,
    maxParticipants: 16,
    minLevel: 'Iniciante',
    minRanking: 0,
  }),
  P2: Object.freeze({
    label: 'P2',
    order: 2,
    description: 'Primeiro nível do circuito profissional internacional.',
    entryFee: 100,
    prize: 1000,
    xp: 500,
    rankPoints: 200,
    difficultyModifier: 0,
    maxParticipants: 32,
    minLevel: 'Amador',
    minRanking: 0,
  }),
  P1: Object.freeze({
    label: 'P1',
    order: 3,
    description: 'Etapa internacional de alto nível.',
    entryFee: 250,
    prize: 2200,
    xp: 1000,
    rankPoints: 400,
    difficultyModifier: 1,
    maxParticipants: 32,
    minLevel: 'Competitivo',
    minRanking: 30,
  }),
  Major: Object.freeze({
    label: 'Major',
    order: 4,
    description: 'Os torneios mais prestigiados da temporada.',
    entryFee: 500,
    prize: 4200,
    xp: 1750,
    rankPoints: 700,
    difficultyModifier: 2,
    maxParticipants: 32,
    minLevel: 'Avançado',
    minRanking: 16,
  }),
});

export const WORLD_CIRCUIT_TEMPLATE = Object.freeze([
  { code: 'POA-REG', name: 'Circuito Gaúcho de Padel', tier: 'Regional', month: 1, day: 8, location: 'Porto Alegre, Brasil', surface: 'indoor' },
  { code: 'SP-CH', name: 'São Paulo Challenger', tier: 'Challenger', month: 1, day: 22, location: 'São Paulo, Brasil', surface: 'vidro' },
  { code: 'CUR-REG', name: 'Open Regional de Curitiba', tier: 'Regional', month: 2, day: 5, location: 'Curitiba, Brasil', surface: 'indoor' },
  { code: 'SP-P2', name: 'Aberto de São Paulo', tier: 'P2', month: 2, day: 19, location: 'São Paulo, Brasil', surface: 'vidro' },
  { code: 'MON-REG', name: 'Copa Regional de Montevidéu', tier: 'Regional', month: 3, day: 5, location: 'Montevidéu, Uruguai', surface: 'outdoor' },
  { code: 'MAD-P1', name: 'Madrid Open', tier: 'P1', month: 3, day: 18, location: 'Madrid, Espanha', surface: 'vidro' },
  { code: 'LIS-CH', name: 'Lisboa Challenger', tier: 'Challenger', month: 3, day: 29, location: 'Lisboa, Portugal', surface: 'vidro' },
  { code: 'ROS-REG', name: 'Troféu Regional de Rosário', tier: 'Regional', month: 4, day: 8, location: 'Rosário, Argentina', surface: 'cimento' },
  { code: 'BA-MAJ', name: 'Buenos Aires Major', tier: 'Major', month: 4, day: 26, location: 'Buenos Aires, Argentina', surface: 'vidro' },
  { code: 'BRA-REG', name: 'Copa Brasília de Padel', tier: 'Regional', month: 5, day: 7, location: 'Brasília, Brasil', surface: 'outdoor' },
  { code: 'BCN-P2', name: 'Barcelona Padel Cup', tier: 'P2', month: 5, day: 21, location: 'Barcelona, Espanha', surface: 'cimento' },
  { code: 'POR-CH', name: 'Porto Challenger', tier: 'Challenger', month: 6, day: 6, location: 'Porto, Portugal', surface: 'indoor' },
  { code: 'STO-P2', name: 'Stockholm Open', tier: 'P2', month: 6, day: 20, location: 'Estocolmo, Suécia', surface: 'indoor' },
  { code: 'FLO-REG', name: 'Open Regional de Florianópolis', tier: 'Regional', month: 7, day: 5, location: 'Florianópolis, Brasil', surface: 'outdoor' },
  { code: 'PAR-P1', name: 'Paris Padel Open', tier: 'P1', month: 7, day: 19, location: 'Paris, França', surface: 'vidro' },
  { code: 'ROM-CH', name: 'Roma Challenger', tier: 'Challenger', month: 8, day: 6, location: 'Roma, Itália', surface: 'cimento' },
  { code: 'PAR-MAJ', name: 'Paris Padel Major', tier: 'Major', month: 8, day: 25, location: 'Paris, França', surface: 'vidro' },
  { code: 'RIO-REG', name: 'Circuito Carioca de Padel', tier: 'Regional', month: 9, day: 7, location: 'Rio de Janeiro, Brasil', surface: 'outdoor' },
  { code: 'RIO-P2', name: 'Rio Padel Open', tier: 'P2', month: 9, day: 21, location: 'Rio de Janeiro, Brasil', surface: 'outdoor' },
  { code: 'AMS-CH', name: 'Amsterdam Challenger', tier: 'Challenger', month: 10, day: 6, location: 'Amsterdã, Holanda', surface: 'indoor' },
  { code: 'ROM-P1', name: 'Rome Classic', tier: 'P1', month: 10, day: 20, location: 'Roma, Itália', surface: 'cimento' },
  { code: 'REC-REG', name: 'Copa Regional do Recife', tier: 'Regional', month: 11, day: 5, location: 'Recife, Brasil', surface: 'outdoor' },
  { code: 'MEX-CH', name: 'México Challenger', tier: 'Challenger', month: 11, day: 17, location: 'Cidade do México, México', surface: 'vidro' },
  { code: 'DUB-MAJ', name: 'Dubai World Padel Major', tier: 'Major', month: 12, day: 5, location: 'Dubai, EAU', surface: 'vidro' },
  { code: 'CPH-P2', name: 'Copenhagen Open', tier: 'P2', month: 12, day: 18, location: 'Copenhague, Dinamarca', surface: 'indoor' },
]);

const pad = (value) => String(value).padStart(2, '0');

export function getTournamentTierConfig(tier) {
  return TOURNAMENT_TIER_CONFIG[tier] || TOURNAMENT_TIER_CONFIG.P2;
}

export function buildSeasonTournaments(year, seasonId = null) {
  return WORLD_CIRCUIT_TEMPLATE.map((stage, index) => {
    const config = getTournamentTierConfig(stage.tier);
    const startDate = `${year}-${pad(stage.month)}-${pad(stage.day)}`;
    return {
      id: `tournament-${year}-${stage.code.toLowerCase()}`,
      circuit_code: stage.code,
      name: stage.name,
      description: `${config.description} Etapa disputada em ${stage.location}.`,
      tier: stage.tier,
      circuit_level: config.order,
      format: 'eliminacao_simples',
      status: 'inscricoes',
      start_date: startDate,
      month: stage.month,
      year,
      bot_difficulty_modifier: config.difficultyModifier,
      max_participants: config.maxParticipants,
      prize_coins: config.prize,
      xp_reward: config.xp,
      rank_points: config.rankPoints,
      season_id: seasonId,
      surface: stage.surface,
      entry_fee: config.entryFee,
      min_ranking: config.minRanking,
      min_level: config.minLevel,
      current_phase: 'inscricoes',
      location: stage.location,
      participants: [],
      calendar_order: index,
      is_development_tournament: stage.tier === 'Regional' || stage.tier === 'Challenger',
    };
  });
}

export function getSeasonCircuitSummary(tournaments = []) {
  const summary = { total: tournaments.length, Regional: 0, Challenger: 0, P2: 0, P1: 0, Major: 0 };
  tournaments.forEach((tournament) => {
    if (Object.prototype.hasOwnProperty.call(summary, tournament?.tier)) {
      summary[tournament.tier] += 1;
    }
  });
  summary.development = summary.Regional + summary.Challenger;
  summary.professional = summary.P2 + summary.P1 + summary.Major;
  return summary;
}
