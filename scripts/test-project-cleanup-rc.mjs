import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

function walk(relative, output = []) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(child, output);
    else if (/\.(?:js|jsx|mjs|ts|tsx|css)$/.test(entry.name)) output.push(child.replaceAll('\\', '/'));
  }
  return output;
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return true;
  const base = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : path.resolve(root, path.dirname(importer), specifier);
  const candidates = [
    base,
    ...['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css', '.json'].map(extension => `${base}${extension}`),
    ...['index.js', 'index.jsx', 'index.mjs', 'index.ts', 'index.tsx'].map(file => path.join(base, file)),
  ];
  return candidates.some(candidate => fs.existsSync(candidate));
}

const app = read('src/App.jsx');
const navigation = read('src/navigation/navigationConfig.js');
const routeModules = read('src/lib/routeModules.js');
const packageJson = JSON.parse(read('package.json'));
const sourceFiles = walk('src');
const codeFiles = [...sourceFiles, ...walk('scripts'), ...walk('tests')];

assert(!navigation.includes('Circuito ao vivo'), 'Circuito ao vivo ainda aparece no menu.');
assert(!navigation.includes('/world-tour/live'), 'A rota antiga ainda aparece na navegação.');
assert.match(app, /path="\/world-tour\/live" element=\{<Navigate to="\/tournaments" replace \/>\}/, 'A rota /world-tour/live não redireciona com segurança.');
assert.match(app, /path="\/live-circuit" element=\{<Navigate to="\/tournaments" replace \/>\}/, 'O alias /live-circuit não redireciona com segurança.');
assert(!app.includes('WorldSpectator'), 'WorldSpectator ainda está montado no runtime.');
assert(!routeModules.includes('WorldSpectator'), 'WorldSpectator ainda está no registro de módulos.');

const removedPaths = [
  'src/pages/WorldSpectator.jsx',
  'src/pages/ReplayLibrary.jsx',
  'src/pages/dev/SpritePreview.jsx',
  'src/components/matches/ReplayPanel.jsx',
  'src/components/matches/BroadcastHUD.jsx',
  'src/pages/Landing.jsx',
  'src/pages/SeasonDashboard.jsx',
];
for (const relative of removedPaths) assert(!exists(relative), `Arquivo obsoleto ainda existe: ${relative}`);
assert.equal(walk('src/gameplay/replay').length, 0, 'A família gameplay/replay ainda possui arquivos.');

const obsoleteScripts = [
  'test:replay',
  'test:replay-gameplay',
  'test:replay-sprites',
  'test:replay-broadcast',
  'test:replay-career',
  'test:replay-spectator',
];
for (const name of obsoleteScripts) assert(!(name in packageJson.scripts), `Script obsoleto ainda registrado: ${name}`);
assert.equal(packageJson.scripts['test:match-playback'], 'node scripts/test-match-playback-tactics.mjs', 'O teste da partida narrada foi removido ou alterado indevidamente.');

const forbiddenImportFragments = [
  'gameplay/replay',
  'ReplayPanel',
  'BroadcastHUD',
  'WorldSpectator',
  'SpritePreview',
];
const importPatterns = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const unresolved = [];
const forbiddenImports = [];
const runtimeFiles = new Set(sourceFiles);
for (const file of codeFiles) {
  const content = read(file);
  for (const expression of importPatterns) {
    for (const match of content.matchAll(expression)) {
      const specifier = match[1];
      if (forbiddenImportFragments.some(fragment => specifier.includes(fragment))) forbiddenImports.push(`${file}: ${specifier}`);
      if (runtimeFiles.has(file) && !resolveLocalImport(file, specifier)) unresolved.push(`${file}: ${specifier}`);
    }
  }
}
assert.deepEqual(forbiddenImports, [], `Imports do sistema removido encontrados:\n${forbiddenImports.join('\n')}`);
assert.deepEqual(unresolved, [], `Imports locais sem destino encontrados:\n${unresolved.join('\n')}`);

for (const provider of ['ReplayProvider', 'SpectatorProvider', 'LegacyWorldProvider']) {
  assert(!sourceFiles.some(file => read(file).includes(provider)), `Provider morto ainda presente: ${provider}`);
}

const loaderImports = [...routeModules.matchAll(/import\(['"]@\/pages\/([^'"]+)['"]\)/g)].map(match => match[1]);
assert(loaderImports.length > 30, 'O registro de rotas ativas parece incompleto.');
for (const modulePath of loaderImports) {
  assert(resolveLocalImport('src/lib/routeModules.js', `@/pages/${modulePath}`), `Loader de rota sem componente: ${modulePath}`);
}

const liveMatch = read('src/components/matches/LiveMatch.jsx');
const matchEngine = read('src/engine/match/MatchEngine.js');
assert(liveMatch.includes('PlaybackControls') && liveMatch.includes('state.narration'), 'Playback/narração da partida atual não foi preservado.');
assert(matchEngine.includes('narration: []') && matchEngine.includes('activeTactics'), 'Motor narrado ou táticas foram removidos.');

console.log(JSON.stringify({
  ok: true,
  sourceFilesChecked: sourceFiles.length,
  codeFilesChecked: codeFiles.length,
  activeRouteLoadersChecked: loaderImports.length,
  legacyRoutesRedirected: ['/world-tour/live', '/live-circuit'],
  obsoleteScriptsRemoved: obsoleteScripts.length,
  matchPlaybackPreserved: true,
}, null, 2));
