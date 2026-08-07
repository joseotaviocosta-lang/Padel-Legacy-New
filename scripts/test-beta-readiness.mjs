import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';

const checks = [
  ['Missões', 'scripts/test-mission-system-v2.mjs'],
  ['Onboarding', 'scripts/test-onboarding-v2.mjs'],
  ['Cronologia do tutorial', 'scripts/test-tutorial-chronology.mjs'],
  ['Jogadores', 'scripts/test-player-system.mjs'],
  ['Integridade das partidas', 'scripts/test-match-integrity.mjs'],
  ['Configuração Vite', 'scripts/test-vite-config.mjs'],
];

for (const [name, script] of checks) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 120_000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${name} falhou (${script}).`);
}

for (const path of [
  'src/components/system/BetaErrorBoundary.jsx',
  'src/components/system/BetaTools.jsx',
  'src/lib/betaDiagnostics.js',
  'src/App.jsx',
]) await access(path);

const app = await readFile('src/App.jsx', 'utf8');
assert.match(app, /BetaErrorBoundary/);
assert(!app.includes('ReplayLibrary'), 'Replay não deve voltar às rotas públicas da versão beta.');

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(packageJson.version, /(?:beta|rc)/i, 'A versão deve estar identificada como beta ou release candidate.');

console.log(`BetaReadiness: ${checks.length} suítes essenciais aprovadas; versão ${packageJson.version}.`);
