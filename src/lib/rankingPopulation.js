export const WORLD_RANKING_TARGET = 1000;
export const TEAM_RANKING_TARGET = 500;

const FIRST_NAMES = ['Lucas','Mateo','Thiago','Martín','Nicolás','Javier','Bruno','Tomás','Diego','Rafael','Enzo','Pablo','Santiago','Álvaro','Gonzalo','Miguel','Felipe','João','Pedro','André','Hugo','Marco','Daniel','Carlos','Emiliano','Franco','Ignacio','Samuel','Adrián','Rubén'];
const LAST_NAMES = ['Silva','García','López','Martínez','Sánchez','Fernández','Pereira','Costa','Romero','Navarro','Torres','Molina','Castro','Ramos','Vega','Ortiz','Medina','Herrera','Suárez','Cabrera','Alonso','Méndez','Ferrer','Giménez','Acosta','Miranda','Rojas','Campos','Santos','Iglesias'];
const COUNTRIES = ['Espanha','Argentina','Brasil','França','Itália','Portugal','México','Chile','Uruguai','Suécia','Bélgica','Países Baixos'];
const STYLES = ['Equilibrado','Controle','Defensivo','Agressivo','Potência','Tático'];

function hash(value = '') {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
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

export function buildSupplementalRankingPopulation(existingAthletes = [], existingTeams = []) {
  const athletes = [];
  const usedNames = new Set((existingAthletes || []).map(a => String(a.name || a.sport_name || '').trim().toLowerCase()));
  const missingAthletes = Math.max(0, WORLD_RANKING_TARGET - (existingAthletes || []).length);

  for (let i = 0; i < missingAthletes; i += 1) {
    const absoluteRank = (existingAthletes || []).length + i + 1;
    const seed = hash(`ranking-athlete-${absoluteRank}`);
    let name = `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(seed / 31) % LAST_NAMES.length]}`;
    if (usedNames.has(name.toLowerCase())) name = `${name} ${absoluteRank}`;
    usedNames.add(name.toLowerCase());
    const points = pointsForRank(absoluteRank);
    const overall = Math.max(35, Math.min(96, Math.round(96 - Math.pow(absoluteRank / WORLD_RANKING_TARGET, 0.72) * 57)));
    athletes.push({
      bot_id: `ranking-bot-${String(absoluteRank).padStart(4, '0')}`,
      name,
      sport_name: name,
      country: COUNTRIES[seed % COUNTRIES.length],
      nationality: COUNTRIES[seed % COUNTRIES.length],
      age: 18 + (seed % 19),
      dominant_hand: seed % 5 === 0 ? 'Canhoto' : 'Destro',
      court_side: seed % 2 === 0 ? 'Direita' : 'Esquerda',
      play_style: STYLES[seed % STYLES.length],
      overall_rating: overall,
      potential: Math.min(99, overall + 2 + (seed % 10)),
      world_ranking_points: points,
      ranking_points: points,
      race_points: Math.round(points * (0.15 + ((seed % 70) / 100))),
      world_ranking: absoluteRank,
      ranking_position: absoluteRank,
      tournaments_played: Math.max(1, 6 + (seed % 28)),
      matches_played: Math.max(2, 12 + (seed % 95)),
      wins: Math.max(1, Math.round((12 + (seed % 95)) * (0.35 + (overall - 35) / 130))),
      retired: false,
      career_phase: overall >= 83 ? 'Elite' : overall >= 68 ? 'Profissional' : 'Desenvolvimento',
      circuit_category: absoluteRank <= 100 ? 'Premier' : absoluteRank <= 350 ? 'Challenger' : 'Future',
      ranking_seed_version: 1,
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
      race_points: Math.round(points * 0.4),
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
