import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { validateAthleteProfileRankingIntegrity } = await vite.ssrLoadModule('/src/players/athleteSchema.js');
  const { LOCAL_SEED } = await vite.ssrLoadModule('/src/local/localSeed.js');
  const report = validateAthleteProfileRankingIntegrity(LOCAL_SEED.AthleteProfile);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.ok(report.checked >= 6);
  for (const athlete of LOCAL_SEED.AthleteProfile.filter((row) => /^athlete-00[1-6]$/.test(row.id))) {
    assert.equal(athlete.overall_rating, athlete.overall, athlete.name);
  }
  console.log('test-athlete-profile-ranking-integrity-v56: PASS');
} finally { await vite.close(); }
