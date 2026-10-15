// Playthrough 5.27-F, Bloco G (item 35) — tabela de pontos de ranking por tier,
// lida do catálogo real (circuitCatalog.getTournamentTierConfig). Só leitura.
//   node scripts/diag-ranking-points-v527f.mjs [--out=reports/rebalance-527f/ranking-points-by-tier.csv]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';
import { installBrowserShim } from './lib/v526CareerSim.mjs';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? 'reports/rebalance-527f/ranking-points-by-tier.csv';
if (process.env.PL527_PRESET) globalThis.__PL527_PRESET = process.env.PL527_PRESET;
installBrowserShim();
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
const catalog = await server.ssrLoadModule('/src/lib/circuitCatalog.js');
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const rows = [['tier', 'minRanking', 'mainDrawSize', 'roundCount', 'championPoints', 'r1LossPoints', 'firstWinPoints', 'firstWinDelta', 'titlePoints', 'qualifyingLossPoints', 'roundPoints']];
for (const tier of TIERS) {
  const c = catalog.getTournamentTierConfig(tier);
  const rp = c.roundPoints || [];
  rows.push([tier, c.minRanking || 0, c.mainDrawSize, c.roundCount, c.rankPoints, rp[0], rp[1], (rp[1] ?? 0) - (rp[0] ?? 0), rp.at(-1), c.qualifyingPoints ?? c.qualifying_points ?? 0, `"${rp.join(' ')}"`]);
}
await server.close();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${rows.map((r) => r.join(',')).join('\n')}\n`);
for (const r of rows) console.log(r.map((x) => String(x).padStart(10)).join(''));
