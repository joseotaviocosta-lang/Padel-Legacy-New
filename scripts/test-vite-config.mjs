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
assert.doesNotMatch(portGuard, /Stop-Process|taskkill/i, 'port guard must never kill a live dev server');
assert.match(appSource, /ScrollToTop/);
assert.match(appSource, /AuthProvider/);
assert.doesNotMatch(appSource, /UnregisteredError/, 'obsolete module reference returned to the app graph');

console.log('ViteConfigTest: host, porta, HMR, Tauri, imports e protecao de processo aprovados.');
