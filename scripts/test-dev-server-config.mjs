import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEV_PORT,
  PROJECT_ROOT,
  isRecognizedProjectViteProcess,
  parseWindowsNetstat,
} from './dev-port-manager.mjs';
import { resolveDevServerHost } from './vite-dev-host.mjs';

const rootUrl = new URL('..', import.meta.url);
const [viteConfig, packageJson, tauriConfig, manager, watchdog, appRunner, viteRunner, appSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./dev-port-manager.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./dev-session-watchdog.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./run-app-dev.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./run-vite-dev.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
]);

assert.equal(DEV_PORT, 5174);
assert.equal(
  resolveDevServerHost({}),
  '127.0.0.1',
  'desktop deve continuar restrito ao loopback',
);
assert.equal(
  resolveDevServerHost({ TAURI_DEV_HOST: '192.0.2.14' }),
  '192.0.2.14',
  'Tauri mobile deve definir o bind pela rede sem IP hardcoded',
);
assert.equal(
  resolveDevServerHost({ TAURI_DEV_HOST: ' 192.0.2.15 ' }),
  '192.0.2.15',
  'TAURI_DEV_HOST deve ser normalizado antes do bind',
);
assert.match(viteConfig, /resolveDevServerHost\(\)/);
assert.match(viteConfig, /port:\s*5174/);
assert.match(viteConfig, /strictPort:\s*true/);
assert.doesNotMatch(viteConfig, /hmr\s*:/, 'HMR local deve usar os padrões do Vite');
assert.equal(tauriConfig.build.devUrl, 'http://127.0.0.1:5174');
assert.equal(tauriConfig.build.beforeDevCommand, 'npm run dev:tauri');

assert.equal(packageJson.scripts.dev, 'node scripts/run-vite-dev.mjs');
assert.equal(packageJson.scripts['dev:tauri'], 'node scripts/run-vite-dev.mjs --mode desktop');
assert.equal(packageJson.scripts['dev:local'], 'node scripts/run-vite-dev.mjs --mode desktop');
assert.equal(packageJson.scripts['dev:prepare'], 'node scripts/prepare-dev-port.mjs');
assert.equal(packageJson.scripts['app:dev'], 'node scripts/run-app-dev.mjs');
assert.equal(packageJson.scripts['dev:status'], 'node scripts/dev-server-status.mjs');
assert.equal(packageJson.scripts['dev:cleanup'], 'node scripts/cleanup-dev-server.mjs');
assert.equal(packageJson.scripts.build, 'vite build', 'build web não pode depender do gerenciador DEV');
assert.equal(packageJson.scripts['app:build'], 'tauri build', 'build Tauri não pode depender do gerenciador DEV');

assert.match(appRunner, /prepareDevPort/);
assert.match(appRunner, /superviseDevProcess/);
assert.match(viteRunner, /prepareDevPort/);
assert.match(manager, /dev-session-watchdog/);
assert.match(watchdog, /PADEL_DEV_SUPERVISOR_PIDS/);
assert.match(viteRunner, /getAncestorProcessIds/);
assert.match(appRunner, /getAncestorProcessIds/);
assert.match(watchdog, /terminateSpawnedProcessTree/);
assert.match(manager, /SIGINT/);
assert.match(manager, /SIGTERM/);
assert.match(manager, /taskkill\.exe/);
assert.match(manager, /\['\/PID', String\(pid\), '\/T', '\/F'\]/);
assert.doesNotMatch(manager, /\/IM[\s'",]+node(?:\.exe)?/i, 'cleanup nunca pode matar todos os processos Node');
assert.doesNotMatch(manager, /Stop-Process[\s\S]*ProcessName/i, 'cleanup não pode encerrar por nome genérico');

const vitePath = path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
assert.equal(isRecognizedProjectViteProcess({
  name: 'node.exe',
  commandLine: `"${process.execPath}" "${vitePath}" --mode desktop`,
}), true, 'Vite deste checkout deve ser reconhecido');
assert.equal(isRecognizedProjectViteProcess({
  name: 'node.exe',
  commandLine: `"node" "${PROJECT_ROOT}\\node_modules\\.bin\\..\\vite\\bin\\vite.js"`,
}), true, 'Vite iniciado pelo shim do npm deve ser reconhecido');
assert.equal(isRecognizedProjectViteProcess({
  name: 'node.exe',
  commandLine: 'node -e "require(\'net\').createServer().listen(5174)"',
}), false, 'Node desconhecido não pode ser reconhecido como Vite do projeto');
assert.equal(isRecognizedProjectViteProcess({
  name: 'node.exe',
  commandLine: 'C:\\outro-projeto\\node_modules\\vite\\bin\\vite.js',
}), false, 'Vite de outro projeto não pode ser encerrado');

const parsedPids = parseWindowsNetstat([
  '  TCP    127.0.0.1:5174    0.0.0.0:0    LISTENING    12345',
  '  TCP    127.0.0.1:5175    0.0.0.0:0    LISTENING    99999',
  '  TCP    [::1]:5174        [::]:0       LISTENING    12345',
].join('\r\n'), 5174);
assert.deepEqual(parsedPids, [12345]);

assert.doesNotMatch(appSource, /dev-port-manager|prepareDevPort|5174/, 'runtime do jogo não pode importar lógica DEV');
assert.equal(fileURLToPath(rootUrl), `${PROJECT_ROOT}${path.sep}`);

console.log('DevServerConfigTest: porta sincronizada, diagnóstico, cleanup seguro e isolamento de produção aprovados.');
