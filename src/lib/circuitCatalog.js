import { createTournamentEditionId } from './tournamentIntegrity.js';
import { fnv1aHash } from './hashUtils.js';

export const WORLD_TOUR_VERSION = '0.5.0-alpha.1';
export const WORLD_PLAYER_CAPACITY = 5000;

// Fase 3, item 3A.1 — "cada rodada anterior vale ~60% da seguinte, padrão
// do circuito real". Worked example dado pelo usuário para Crown:
// 2000/1200/720/360/180/90 — os passos reais são [0.6, 0.6, 0.5, 0.5, 0.5]
// (não um 60% uniforme; a decolagem do topo é mais suave, o fundo decai
// mais rápido — confirmado batendo os números exatos). Esta MESMA
// sequência de razões é aplicada a TODOS os tiers, truncada ao número de
// rodadas que o tamanho da chave produz — gera a tabela em config, a
// partir de UM único parâmetro por tier (pontos do campeão), em vez de
// cada tier carregar sua própria lista de números mágicos desalinhados.
const ROUND_DECAY_RATIOS = Object.freeze([1, 0.6, 0.36, 0.18, 0.09, 0.045]);

// Rótulos de rodada por número de rodadas da chave principal (da entrada
// ao campeão) — 4 chaves possíveis nesta escada: 8 (3 rodadas), 16 (4),
// 24 (5, primeira rodada comprimida com byes) e 32 (5). "entrada" nomeia a
// primeira rodada de forma genérica porque o tamanho real dela varia (8
// perdedores numa chave de 24 com bye, 16 numa chave de 32) — a simulação
// de fundo (WorldTourLifecycle.js) não modela byes individualmente, só
// classifica por posição no ranking do dia, então o rótulo genérico evita
// alegar uma rodada que o motor não desenha de fato.
const ROUND_LABELS_BY_COUNT = Object.freeze({
  3: Object.freeze(['quarterfinal', 'semifinal', 'final', 'champion']),
  4: Object.freeze(['r16', 'quarterfinal', 'semifinal', 'final', 'champion']),
  5: Object.freeze(['entry', 'r16', 'quarterfinal', 'semifinal', 'final', 'champion']),
});

// Rótulos de exibição das rodadas (campanha do jogador, MainDrawManager/
// tournamentSchedule.js) — quantas rodadas o CAMPEÃO precisa vencer,
// não inclui o próprio "champion" (esse é o resultado, não uma rodada).
// Diferente de ROUND_LABELS_BY_COUNT (pontuação, genérico por CONTAGEM de
// rodadas — 24 e 32 dividem o mesmo formato), aqui a 1ª rodada é
// rotulada pelo TAMANHO real da chave (R24/R32) — é uma tela pro
// jogador, então vale nomear com precisão o que ele está vendo, mesmo
// quando a simulação de fundo não desenha byes rodada a rodada.
const DISPLAY_ROUNDS_BY_DRAW_SIZE = Object.freeze({
  8: Object.freeze([{ label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  16: Object.freeze([{ label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  24: Object.freeze([{ label: 'Primeira Rodada', short: 'R24' }, { label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
  32: Object.freeze([{ label: 'Rodada de 32', short: 'R32' }, { label: 'Oitavas de Final', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' }]),
});

// roundCount = quantas rodadas o campeão vence (3 → chave de 8; 4 → chave
// de 16; 5 → chave de 24 OU 32, mesmo número de rodadas em ambas — a de
// 24 só comprime a 1ª rodada com byes, não adiciona uma rodada a mais).
function roundCountForDrawSize(drawSize) {
  if (drawSize <= 8) return 3;
  if (drawSize <= 16) return 4;
  return 5;
}

// Fase 3, item 3D (proposta, pendente de confirmação — ver relatório):
// moedas calibradas contra a economia existente (salário de parceiro
// ~80-200/mês via defaultSalary em partnerLifecycle.js, saldo inicial de
// 100 moedas em padel.js) — multiplicador único (15×) sobre os pontos de
// ranking do campeão de cada tier, escolhido para que Bronze (150 moedas)
// cubra ~1 mês de salário de um parceiro iniciante e Crown (30.000)
// equivalha a 300× o saldo inicial do jogador. Reaproveita a MESMA
// sequência de decaimento por rodada que os pontos de ranking usam —
// nenhuma tabela paralela de números escolhidos a dedo.
const PRIZE_COINS_PER_RANK_POINT = 15;
// XP não foi pedido para calibração contra a economia (só moedas) —
// mantém a MESMA forma de crescimento da tabela antiga (Silver→Crown
// ~16,4×), estendida para os 9 tiers, escalada pelos pontos de ranking de
// cada tier (não pelas moedas, que crescem numa razão diferente).
const XP_PER_RANK_POINT = 1.4;

function buildRoundTable(championValue, roundCount) {
  const ratios = ROUND_DECAY_RATIOS.slice(0, roundCount + 1);
  return Object.freeze(ratios.map((ratio) => Math.round(championValue * ratio)).reverse());
}

function buildTier(definition) {
  const roundCount = roundCountForDrawSize(definition.mainDrawSize);
  // `championPrize`/`championXp` explícitos (usado só pela Exibição,
  // abaixo — precisa de moeda real com ZERO ponto de ranking, e prize/xp
  // não podem ser derivados de rankPoints=0 nesse caso) vencem o cálculo
  // padrão de qualquer tier real da escada de 9.
  const prize = Math.round(Number.isFinite(definition.championPrize) ? definition.championPrize : definition.rankPoints * PRIZE_COINS_PER_RANK_POINT);
  const xp = Math.round(Number.isFinite(definition.championXp) ? definition.championXp : definition.rankPoints * XP_PER_RANK_POINT);
  // Salvaguarda: se um tamanho de chave futuro não tiver rótulos de
  // exibição dedicados em DISPLAY_ROUNDS_BY_DRAW_SIZE, avisa alto (em vez
  // de deixar `displayRounds` undefined, quebrando MainDrawManager/
  // tournamentSchedule.js silenciosamente) e cai pros rótulos genéricos
  // por CONTAGEM de rodada.
  let displayRounds = DISPLAY_ROUNDS_BY_DRAW_SIZE[definition.mainDrawSize];
  if (!displayRounds) {
    console.warn(`[circuitCatalog] tier "${definition.shortLabel}": sem rótulos de rodada dedicados para mainDrawSize=${definition.mainDrawSize} — usando rótulos genéricos.`);
    displayRounds = ROUND_LABELS_BY_COUNT[roundCount].slice(0, -1).map((key) => ({ label: key, short: key.toUpperCase().slice(0, 3) }));
  }
  return Object.freeze({
    ...definition,
    prize,
    xp,
    qualifyingSize: definition.qualifyingSize || 0,
    roundCount,
    // Do "entrada" (1ª rodada perdida) ao campeão — mesmo comprimento de
    // roundLabels, índice a índice.
    roundPoints: buildRoundTable(definition.rankPoints, roundCount),
    roundCoins: buildRoundTable(prize, roundCount),
    roundXp: buildRoundTable(xp, roundCount),
    roundLabels: ROUND_LABELS_BY_COUNT[roundCount],
    displayRounds,
  });
}

// Fase 3, item 3A — escada de 9 tiers (era 6). `order` segue a ordem da
// tabela pedida (não é só "força crescente": Circuit Finals, um
// convidativo de fim de mini-temporada só para o Top 8, vale menos pontos
// que Platinum de propósito — mesmo padrão de "Finals" do circuito real,
// mérito de acesso ≠ valor de pontos). `minRanking` é a ÚNICA declaração
// de corte de acesso por tier — EntryManager.js já lê `config.minRanking`
// (nenhuma regra paralela hardcoded por nome de tier a corrigir aqui;
// achado #16 da auditoria original já garantia isso desde a Fase 1A).
export const TOURNAMENT_TIER_CONFIG = Object.freeze({
  Bronze: buildTier({
    label: 'Legacy Bronze', shortLabel: 'Bronze', order: 0,
    description: 'Primeiro degrau do circuito mundial, aberto a qualquer atleta — o lugar onde toda carreira profissional começa.',
    entryFee: 10, rankPoints: 10, difficultyModifier: -3,
    mainDrawSize: 16, minLevel: 'Iniciante', minRanking: 0,
    prestige: 14, exposure: 10, tradition: 15, durationDays: 4,
  }),
  Silver: buildTier({
    label: 'Legacy Silver', shortLabel: 'Silver', order: 1,
    description: 'Porta de entrada consolidada do circuito mundial, com campos amplos e oportunidades constantes de pontuar.',
    entryFee: 20, rankPoints: 25, difficultyModifier: -2,
    mainDrawSize: 16, minLevel: 'Iniciante', minRanking: 0,
    prestige: 22, exposure: 18, tradition: 25, durationDays: 4,
  }),
  Gold: buildTier({
    label: 'Legacy Gold', shortLabel: 'Gold', order: 2,
    description: 'Evento internacional de desenvolvimento, com boa relação entre risco, pontos e custos.',
    entryFee: 45, rankPoints: 100, difficultyModifier: -1,
    mainDrawSize: 24, minLevel: 'Iniciante', minRanking: 800,
    prestige: 38, exposure: 32, tradition: 40, durationDays: 5,
  }),
  Platinum: buildTier({
    label: 'Legacy Platinum', shortLabel: 'Platinum', order: 3,
    description: 'Principal nível do circuito de acesso, capaz de transformar uma temporada com um grande resultado.',
    entryFee: 90, rankPoints: 200, difficultyModifier: 0,
    mainDrawSize: 32, minLevel: 'Amador', minRanking: 500,
    prestige: 56, exposure: 52, tradition: 58, durationDays: 6,
  }),
  'Circuit Finals': buildTier({
    label: 'Legacy Circuit Finals', shortLabel: 'Circuit Finals', order: 4,
    description: 'Fechamento do circuito base da temporada — só os 8 melhores do ranking entram, sem inscrição por convite ou wildcard.',
    entryFee: 0, rankPoints: 150, difficultyModifier: 2,
    mainDrawSize: 8, minLevel: 'Avançado', minRanking: 8,
    prestige: 68, exposure: 58, tradition: 50, durationDays: 3,
  }),
  Masters: buildTier({
    label: 'Legacy Masters', shortLabel: 'Masters', order: 5,
    description: 'Primeiro nível da elite mundial, com chaves competitivas e presença frequente de atletas de ponta.',
    entryFee: 180, rankPoints: 500, difficultyModifier: 1,
    mainDrawSize: 24, minLevel: 'Competitivo', minRanking: 300,
    prestige: 72, exposure: 70, tradition: 68, durationDays: 5,
  }),
  Elite: buildTier({
    label: 'Legacy Elite', shortLabel: 'Elite', order: 6,
    description: 'Grandes eventos da temporada, reservados às melhores duplas ou a convidados de alto prestígio.',
    entryFee: 320, rankPoints: 1000, difficultyModifier: 2,
    mainDrawSize: 32, minLevel: 'Avançado', minRanking: 150,
    prestige: 88, exposure: 88, tradition: 82, durationDays: 6,
  }),
  Crown: buildTier({
    label: 'Legacy Crown', shortLabel: 'Crown', order: 7,
    description: 'Os eventos máximos do Padel Legacy World Tour, onde história, pressão e legado se encontram.',
    entryFee: 500, rankPoints: 2000, difficultyModifier: 3,
    mainDrawSize: 32, qualifyingSize: 16, minLevel: 'Avançado', minRanking: 80,
    prestige: 100, exposure: 100, tradition: 96, durationDays: 8,
  }),
  'Legacy Finals': buildTier({
    label: 'Legacy Finals', shortLabel: 'Legacy Finals', order: 8,
    description: 'O evento máximo de duplas do ano — só as 16 melhores parcerias do ranking de duplas disputam, por convite direto.',
    entryFee: 0, rankPoints: 1500, difficultyModifier: 3,
    mainDrawSize: 8, minLevel: 'Avançado', minRanking: 16,
    prestige: 98, exposure: 95, tradition: 40, durationDays: 3,
  }),
  // Fase 3, item 3C.2 — Pré-Temporada/Exibição: NÃO faz parte da escada
  // competitiva (fora de TIER_EVENTS_PER_YEAR/WEEK_PROGRAM de propósito —
  // um evento ÚNICO por carreira, criado por buildPreSeasonExhibition,
  // nunca repetido todo ano). Mora aqui mesmo assim (não num objeto
  // separado) porque TUDO que lê "config de um tier por nome"
  // (getTournamentTierConfig — EntryManager indiretamente via
  // buildAthleteEntryContext, career.js:getTournamentRewards/
  // getTournamentDifficulty, tournamentSchedule.js) precisa resolver
  // "Exibição" corretamente, não cair no fallback de Silver (que tem
  // rankPoints > 0 — premiaria pontos de ranking por um evento que não
  // pode dar nenhum). `rankPoints:0` propaga sozinho pra
  // roundPoints=[0,0,0,0] via buildRoundTable; `championPrize`/
  // `championXp` (não derivados de rankPoints, que aqui é zero de
  // propósito) dão a "premiação pequena mas real" pedida.
  Exibição: buildTier({
    label: 'Pré-Temporada', shortLabel: 'Exibição', order: -1,
    description: 'Torneio de pré-temporada, sem pontos de ranking — o primeiro contato do circuito com a nova safra de duplas.',
    entryFee: 0, rankPoints: 0, championPrize: 60, championXp: 80, difficultyModifier: -3,
    mainDrawSize: 8, minLevel: 'Iniciante', minRanking: 0,
    prestige: 8, exposure: 6, tradition: 2, durationDays: 3,
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

// Fase 3, item 3A/3C — 80 eventos/ano (era 24), distribuídos por config em
// vez de uma lista de 80 tuplas escritas à mão. `Bronze`+`Silver` (os
// únicos tiers com `minRanking:0`, item 3C.1) somam 40 eventos/ano — a
// densidade que sustenta a meta de intervalo do jogador em #1000 (medida
// em scripts/diag-tier-ladder-calendar-fase3.mjs, relatório da Fase 3).
// Circuit Finals/Legacy Finals são de propósito eventos ÚNICOS de fim de
// temporada (não entram na distribuição regular) — só fazem sentido depois
// que a maior parte do "circuito base" do ano já aconteceu, pra que
// "top 8"/"top 16" already reflita uma temporada real, não um sorteio de
// janeiro.
const TIER_EVENTS_PER_YEAR = Object.freeze({
  Bronze: 24, Silver: 16, Gold: 8, Platinum: 6, Masters: 10, Elite: 10, Crown: 4,
});
const REGULAR_SEASON_LAST_WEEK = 47;
const SEASON_FINALE_WEEKS = Object.freeze({ 'Circuit Finals': 49, 'Legacy Finals': 52 });
// Deslocamento (em semanas) de cada tier dentro da distribuição regular —
// existe só pra os tiers não caírem todos na mesma semana quando as
// cadências batem (ex.: Bronze a cada ~1,9 semana e Silver a cada ~2,9
// nunca coincidem por causa do deslocamento relativo de 1 semana).
const TIER_WEEK_OFFSET = Object.freeze({ Bronze: 0, Silver: 1, Gold: -1, Platinum: 2, Masters: -2, Elite: 1, Crown: 0 });

function distributeTierWeeks(count, offset) {
  const weeks = [];
  for (let index = 0; index < count; index += 1) {
    const target = Math.round(((index + 0.5) * REGULAR_SEASON_LAST_WEEK) / count) + offset;
    weeks.push(Math.max(1, Math.min(REGULAR_SEASON_LAST_WEEK, target)));
  }
  return weeks;
}

function buildWeekProgram() {
  const byWeek = new Map();
  const addToWeek = (week, tier) => {
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(tier);
  };
  Object.entries(TIER_EVENTS_PER_YEAR).forEach(([tier, count]) => {
    distributeTierWeeks(count, TIER_WEEK_OFFSET[tier] || 0).forEach((week) => addToWeek(week, tier));
  });
  Object.entries(SEASON_FINALE_WEEKS).forEach(([tier, week]) => addToWeek(week, tier));
  return Object.freeze(
    [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, tiers]) => Object.freeze([week, Object.freeze(tiers)])),
  );
}

const WEEK_PROGRAM = buildWeekProgram();

const EVENT_BRANDS = Object.freeze({
  Bronze: ['Rising Cup','Open','Challenge','Tour Stop'],
  Silver: ['Open','International','Challenge','Cup'],
  Gold: ['Gold Series','World Gold','Championship','Classic'],
  Platinum: ['Platinum Open','World Platinum','Grand Prix','Championship'],
  'Circuit Finals': ['Circuit Finals','Season Finals'],
  Masters: ['World Masters','Masters Open','Champions Masters'],
  Elite: ['World Elite','Elite Open','Champions Trophy'],
  Crown: ['Crown Championship','World Crown','Legacy Crown'],
  'Legacy Finals': ['Legacy Finals','World Tour Finals'],
});

function hashString(value) {
  return fnv1aHash(String(value || ''));
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
        // Achado #8 da auditoria original: campo nunca lido em produção
        // (código morto). Generalizado por `config.order` (não mais uma
        // lista fixa de nomes de tier) só pra continuar coerente com a
        // nova escada — não vale esforço de remover um campo morto nesta
        // fase.
        is_development_tournament: config.order <= TOURNAMENT_TIER_CONFIG.Platinum.order,
        world_tour_event: true,
      });
    });
  });

  return events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.circuit_level - b.circuit_level);
}

// Fase 3, item 3C.2 — a carreira começava em 01/01 e o primeiro torneio só
// abria (e só ocorria ~35 dias depois), travando "Inscreva-se em um
// torneio" no tutorial por semanas. Evento de Exibição/Pré-Temporada,
// único por carreira — chamado à parte de buildSeasonTournaments (nunca
// entra em WEEK_PROGRAM, então nunca se repete ano a ano). Config
// completa (pontos zerados, prêmio pequeno mas real, rótulos de rodada)
// vem de TOURNAMENT_TIER_CONFIG.Exibição, acima — mesma fonte que
// qualquer tier real, então nenhum consumidor (EntryManager,
// getTournamentRewards, getTournamentDifficulty, MainDrawManager) precisa
// de um caminho especial pra reconhecer este torneio.
export function buildPreSeasonExhibition(year, seasonId = null) {
  const config = getTournamentTierConfig('Exibição');
  const startDate = `${year}-01-11`;
  const city = WORLD_TOUR_CITIES[seededIndex(`${year}:exhibition`, WORLD_TOUR_CITIES.length)];
  const code = `${city.code}-EXH-${year}`;
  return {
    id: createTournamentEditionId({ year, circuitCode: code }),
    circuit_code: code,
    name: `${city.city} Pré-Temporada`,
    description: config.description,
    tier: 'Exibição',
    tier_label: config.label,
    circuit_level: config.order,
    circuit_name: 'Padel Legacy World Tour',
    format: 'eliminacao_simples',
    status: 'inscricoes',
    start_date: startDate,
    end_date: addDays(startDate, config.durationDays - 1),
    registration_deadline: addDays(startDate, -1),
    // Item 3C.2: "inscrição livre desde o dia 1" — explícito, não incidental
    // (mesmo que o evento em si só ocorra no dia 11).
    registration_open_date: `${year}-01-01`,
    week: 2,
    month: 1,
    year,
    conflict_group: `${year}-EXH`,
    concurrent_events: 1,
    strategic_choice_required: false,
    bot_difficulty_modifier: config.difficultyModifier,
    max_participants: config.mainDrawSize,
    main_draw_size: config.mainDrawSize,
    qualifying_size: config.qualifyingSize,
    estimated_field_size: config.mainDrawSize,
    expected_world_player_pool: WORLD_PLAYER_CAPACITY,
    participant_generation_mode: 'lazy',
    simulation_batch_size: config.mainDrawSize,
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
    prestige: config.prestige,
    tradition: config.tradition,
    exposure: config.exposure,
    participants: [],
    calendar_order: -1,
    is_development_tournament: true,
    // `world_tour_event:false` de propósito: (a) a simulação de fundo
    // (WorldTourLifecycle.resolveCompletedWorldTourEvents) só resolve
    // torneios com essa flag — bots não disputam a exibição, é só pro
    // jogador; (b) a poda de "torneios obsoletos" em
    // ensureFutureTournamentsInternal (career.js) só remove torneios COM
    // essa flag — sem ela, a exibição seria varrida como "não faz mais
    // parte da temporada desejada" assim que o horizonte rolasse adiante.
    world_tour_event: false,
    is_exhibition: true,
  };
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
  // Fase 3: era hardcoded por nome ("Silver"/"Gold" tinham acesso livre,
  // então usavam um "encaixe" fixo de 75/45 quando não há rank de dupla
  // ainda) — Gold agora tem corte real (top 800), e Bronze é o novo tier
  // livre. Generalizado por `config.minRanking === 0` (a mesma declaração
  // que EntryManager.js usa pra decidir elegibilidade), nenhuma lista de
  // nomes paralela a manter.
  const rankingFit = teamRank > 0 && config.minRanking > 0
    ? Math.max(0, Math.min(100, ((config.minRanking - teamRank + 40) / 80) * 100))
    : config.minRanking === 0 ? 75 : 45;
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

// Fase 3: generalizado pros 9 tiers — era uma lista fixa dos 6 antigos,
// que silenciosamente NUNCA contaria Bronze/Circuit Finals/Legacy Finals
// (ficariam de fora de `summary` inteiro, não só das somas). "development"
// e "premier" agora agrupam por `config.order` (mesmo corte de
// is_development_tournament, acima) em vez de nomear cada tier; Circuit
// Finals/Legacy Finals formam uma terceira categoria própria — não são
// "desenvolvimento" nem um degrau comum do "premier", são os únicos dois
// eventos de acesso por mérito (top 8/16), sem inscrição aberta nem corte
// de ranking direto.
export function getSeasonCircuitSummary(tournaments = []) {
  const summary = { total: tournaments.length };
  Object.keys(TOURNAMENT_TIER_CONFIG).forEach((tier) => { summary[tier] = 0; });
  tournaments.forEach((tournament) => {
    if (Object.prototype.hasOwnProperty.call(summary, tournament?.tier)) summary[tournament.tier] += 1;
  });
  const platinumOrder = TOURNAMENT_TIER_CONFIG.Platinum.order;
  const finalsOrders = new Set([TOURNAMENT_TIER_CONFIG['Circuit Finals'].order, TOURNAMENT_TIER_CONFIG['Legacy Finals'].order]);
  summary.development = 0;
  summary.premier = 0;
  summary.finals = 0;
  Object.entries(TOURNAMENT_TIER_CONFIG).forEach(([tier, config]) => {
    if (finalsOrders.has(config.order)) summary.finals += summary[tier];
    else if (config.order <= platinumOrder) summary.development += summary[tier];
    else summary.premier += summary[tier];
  });
  summary.conflictWeeks = groupTournamentConflicts(tournaments).length;
  summary.countries = new Set(tournaments.map((t) => t.country).filter(Boolean)).size;
  summary.regions = new Set(tournaments.map((t) => t.world_region).filter(Boolean)).size;
  return summary;
}
