import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateFictionalAthletes } from '../src/players/athleteGenerator.js';
import { buildAthleteCatalog } from '../src/players/athleteCatalog.js';
import { normalizeAthlete, validateAthlete } from '../src/players/athleteSchema.js';
import { applySideAdaptation, calculatePartnershipInterest, evaluatePartnerCompatibility, resolveTeamCourtSides } from '../src/players/teamCompatibility.js';
import { getRealAthleteRegistry } from '../src/players/realAthleteRegistry.js';
import { FICTIONAL_ATHLETE_COUNT } from '../src/players/athleteCatalog.js';

// Fase 2A: a contagem de reais não é mais um número fixo no código (era
// 10, hardcoded aqui) — deriva do registro canônico, como o resto da base.
const realCount = getRealAthleteRegistry().length;

const catalog = buildAthleteCatalog({ includeReal: true });
assert.equal(catalog.length, realCount + FICTIONAL_ATHLETE_COUNT);
assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length, 'IDs must be unique');
assert(catalog.every(item => validateAthlete(item).valid), 'catalog athletes must validate');
assert.equal(catalog.filter(item => item.source_type === 'real').length, realCount);

const thousand = generateFictionalAthletes({ count: 1000, seed: 'distribution-test' });
const sideCounts = Object.groupBy ? Object.groupBy(thousand, item => item.preferred_side) : thousand.reduce((acc, item) => ((acc[item.preferred_side] ||= []).push(item), acc), {});
assert.equal(sideCounts.right.length, 450);
assert.equal(sideCounts.left.length, 450);
assert.equal(sideCounts.flex.length, 100);
assert.deepEqual(thousand, generateFictionalAthletes({ count: 1000, seed: 'distribution-test' }), 'generation must be deterministic');

const rightA = normalizeAthlete({ id: 'career-a', source_type: 'career', name: 'A', court_side: 'direita', overall: 60, side_flexibility: 0.15 });
const rightB = normalizeAthlete({ id: 'bot-b', name: 'B', preferred_side: 'right', overall: 62, side_flexibility: 0.2 });
const leftB = normalizeAthlete({ id: 'bot-c', name: 'C', preferred_side: 'left', overall: 62 });
const sameSide = resolveTeamCourtSides(rightA, rightB);
const complementary = resolveTeamCourtSides(rightA, leftB);
assert(sameSide.penalties.total > 0, 'same-side pair must have adaptation cost');
assert.equal(complementary.penalties.total, 0, 'complementary sides must be natural');
assert(evaluatePartnerCompatibility(rightA, leftB).total > evaluatePartnerCompatibility(rightA, rightB).total);
assert(applySideAdaptation(rightB, 'left', 2).side_experience.left > rightB.side_experience.left);

const elite = normalizeAthlete({ id: 'elite', name: 'Elite', preferred_side: 'left', overall: 96, world_rank: 2 });
const noviceInterest = calculatePartnershipInterest({ ...rightA, ranking_position: 1500, reputation: 5 }, elite);
const topInterest = calculatePartnershipInterest({ ...rightA, ranking_position: 5, reputation: 90, overall_rating: 92 }, elite);
assert(topInterest.score > noviceInterest.score, 'career progression must unlock elite interest');
assert.equal(topInterest.available, true, 'elite athletes are not permanently blocked');

const started = performance.now();
for (let i = 0; i < 10000; i += 1) evaluatePartnerCompatibility(thousand[i % thousand.length], thousand[(i + 1) % thousand.length]);
const duration = performance.now() - started;
assert(duration < 2500, `10k compatibility evaluations too slow: ${duration.toFixed(1)}ms`);

console.log(JSON.stringify({ success: true, catalog: catalog.length, generated: thousand.length, sides: Object.fromEntries(Object.entries(sideCounts).map(([key, value]) => [key, value.length])), tenThousandEvaluationsMs: Math.round(duration), noviceInterest: noviceInterest.score, topInterest: topInterest.score }, null, 2));
