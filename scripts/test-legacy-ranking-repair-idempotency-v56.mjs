import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { athleteProfileOverallRepair } from '../src/players/athleteSchema.js';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildLegacyTeamRankingRepair } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { LOCAL_SEED } = await vite.ssrLoadModule('/src/local/localSeed.js');
  const legacyTeam = { id: 'ranking-001', team_key: 'mateo-tomas', player1_name: 'Mateo Ruiz', player2_name: 'Tomás Vidal' };
  const firstTeam = { ...legacyTeam, ...buildLegacyTeamRankingRepair(legacyTeam, LOCAL_SEED.AthleteProfile) };
  assert.equal(buildLegacyTeamRankingRepair(firstTeam, LOCAL_SEED.AthleteProfile), null);
  const legacyAthlete = { id: 'athlete-001', ranking_position: 74, overall: 78 };
  const firstAthlete = { ...legacyAthlete, ...athleteProfileOverallRepair(legacyAthlete) };
  assert.equal(athleteProfileOverallRepair(firstAthlete), null);
  console.log('test-legacy-ranking-repair-idempotency-v56: PASS');
} finally { await vite.close(); }
