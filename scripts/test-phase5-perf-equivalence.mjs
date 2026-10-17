// CLOUD-5 — equivalência funcional da otimização de resolveTeamCourtSides.
// O oráculo abaixo é a implementação anterior (normalizeAthlete completo por
// chamada de penalidade); a nova deve devolver exatamente o mesmo resultado.
import assert from 'node:assert/strict';
import { normalizeAthlete, normalizeCourtSide, toLegacyCourtSide } from '../src/players/athleteSchema.js';
import { resolveTeamCourtSides } from '../src/players/teamCompatibility.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const nameOf = (athlete) => athlete?.sport_name || athlete?.name || 'Atleta';

function oraclePenalty(raw, assignedSide) {
  const athlete = normalizeAthlete(raw, { sourceType: raw?.source_type || 'career' });
  const preferred = normalizeCourtSide(athlete.preferred_side);
  if (preferred === 'flex' || preferred === assignedSide) return 0;
  const experience = clamp(athlete.side_experience?.[assignedSide], 0, 100) / 100;
  return clamp(Math.round(24 * (1 - athlete.side_flexibility) * (1 - experience * 0.55)), 3, 24);
}

function oracleResolve(playerA, playerB, { preservePlayerA = true } = {}) {
  const options = [{ a: 'right', b: 'left' }, { a: 'left', b: 'right' }]
    .map((option) => ({ ...option, penaltyA: oraclePenalty(playerA, option.a), penaltyB: oraclePenalty(playerB, option.b) }))
    .map((option) => ({ ...option, totalPenalty: option.penaltyA + option.penaltyB }));
  options.sort((x, y) => x.totalPenalty - y.totalPenalty || (preservePlayerA && x.a === normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) ? -1 : 1));
  const best = options[0];
  return {
    assignments: { playerA: best.a, playerB: best.b },
    legacyAssignments: { playerA: toLegacyCourtSide(best.a), playerB: toLegacyCourtSide(best.b) },
    penalties: { playerA: best.penaltyA, playerB: best.penaltyB, total: best.totalPenalty },
    naturalFit: best.totalPenalty === 0,
    explanation: best.totalPenalty === 0
      ? `${nameOf(playerA)} e ${nameOf(playerB)} ocupam lados naturais complementares.`
      : `${best.penaltyA >= best.penaltyB ? nameOf(playerA) : nameOf(playerB)} fará adaptação de lado; penalidade tática estimada em ${best.totalPenalty} pontos.`,
  };
}

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const sideValues = ['right', 'left', 'flex', 'direita', 'esquerda', 'Drive', ' revés ', 'ambos', 'xyz', '', null, undefined];
const numeric = () => pick([undefined, null, '', 'abc', -10, 0, 0.3, 0.9, 1, 1.7, 40, 100, 150, '55']);
const makeAthlete = (i) => ({
  id: `p${i}`, name: `Atleta ${i}`, ...(rnd() < 0.5 ? { sport_name: `Sport ${i}` } : {}),
  source_type: pick(['real', 'fictional', 'career', 'invalido', undefined]),
  preferred_side: pick(sideValues), court_side: pick(sideValues), position: pick(sideValues),
  side_flexibility: numeric(),
  side_experience: rnd() < 0.3 ? undefined : { right: numeric(), left: numeric() },
});

const athletes = Array.from({ length: 300 }, (_, i) => makeAthlete(i));
let compared = 0;
for (let i = 0; i < 20000; i += 1) {
  const a = pick(athletes);
  const b = pick(athletes);
  const preservePlayerA = rnd() < 0.5;
  const expected = oracleResolve(a, b, { preservePlayerA });
  const actual = resolveTeamCourtSides(a, b, { preservePlayerA });
  for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `divergência em ${key} (par ${a.id}/${b.id})`);
  compared += 1;
}
// Entradas ausentes continuam suportadas como antes (objeto vazio).
assert.deepEqual(resolveTeamCourtSides(undefined, undefined).penalties, oracleResolve(undefined, undefined).penalties);
// normalizeAthlete mantém o formato de side_experience/side_flexibility.
const normalized = normalizeAthlete({ name: 'X', preferred_side: 'left' });
assert.deepEqual(normalized.side_experience, { right: 30, left: 85 });
assert.equal(normalized.side_flexibility, 0.25);
console.log(`OK — ${compared} pares idênticos ao oráculo (implementação anterior).`);
