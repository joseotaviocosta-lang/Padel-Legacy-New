import { isAtLeastBetaOrRC } from './release-version-utils.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const analytics = fs.readFileSync(path.join(root, 'src/lib/betaAnalytics.js'), 'utf8');
const betaTools = fs.readFileSync(path.join(root, 'src/components/system/BetaTools.jsx'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const checks = [
  ['insights export', analytics.includes('export function getBetaTesterInsights')],
  ['feature catalog', analytics.includes('FEATURE_CATALOG') && analytics.includes("label: 'Imprensa'")],
  ['coverage calculation', analytics.includes('coverage') && analytics.includes('testerScore')],
  ['tester tab', betaTools.includes("['tester', 'Estatísticas']")],
  ['usage panel', betaTools.includes('Uso dos sistemas')],
  ['unused features', betaTools.includes('Ainda não descoberto')],
  ['complete export', betaTools.includes('Exportar estatísticas completas')],
  ['version', isAtLeastBetaOrRC(pkg.version, 41)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('BetaAnalyticsProV36Test: FAIL');
  failed.forEach(([name]) => console.error(`- ${name}`));
  process.exit(1);
}
console.log(`BetaAnalyticsProV36Test: PASS (${checks.length}/${checks.length})`);
