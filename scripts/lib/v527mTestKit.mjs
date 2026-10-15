// Playthrough 5.27-M — kit dos testes *-v527m.
//
// - `withModules`: carrega módulos do jogo pelo Vite SSR (aliases '@/').
// - `gateRunner`: contador de gates no formato dos testes anteriores.
// - `onboarding(variant)`: evidência da reprodução headless do playtest
//   físico (scripts/repro-onboarding-v527m.mjs): 'continuous' (Conquistas
//   aberta no dia 1), 'no-panel-after' (sem abrir Conquistas — o caminho que
//   gerou ~7k no celular) e 'reload' (save/reload após inscrição, sorteio e
//   settlement). Gerada por `node scripts/run-tests-527m.mjs` antes dos testes.
// - `samplePlayerBracket`: chave de 8 do jogador, montada pelo MESMO
//   construtor do sorteio (buildPlayerTournamentBracket).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

export const ROOT = resolve('reports/release-527m');
export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

export function gateRunner(name) {
  let gates = 0; let failed = 0;
  const gate = (label, condition, detail = '') => {
    gates += 1;
    if (!condition) failed += 1;
    console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}${!condition && detail ? ` (${detail})` : ''}`);
  };
  const finish = () => {
    if (failed) { console.error(`${name}: ${failed}/${gates} falharam`); process.exit(1); }
    console.log(`${name}: ${gates}/${gates} passaram`);
    process.exit(0);
  };
  return { gate, finish };
}

export async function withModules(paths, work) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  try {
    const mods = {};
    for (const [key, p] of Object.entries(paths)) mods[key] = await server.ssrLoadModule(p);
    return await work(mods);
  } finally { await server.close(); }
}

export function onboarding(variant) {
  const file = join(ROOT, `onboarding-${variant}.json`);
  if (!existsSync(file)) throw new Error(`Evidência ausente: ${file} — rode node scripts/run-tests-527m.mjs`);
  return readJson(file);
}

export const PLAYER = 'Atleta Teste & Parceiro Teste';
export function samplePlayerBracket(settlement, tournamentId = 'tour-527m') {
  return settlement.buildPlayerTournamentBracket({
    tournamentId,
    roundDates: ['2026-01-12', '2026-01-13', '2026-01-14'],
    playerTeamName: PLAYER,
    mainOpponents: [{ name: 'Rival QF A & Rival QF B' }, { name: 'Rival SF A & Rival SF B' }, { name: 'Rival F A & Rival F B' }],
    fillerFactory: (count, k) => Array.from({ length: count }, (_, i) => ({ name: `Dupla ${k}-${i} A & Dupla ${k}-${i} B`, strength: 100 + i })),
  });
}
