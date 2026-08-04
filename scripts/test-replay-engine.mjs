import { runReplayEngineTest } from '../src/gameplay/replay/ReplayEngineTest.js';
const result = await runReplayEngineTest();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
