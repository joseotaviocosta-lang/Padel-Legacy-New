import fs from 'node:fs';
const required = [
  ['src/lib/betaAnalytics.js', ['MAX_SESSIONS = 50', 'MAX_EVENTS = 2000', 'trackBetaScreen', 'trackBetaEvent', 'buildBetaAnalyticsExport']],
  ['src/components/system/BetaAnalyticsTracker.jsx', ['padel:day-advanced', 'trackBetaScreen', 'beforeunload']],
  ['src/components/system/BetaTools.jsx', ["['analytics', 'Sessão atual']", 'Estatísticas do testador', 'Exportar sessão']],
  ['src/components/AppLayout.jsx', ['<BetaAnalyticsTracker />']],
];
let passed = 0;
for (const [file, needles] of required) {
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) throw new Error(`${file}: ausente ${needle}`);
    passed++;
  }
}
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
if (!pkg.scripts['test:beta-analytics']) throw new Error('script test:beta-analytics ausente');
if (pkg.version !== '0.9.0-beta.40') throw new Error(`versão inesperada: ${pkg.version}`);
console.log(`BetaAnalyticsV36Test: PASS (${passed + 2}/${passed + 2})`);
