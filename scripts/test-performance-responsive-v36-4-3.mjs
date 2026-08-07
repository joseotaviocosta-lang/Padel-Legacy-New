import fs from 'node:fs';
import { isAtLeastBetaOrRC } from './release-version-utils.mjs';

const checks = [
  ['src/hooks/useAdaptivePerformance.js', ['allowDecorativeMotion', 'allowRoutePreload', 'visibilitychange']],
  ['src/components/AppLayout.jsx', ['useAdaptivePerformance', 'performanceProfile.allowDecorativeMotion', 'performanceProfile.allowRoutePreload']],
  ['src/components/design-system/Page.jsx', ['pl-auto-contain']],
  ['src/index.css', ['v36.4.3 — Performance & Responsiveness', 'content-visibility: auto', 'max-height: 720px']],
  ['package.json', ['test:performance-responsive-v36']],
];

const failures = [];
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!isAtLeastBetaOrRC(pkg.version, 38)) failures.push(`package.json: versão incompatível ${pkg.version}`);
for (const [file, fragments] of checks) {
  if (!fs.existsSync(file)) {
    failures.push(`${file}: ausente`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  for (const fragment of fragments) {
    if (!content.includes(fragment)) failures.push(`${file}: não contém ${fragment}`);
  }
}

if (failures.length) {
  console.error('PerformanceResponsiveV36_4_3Test: FAIL');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('PerformanceResponsiveV36_4_3Test: PASS (5/5)');
