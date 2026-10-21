// LOCAL-8E — 8E-02: o Jornal não pode modificar partidas históricas.
//
// Reprodução (LOCAL-8D 8D-02): generateJournal() fazia (m.team_a || []).sort()
// sobre a lista do repositório (cópia RASA): a ordem dos membros da dupla era
// reescrita no próprio save, e Torneios — que reconhece as partidas do
// jogador por team_a[0] — deixava de reconhecê-las.
// Para cada save (em memória; nenhum arquivo é escrito):
//   1. hash de cada Match antes; generateJournal() ×3; hash depois → idêntico;
//   2. ordem dos participantes preservada (team_a/team_b iguais);
//   3. partidas do jogador reconhecidas como antes (team_a[0] === nome);
//   4. o Jornal continua agrupando rivalidades por dupla (ordem só na apresentação);
//   5. save → load → Jornal → save: partidas idênticas.
// Uso: node scripts/test-local-8e-journal-integrity.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
let passed = 0; const failures = [];
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
function memoryBackend() {
  const files = new Map();
  return { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = { 't5-com-dupla': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json', t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const report = { label: process.env.PL8E_LABEL || 'working-tree', saves: {} };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const { generateJournal } = await L('/src/lib/journal.js');
  async function open(data) {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    return manager;
  }
  const matchesJson = async () => {
    const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
    return new Map((career.entities.Match || []).map((m) => [m.id, JSON.stringify(m)]));
  };
  for (const [label, file] of Object.entries(FILES)) {
    if (!existsSync(file)) { console.log(`SKIP — ${label}: ${file} ausente`); continue; }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const playerName = data.player?.sport_name;
    const manager = await open(data);
    const before = await matchesJson();
    const recentBefore = (await localGame.entities.Match.list('-created_date', 30)).filter((m) => m.team_a?.[0] === playerName).length;
    let journal;
    const openMs = [];
    for (let i = 0; i < 3; i += 1) { const t = performance.now(); journal = await quiet(() => generateJournal()); openMs.push(Math.round(performance.now() - t)); }
    const after = await matchesJson();
    const changed = [...after].filter(([id, j]) => before.get(id) !== j).map(([id]) => id);
    const recentAfter = (await localGame.entities.Match.list('-created_date', 30)).filter((m) => m.team_a?.[0] === playerName).length;
    report.saves[label] = { matches: before.size, changedByJournal: changed.length, playerRecognizedBefore: recentBefore, playerRecognizedAfter: recentAfter, openMs };
    ok(`${label}: Jornal ×3 não altera partidas (${changed.length} de ${before.size} alteradas)`, changed.length === 0);
    ok(`${label}: partidas do jogador seguem reconhecidas (${recentBefore} → ${recentAfter} entre as 30 recentes)`, recentAfter === recentBefore);
    // O Jornal continua correto: rivalidades agrupadas pela dupla, sem depender da ordem.
    const rivals = journal?.rivalries || [];
    ok(`${label}: Jornal gerado (${rivals.length} rivalidade(s), manchete "${String(journal?.headline || '').slice(0, 40)}")`, Boolean(journal?.headline));
    const keyOf = (names) => [...names].sort().join(' & ');
    const sample = (await localGame.entities.Match.list('-created_date', 30)).find((m) => (m.team_a || []).length > 1);
    if (sample && rivals.length) ok(`${label}: nomes da rivalidade em ordem de apresentação (ordenados), sem alterar o registro`, rivals.every((r) => r.teamA === keyOf(r.teamA.split(' & ')) && r.teamB === keyOf(r.teamB.split(' & '))));
    // Save/load.
    const exported = await manager.exportCareer(data.career_id);
    const second = await open(JSON.parse(JSON.stringify(exported)));
    await quiet(() => generateJournal());
    const reexported = await second.exportCareer(data.career_id);
    const mapOf = (c) => new Map((c.entities.Match || []).map((m) => [m.id, JSON.stringify(m)]));
    const a = mapOf(exported); const b = mapOf(reexported);
    ok(`${label}: save → load → Jornal → save com partidas idênticas`, [...b].every(([id, j]) => a.get(id) === j) && a.size === b.size);
  }
  // Duplas com nomes iguais e ordem "invertida": o Jornal não toca no registro.
  {
    const data = JSON.parse(readFileSync(FILES['t5-com-dupla'], 'utf8'));
    await open(data);
    const synthetic = [
      { team_a: ['Zeca Silva', 'Ana Souza'], team_b: ['Bruno Lima', 'Bruno Lima'], winner: 'A', tournament_name: 'Teste 8E', created_date: '2099-01-01T00:00:00.000Z' },
      { team_a: ['Ana Souza', 'Zeca Silva'], team_b: ['Bruno Lima', 'Bruno Lima'], winner: 'B', tournament_name: 'Teste 8E', created_date: '2099-01-02T00:00:00.000Z' },
    ];
    const created = [];
    for (const m of synthetic) created.push(await localGame.entities.Match.create(m));
    const journal = await quiet(() => generateJournal());
    const reread = await Promise.all(created.map((m) => localGame.entities.Match.get(m.id)));
    ok('nomes iguais/ordem invertida: registros intactos', reread.every((m, i) => JSON.stringify(m.team_a) === JSON.stringify(synthetic[i].team_a) && JSON.stringify(m.team_b) === JSON.stringify(synthetic[i].team_b)));
    const r = (journal?.rivalries || []).find((x) => x.teamA.includes('Zeca') || x.teamB.includes('Zeca'));
    ok('a mesma dupla em ordens diferentes é UMA rivalidade (2 confrontos)', r && r.count === 2, JSON.stringify(r));
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8e-p1-navigation-integrity', { recursive: true });
writeFileSync(`reports/local-8e-p1-navigation-integrity/journal-${report.label}.json`, JSON.stringify({ ...report, passed, failures }, null, 2));
console.log(`test-local-8e-journal-integrity: ${passed} PASS · ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
