import { base44 } from '@/api/base44Client';

// ── Location Climate Profiles ─────────────────────────────────────────────
// Base climate data per city: [avgTemp, tempVariance, avgHumidity, avgWind, weatherWeights]

export const LOCATION_CLIMATES = {
  'Madrid, Espanha':       { baseTemp: 18, tempVar: 10, humidity: 45, wind: 12, weights: { ensolarado: 3, nublado: 2, parcialmente_nublado: 2, ventoso: 1, chuvoso: 1, calor_extremo: 0.5, frio_extremo: 0.5, neblina: 0.5, tempestade: 0.2 } },
  'Barcelona, Espanha':    { baseTemp: 20, tempVar: 8, humidity: 60, wind: 15, weights: { ensolarado: 3, parcialmente_nublado: 2, nublado: 1, chuvoso: 1, ventoso: 1, neblina: 0.5, tempestade: 0.3 } },
  'Buenos Aires, Argentina':{ baseTemp: 19, tempVar: 10, humidity: 65, wind: 18, weights: { parcialmente_nublado: 2, nublado: 2, ensolarado: 2, ventoso: 2, chuvoso: 1.5, neblina: 0.5, tempestade: 0.5, calor_extremo: 0.3 } },
  'Estocolmo, Suécia':     { baseTemp: 8, tempVar: 12, humidity: 70, wind: 14, weights: { nublado: 3, chuvoso: 2, neblina: 1, parcialmente_nublado: 1, ventoso: 1, frio_extremo: 1, ensolarado: 1, tempestade: 0.5 } },
  'Roma, Itália':          { baseTemp: 22, tempVar: 8, humidity: 55, wind: 10, weights: { ensolarado: 4, parcialmente_nublado: 2, nublado: 1, chuvoso: 1, calor_extremo: 1, ventoso: 0.5, tempestade: 0.3 } },
  'Paris, França':         { baseTemp: 15, tempVar: 9, humidity: 65, wind: 13, weights: { nublado: 3, parcialmente_nublado: 2, chuvoso: 2, ensolarado: 1, neblina: 1, ventoso: 1, tempestade: 0.5 } },
  'Doha, Catar':           { baseTemp: 32, tempVar: 8, humidity: 40, wind: 15, weights: { ensolarado: 4, calor_extremo: 3, ventoso: 1, parcialmente_nublado: 1, nublado: 0.5, tempestade: 0.2 } },
  'Miami, EUA':            { baseTemp: 27, tempVar: 6, humidity: 75, wind: 16, weights: { ensolarado: 3, parcialmente_nublado: 2, chuvoso: 2, ventoso: 1, tempestade: 1, nublado: 1, calor_extremo: 1 } },
  'São Paulo, Brasil':     { baseTemp: 21, tempVar: 7, humidity: 70, wind: 12, weights: { parcialmente_nublado: 3, nublado: 2, chuvoso: 2, ensolarado: 2, neblina: 1, ventoso: 1, tempestade: 0.5 } },
  'Lisboa, Portugal':      { baseTemp: 20, tempVar: 7, humidity: 60, wind: 17, weights: { ensolarado: 3, parcialmente_nublado: 2, ventoso: 2, nublado: 1, neblina: 0.5, chuvoso: 1, tempestade: 0.3 } },
  'Dubai, EAU':            { baseTemp: 33, tempVar: 8, humidity: 45, wind: 14, weights: { ensolarado: 5, calor_extremo: 3, ventoso: 1, parcialmente_nublado: 0.5, nublado: 0.3 } },
  'Cancún, México':        { baseTemp: 28, tempVar: 5, humidity: 75, wind: 14, weights: { ensolarado: 3, parcialmente_nublado: 2, chuvoso: 2, tempestade: 1, ventoso: 1, nublado: 1, calor_extremo: 1 } },
  'Amsterdã, Holanda':     { baseTemp: 12, tempVar: 9, humidity: 75, wind: 20, weights: { nublado: 3, chuvoso: 2, ventoso: 2, neblina: 1, parcialmente_nublado: 1, frio_extremo: 0.5, tempestade: 0.5, ensolarado: 0.5 } },
  'Viena, Áustria':        { baseTemp: 14, tempVar: 11, humidity: 65, wind: 11, weights: { parcialmente_nublado: 2, nublado: 2, ensolarado: 1, chuvoso: 1, neblina: 1, frio_extremo: 0.5, ventoso: 0.5, tempestade: 0.3 } },
};

const DEFAULT_CLIMATE = { baseTemp: 20, tempVar: 8, humidity: 60, wind: 12, weights: { ensolarado: 2, parcialmente_nublado: 2, nublado: 1, chuvoso: 1, ventoso: 1, neblina: 0.5, tempestade: 0.3, calor_extremo: 0.3, frio_extremo: 0.3 } };

// ── Weather Condition Metadata ─────────────────────────────────────────────

export const WEATHER_META = {
  ensolarado:           { icon: 'Sun',            label: 'Ensolarado',         color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  emoji: '☀️' },
  parcialmente_nublado:{ icon: 'CloudSun',        label: 'Parc. Nublado',      color: 'text-amber-400',   bg: 'bg-amber-500/10',   emoji: '⛅' },
  nublado:              { icon: 'Cloud',           label: 'Nublado',            color: 'text-slate-400',   bg: 'bg-slate-500/10',   emoji: '☁️' },
  chuvoso:              { icon: 'CloudRain',       label: 'Chuvoso',            color: 'text-blue-400',    bg: 'bg-blue-500/10',    emoji: '🌧️' },
  ventoso:              { icon: 'Wind',            label: 'Ventoso',            color: 'text-cyan-400',     bg: 'bg-cyan-500/10',    emoji: '💨' },
  tempestade:           { icon: 'CloudLightning',  label: 'Tempestade',          color: 'text-purple-400',   bg: 'bg-purple-500/10',  emoji: '⛈️' },
  neblina:              { icon: 'CloudFog',        label: 'Neblina',            color: 'text-slate-400',    bg: 'bg-slate-500/10',   emoji: '🌫️' },
  calor_extremo:        { icon: 'ThermometerSun',  label: 'Calor Extremo',       color: 'text-red-400',      bg: 'bg-red-500/10',     emoji: '🥵' },
  frio_extremo:         { icon: 'Snowflake',        label: 'Frio Extremo',         color: 'text-cyan-300',     bg: 'bg-cyan-500/10',    emoji: '🥶' },
};

export const COURT_META = {
  seca:            { label: 'Seca',            color: 'text-amber-400',  bg: 'bg-amber-500/10',  desc: 'Quadra rápida, bola acelera' },
  umida:           { label: 'Úmida',           color: 'text-blue-400',    bg: 'bg-blue-500/10',   desc: 'Bola mais lenta, maior controle' },
  molhada:         { label: 'Molhada',          color: 'text-cyan-400',    bg: 'bg-cyan-500/10',   desc: 'Perigosa, alto risco de escorregão' },
  molhada_parcial: { label: 'Molhada Parcial',  color: 'text-teal-400',     bg: 'bg-teal-500/10',   desc: 'Zonas escorregadias, jogo imprevisível' },
  poeirenta:       { label: 'Poeirenta',        color: 'text-orange-400',   bg: 'bg-orange-500/10', desc: 'Bola desacelera, baixa visibilidade' },
};

const WIND_DIRECTIONS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

// ── Helpers ────────────────────────────────────────────────────────────────

function pick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[0][0];
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Seasonal temperature adjustment by month (Northern Hemisphere)
// Positive = warmer than base, negative = colder
function seasonalAdjust(month) {
  // month 1-12, peak warmth in July/Aug (month 7-8), coldest in Jan/Dec (1/12)
  const offset = Math.cos(((month - 7) / 12) * Math.PI * 2);
  return Math.round(offset * 8);
}

// ── Weather Generation ────────────────────────────────────────────────────

export function getClimateForLocation(location) {
  if (!location) return DEFAULT_CLIMATE;
  // Try exact match first
  if (LOCATION_CLIMATES[location]) return LOCATION_CLIMATES[location];
  // Try partial match
  const key = Object.keys(LOCATION_CLIMATES).find(k => k.toLowerCase().includes(location.toLowerCase().split(',')[0]));
  return key ? LOCATION_CLIMATES[key] : DEFAULT_CLIMATE;
}

export function generateWeather(location, month) {
  const climate = getClimateForLocation(location);
  const adj = seasonalAdjust(month || 7);

  const baseTemp = climate.baseTemp + adj;
  const temperature = clamp(baseTemp + randInt(-climate.tempVar, climate.tempVar), -5, 50);

  const humidity = clamp(climate.humidity + randInt(-15, 15), 10, 95);
  const wind_speed = clamp(climate.wind + randInt(-8, 12), 0, 55);
  const wind_direction = WIND_DIRECTIONS[randInt(0, 7)];

  let condition = pick(climate.weights);

  // Temperature overrides
  if (temperature >= 38) condition = 'calor_extremo';
  else if (temperature <= 2) condition = 'frio_extremo';

  // Wind override
  if (wind_speed >= 40 && condition !== 'tempestade') condition = 'ventoso';

  // Court condition based on weather
  let court_condition;
  if (condition === 'tempestade' || condition === 'chuvoso') {
    court_condition = Math.random() > 0.4 ? 'molhada' : 'molhada_parcial';
  } else if (humidity >= 80) {
    court_condition = 'umida';
  } else if (condition === 'neblina') {
    court_condition = 'umida';
  } else if (temperature >= 35 && humidity < 40) {
    court_condition = Math.random() > 0.5 ? 'poeirenta' : 'seca';
  } else {
    court_condition = 'seca';
  }

  const uv_index = condition === 'ensolarado' || condition === 'calor_extremo'
    ? clamp(Math.round(temperature / 5), 5, 11)
    : condition === 'parcialmente_nublado' ? randInt(3, 7) : randInt(0, 4);

  const visibility_km = condition === 'neblina' ? randInt(1, 4)
    : condition === 'tempestade' ? randInt(2, 6)
    : condition === 'chuvoso' ? randInt(5, 10)
    : randInt(10, 20);

  return {
    temperature,
    humidity,
    wind_speed,
    wind_direction,
    weather_condition: condition,
    court_condition,
    uv_index,
    visibility_km,
  };
}

// ── Weather Impact on Player Performance ───────────────────────────────────

export function computeWeatherImpact(weather) {
  if (!weather) return { energy_cost_modifier: 1, accuracy_modifier: 1, injury_risk_modifier: 0, speed_modifier: 1, tactic_bonus: 0, defense_bonus: 0, description: 'Condições normais' };

  const { temperature, humidity, wind_speed, weather_condition, court_condition, uv_index } = weather;

  let energy_cost_modifier = 1;
  let accuracy_modifier = 1;
  let injury_risk_modifier = 0;
  let speed_modifier = 1;
  let tactic_bonus = 0;
  let defense_bonus = 0;
  const effects = [];

  // Temperature effects
  if (temperature >= 35) {
    energy_cost_modifier *= 1.3;
    injury_risk_modifier += 8;
    effects.push('Calor intenso acelera a fadiga');
  } else if (temperature >= 30) {
    energy_cost_modifier *= 1.15;
    injury_risk_modifier += 3;
    effects.push('Calor aumenta o desgaste físico');
  } else if (temperature <= 5) {
    energy_cost_modifier *= 1.1;
    injury_risk_modifier += 5;
    effects.push('Frio extremo prejudica o aquecimento muscular');
  } else if (temperature <= 10) {
    energy_cost_modifier *= 1.05;
    effects.push('Frio reduz a flexibilidade');
  }

  // Humidity effects
  if (humidity >= 80) {
    energy_cost_modifier *= 1.12;
    effects.push('Umidade alta dificulta a termorregulação');
  } else if (humidity <= 30) {
    effects.push('Ar seco pode irritar vias respiratórias');
  }

  // Wind effects
  if (wind_speed >= 35) {
    accuracy_modifier *= 0.8;
    tactic_bonus += 5;
    effects.push('Vento forte prejudica a precisão, favorece táticos');
  } else if (wind_speed >= 20) {
    accuracy_modifier *= 0.92;
    tactic_bonus += 2;
    effects.push('Vento moderado afeta a trajetória da bola');
  }

  // Weather condition effects
  switch (weather_condition) {
    case 'tempestade':
      accuracy_modifier *= 0.75;
      speed_modifier *= 0.9;
      injury_risk_modifier += 10;
      effects.push('Tempestade torna o jogo perigoso e imprevisível');
      break;
    case 'chuvoso':
      speed_modifier *= 0.85;
      defense_bonus += 3;
      effects.push('Chuva deixa a quadra lenta, favorece defensores');
      break;
    case 'neblina':
      accuracy_modifier *= 0.9;
      effects.push('Neblina reduz a visibilidade');
      break;
    case 'calor_extremo':
      energy_cost_modifier *= 1.4;
      injury_risk_modifier += 12;
      effects.push('Calor extremo é perigoso para a saúde');
      break;
    case 'frio_extremo':
      energy_cost_modifier *= 1.2;
      injury_risk_modifier += 8;
      effects.push('Frio extremo aumenta risco de lesão muscular');
      break;
    case 'ventoso':
      accuracy_modifier *= 0.88;
      tactic_bonus += 3;
      effects.push('Vento constante desafia a precisão');
      break;
  }

  // Court condition effects
  switch (court_condition) {
    case 'molhada':
      speed_modifier *= 0.8;
      injury_risk_modifier += 15;
      defense_bonus += 5;
      effects.push('Quadra molhada é perigosa e lenta');
      break;
    case 'molhada_parcial':
      accuracy_modifier *= 0.92;
      injury_risk_modifier += 5;
      effects.push('Zonas molhadas tornam o jogo imprevisível');
      break;
    case 'umida':
      speed_modifier *= 0.93;
      defense_bonus += 2;
      effects.push('Quadra úmida favorece jogo defensivo');
      break;
    case 'poeirenta':
      accuracy_modifier *= 0.95;
      effects.push('Poeira reduz a velocidade da bola');
      break;
  }

  // UV index effects
  if (uv_index >= 9) {
    energy_cost_modifier *= 1.05;
    effects.push('UV extremo causa desgaste adicional');
  }

  const description = effects.length > 0 ? effects.join('; ') : 'Condições ideais para o padel';

  return {
    energy_cost_modifier: Math.round(energy_cost_modifier * 100) / 100,
    accuracy_modifier: Math.round(accuracy_modifier * 100) / 100,
    injury_risk_modifier,
    speed_modifier: Math.round(speed_modifier * 100) / 100,
    tactic_bonus,
    defense_bonus,
    description,
    effects,
  };
}

// ── Tournament Weather Enrichment ──────────────────────────────────────────

export function enrichTournamentWeather(tournament) {
  if (!tournament) return tournament;
  if (tournament.temperature !== undefined && tournament.weather_condition) return tournament;

  const weather = generateWeather(tournament.location, tournament.month);
  return { ...tournament, ...weather };
}

export async function ensureTournamentWeather(tournamentId) {
  try {
    const t = await base44.entities.Tournament.get(tournamentId);
    if (!t) return null;
    if (t.temperature !== undefined && t.weather_condition) return t;

    const weather = generateWeather(t.location, t.month);
    const updated = await base44.entities.Tournament.update(tournamentId, weather);
    return updated;
  } catch (e) {
    console.error('ensureTournamentWeather', e);
    return null;
  }
}

// ── Historical Statistics ──────────────────────────────────────────────────

export async function getWeatherStats(limit = 100) {
  try {
    const tournaments = await base44.entities.Tournament.filter({ status: 'finalizado' }, '-start_date', limit);
    const withWeather = (tournaments || []).filter(t => t.temperature !== undefined);

    if (withWeather.length === 0) return { total: 0 };

    const conditions = {};
    const courts = {};
    const locations = {};
    let tempSum = 0, humiditySum = 0, windSum = 0;

    withWeather.forEach(t => {
      const c = t.weather_condition || 'ensolarado';
      conditions[c] = (conditions[c] || 0) + 1;
      const cc = t.court_condition || 'seca';
      courts[cc] = (courts[cc] || 0) + 1;

      const loc = (t.location || 'Desconhecido').split(',')[0];
      if (!locations[loc]) locations[loc] = { count: 0, tempSum: 0, conditions: {} };
      locations[loc].count++;
      locations[loc].tempSum += t.temperature || 20;
      locations[loc].conditions[c] = (locations[loc].conditions[c] || 0) + 1;

      tempSum += t.temperature || 20;
      humiditySum += t.humidity || 50;
      windSum += t.wind_speed || 10;
    });

    return {
      total: withWeather.length,
      avgTemp: Math.round(tempSum / withWeather.length),
      avgHumidity: Math.round(humiditySum / withWeather.length),
      avgWind: Math.round(windSum / withWeather.length),
      conditions,
      courts,
      locations,
    };
  } catch (e) {
    console.error('getWeatherStats', e);
    return { total: 0 };
  }
}

// ── Forecast generation (upcoming tournaments) ─────────────────────────────

export async function getWeatherForecast(profileDate, limit = 10) {
  try {
    const tournaments = await base44.entities.Tournament.filter({ status: 'inscricoes' }, 'start_date', limit);
    return (tournaments || []).map(t => enrichTournamentWeather(t));
  } catch (e) {
    console.error('getWeatherForecast', e);
    return [];
  }
}