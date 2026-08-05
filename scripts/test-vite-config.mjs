import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [viteConfig, packageJson, tauriConfig, portGuard, appSource] = await Promise.all([
  readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./free-dev-port.ps1', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
]);

assert.match(viteConfig, /host:\s*['"]127\.0\.0\.1['"]/);
assert.match(viteConfig, /port:\s*5174/);
assert.match(viteConfig, /strictPort:\s*true/);
assert.doesNotMatch(viteConfig, /hmr\s*:/, 'local HMR must use Vite defaults');
assert.equal(packageJson.scripts.dev, 'vite');
assert.equal(tauriConfig.build.devUrl, 'http://127.0.0.1:5174');
assert.match(tauriConfig.build.beforeDevCommand, /dev:tauri/);
assert.match(portGuard, /REUSE_EXISTING_SERVER/, 'port guard must reuse a healthy Padel Legacy dev server');
assert.match(portGuard, /Is-ProjectOwnedProcess/, 'port guard must identify project-owned stale processes before termination');
assert.match(portGuard, /TerminateStaleProjectProcess/, 'automatic termination must be explicitly controlled');
assert.doesNotMatch(portGuard, /taskkill\s+\/F\s+\/IM\s+node\.exe/i, 'port guard must never kill every Node process');
const reuseIndex = portGuard.indexOf('REUSE_EXISTING_SERVER');
const stopIndex = portGuard.indexOf('Stop-Process');
assert.ok(reuseIndex >= 0 && stopIndex > reuseIndex, 'healthy-server reuse must be evaluated before stale-process termination');
assert.match(appSource, /ScrollToTop/);
assert.match(appSource, /AuthProvider/);
assert.doesNotMatch(appSource, /UnregisteredError/, 'obsolete module reference returned to the app graph');

console.log('ViteConfigTest: host, porta, HMR, Tauri, imports e protecao de processo aprovados.');
