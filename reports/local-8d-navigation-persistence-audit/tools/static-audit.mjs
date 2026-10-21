// LOCAL-8D — auditoria ESTÁTICA (só leitura do código-fonte).
//   1. inventário de rotas (App.jsx) e abas dos hubs (ConsolidatedHub);
//   2. para cada página/componente: funções chamadas com `await` que vêm de
//      módulos do projeto; resolve a definição exportada e procura, no corpo
//      (e um nível abaixo), chamadas de escrita e fontes de aleatoriedade.
// É uma triagem: "escreve" aqui significa "o corpo contém uma chamada de
// escrita", não que a escrita aconteça sempre — a confirmação é dinâmica.
// Uso: node reports/local-8d-navigation-persistence-audit/tools/static-audit.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = 'reports/local-8d-navigation-persistence-audit';
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SRC = walk(join(ROOT, 'src')).filter((f) => /\.(jsx?|mjs)$/.test(f));
const text = new Map(SRC.map((f) => [f, readFileSync(f, 'utf8')]));
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');

// ── Rotas ────────────────────────────────────────────────────────────────
const app = readFileSync('src/App.jsx', 'utf8');
const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{([^}]*?)\}/g)].map((m) => ({ path: m[1], element: m[2].replace(/\s+/g, ' ').trim() }));
const hubs = {};
for (const f of SRC.filter((x) => /pages[\\/]hubs[\\/]/.test(x))) {
  const tabs = [...text.get(f).matchAll(/\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)'[^}]*component:\s*(\w+)/g)].map((m) => ({ key: m[1], label: m[2], component: m[3] }));
  hubs[rel(f).split('/').pop().replace('.jsx', '')] = tabs;
}

// ── Definições exportadas (nome → arquivo + corpo aproximado) ────────────
const defs = new Map();
for (const [f, src] of text) {
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    const start = m.index;
    // Corpo aproximado: até o próximo "\nexport " ou fim do arquivo.
    const next = src.indexOf('\nexport ', start + 10);
    defs.set(m[1], { file: rel(f), body: src.slice(start, next < 0 ? src.length : next) });
  }
}
const WRITE = /\.(create|bulkCreate|update|bulkUpdate|delete|bulkDelete|upsert)\(|localGame\.batch\(|mutateActiveCareer\(|saveActiveCareer\(|updatePlayerProfile\(|saveCareer\(/g;
const RANDOM = /Math\.random\(|crypto\.randomUUID\(/g;
function analyze(name, depth = 0, seen = new Set()) {
  const def = defs.get(name);
  if (!def || seen.has(name)) return null;
  seen.add(name);
  const writes = [...new Set([...def.body.matchAll(WRITE)].map((m) => m[0].replace('(', '')))];
  const randoms = (def.body.match(RANDOM) || []).length;
  const indirect = [];
  if (depth < 1) {
    for (const call of new Set([...def.body.matchAll(/await\s+(\w+)\(/g)].map((m) => m[1]))) {
      if (call === name) continue;
      const sub = analyze(call, depth + 1, seen);
      if (sub && (sub.writes.length || sub.randoms)) indirect.push({ name: call, file: sub.file, writes: sub.writes, randoms: sub.randoms });
    }
  }
  return { name, file: def.file, writes, randoms, indirect };
}

// ── Telas ────────────────────────────────────────────────────────────────
const UI = SRC.filter((f) => /src[\\/](pages|components|App\.jsx)/.test(f) || /src[\\/]App\.jsx$/.test(f));
const screens = [];
for (const f of UI) {
  const src = text.get(f);
  const calls = [...new Set([...src.matchAll(/await\s+(\w+)\(/g)].map((m) => m[1]))].filter((n) => defs.has(n) && defs.get(n).file !== rel(f));
  const found = calls.map((n) => analyze(n)).filter((a) => a && (a.writes.length || a.randoms || a.indirect.length));
  const directWrites = [...new Set([...src.matchAll(WRITE)].map((m) => m[0].replace('(', '')))];
  const mountRandom = (src.match(RANDOM) || []).length;
  if (found.length || directWrites.length || mountRandom) screens.push({ file: rel(f), calls: found, directWrites, randomInFile: mountRandom });
}
const byFunction = {};
for (const s of screens) for (const c of s.calls) {
  byFunction[c.name] = byFunction[c.name] || { file: c.file, writes: c.writes, randoms: c.randoms, indirect: c.indirect, calledFrom: [] };
  byFunction[c.name].calledFrom.push(s.file);
}
const out = { createdAt: new Date().toISOString(), routes, hubs, screens, byFunction };
writeFileSync(`${OUT}/static-audit.json`, JSON.stringify(out, null, 2));
console.log(`rotas: ${routes.length} · hubs: ${Object.keys(hubs).length} (${Object.values(hubs).flat().length} abas) · telas com possível escrita: ${screens.length} · funções com escrita/aleatoriedade chamadas de UI: ${Object.keys(byFunction).length}`);
for (const [name, f] of Object.entries(byFunction).sort((a, b) => b[1].calledFrom.length - a[1].calledFrom.length)) {
  console.log(`${name.padEnd(42)} ${f.file.padEnd(48)} escrita=[${f.writes.join(',')}] rnd=${f.randoms} indireto=[${f.indirect.map((i) => i.name).join(',')}] ← ${f.calledFrom.length} tela(s)`);
}
