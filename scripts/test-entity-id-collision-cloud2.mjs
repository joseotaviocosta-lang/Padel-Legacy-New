// CLOUD-2 (B) — geração de id de entidade sem colisão.
//
// makeId gera `<prefixo>-<Date.now()>-<6 base36 de Math.random>`. Com a fonte
// aleatória fixa (testes) ou por acaso no mesmo ms, dois ids GERADOS saíam
// iguais e a transação inteira do avanço de dia era desfeita
// (reports/cloud-phase-1-integrity-diagnosis, investigação B).
//
// Contrato verificado aqui:
//  - formato preservado; ids explícitos/persistidos nunca são reescritos;
//  - 1ª tentativa idêntica ao makeId de antes, com a MESMA quantidade de
//    chamadas a Math.random (harness determinístico e selectPair intactos);
//  - na colisão, sufixo derivado deterministicamente (sem Math.random);
//  - fonte aleatória E relógio fixos: ainda progride, sem laço infinito;
//  - id explícito duplicado continua sendo erro (não mascara duplicata real);
//  - vale para create, bulkCreate e batch.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

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

const ID_FORMAT = /^worldevent-\d+-[0-9a-z]{6}$/;
const originalRandom = Math.random;
const originalNow = Date.now;
const freeze = (value = 0.99) => { const t = originalNow(); Date.now = () => t; Math.random = () => value; };
const unfreeze = () => { Date.now = originalNow; Math.random = originalRandom; };

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { makeUniqueId, resetIdCollisionSequence } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  // ── 1. Unidade: makeUniqueId ───────────────────────────────────────────
  {
    // 1ª tentativa = makeId de antes, com exatamente 1 chamada a Math.random.
    let calls = 0;
    Math.random = () => { calls += 1; return 0.123456789; };
    const fixedNow = originalNow();
    Date.now = () => fixedNow;
    const first = makeUniqueId('worldevent', () => false);
    gate('sem colisão: id idêntico ao makeId de antes (mesmo ms, mesmo sufixo do random)', first === `worldevent-${fixedNow}-${(0.123456789).toString(36).slice(2, 8)}`);
    gate('sem colisão: exatamente 1 chamada a Math.random (sequência semeada intacta)', calls === 1);
    calls = 0;
    const taken = new Set([first]);
    const second = makeUniqueId('worldevent', (id) => taken.has(id));
    gate('com colisão: ainda só 1 chamada a Math.random (o desvio não consome a fonte aleatória)', calls === 1);
    gate('com colisão: id diferente e no mesmo formato', second !== first && ID_FORMAT.test(second));
    gate('com colisão: mantém prefixo e o mesmo ms', second.startsWith(`worldevent-${fixedNow}-`));
    unfreeze();

    // Fonte e relógio fixos: 500 ids seguidos, todos únicos, sem travar; e a
    // mesma sequência de operações reproduz exatamente os mesmos ids.
    const runSequence = () => {
      resetIdCollisionSequence();
      // Relógio fixo no MESMO instante nas duas execuções (como no harness
      // determinístico, que também substitui Date).
      Date.now = () => 1767225600000;
      Math.random = () => 0.99;
      const seen = new Set();
      const ordered = [];
      for (let index = 0; index < 500; index += 1) { const id = makeUniqueId('worldevent', (candidate) => seen.has(candidate)); seen.add(id); ordered.push(id); }
      unfreeze();
      return { seen, ordered };
    };
    const runA = runSequence();
    gate('fonte aleatória e relógio fixos: 500 ids únicos (progride, sem laço infinito)', runA.seen.size === 500);
    gate('fonte aleatória e relógio fixos: todos no formato original', runA.ordered.every((id) => ID_FORMAT.test(id)));
    const runB = runSequence();
    gate('determinístico: mesma sequência de operações + mesmo relógio → exatamente os mesmos ids', runA.ordered.every((id, i) => id === runB.ordered[i]));

    // Tudo ocupado: falha com erro limitado, nunca laço infinito.
    let threw = null;
    try { makeUniqueId('worldevent', () => true); } catch (error) { threw = error; }
    gate('espaço esgotado: erro explícito após limite de tentativas (sem laço infinito)', Boolean(threw) && /após \d+ tentativas/.test(threw.message));
  }

  // ── 2. Integração: create / bulkCreate / batch ─────────────────────────
  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'QA Ids' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'qa-ids-player', sport_name: 'qa-ids', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', energy: 100, coins: 1000 });

  freeze();
  const bulk = await localGame.entities.WorldEvent.bulkCreate(Array.from({ length: 5 }, (_, i) => ({ event_type: 'qa', title: `b${i}` })));
  gate('bulkCreate (fonte e relógio fixos): 5 ids únicos', new Set(bulk.map((r) => r.id)).size === 5);
  gate('bulkCreate: todos no formato original', bulk.every((r) => ID_FORMAT.test(r.id)));
  const single = await localGame.entities.WorldEvent.create({ event_type: 'qa', title: 'single' });
  gate('create (fonte e relógio fixos): id novo não colide com os do lote', !bulk.some((r) => r.id === single.id) && ID_FORMAT.test(single.id));
  await localGame.batch([
    { type: 'create', entityName: 'WorldEvent', data: { event_type: 'qa', title: 'batch-a' } },
    { type: 'create', entityName: 'WorldEvent', data: { event_type: 'qa', title: 'batch-b' } },
  ]);
  unfreeze();
  const all = await localGame.entities.WorldEvent.filter({ event_type: 'qa' });
  gate('batch (fonte e relógio fixos): 8 eventos, todos com id único', all.length === 8 && new Set(all.map((r) => r.id)).size === 8);

  // Ids explícitos: preservados e duplicata real continua sendo erro.
  const explicit = await localGame.entities.WorldEvent.create({ id: 'worldevent-legacy-abc123', event_type: 'qa-explicit' });
  gate('id explícito (ex.: já persistido) é preservado sem alteração', explicit.id === 'worldevent-legacy-abc123');
  let duplicateError = null;
  try { await localGame.entities.WorldEvent.create({ id: 'worldevent-legacy-abc123', event_type: 'qa-explicit' }); } catch (error) { duplicateError = error; }
  gate('id explícito duplicado continua sendo erro (não mascara duplicata real)', Boolean(duplicateError) && /já existe com o id/.test(duplicateError.message));

  // Reload: ids gerados sobrevivem iguais.
  activeCareerAdapter.clearActiveCareer?.();
  const reloaded = await manager.loadCareer(career.career_id);
  const reloadedIds = new Set((reloaded.entities.WorldEvent || []).map((r) => r.id));
  gate('após reload: todos os ids gerados persistem idênticos', all.every((r) => reloadedIds.has(r.id)));

  console.log(`\n${gates} gates executados, todos PASS — CLOUD-2 entity id collision.`);
} finally {
  unfreeze();
  await vite.close();
}
