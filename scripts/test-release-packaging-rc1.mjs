import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
const lock = fs.readFileSync('src-tauri/Cargo.lock', 'utf8');

const checks = [
  ['app release identity preserved', pkg.version === '0.9.0-rc.1.5'],
  ['desktop installer version synchronized', tauri.version === '0.9.0'],
  ['product name', tauri.productName === 'Padel Legacy'],
  ['stable identifier', tauri.identifier === 'com.padellegacy.game'],
  ['Windows MSI target', Array.isArray(tauri.bundle?.targets) && tauri.bundle.targets.includes('msi')],
  ['Windows NSIS target', Array.isArray(tauri.bundle?.targets) && tauri.bundle.targets.includes('nsis')],
  ['Cargo version synchronized', /^version = "0\.9\.0"$/m.test(cargo)],
  ['Cargo lock synchronized', /name = "padel-legacy"\nversion = "0\.9\.0"/.test(lock)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`ReleasePackagingRC1Test: FAIL (${failed}/${checks.length})`);
  process.exit(1);
}
console.log(`ReleasePackagingRC1Test: PASS (${checks.length}/${checks.length})`);
