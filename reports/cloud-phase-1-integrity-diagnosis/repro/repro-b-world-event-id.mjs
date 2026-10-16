// CLOUD-1 / Investigação B — reprodução mínima e determinística da colisão de
// id de WorldEvent vista em scripts/test-phase15-5-1-critical-training-center.mjs.
//
// NÃO DESTRUTIVA: storage em memória; Math.random é restaurado ao final.
//
// Cenários:
//  1. bulkCreate de 2 WorldEvents com Math.random REAL       → ids distintos.
//  2. bulkCreate de 2 WorldEvents com Math.random = () => 0.99 (o que o teste faz)
//     e Date.now fixo → os 2 ids saem iguais → erro (determinístico).
//  3. A mesma colisão DENTRO de uma transação de persistência (como no avanço
//     de dia): a 1ª falha marca rollbackError; uma mutação seguinte, sem
//     relação nenhuma (update do PlayerProfile), falha com o MESMO erro; o save
//     confirmado no "disco" não muda (rollback atômico).
//  4. Probabilidade analítica de colisão com Math.random real.
//
// Uso: node reports/cloud-phase-1-integrity-diagnosis/repro/repro-b-world-event-id.mjs [--out=<arquivo.json>]
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') { const prefix = dir && dir !== '.' ? `${dir}/` : ''; return [...this.files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).filter((r) => r && !r.includes('/')).map((name) => ({ name, isDirectory: false })); }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const originalRandom = Math.random;
const originalNow = Date.now;
// Fixa o relógio para tornar a colisão determinística (sem isso ela depende de
// os dois ids caírem no mesmo ms, o que no laço síncrono é o caso comum).
const freeze = () => { const t = originalNow(); Date.now = () => t; Math.random = () => 0.99; };
const unfreeze = () => { Date.now = originalNow; Math.random = originalRandom; };
const report = { constantRandomSuffix: (0.99).toString(36).slice(2, 8) };
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Repro B' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'repro-b-player', sport_name: 'repro-b', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', energy: 100, coins: 1000 });
  const payload = (n) => ({ event_type: 'repro', title: `evento ${n}`, event_date: '2026-01-01' });
  const attempt = async (fn) => { try { const r = await fn(); return { ok: true, ids: Array.isArray(r) ? r.map((x) => x.id) : [r?.id] }; } catch (e) { return { ok: false, error: String(e.message) }; } };

  report.case1_realRandom = await attempt(() => localGame.entities.WorldEvent.bulkCreate([payload(1), payload(2)]));
  freeze();
  report.case2_constantRandom = await attempt(() => localGame.entities.WorldEvent.bulkCreate([payload(3), payload(4)]));
  unfreeze();

  // Caso 3 — dentro de uma transação de persistência.
  const file = [...storage.files.keys()].find((k) => k.startsWith('careers/') && k.endsWith(`${career.career_id}.json`));
  const before = storage.files.get(file);
  const coinsBefore = (await localGame.entities.PlayerProfile.get('repro-b-player')).coins;
  const steps = [];
  const tx = await attempt(() => activeCareerAdapter.withPersistenceTransaction('repro-b', async () => {
    freeze();
    steps.push({ step: 'bulkCreate colidente', ...(await attempt(() => localGame.entities.WorldEvent.bulkCreate([payload(5), payload(6)]))) });
    unfreeze();
    steps.push({ step: 'update NÃO relacionado (PlayerProfile.coins + 1)', ...(await attempt(() => localGame.entities.PlayerProfile.update('repro-b-player', { coins: coinsBefore + 1 }))) });
  }));
  unfreeze();
  activeCareerAdapter.clearActiveCareer?.();
  const reloaded = await manager.loadCareer(career.career_id);
  report.case3_transaction = {
    steps,
    transaction: tx,
    committedFileUnchanged: storage.files.get(file) === before,
    coinsAfterReload: reloaded.player?.coins,
    coinsBefore,
  };

  // Caso 4 — chance com Math.random real: 6 dígitos base 36 do sufixo.
  const space = 36 ** 6;
  const pairsPerDay = (n) => (n * (n - 1)) / 2;
  report.case4_probability = {
    suffixSpace: space,
    note: 'Só ids gerados no MESMO milissegundo podem colidir (Date.now faz parte do id). Em bulkCreate o laço é síncrono: todos os itens do lote compartilham o ms.',
    perBatch: Object.fromEntries([10, 50, 200].map((n) => [`n=${n}`, pairsPerDay(n) / space])),
    tenYearsAt50PerDay: 1 - (1 - pairsPerDay(50) / space) ** 3650,
  };
} finally {
  unfreeze();
  await vite.close();
}
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
