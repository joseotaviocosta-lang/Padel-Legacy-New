import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { validateTeamRankingIntegrity, buildLegacyTeamRankingRepair } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { LOCAL_SEED } = await vite.ssrLoadModule('/src/local/localSeed.js');
  assert.equal(validateTeamRankingIntegrity(LOCAL_SEED.TeamRanking, LOCAL_SEED.AthleteProfile).ok, true);
  const oldRows = [
    { id: 'ranking-001', team_key: 'mateo-tomas', player1_name: 'Mateo Ruiz', player2_name: 'Tomás Vidal' },
    { id: 'ranking-002', team_key: 'lucas-rafael', player1_name: 'Lucas Ferraz', player2_name: 'Rafael Martins' },
  ];
  assert.equal(validateTeamRankingIntegrity(oldRows, LOCAL_SEED.AthleteProfile).issues.every((issue) => issue.recoverable), true);
  assert.equal(buildLegacyTeamRankingRepair(oldRows[0], LOCAL_SEED.AthleteProfile).team_key, 'athlete-001_athlete-003');
  console.log('test-team-ranking-legacy-integrity-v56: PASS');
} finally { await vite.close(); }
