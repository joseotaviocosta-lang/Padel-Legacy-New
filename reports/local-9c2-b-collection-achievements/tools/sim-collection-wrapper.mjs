// LOCAL-9C.2-B — roda o simulador LOCAL-9E.1 (scripts/sim-local-9e1-decisions.mjs)
// com a liberação das recompensas de coleção ligada ou desligada, sem alterar
// o simulador. O Vite SSR do simulador roda no mesmo processo, então a chave
// global chega ao achievementEngine real.
//
// Uso: node reports/local-9c2-b-collection-achievements/tools/sim-collection-wrapper.mjs --collection=on|off <args do simulador>
const flag = process.argv.find((a) => a.startsWith('--collection='))?.split('=')[1];
globalThis.__PL9C2B_COLLECTION_REWARDS = flag === 'on';
process.argv = process.argv.filter((a) => !a.startsWith('--collection='));
await import('../../../scripts/sim-local-9e1-decisions.mjs');
