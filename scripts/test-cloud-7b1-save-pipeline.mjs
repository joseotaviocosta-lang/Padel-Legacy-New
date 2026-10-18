// CLOUD-7B1 — equivalência, compatibilidade, isolamento e falhas do pipeline de persistência.
//   A. Equivalência: mesma seed + relógio fixo => o arquivo de save persistido tem EXATAMENTE os mesmos bytes
//      (sha256) do baseline gravado com o código anterior (memória e TauriStorage real sobre invoke simulado).
//   B. Save antigo: carrega um save gerado pelo código ANTERIOR (fixture .json.gz), avança, grava, recarrega.
//   C. Isolamento: nenhuma referência compartilhada entre estado ativo, retornos de leitura/gravação e disco.
//   D. Falhas: escrita, verificação do temporário, serialização, dados inválidos e concorrência não corrompem nada.
//
// Uso:  node scripts/test-cloud-7b1-save-pipeline.mjs            (compara com o baseline commitado)
//       node scripts/test-cloud-7b1-save-pipeline.mjs --record   (REGRAVA baseline + fixture; rode só no código-base)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { installTauriMock } from './lib/cloud7b1TauriMock.mjs';

const RECORD = process.argv.includes('--record');
const DIR = 'reports/cloud-phase-7b1-save-pipeline';
const BASELINE_FILE = path.resolve(`${DIR}/data/equivalence-baseline.json`);
const FIXTURE_FILE = path.resolve(`${DIR}/fixtures/career-day30-pre7b1.json.gz`);
const sha = (text) => createHash('sha256').update(text).digest('hex');

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = 1;
let fake = 0;
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date;
globalThis.Date = class DeterministicDate extends RealDate {
  constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); }
  static now() { return (fake += 1000); }
};
// career_id vem de crypto.randomUUID(): fixa-o à mesma sequência determinística.
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
const reseed = (seed) => { rng = hashSeed(seed); fake = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(seed) % 100000); };

let passed = 0;
const ok = (label, condition) => { assert.ok(condition, `FALHOU: ${label}`); passed += 1; console.log(`PASS — ${label}`); };
const dupes = (ids) => ids.length - new Set(ids).size;

function memoryBackend(hooks = {}) {
  const files = new Map();
  return {
    files, hooks,
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { if (hooks.failWrite && hooks.failWrite(p)) { hooks.failWrite = null; throw Object.assign(new Error('falha de escrita simulada'), { code: 'SIMULATED_WRITE_FAILURE' }); } files.set(p, String(c)); },
    async readText(p) {
      if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; }
      const s = files.get(p);
      if (hooks.corruptRead && hooks.corruptRead(p)) { hooks.corruptRead = null; return `${s}x`; }
      return s;
    },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { resetIdCollisionSequence } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const logQuiet = (fn) => async (...a) => { const w = console.warn; const l = console.log; const d = console.debug; console.warn = () => {}; console.debug = () => {}; try { return await fn(...a); } finally { console.warn = w; console.debug = d; console.log = l; } };

  async function boot({ seed, tauri = false, hooks = {}, loadText = null }) {
    reseed(seed);
    resetIdCollisionSequence();
    activeCareerAdapter.activePersistenceTransaction = null;
    activeCareerAdapter.writeChain = Promise.resolve();
    let files;
    let manager;
    if (tauri) {
      const mock = installTauriMock();
      files = mock.files;
      manager = new CareerManager(new CareerRepository(new GameStorage()));
    } else {
      const backend = memoryBackend(hooks);
      files = backend.files;
      manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
    }
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ playerName: 'Cloud 7B1' });
    let profileId = 'c7b1-player';
    if (loadText) {
      const external = JSON.parse(loadText);
      external.career_id = career.career_id;
      await manager.saveCareer(career.career_id, external);
      activeCareerAdapter.clearActiveCareer();
      const loaded = await manager.loadCareer(career.career_id);
      activeCareerAdapter.setActiveCareer(loaded);
      profileId = external.player.id;
    } else {
      activeCareerAdapter.setActiveCareer(career);
      await activeCareerAdapter.createPlayerProfile({
        id: profileId, sport_name: 'Cloud 7B1', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
        court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id, weekly_training_enabled: false,
      });
    }
    const careerId = career.career_id;
    const fileText = () => files.get(`careers/${careerId}.json`);
    const advance = async (n) => {
      let profile = await localGame.entities.PlayerProfile.get(profileId);
      for (let i = 0; i < n; i += 1) { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); profile = await localGame.entities.PlayerProfile.get(profileId); }
      return profile;
    };
    return { manager, files, careerId, profileId, fileText, advance };
  }

  // ═══ A. Equivalência byte a byte ═══
  const results = {};
  {
    const rt = await boot({ seed: '7b1-eq' });
    for (const day of [15, 30, 45]) { await logQuiet(rt.advance)(15); results[`memoria-dia-${day}`] = sha(rt.fileText()); if (process.env.DUMP_DIR && day === 15) fs.writeFileSync(`${process.env.DUMP_DIR}/eq15.json`, rt.fileText()); }
    if (RECORD) {
      fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
      // fixture = o save do dia 30 do código ANTERIOR (recriado em um runtime separado para parar exatamente no dia 30)
      const fx = await boot({ seed: '7b1-eq' });
      await logQuiet(fx.advance)(30);
      fs.writeFileSync(FIXTURE_FILE, zlib.gzipSync(fx.fileText(), { level: 9 }));
    }
  }
  {
    const rt = await boot({ seed: '7b1-eq-tauri', tauri: true });
    await logQuiet(rt.advance)(15);
    results['tauri-mock-dia-15'] = sha(rt.fileText());
  }
  const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE_FILE)).toString('utf8');
  results['fixture-sha'] = sha(fixtureText);
  {
    const rt = await boot({ seed: '7b1-fixture', loadText: fixtureText });
    await logQuiet(rt.advance)(10);
    results['fixture-mais-10-dias'] = sha(rt.fileText());
  }
  if (RECORD) {
    fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({ note: 'Gerado pelo código anterior à CLOUD-7B1 (commit 9804adc); node --record', results }, null, 2));
    console.log('baseline e fixture gravados:', JSON.stringify(results, null, 1));
  } else {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).results;
    for (const key of Object.keys(baseline)) ok(`A. equivalência byte a byte (${key})`, results[key] === baseline[key]);
  }

  // ═══ B. Save antigo: carrega, avança, grava, recarrega ═══
  {
    const rt = await boot({ seed: '7b1-old-save', loadText: fixtureText });
    const before = await localGame.entities.PlayerProfile.get(rt.profileId);
    const after = await logQuiet(rt.advance)(3);
    ok('B. save anterior carrega e avança 3 dias', after.career_date > before.career_date);
    activeCareerAdapter.clearActiveCareer();
    const reloaded = await rt.manager.loadCareer(rt.careerId);
    activeCareerAdapter.setActiveCareer(reloaded);
    const again = await localGame.entities.PlayerProfile.get(rt.profileId);
    ok('B. recarregar após gravar preserva a data da carreira', again.career_date === after.career_date);
    const tournaments = await localGame.entities.Tournament.filter({});
    ok('B. sem ids duplicados de torneio após carregar/avançar/recarregar', dupes(tournaments.map((t) => t.id)) === 0);
    const more = await logQuiet(rt.advance)(1);
    ok('B. continua avançando após recarregar', more.career_date > again.career_date);
  }

  // ═══ C. Isolamento ═══
  {
    const rt = await boot({ seed: '7b1-iso' });
    await logQuiet(rt.advance)(2);
    const a = await activeCareerAdapter.getActiveCareer();
    a.player.coins = -999; a.entities.Tournament.length = 0; a.metadata.player_name = 'MUTADO';
    const b = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
    ok('C. mutar o retorno de getActiveCareer() não altera o estado ativo', b.player.coins !== -999 && b.entities.Tournament.length > 0 && b.metadata.player_name !== 'MUTADO');

    const diskBefore = rt.fileText();
    const loaded = await rt.manager.loadCareer(rt.careerId);
    loaded.player.coins = -1; loaded.entities.Tournament.length = 0;
    const loadedAgain = await rt.manager.loadCareer(rt.careerId);
    ok('C. mutar o retorno de loadCareer() não afeta cargas seguintes nem o disco', loadedAgain.player.coins !== -1 && loadedAgain.entities.Tournament.length > 0 && rt.fileText() === diskBefore);

    activeCareerAdapter.clearActiveCareer();
    const fresh = await activeCareerAdapter.getActiveCareer({ fresh: true });
    fresh.player.coins = -2; fresh.entities.Tournament.length = 0;
    const hot = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
    ok('C. mutar o retorno de getActiveCareer({fresh:true}) não altera o estado ativo', hot.player.coins !== -2 && hot.entities.Tournament.length > 0);

    const readOnly = await rt.manager.readCareer(rt.careerId);
    readOnly.metadata.player_name = 'MUTADO-2';
    ok('C. mutar o retorno de readCareer() não altera o disco', (await rt.manager.readCareer(rt.careerId)).metadata.player_name !== 'MUTADO-2');

    const tournaments = await localGame.entities.Tournament.filter({});
    const target = tournaments[0];
    const updated = await localGame.entities.Tournament.update(target.id, { description: 'descrição C6' });
    updated.description = 'ALTERADO FORA'; updated.id = 'x';
    const stored = (await localGame.entities.Tournament.filter({})).find((t) => t.id === target.id);
    ok('C. mutar o retorno de Entity.update() não altera a linha armazenada', stored && stored.description === 'descrição C6');
    const created = await localGame.entities.Post.create({ author_name: 'T', content: 'c6' });
    created.content = 'ALTERADO FORA';
    ok('C. mutar o retorno de Entity.create() não altera a linha armazenada', (await localGame.entities.Post.filter({ id: created.id }))[0]?.content === 'c6');
    const profile = await activeCareerAdapter.updatePlayerProfile(rt.profileId, { coins: 12345 });
    profile.coins = 1; profile.sport_name = 'MUT';
    const profileAgain = await activeCareerAdapter.getPlayerProfile();
    ok('C. mutar o retorno de updatePlayerProfile() não altera o jogador ativo', profileAgain.coins === 12345 && profileAgain.sport_name !== 'MUT');

    const snapshotBefore = await activeCareerAdapter.getActiveCareer();
    const snapshotJson = JSON.stringify(snapshotBefore);
    await logQuiet(rt.advance)(1);
    ok('C. snapshots obtidos antes de um commit não mudam depois dele', JSON.stringify(snapshotBefore) === snapshotJson);
  }

  // ═══ D. Falhas de persistência ═══
  {
    const hooks = {};
    const rt = await boot({ seed: '7b1-fail', hooks });
    await logQuiet(rt.advance)(3);
    const diskOk = rt.fileText();
    const dateOk = (await localGame.entities.PlayerProfile.get(rt.profileId)).career_date;
    const stateOk = JSON.stringify(await activeCareerAdapter.getActiveCareer({ cloneResult: false }));
    const intact = async (label) => {
      ok(`D. ${label}: arquivo em disco intacto`, rt.fileText() === diskOk);
      ok(`D. ${label}: estado ativo intacto`, JSON.stringify(await activeCareerAdapter.getActiveCareer({ cloneResult: false })) === stateOk);
      ok(`D. ${label}: nenhuma transação ficou pendurada`, activeCareerAdapter.activePersistenceTransaction === null);
    };
    const profile = await localGame.entities.PlayerProfile.get(rt.profileId);

    hooks.failWrite = (p) => p.startsWith('temp/');
    await assert.rejects(logQuiet(() => advanceCareerDayOnce(profile))(), /falha de escrita simulada/);
    await intact('falha de escrita do temporário');

    hooks.corruptRead = (p) => p.startsWith('temp/');
    await assert.rejects(logQuiet(() => advanceCareerDayOnce(profile))(), (e) => e?.code === 'TEMP_WRITE_MISMATCH');
    await intact('verificação do temporário divergente');

    const circular = {}; circular.self = circular;
    await assert.rejects(logQuiet(() => activeCareerAdapter.withPersistenceTransaction('t-serialize', async () => {
      await activeCareerAdapter.mutateActiveCareer((c) => { c.player.circular = circular; }, { caller: 't' });
    }))(), /circular|JSON/i);
    await intact('falha de serialização (referência circular)');

    await assert.rejects(logQuiet(() => activeCareerAdapter.withPersistenceTransaction('t-invalid', async () => {
      await activeCareerAdapter.mutateActiveCareer((c) => { c.entities = null; }, { caller: 't' });
    }))(), /entities deve ser um objeto/);
    await intact('dados inválidos');

    await assert.rejects(logQuiet(() => activeCareerAdapter.withPersistenceTransaction('t-throw', async () => {
      await activeCareerAdapter.mutateActiveCareer((c) => { c.player.coins = 7; }, { caller: 't' });
      throw new Error('interrupção simulada');
    }))(), /interrupção simulada/);
    await intact('interrupção no meio da transação (rollback)');

    const next = await logQuiet(() => advanceCareerDayOnce(profile))();
    ok('D. após as falhas, o avanço normal continua funcionando', next.career_date > dateOk);

    const base = await localGame.entities.PlayerProfile.get(rt.profileId);
    const [x, y] = await Promise.all([
      activeCareerAdapter.updatePlayerProfile(rt.profileId, { coins: 111 }),
      activeCareerAdapter.updatePlayerProfile(rt.profileId, { xp: 222 }),
    ]);
    const merged = await localGame.entities.PlayerProfile.get(rt.profileId);
    ok('D. gravações concorrentes são serializadas sem perder nenhuma', merged.coins === 111 && merged.xp === 222 && x && y);
    const day = merged.career_date;
    const [p1, p2] = await Promise.all([logQuiet(() => advanceCareerDayOnce(merged))(), logQuiet(() => advanceCareerDayOnce(merged))()]);
    ok('D. dois cliques simultâneos em "Avançar" avançam exatamente um dia', p1.career_date === p2.career_date && p1.career_date > day
      && (await localGame.entities.PlayerProfile.get(rt.profileId)).career_date === p1.career_date && base);
    const reread = await rt.manager.readCareer(rt.careerId);
    ok('D. o arquivo final é um save válido e legível', reread.career_id === rt.careerId);
  }

  console.log(`\n${passed} verificações executadas, todas PASS — CLOUD-7B1 save pipeline${RECORD ? ' (modo --record: baseline regravado)' : ''}.`);
} finally {
  await vite.close();
}
