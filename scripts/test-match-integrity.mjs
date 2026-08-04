import { runMatchIntegrityTest } from '../src/engine/match/MatchIntegrityTest.js';
const result = await runMatchIntegrityTest();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
