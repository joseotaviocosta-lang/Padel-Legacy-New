import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const checks = [];
function check(name, ok) {
  checks.push([name, Boolean(ok)]);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
}

const pkg = JSON.parse(read('package.json'));
const betaTools = read('src/components/system/BetaTools.jsx');
const welcome = read('src/components/system/BetaWelcome.jsx');
const candidate = read('src/lib/betaCandidate.js');
const layout = read('src/components/AppLayout.jsx');

check('RC1 version', /^0\.9\.0-rc\.1(?:\.\d+)?$/.test(pkg.version));
check('candidate test script', pkg.scripts?.['test:closed-beta-candidate']?.includes('test-closed-beta-candidate-rc1.mjs'));
check('first run welcome', welcome.includes('Bem-vindo ao Padel Legacy') && candidate.includes('CLOSED_BETA_CHANGELOG'));
check('welcome wired into app shell', layout.includes('<BetaWelcome />'));
check('separate suggestion flow', betaTools.includes("mode === 'suggestion'") && betaTools.includes('Exportar sugestão'));
check('system rating flow', betaTools.includes("mode === 'rating'") && betaTools.includes('Você jogaria mais uma hora agora?'));
check('changelog visible', betaTools.includes("mode === 'changelog'") && betaTools.includes('Changelog da Closed Beta'));
check('local privacy', candidate.includes('localStorage') && !candidate.includes('fetch('));
check('feature freeze copy', candidate.includes('Feature freeze ativo'));

const failed = checks.filter(([, ok]) => !ok);
console.log(`ClosedBetaCandidateRC1Test: ${failed.length ? 'FAIL' : 'PASS'} (${checks.length - failed.length}/${checks.length})`);
if (failed.length) process.exit(1);
