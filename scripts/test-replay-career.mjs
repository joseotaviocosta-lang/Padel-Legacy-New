import { runReplayCareerIntegrationTest } from '../src/gameplay/replay/library/ReplayCareerIntegrationTest.js';
const result=await runReplayCareerIntegrationTest();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
