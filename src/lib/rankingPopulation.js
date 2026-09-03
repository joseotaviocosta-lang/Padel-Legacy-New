import { fnv1aHash } from './hashUtils.js';

export const WORLD_RANKING_TARGET = 1000;
export const TEAM_RANKING_TARGET = 500;

const FIRST_NAMES = ['Lucas','Mateo','Thiago','Martín','Nicolás','Javier','Bruno','Tomás','Diego','Rafael','Enzo','Pablo','Santiago','Álvaro','Gonzalo','Miguel','Felipe','João','Pedro','André','Hugo','Marco','Daniel','Carlos','Emiliano','Franco','Ignacio','Samuel','Adrián','Rubén'];
const LAST_NAMES = ['Silva','García','López','Martínez','Sánchez','Fernández','Pereira','Costa','Romero','Navarro','Torres','Molina','Castro','Ramos','Vega','Ortiz','Medina','Herrera','Suárez','Cabrera','Alonso','Méndez','Ferrer','Giménez','Acosta','Miranda','Rojas','Campos','Santos','Iglesias'];
const STYLES = ['Equilibrado','Controle','Defensivo','Agressivo','Potência','Tático'];

function hash(value = '') {
  return Math.abs(fnv1aHash(String(value)));
}

function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fase 2C — nacionalidade: espelha o top 100 real do topo da base (101-400)
// e diversifica progressivamente até a posição 1000. "Diversifica" não é
// arbitrário: o FIP Tour roda 200+ eventos em cinco continentes, então a
// base do circuito tem representação bem mais ampla que o topo dominado
// por ESP/ARG. Garante presença brasileira relevante na base (pedido
// explícito), sem apagar o peso de ESP/ARG (que continuam maioria, só não
// mais ~82%).
const TOP_COUNTRY_WEIGHTS = Object.freeze({
  Espanha: 58, Argentina: 24, Itália: 7, Brasil: 2, Paraguai: 2, Portugal: 2,
  México: 1, Bélgica: 1, França: 1, Chile: 1, 'Emirados Árabes Unidos': 1,
});
const BASE_COUNTRY_WEIGHTS = Object.freeze({
  Espanha: 35, Argentina: 15, Brasil: 10, Itália: 7, França: 5, Portugal: 4,
  México: 4, Bélgica: 3, Chile: 3, Paraguai: 3, 'Estados Unidos': 3,
  'Emirados Árabes Unidos': 2, Catar: 2, Suécia: 2, Marrocos: 1, Egito: 1,
});
const ALL_WEIGHTED_COUNTRIES = [...new Set([...Object.keys(TOP_COUNTRY_WEIGHTS), ...Object.keys(BASE_COUNTRY_WEIGHTS)])];

function blendedCountryWeights(absoluteRank) {
  if (absoluteRank <= 400) return TOP_COUNTRY_WEIGHTS;
  const t = Math.min(1, (absoluteRank - 400) / (WORLD_RANKING_TARGET - 400));
  const blended = {};
  for (const country of ALL_WEIGHTED_COUNTRIES) {
    const top = TOP_COUNTRY_WEIGHTS[country] || 0;
    const base = BASE_COUNTRY_WEIGHTS[country] || 0;
    blended[country] = top * (1 - t) + base * t;
  }
  return blended;
}

function weightedCountryFor(absoluteRank, seed) {
  const weights = blendedCountryWeights(absoluteRank);
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = (hash(seed) % 1000000) / 1000000 * total;
  for (const [country, weight] of entries) {
    if (roll < weight) return country;
    roll -= weight;
  }
  return entries[entries.length - 1][0];
}

// Fase 2C — pirâmide etária: sem ela, geração uniforme produz onda de
// aposentadoria (todo mundo sai junto, circuito colapsa num ano — achado
// do pedido). Faixas e fatias pedidas, aplicadas sobre a POPULAÇÃO TOTAL
// (1000, reais incluídos) — a função abaixo desconta quantos reais já
// caem em cada faixa e sorteia só a diferença entre os bots, embaralhada
// (sem correlação com rank/posição, mesmo princípio usado na idade
// sintética dos reais).
const AGE_PYRAMID = Object.freeze([
  { key: '17-20', min: 17, max: 20, share: 0.15 },
  { key: '21-24', min: 21, max: 24, share: 0.22 },
  { key: '25-28', min: 25, max: 28, share: 0.24 },
  { key: '29-32', min: 29, max: 32, share: 0.21 },
  { key: '33-36', min: 33, max: 36, share: 0.13 },
  { key: '37-42', min: 37, max: 42, share: 0.05 },
]);

function bucketFor(age) {
  return AGE_PYRAMID.find((b) => age >= b.min && age <= b.max) || AGE_PYRAMID[AGE_PYRAMID.length - 1];
}

function buildAgeAssignments(missingCount, existingAthletes, seedLabel) {
  if (missingCount <= 0) return [];
  const existingCounts = Object.fromEntries(AGE_PYRAMID.map((b) => [b.key, 0]));
  for (const athlete of existingAthletes) {
    const age = Math.max(16, Math.round(Number(athlete.age) || 27));
    existingCounts[bucketFor(age).key] += 1;
  }
  const totalPopulation = existingAthletes.length + missingCount;
  const targets = AGE_PYRAMID.map((b) => Math.max(0, Math.round(b.share * totalPopulation) - existingCounts[b.key]));
  let diff = missingCount - targets.reduce((sum, v) => sum + v, 0);
  const order = [...AGE_PYRAMID.keys()];
  let guard = 0;
  while (diff !== 0 && guard < missingCount * 4 + 64) {
    const i = order[guard % order.length];
    if (diff > 0) { targets[i] += 1; diff -= 1; }
    else if (targets[i] > 0) { targets[i] -= 1; diff += 1; }
    guard += 1;
  }
  const pool = [];
  AGE_PYRAMID.forEach((bucket, index) => { for (let k = 0; k < targets[index]; k += 1) pool.push(bucket); });
  const rand = mulberry32(hash(seedLabel));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

const RANKING_POINT_ANCHORS = Object.freeze([
  [1, 13000], [10, 9130], [24, 3110], [50, 2050], [100, 1200],
  [200, 650], [350, 340], [500, 200], [750, 65], [1000, 1],
]);

export function pointsForRank(rank, total = WORLD_RANKING_TARGET) {
  const safeRank = Math.max(1, Math.min(total, Math.round(Number(rank) || total)));
  const scaledRank = total === WORLD_RANKING_TARGET
    ? safeRank
    : 1 + ((safeRank - 1) / Math.max(1, total - 1)) * (WORLD_RANKING_TARGET - 1);
  for (let index = 0; index < RANKING_POINT_ANCHORS.length - 1; index += 1) {
    const [rankA, pointsA] = RANKING_POINT_ANCHORS[index];
    const [rankB, pointsB] = RANKING_POINT_ANCHORS[index + 1];
    if (scaledRank < rankA || scaledRank > rankB) continue;
    const ratio = (scaledRank - rankA) / Math.max(1, rankB - rankA);
    return Math.max(1, Math.round(pointsA + (pointsB - pointsA) * ratio));
  }
  return 1;
}

export function buildSupplementalRankingPopulation(existingAthletes = [], existingTeams = [], seasonStartDate = '2026-01-01') {
  const athletes = [];
  const usedNames = new Set((existingAthletes || []).map(a => String(a.name || a.sport_name || '').trim().toLowerCase()));
  const missingAthletes = Math.max(0, WORLD_RANKING_TARGET - (existingAthletes || []).length);
  const ageAssignments = buildAgeAssignments(missingAthletes, existingAthletes || [], 'ranking-population-age-shuffle');

  for (let i = 0; i < missingAthletes; i += 1) {
    const absoluteRank = (existingAthletes || []).length + i + 1;
    const seed = hash(`ranking-athlete-${absoluteRank}`);
    let name = `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(seed / 31) % LAST_NAMES.length]}`;
    if (usedNames.has(name.toLowerCase())) name = `${name} ${absoluteRank}`;
    usedNames.add(name.toLowerCase());
    const points = pointsForRank(absoluteRank);
    const overall = Math.max(35, Math.min(96, Math.round(96 - Math.pow(absoluteRank / WORLD_RANKING_TARGET, 0.72) * 57)));
    const country = weightedCountryFor(absoluteRank, `ranking-athlete-${absoluteRank}-country`);
    const ageBucket = ageAssignments[i] || bucketFor(27);
    const age = ageBucket.min + (hash(`ranking-athlete-${absoluteRank}-age`) % (ageBucket.max - ageBucket.min + 1));
    athletes.push({
      bot_id: `ranking-bot-${String(absoluteRank).padStart(4, '0')}`,
      name,
      sport_name: name,
      country,
      nationality: country,
      age,
      dominant_hand: seed % 5 === 0 ? 'Canhoto' : 'Destro',
      court_side: seed % 2 === 0 ? 'Direita' : 'Esquerda',
      play_style: STYLES[seed % STYLES.length],
      overall_rating: overall,
      potential: Math.min(99, overall + 2 + (seed % 10)),
      world_ranking_points: points,
      ranking_points: points,
      // Correção UI/cronologia — Fase 3: race_points é o placar da temporada
      // (Race) EM ANDAMENTO, nunca deve nascer com valor > 0 — só cresce
      // conforme torneios reais são disputados na carreira do jogador.
      // ranking_points/world_ranking_points seguem representando o Circuito
      // (histórico acumulado), que continua populado normalmente.
      race_points: 0,
      world_ranking: absoluteRank,
      ranking_position: absoluteRank,
      tournaments_played: Math.max(1, 6 + (seed % 28)),
      matches_played: Math.max(2, 12 + (seed % 95)),
      wins: Math.max(1, Math.round((12 + (seed % 95)) * (0.35 + (overall - 35) / 130))),
      retired: false,
      career_phase: overall >= 83 ? 'Elite' : overall >= 68 ? 'Profissional' : 'Desenvolvimento',
      circuit_category: absoluteRank <= 100 ? 'Premier' : absoluteRank <= 350 ? 'Challenger' : 'Future',
      ranking_seed_version: 1,
      // Fase 2.6, item 3: marca quando este atleta passou a existir NESTA
      // carreira (não uma biografia pré-jogo inventada — "Parte 41: nunca
      // inventar passado") — usado só pra "anos ativos" na linha-resumo de
      // aposentadoria (AthleteCareerLegacy).
      circuit_entry_date: seasonStartDate,
    });
  }

  const allAthletes = [...(existingAthletes || []), ...athletes];
  const teams = [];
  const missingTeams = Math.max(0, TEAM_RANKING_TARGET - (existingTeams || []).length);
  for (let i = 0; i < missingTeams; i += 1) {
    const teamRank = (existingTeams || []).length + i + 1;
    const a = allAthletes[(i * 2) % allAthletes.length];
    const b = allAthletes[(i * 2 + 1) % allAthletes.length];
    if (!a || !b) break;
    const p1Id = a.id || a.bot_id;
    const p2Id = b.id || b.bot_id;
    const key = [p1Id, p2Id].sort().join('_');
    const points = Math.max(1, Math.round(pointsForRank(Math.min(WORLD_RANKING_TARGET, teamRank * 2), WORLD_RANKING_TARGET) * 0.72));
    teams.push({
      team_key: key,
      player1_id: p1Id,
      player1_name: a.name || a.sport_name,
      player1_country: a.country || a.nationality,
      player2_id: p2Id,
      player2_name: b.name || b.sport_name,
      player2_country: b.country || b.nationality,
      ranking_points: points,
      // Ver comentário equivalente acima (Fase 3): Race começa zerada.
      race_points: 0,
      matches_played: 8 + (hash(key) % 80),
      wins: 4 + (hash(`${key}:wins`) % 45),
      losses: 4 + (hash(`${key}:losses`) % 38),
      titles: [],
      circuit_category: teamRank <= 50 ? 'Premier' : teamRank <= 180 ? 'Challenger' : 'Future',
      ranking_seed_version: 1,
    });
  }
  return { athletes, teams };
}

export function formatRankingPosition(rank, { unranked = false, threshold = 1000 } = {}) {
  const value = Number(rank) || 0;
  if (unranked && value > threshold) return `${threshold}+`;
  return value > 0 ? String(value) : '—';
}
