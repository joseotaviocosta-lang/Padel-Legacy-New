import { runReplaySpritesTest } from '../src/gameplay/replay/sprites/ReplaySpritesTest.js';
const result = await runReplaySpritesTest(); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
