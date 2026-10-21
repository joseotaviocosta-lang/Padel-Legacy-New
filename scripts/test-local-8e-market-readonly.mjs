// LOCAL-8E — 8E-01: abrir o Mercado Mundial é somente leitura.
//
// Reprodução (LOCAL-8D 8D-01): WorldMarket.jsx → getGlobalMarketSnapshot()
// chamava ensureWorldMarket() (bulkUpdate de até 500 atletas na 1ª visita do
// mês: current_form, potential, world_rank, career_status, market_*…) e
// updateCoachMarket() (bulkUpdate de TODOS os treinadores a cada visita).
// Para cada save (em memória; nenhum arquivo de save é escrito):
//   1. getGlobalMarketSnapshot ×3: nenhuma entidade do save muda;
//   2. a tela continua com dados: atletas com valor/salário/rank, livres,
//      treinadores disponíveis em todos os níveis, duplas;
//   3. a projeção é a MESMA lista que o caminho antigo mostrava (mesmos ids,
//      valores e world_rank) — comparada com ensureWorldMarket() num save
//      gêmeo carregado à parte;
//   4. busca/filtros da tela (mesma lógica de WorldMarket.jsx) funcionam;
//   5. save → load → Mercado → save idêntico;
//   6. processGlobalMarketMonth (ação explícita) segue gravando.
// Uso: node scripts/test-local-8e-market-readonly.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
let passed = 0; const failures = [];
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
function memoryBackend() {
  const files = new Map();
  return { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm', files };
}
const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = { 'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json', 't5-com-dupla': 'reports/ui-redesign-532/fixtures/t5-com-dupla.json', t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const report = { label: process.env.PL8E_LABEL || 'working-tree', saves: {} };

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const { getGlobalMarketSnapshot, processGlobalMarketMonth } = await L('/src/game-core/globalMarketLifecycle.js');
  const { ensureWorldMarket } = await L('/src/game-core/worldMarketLifecycle.js');
  async function load(data) {
    resetIdCollisionSequence();
    const backend = memoryBackend();
    const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    return { manager, backend };
  }
  const entityHashes = async () => {
    const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
    const out = {};
    for (const [name, rows] of Object.entries(career.entities || {})) if (Array.isArray(rows)) out[name] = new Map(rows.map((r, i) => [String(r?.id ?? `#${i}`), JSON.stringify(r)]));
    return { out, player: JSON.stringify(career.player) };
  };
  const diff = (a, b) => {
    const res = {};
    for (const n of new Set([...Object.keys(a.out), ...Object.keys(b.out)])) {
      const x = a.out[n] || new Map(); const y = b.out[n] || new Map();
      const created = [...y.keys()].filter((id) => !x.has(id)).length;
      const removed = [...x.keys()].filter((id) => !y.has(id)).length;
      const changed = [...y.keys()].filter((id) => x.has(id) && x.get(id) !== y.get(id)).length;
      if (created || removed || changed) res[n] = { created, removed, changed };
    }
    if (a.player !== b.player) res.__player = { changed: 1 };
    return res;
  };
  // Mesma lógica de filtro/busca de WorldMarket.jsx (aba atletas/treinadores).
  const searchAthletes = (snapshot, text) => (snapshot.athletes || []).filter((a) => a.career_status !== 'aposentado' && String(a.name || '').toLowerCase().includes(text.toLowerCase()));
  const coachesByTier = (snapshot, tier) => (snapshot.coaches || []).filter((c) => c.market_available && (tier === 'all' || c.tier === tier));

  for (const [label, file] of Object.entries(FILES)) {
    if (!existsSync(file)) { console.log(`SKIP — ${label}: ${file} ausente`); continue; }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const date = data.player?.career_date;
    const { manager, backend } = await load(data);
    const profile = (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
    const before = await entityHashes();
    const writesBefore = backend.files.size;
    const times = []; let snapshot;
    for (let i = 0; i < 3; i += 1) { const t = performance.now(); snapshot = await quiet(() => getGlobalMarketSnapshot(profile, date)); times.push(Math.round(performance.now() - t)); }
    const after = await entityHashes();
    const d = diff(before, after);
    const changedRecords = Object.values(d).reduce((s, v) => s + (v.created || 0) + (v.removed || 0) + (v.changed || 0), 0);
    ok(`${label}: Mercado ×3 não altera o save (${changedRecords} registro(s) ${JSON.stringify(d)})`, changedRecords === 0);
    ok(`${label}: atletas e treinadores intactos (AthleteProfile ${d.AthleteProfile?.changed || 0}, Coach ${d.Coach?.changed || 0})`, !d.AthleteProfile && !d.Coach);
    const athletes = snapshot?.athletes || [];
    ok(`${label}: a tela tem dados (${athletes.length} atletas, ${snapshot?.summary?.freeAthletes} livres, ${snapshot?.summary?.availableCoaches} treinadores, ${snapshot?.teams?.length} duplas)`, athletes.length > 0 && snapshot.summary.availableCoaches > 0 && snapshot.teams.length > 0);
    // Atletas fora do top 500 por OVR nunca recebiam campos de mercado (nem
    // no caminho antigo) — a contagem tem de ser a mesma da lista antiga.
    const incomplete = athletes.filter((a) => !(Number(a.market_value) > 0 && Number(a.expected_salary) > 0 && Number(a.world_rank) > 0)).length;
    const coachTiers = ['iniciante', 'regional', 'profissional'].map((t) => coachesByTier(snapshot, t).length);
    ok(`${label}: treinadores disponíveis por nível (iniciante/regional/profissional ${coachTiers.join('/')})`, coachTiers.every((n) => n > 0));
    const probe = athletes.find((a) => a.career_status !== 'aposentado' && a.name);
    const term = String(probe?.name || '').split(' ')[0];
    ok(`${label}: busca "${term}" encontra o atleta`, Boolean(probe) && searchAthletes(snapshot, term).some((a) => a.id === probe.id));
    // Equivalência com o caminho antigo: save gêmeo, ensureWorldMarket persiste
    // e a lista antiga é a dos 500 maiores market_value.
    const projected = athletes.map((a) => `${a.id}:${a.market_value}:${a.expected_salary}:${a.world_rank}:${a.market_status}:${a.career_status}`);
    await load(JSON.parse(JSON.stringify(data)));
    await quiet(() => ensureWorldMarket(date));
    const legacy = ((await localGame.entities.AthleteProfile.list('-market_value', 500)) || []).map((a) => `${a.id}:${a.market_value}:${a.expected_salary}:${a.world_rank}:${a.market_status}:${a.career_status}`);
    const same = new Set(legacy);
    const mismatch = projected.filter((x) => !same.has(x));
    ok(`${label}: projeção somente leitura = lista que a abertura antiga gravava e exibia (${mismatch.length} divergência(s) em ${projected.length})`, mismatch.length === 0 && projected.length === legacy.length, mismatch.slice(0, 3).join(' | '));
    const legacyIncomplete = legacy.filter((x) => { const [, v, sal, rank] = x.split(':'); return !(Number(v) > 0 && Number(sal) > 0 && Number(rank) > 0); }).length;
    ok(`${label}: atletas sem valor/salário/rank exibidos = caminho antigo (${incomplete} × ${legacyIncomplete})`, incomplete === legacyIncomplete);
    // Save/load.
    const { manager: m2 } = await load(JSON.parse(JSON.stringify(data)));
    const exported = await m2.exportCareer(data.career_id);
    const { manager: m3 } = await load(JSON.parse(JSON.stringify(exported)));
    await quiet(() => getGlobalMarketSnapshot((exported.player), date));
    const reexported = await m3.exportCareer(data.career_id);
    const strip = (c) => JSON.stringify(c.entities);
    ok(`${label}: save → load → Mercado → save com entidades idênticas`, strip(exported) === strip(reexported));
    report.saves[label] = { athletesShown: athletes.length, recordsChanged: changedRecords, openMs: times, persistedFilesBefore: writesBefore, mismatchVsLegacy: mismatch.length, incompleteShown: incomplete };
    void manager;
  }
  // Ação explícita: processar o mês continua gravando (não foi desligada).
  {
    const data = JSON.parse(readFileSync(FILES['t5-com-dupla'], 'utf8'));
    await load(data);
    const profile = (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
    const before = await entityHashes();
    await quiet(() => processGlobalMarketMonth(profile, profile.career_date));
    const d = diff(before, await entityHashes());
    // LOCAL-8F (8F-06): o mercado de treinadores do mês passou a ser uma
    // projeção pura (src/lib/coachMarket.js) — processar o mês evolui os
    // atletas e não grava mais campos market_* nos treinadores.
    ok(`processGlobalMarketMonth (botão) segue processando o mês (${JSON.stringify(d).slice(0, 120)})`, Boolean(d.AthleteProfile?.changed) && !d.Coach);
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8e-p1-navigation-integrity', { recursive: true });
writeFileSync(`reports/local-8e-p1-navigation-integrity/market-${report.label}.json`, JSON.stringify({ ...report, passed, failures }, null, 2));
console.log(`test-local-8e-market-readonly: ${passed} PASS · ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
