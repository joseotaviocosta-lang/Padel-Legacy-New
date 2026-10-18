// CLOUD-7B2C — equivalência de ponta a ponta do motor: avança N dias a partir de um save real com a estratégia
// escolhida, relógio/Math.random/UUID determinísticos, e imprime o hash do save FINAL expandido (history_pack removido).
// Rode uma vez por estratégia, em processos separados, e compare os hashes.
// Uso: node scripts/verify-cloud-7b2c-engine-equivalence.mjs --save=<save.json> --days=10 --strategy=off|repeated|incremental [--output=<json>]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const STRATEGY = args.strategy || 'off';
if (STRATEGY === 'repeated') globalThis.__PADEL_HISTORICAL_COMPACTION__ = true;
if (STRATEGY === 'incremental') globalThis.__PADEL_INCREMENTAL_COMPACTION__ = true;
globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
let rng = 2166136261;
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
const RealDate = Date; let fake = new RealDate('2027-01-05T00:00:00.000Z').getTime();
globalThis.Date = class DeterministicDate extends RealDate { constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); } static now() { return (fake += 1000); } };
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { unpackCareerFromStorage } = await server.ssrLoadModule('/src/careers/tournamentHistoryCodec.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await server.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const files = new Map();
  const backend = {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return []; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Cloud 7B2C EQ' });
  const external = JSON.parse(fs.readFileSync(args.save, 'utf8'));
  external.career_id = career.career_id;
  await manager.saveCareer(career.career_id, external);
  activeCareerAdapter.clearActiveCareer();
  activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
  const quiet = async (fn) => { const w = console.warn; const d = console.debug; console.warn = () => {}; console.debug = () => {}; try { return await fn(); } finally { console.warn = w; console.debug = d; } };
  let profile = await localGame.entities.PlayerProfile.get(external.player.id);
  for (let i = 0; i < Number(args.days || 10); i += 1) { await quiet(async () => { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); }); profile = await localGame.entities.PlayerProfile.get(external.player.id); }
  const raw = JSON.parse(files.get(`careers/${career.career_id}.json`));
  const packedRows = raw.entities.Tournament.filter((t) => t.history_pack).length;
  const logical = unpackCareerFromStorage(raw);
  const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const parts = {};
  for (const [name, rows] of Object.entries(logical.entities)) parts[name] = sha(rows);
  parts.player = sha(logical.player);
  const result = { strategy: STRATEGY, days: Number(args.days || 10), careerDate: profile.career_date, packedRows, fileBytes: files.get(`careers/${career.career_id}.json`).length, tournaments: logical.entities.Tournament.length, whole: sha({ ...logical, career_id: 0, last_played_at: 0, updated_at: 0 }), parts };
  if (args.output) fs.writeFileSync(args.output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, parts: undefined }));
} finally { await server.close(); }
