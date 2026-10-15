import assert from 'node:assert/strict';
import { athleteProfileOverallRepair, validateAthleteProfileRankingIntegrity } from '../src/players/athleteSchema.js';

const legacy = { id: 'legacy', ranking_position: 74, overall: 78 };
assert.deepEqual(athleteProfileOverallRepair(legacy), { overall_rating: 78 });
const repaired = { ...legacy, ...athleteProfileOverallRepair(legacy) };
assert.equal(validateAthleteProfileRankingIntegrity([repaired]).ok, true);
assert.equal(athleteProfileOverallRepair({ ...repaired, overall: 12 }), null, 'valid modern OVR is never overwritten');
assert.equal(athleteProfileOverallRepair({ ranking_position: 1 }), null, 'no invented OVR without evidence');
console.log('test-athlete-profile-ovr-repair-v56: PASS');
