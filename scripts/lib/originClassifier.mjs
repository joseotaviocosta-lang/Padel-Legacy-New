// Playthrough 5.15, Parte A — classificação de ORIGEM por procedência real,
// nunca por heurística de nome.
//
// REAL:       AthleteProfile cujo `bot_id` está no registro curado
//             (src/data/realAthletesRegistry.json, via getRealAthleteRegistry).
//             É exatamente a chave que saveFoundation.js usa no upsert.
// PROCEDURAL: qualquer outro — na prática os suplementares gerados por
//             rankingPopulation.js (`bot_id: ranking-bot-NNNN`).
export const ORIGIN = Object.freeze({ REAL: 'REAL', PROCEDURAL: 'PROCEDURAL' });
export const PAIR_ORIGIN = Object.freeze({ RR: 'RR', RP: 'RP', PP: 'PP', UNKNOWN: 'UNKNOWN' });

export async function buildOriginIndex(vite, athletes) {
  const { getRealAthleteRegistry } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const registry = getRealAthleteRegistry() || [];
  const realBotIds = new Set(registry.map((a) => a.bot_id).filter(Boolean));
  const realNames = new Set(registry.map((a) => String(a.name || '').trim().toLowerCase()).filter(Boolean));

  const originById = new Map();
  for (const athlete of athletes || []) {
    const isReal = athlete?.bot_id ? realBotIds.has(athlete.bot_id) : false;
    originById.set(athlete.id, isReal ? ORIGIN.REAL : ORIGIN.PROCEDURAL);
  }
  return { registry, realBotIds, realNames, originById, registrySize: registry.length };
}

export function classifyPair(originById, player1Id, player2Id) {
  const a = originById.get(player1Id);
  const b = originById.get(player2Id);
  if (!a || !b) return PAIR_ORIGIN.UNKNOWN;
  if (a === ORIGIN.REAL && b === ORIGIN.REAL) return PAIR_ORIGIN.RR;
  if (a === ORIGIN.PROCEDURAL && b === ORIGIN.PROCEDURAL) return PAIR_ORIGIN.PP;
  return PAIR_ORIGIN.RP;
}

export function originMix(rows, originById, { limit = rows.length } = {}) {
  const slice = rows.slice(0, limit);
  const counts = { RR: 0, RP: 0, PP: 0, UNKNOWN: 0 };
  for (const row of slice) {
    counts[classifyPair(originById, row.player1_id, row.player2_id)] += 1;
  }
  const total = slice.length || 1;
  return {
    ...counts,
    total: slice.length,
    pctRR: (counts.RR / total) * 100,
    pctRP: (counts.RP / total) * 100,
    pctPP: (counts.PP / total) * 100,
  };
}

export function formatMix(label, mix) {
  return `${label.padEnd(8)} RR=${String(mix.RR).padStart(3)} (${mix.pctRR.toFixed(0).padStart(3)}%)  `
    + `RP=${String(mix.RP).padStart(3)} (${mix.pctRP.toFixed(0).padStart(3)}%)  `
    + `PP=${String(mix.PP).padStart(3)} (${mix.pctPP.toFixed(0).padStart(3)}%)`;
}
