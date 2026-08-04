import { runReplayGameplayTest } from '../src/gameplay/replay/ReplayGameplayTest.js';
const result = await runReplayGameplayTest(); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
