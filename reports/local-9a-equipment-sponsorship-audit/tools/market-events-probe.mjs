// LOCAL-9A — eventos de mercado e histórico de preços numa carreira nova (storage de MEMÓRIA).
// Verifica: quais MarketEvent existem após a ativação real (seedMarket), quantos estão vigentes
// em datas da carreira, e se algo no avanço diário os renova (processMarketTick não tem chamador).
// Uso: node reports/local-9a-equipment-sponsorship-audit/tools/market-events-probe.mjs
import { writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootCareer } from '../../../scripts/lib/v526bTestKit.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { rt, profile } = await bootCareer('local-9a-market');
const report = { generatedBy: 'LOCAL-9A market-events-probe' };
try {
  const market = await rt.load('/src/lib/marketEngine.js');
  const promo = await rt.load('/src/lib/marketPromotion.js');
  const E = rt.localGame.entities;
  report.seedResult = await market.seedMarket(profile.career_date);
  const events = (await E.MarketEvent.list()) || [];
  report.events = events.map((e) => ({ id: e.id, title: e.title, start: e.start_date, end: e.end_date, is_active: e.is_active, modifier: e.price_modifier }));
  report.activeByDate = Object.fromEntries(['2026-01-01', '2026-01-08', '2026-01-15', '2026-03-01', '2027-06-01'].map((d) => [d, events.filter((e) => promo.isMarketEventActive(promo.normalizeMarketEvent(e), d)).length]));
  const hist = (await E.MarketPriceHistory.list()) || [];
  report.priceHistory = { rows: hist.length, limitedStock: hist.filter((h) => h.is_limited_stock).length };
  // Chamadores de processMarketTick em src/ (varredura de texto).
  const callers = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f) && /processMarketTick\(/.test(readFileSync(p, 'utf8')) && !p.endsWith('marketEngine.js')) callers.push(p); } };
  walk('src');
  report.processMarketTickCallers = callers;
} finally {
  await rt.close();
}
writeFileSync(resolve(OUT, 'market-events-probe.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
