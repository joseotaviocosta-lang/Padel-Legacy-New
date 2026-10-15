// Playthrough 5.22-E — harness compartilhado dos testes da regra de duplas.
//
// Sobe um Vite em middleware mode para carregar `teamRanking.js` (que usa o
// alias `@/`) e troca `localGame.entities` por um store em memória, de forma
// que os testes exercitem a lógica REAL (materialização, repair, rank) sem
// depender de save em disco. O mesmo padrão de `test-team-ranking-*-v511`.
import { createServer } from 'vite';

export async function loadTeamRankingModules() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const teamRanking = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const formula = await vite.ssrLoadModule('/src/lib/teamRankingFormula.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  return { vite, teamRanking, formula, localGame };
}

function matchesQuery(row, query = {}) {
  return Object.entries(query || {}).every(([key, value]) => {
    if (value && typeof value === 'object' && Array.isArray(value.$in)) return value.$in.includes(row[key]);
    return row[key] === value;
  });
}

// Store genérico com a superfície que os writers/leitores de TeamRanking usam.
export function createEntityStore(seed = {}) {
  const state = { TeamRanking: [], AthleteProfile: [], ...seed };
  const entityFor = (name) => {
    if (!state[name]) state[name] = [];
    return {
      list: async () => [...state[name]],
      filter: async (query) => state[name].filter((row) => matchesQuery(row, query)),
      get: async (id) => state[name].find((row) => row.id === id) || null,
      create: async (data) => {
        const row = { id: data.id || `${name}-${state[name].length + 1}`, ...data };
        state[name].push(row);
        return row;
      },
      update: async (id, patch) => {
        const row = state[name].find((item) => item.id === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      delete: async (id) => {
        const index = state[name].findIndex((row) => row.id === id);
        if (index >= 0) state[name].splice(index, 1);
        return true;
      },
      bulkCreate: async (rows) => {
        for (const data of rows) {
          const row = { id: data.id || `${name}-${state[name].length + 1}`, ...data };
          state[name].push(row);
        }
        return rows;
      },
      bulkUpdate: async (rows) => {
        for (const { id, ...patch } of rows) {
          const row = state[name].find((item) => item.id === id);
          if (row) Object.assign(row, patch);
        }
        return rows;
      },
    };
  };
  const entities = new Proxy({}, {
    get(_target, entityName) {
      if (typeof entityName !== 'string') return undefined;
      return entityFor(entityName);
    },
  });
  return { state, entities };
}

export function installEntityStore(localGame, seed) {
  const store = createEntityStore(seed);
  localGame.entities = store.entities;
  return store;
}

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

export function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

export function finish(label) {
  console.log(`\n=== ${label}: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log(`${label}: PASS`);
}
