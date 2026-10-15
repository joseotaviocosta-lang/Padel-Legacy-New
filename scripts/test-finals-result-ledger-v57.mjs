import assert from 'node:assert/strict';
import { runFinalsSeason } from './lib/finalsV57Harness.mjs';

const { sim } = await runFinalsSeason('v57-finals-ledger', true);
const finals = sim.tournaments.filter((tournament) => ['Circuit Finals', 'Legacy Finals'].includes(tournament.tier) && tournament.champion);
const resultIds = new Set((sim.rankingResultRows || []).map((row) => row.tournament_id));
assert.equal(finals.length, 2);
assert.equal(finals.every((tournament) => resultIds.has(tournament.id)), true, 'cada Finals resolvido grava resultados no ledger');
console.log('test-finals-result-ledger-v57: PASS');
