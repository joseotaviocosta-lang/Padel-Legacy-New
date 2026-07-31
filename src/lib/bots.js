import { overallRating, ATTRIBUTE_KEYS, levelForXp } from '@/lib/padel';

// Deterministic seeded PRNG (mulberry32) — bots get consistent attributes per name
function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// 60 jogadores profissionais reais do circuito FIP, com rating individual refletindo o ranking mundial real
const PRO_PLAYERS = [
  // Lenda — Top 10 do ranking FIP mundial (Coello #1, Tapia #2)
  { name: 'Arturo Coello', country: 'Espanha', rating: 97 }, { name: 'Agustín Tapia', country: 'Argentina', rating: 95 },
  { name: 'Alejandro Galán', country: 'Espanha', rating: 93 }, { name: 'Juan Lebrón', country: 'Espanha', rating: 91 },
  { name: 'Franco Stupaczuk', country: 'Argentina', rating: 90 }, { name: 'Martín Di Nenno', country: 'Argentina', rating: 88 },
  { name: 'Federico Chingotto', country: 'Argentina', rating: 87 }, { name: 'Paquito Navarro', country: 'Espanha', rating: 85 },
  { name: 'Pablo Cardona', country: 'Espanha', rating: 83 }, { name: 'Álex Arroyo', country: 'Espanha', rating: 81 },
  // Elite — Top 11-20 FIP
  { name: 'Javi Garrido', country: 'Espanha', rating: 79 }, { name: 'Javi Ruiz', country: 'Espanha', rating: 78 },
  { name: 'Momo González', country: 'Espanha', rating: 77 }, { name: 'Juan Tello', country: 'Argentina', rating: 76 },
  { name: 'Álex Ruiz', country: 'Espanha', rating: 75 }, { name: 'Coki Nieto', country: 'Espanha', rating: 74 },
  { name: 'Mike Yanguas', country: 'Espanha', rating: 73 }, { name: 'Tino Libaak', country: 'Argentina', rating: 72 },
  { name: 'Lucho Capra', country: 'Argentina', rating: 71 }, { name: 'Gonzalo Rubio', country: 'Espanha', rating: 70 },
  // Avançado — Top 21-30
  { name: 'Aris Patiniotis', country: 'Argentina', rating: 65 }, { name: 'Jordi Muñoz', country: 'Espanha', rating: 64 },
  { name: 'Juan Belluati', country: 'Argentina', rating: 63 }, { name: 'Adrián Allemandi', country: 'Argentina', rating: 62 },
  { name: 'Andrés Britos', country: 'Uruguai', rating: 61 }, { name: 'José A. García', country: 'Espanha', rating: 60 },
  { name: 'Denis Perino', country: 'Argentina', rating: 59 }, { name: 'Antonio Fernández', country: 'Espanha', rating: 58 },
  { name: 'Ramiro Valiente', country: 'Argentina', rating: 57 }, { name: 'Víctor Ruiz', country: 'Espanha', rating: 56 },
  // Competitivo — Top 31-40
  { name: 'Sergio Alba', country: 'Espanha', rating: 50 }, { name: 'Pablo Herrera', country: 'Espanha', rating: 48 },
  { name: 'Daniel Santigosa', country: 'Espanha', rating: 47 }, { name: 'Rafa Méndez', country: 'Espanha', rating: 46 },
  { name: 'Eduardo Alonso', country: 'Espanha', rating: 45 }, { name: 'Marc Quílez', country: 'Espanha', rating: 44 },
  { name: 'Jorge Nieto', country: 'Espanha', rating: 43 }, { name: 'Carlos Gutiérrez', country: 'Bolívia', rating: 42 },
  { name: 'Agustín Slutsky', country: 'Argentina', rating: 41 }, { name: 'Martín Abud', country: 'Chile', rating: 40 },
  // Amador — Nível regional profissional
  { name: 'Cristian Gutiérrez', country: 'Argentina', rating: 35 }, { name: 'Marcelo Capitani', country: 'Brasil', rating: 34 },
  { name: 'Facundo Domínguez', country: 'Argentina', rating: 33 }, { name: 'José Rico', country: 'Espanha', rating: 32 },
  { name: 'Juan Restivo', country: 'Argentina', rating: 31 }, { name: 'Pablo Lima', country: 'Brasil', rating: 30 },
  { name: 'Andrés Mazzucchi', country: 'Argentina', rating: 29 }, { name: 'Lucas Campagnolo', country: 'Brasil', rating: 28 },
  { name: 'Lucas Bergamini', country: 'Brasil', rating: 27 }, { name: 'Miguel Oliveira', country: 'Portugal', rating: 26 },
  // Iniciante — Nível de clube
  { name: 'Rafael Fontes', country: 'Brasil', rating: 15 }, { name: 'Bruno Carvalho', country: 'Brasil', rating: 14 },
  { name: 'Tiago Dantas', country: 'Brasil', rating: 13 }, { name: 'Caio Vidal', country: 'Brasil', rating: 12 },
  { name: 'André Bortolini', country: 'Brasil', rating: 11 }, { name: 'Fábio Perez', country: 'Brasil', rating: 10 },
  { name: 'João Souza', country: 'Brasil', rating: 9 }, { name: 'Pedro Salgado', country: 'Brasil', rating: 8 },
  { name: 'Rodrigo Cytrynowicz', country: 'Brasil', rating: 7 }, { name: 'Daniel Moraes', country: 'Brasil', rating: 6 },
];

export const BOT_DIFFICULTIES = [
  { id: 'iniciante', label: 'Iniciante', base: 12, pill: 'bg-slate-500/15 text-slate-300' },
  { id: 'amador', label: 'Amador', base: 28, pill: 'bg-green-500/15 text-green-300' },
  { id: 'competitivo', label: 'Competitivo', base: 42, pill: 'bg-cyan-500/15 text-cyan-300' },
  { id: 'avancado', label: 'Avançado', base: 58, pill: 'bg-blue-500/15 text-blue-300' },
  { id: 'elite', label: 'Elite', base: 75, pill: 'bg-purple-500/15 text-purple-300' },
  { id: 'lenda', label: 'Lenda', base: 90, pill: 'bg-amber-500/15 text-amber-300' },
];

function makeBot(player, difficulty) {
  const rng = seededRandom(player.name + difficulty.id);
  const attrs = {};
  const base = player.rating || difficulty.base;
  ATTRIBUTE_KEYS.forEach((k) => {
    attrs[k] = Math.max(1, Math.min(100, Math.round(base + (rng() - 0.5) * 10)));
  });
  return {
    id: `bot_${player.name.toLowerCase().replace(/\s+/g, '_')}`,
    name: player.name,
    sport_name: player.name,
    level: difficulty.label,
    country: player.country,
    ...attrs,
  };
}

// 10 bots per difficulty, deterministic
export const BOTS_BY_DIFFICULTY = BOT_DIFFICULTIES.reduce((acc, diff, di) => {
  acc[diff.id] = [];
  for (let i = 0; i < 10; i++) {
    const player = PRO_PLAYERS[((BOT_DIFFICULTIES.length - 1 - di) * 10 + i) % PRO_PLAYERS.length];
    const bot = makeBot(player, diff);
    bot.position = i % 2 === 0 ? 'direita' : 'esquerda';
    acc[diff.id].push(bot);
  }
  return acc;
}, {});

export function getDifficultyForPlayer(profile) {
  const level = levelForXp(profile?.xp || 0);
  const idx = BOT_DIFFICULTIES.findIndex(d => d.label === level);
  const baseIdx = idx >= 0 ? idx : 0;
  const offset = Math.random() < 0.5 ? 0 : -1;
  return BOT_DIFFICULTIES[Math.max(0, baseIdx + offset)].id;
}

export function getRandomBots(difficultyId, count = 2, excludeIds = []) {
  const pool = BOTS_BY_DIFFICULTY[difficultyId] || BOTS_BY_DIFFICULTY.iniciante;
  const filtered = pool.filter(b => !excludeIds.includes(b.id));
  return [...filtered].sort(() => Math.random() - 0.5).slice(0, count);
}

export function getDifficulty(difficultyId) {
  return BOT_DIFFICULTIES.find((d) => d.id === difficultyId) || BOT_DIFFICULTIES[0];
}

/**
 * Simulates a padel match between two teams.
 * Each team is an array of player objects with padel attributes.
 * Win probability is derived from the overall-rating difference via a sigmoid.
 */
export function simulateMatch(teamA, teamB) {
  const teamStrength = (players) => {
    if (!players || players.length === 0) return 10;
    const sum = players.reduce((acc, p) => acc + overallRating(p), 0);
    return sum / players.length;
  };

  const strA = teamStrength(teamA);
  const strB = teamStrength(teamB);
  const diff = strA - strB;

  // Sigmoid: ~50% at equal strength, steeper with bigger gaps
  const winProbA = 1 / (1 + Math.exp(-diff / 12));
  const aWins = Math.random() < winProbA;

  // Loser score: higher when teams are closer in strength
  const dominance = Math.abs(diff);
  const maxLoser = Math.min(5, Math.max(0, Math.round(5 - dominance / 8)));
  const loserScore = Math.floor(Math.random() * (maxLoser + 1));

  return {
    winner: aWins ? 'A' : 'B',
    score_a: aWins ? 6 : loserScore,
    score_b: aWins ? loserScore : 6,
    strengthA: Math.round(strA),
    strengthB: Math.round(strB),
  };
}

// XP mapping per difficulty tier — places each bot in the correct XP bracket
// with slight variation based on individual rating within the tier.
const XP_FORMULAS = {
  iniciante: (rating) => Math.round(rating * 30),
  amador: (rating) => Math.round(500 + (rating - 26) * 150),
  competitivo: (rating) => Math.round(3000 + (rating - 40) * 400),
  avancado: (rating) => Math.round(10000 + (rating - 56) * 800),
  elite: (rating) => Math.round(25000 + (rating - 70) * 1200),
  lenda: (rating) => Math.round(50000 + (rating - 81) * 1500),
};

/**
 * Returns all bots as profile-like objects with XP assigned by tier,
 * so they can be merged with real PlayerProfile records in the ranking.
 */
export function getAllBotsAsProfiles() {
  const profiles = [];
  for (const diff of BOT_DIFFICULTIES) {
    const bots = BOTS_BY_DIFFICULTY[diff.id] || [];
    for (const bot of bots) {
      const ovr = overallRating(bot);
      profiles.push({
        id: bot.id,
        sport_name: bot.name,
        country: bot.country,
        level: diff.label,
        xp: XP_FORMULAS[diff.id](ovr) || 0,
        ...bot,
      });
    }
  }
  return profiles;
}

// Re-export so callers can import everything from one place
export { applyMatchRewards } from '@/lib/padel';