import { localGame } from '@/api/localGameClient.js';
import { enrichTournamentWeather } from '@/lib/weather';

// ── Catalogs ──────────────────────────────────────────────────────────────

export const TOURNAMENT_SPONSORS = [
  'Red Bull', 'Estrella Damm', 'Mapfre', 'Vodafone', 'Movistar',
  'Head', 'Bullpad', 'Nox', 'Adidas', 'Wilson', 'Babolat',
  'Coca-Cola', 'Nike', 'Rolex', 'Mercedes-Benz', 'INEOS',
];

export const TOURNAMENT_LOCATIONS = [
  'Madrid, Espanha', 'Barcelona, Espanha', 'Buenos Aires, Argentina',
  'Estocolmo, Suécia', 'Roma, Itália', 'Paris, França',
  'Doha, Catar', 'Miami, EUA', 'São Paulo, Brasil', 'Lisboa, Portugal',
  'Dubai, EAU', 'Cancún, México', 'Amsterdã, Holanda', 'Viena, Áustria',
];

const PRO_RUNNER_UPS = [
  'Alejandro Galán & Juan Lebrón',
  'Federico Chingotto & Paquito Navarro',
  'Fernando Belasteguín & Sanyo Gutiérrez',
  'Arturo Coello & Agustín Tapia',
  'Franco Stupaczuk & Martín Di Nenno',
  'Pablo Lima & Juani Mieres',
  'Momo González & Álex Ruiz',
  'Juan Tello & Álex Arroyo',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateAudience(tier, hash) {
  if (tier === 'Crown') return 180000 + (hash % 520000);
  if (tier === 'Elite') return 70000 + (hash % 180000);
  if (tier === 'Masters') return 25000 + (hash % 90000);
  if (tier === 'Platinum') return 8000 + (hash % 32000);
  if (tier === 'Gold') return 2500 + (hash % 11000);
  return 600 + (hash % 3500);
}

export function enrichTournament(t) {
  if (!t) return t;
  const hash = hashString(t.name || t.id || '');
  if (!t.sponsor) t.sponsor = TOURNAMENT_SPONSORS[hash % TOURNAMENT_SPONSORS.length];
  if (!t.location) t.location = TOURNAMENT_LOCATIONS[hash % TOURNAMENT_LOCATIONS.length];
  if (!t.audience) t.audience = generateAudience(t.tier, hash);
  if (!t.year && t.start_date) {
    try { t.year = new Date(t.start_date + 'T00:00:00').getFullYear(); } catch {}
  }
  if (!t.runner_up && t.champion) t.runner_up = PRO_RUNNER_UPS[hash % PRO_RUNNER_UPS.length];
  if (t.temperature === undefined || !t.weather_condition) {
    enrichTournamentWeather(t);
  }
  return t;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export function computePlayerTournamentStats(profile, matches) {
  const tournamentMatches = (matches || []).filter(m => m.tournament_name && m.tournament_name !== 'Partida Oficial');
  const played = tournamentMatches.length;
  const won = tournamentMatches.filter(m => m.winner === 'A').length;
  const winRate = played > 0 ? Math.round((won / played) * 100) : 0;

  return {
    played, won, lost: played - won, winRate,
    titles: profile?.tournaments_won || 0,
    totalPrizes: (profile?.tournaments_won || 0) * 550 + won * 100,
  };
}

export function computeCircuitStats(tournaments) {
  const finished = (tournaments || []).filter(t => t.champion);
  const totalAudience = finished.reduce((sum, t) => sum + (t.audience || 0), 0);
  const byTier = {
    Crown: finished.filter(t => t.tier === 'Crown').length,
    Elite: finished.filter(t => t.tier === 'Elite').length,
    Masters: finished.filter(t => t.tier === 'Masters').length,
    Platinum: finished.filter(t => t.tier === 'Platinum').length,
    Gold: finished.filter(t => t.tier === 'Gold').length,
    Silver: finished.filter(t => t.tier === 'Silver').length,
  };

  const championCounts = {};
  finished.forEach(t => {
    if (t.champion) championCounts[t.champion] = (championCounts[t.champion] || 0) + 1;
  });
  const topChampions = Object.entries(championCounts)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 5);

  const mostWatched = finished.sort((a, b) => (b.audience || 0) - (a.audience || 0))[0];

  return { totalFinished: finished.length, totalAudience, byTier, topChampions, mostWatched };
}

export function getCircuitEvolution(tournaments) {
  const byYear = {};
  (tournaments || []).forEach(t => {
    const year = t.year || (t.start_date ? (() => { try { return new Date(t.start_date + 'T00:00:00').getFullYear(); } catch { return new Date().getFullYear(); } })() : new Date().getFullYear());
    if (!byYear[year]) byYear[year] = { year, tournaments: [], audience: 0, champions: {} };
    byYear[year].tournaments.push(t);
    byYear[year].audience += t.audience || 0;
    if (t.champion) byYear[year].champions[t.champion] = (byYear[year].champions[t.champion] || 0) + 1;
  });

  return Object.values(byYear).map(y => {
    const topChampion = Object.entries(y.champions).sort((a, b) => b[1] - a[1])[0];
    return {
      year: y.year,
      totalTournaments: y.tournaments.length,
      totalAudience: y.audience,
      topChampion: topChampion?.[0] || '—',
      topChampionWins: topChampion?.[1] || 0,
    };
  }).sort((a, b) => a.year - b.year);
}

export function generateTournamentNews(tournaments, profile) {
  const news = [];
  const finished = (tournaments || []).filter(t => t.champion).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
  const upcoming = (tournaments || []).filter(t => !t.champion && t.start_date).sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

  finished.slice(0, 5).forEach(t => {
    news.push({
      type: 'result',
      icon: 'Crown',
      title: `${t.champion} vence ${t.name}`,
      description: `${t.tier} · ${t.location || '—'} · Audiência: ${(t.audience || 0).toLocaleString('pt-BR')}`,
      date: t.start_date,
      accent: 'text-amber-400',
    });
  });

  if (upcoming.length > 0) {
    const next = upcoming[0];
    news.push({
      type: 'upcoming',
      icon: 'Calendar',
      title: `Próximo: ${next.name}`,
      description: `${next.tier} · ${next.location || '—'} · ${next.start_date}`,
      date: next.start_date,
      accent: 'text-cyan-400',
    });
  }

  const mostWatched = finished.sort((a, b) => (b.audience || 0) - (a.audience || 0))[0];
  if (mostWatched) {
    news.push({
      type: 'record',
      icon: 'TrendingUp',
      title: `Recorde de audiência: ${mostWatched.name}`,
      description: `${(mostWatched.audience || 0).toLocaleString('pt-BR')} espectadores · Patrocinado por ${mostWatched.sponsor}`,
      date: mostWatched.start_date,
      accent: 'text-purple-400',
    });
  }

  return news;
}

export async function saveCircuitSeason(year, tournaments) {
  const existing = await localGame.entities.CircuitSeason.filter({ year });
  if (existing && existing.length > 0) return existing[0];

  const stats = computeCircuitStats(tournaments.filter(t => {
    const tYear = t.year || (t.start_date ? (() => { try { return new Date(t.start_date + 'T00:00:00').getFullYear(); } catch { return null; } })() : null);
    return tYear === year;
  }));

  return await localGame.entities.CircuitSeason.create({
    year,
    total_tournaments: stats.totalFinished,
    total_audience: stats.totalAudience,
    top_player_name: stats.topChampions[0]?.name || '—',
    top_player_wins: stats.topChampions[0]?.wins || 0,
    most_watched_tournament: stats.mostWatched?.name || '—',
    most_watched_audience: stats.mostWatched?.audience || 0,
    circuit_description: `Temporada ${year} com ${stats.totalFinished} torneios finalizados e audiência total de ${stats.totalAudience.toLocaleString('pt-BR')} espectadores.`,
  });
}