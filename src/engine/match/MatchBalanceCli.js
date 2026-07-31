import { runBalanceBatch } from './BalanceSimulator.js';

const matchesArg = process.argv.find((arg) => arg.startsWith('--matches='));
const matches = matchesArg ? Number(matchesArg.split('=')[1]) : 1000;
const report = runBalanceBatch({ matches, seedPrefix: 'v040-cli-balance', alternateSides: true });
console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
