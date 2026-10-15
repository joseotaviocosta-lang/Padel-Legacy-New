// Playthrough 5.24-D — harness de persistência da recompensa do tutorial.
//
// Pipeline de PRODUÇÃO (GameStorage → CareerRepository → CareerManager →
// activeCareerAdapter → localGame → incrementMissionProgress), com um storage
// em memória que cumpre o mesmo contrato de arquivo do TauriStorage.
//
// "Reload/restart" aqui é de verdade: `boot()` sobe um NOVO servidor Vite
// (novas instâncias de TODOS os módulos — runtime, caches, locks, snapshot
// quente) sobre o MESMO Map de arquivos. Nada sobrevive além dos bytes
// gravados, exatamente como fechar e reabrir o app.
import { createServer } from 'vite';

export const MISSION_ID = 'tutorial-career-created';

/** Storage em memória com o contrato do TauriStorage; conta escritas duráveis. */
export function createFileStore() {
  const files = new Map();
  // durableWrites: só o arquivo da carreira (contrato da 5.24-D).
  // allWrites (5.24-E): toda escrita atômica concluída, com bytes — inclui o
  // índice de carreiras. reads: leituras de arquivo.
  const log = { durableWrites: [], allWrites: [], renames: 0, reads: 0 };
  const api = {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(path, content) { files.set(path, String(content)); },
    async readText(path) {
      log.reads += 1;
      if (!files.has(path)) { const e = new Error('O arquivo não existe no armazenamento local.'); e.code = 'FILE_NOT_FOUND'; throw e; }
      return files.get(path);
    },
    async exists(path) { return files.has(path); },
    async remove(path) { return files.delete(path); },
    async copy(from, to) { files.set(to, files.get(from)); return to; },
    async rename(from, to) {
      files.set(to, files.get(from));
      files.delete(from);
      log.renames += 1;
      if (/^careers\/[^/]+\.json$|^careers-index\.json$/.test(to)) log.allWrites.push({ to, bytes: (files.get(to) || '').length });
      // Escrita atômica concluída: temp → arquivo definitivo da carreira.
      if (/^careers\/[^/]+\.json$/.test(to)) log.durableWrites.push({ to, at: log.durableWrites.length + 1 });
      return to;
    },
    async list() { return [...files.keys()]; },
    async stat(path) { return { size: files.has(path) ? files.get(path).length : 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
  return { files, log, api };
}

/** Sobe um runtime NOVO sobre os arquivos existentes (= abrir o app). */
export async function boot(store) {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const load = (p) => server.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const padel = await load('/src/lib/padel.js');
  const { missionRuntime } = await load('/src/missions/missionSystem.js');
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(store.api)));
  activeCareerAdapter.careerManager = careerManager;
  missionRuntime.setHydrationStatus('ready');
  return { server, careerManager, activeCareerAdapter, localGame, padel, missionRuntime, close: () => server.close() };
}

/** Cria a carreira com saldo conhecido (100) num runtime e persiste. */
export async function createCareer(rt, { coins = 100 } = {}) {
  const { career } = await rt.careerManager.createCareer({ career_name: 'Reward 524D' });
  rt.activeCareerAdapter.setActiveCareer(career);
  const id = `${career.career_id}-player`;
  await rt.activeCareerAdapter.createPlayerProfile({
    id, sport_name: 'Jogador 524D', career_date: '2026-01-01', birth_date: '2000-01-01',
    energy: 100, fatigue: 0, coins, xp: 0, morale: 70, form: 55,
    serve: 40, forehand: 40, backhand: 40, volley: 40, bandeja: 40, smash: 40, defense: 40, agility: 40, strategy: 40, emotional_control: 40,
  });
  await rt.padel.ensureTutorialMissionCatalog();
  return { careerId: career.career_id, profileId: id };
}

/** Reabre uma carreira existente num runtime novo (= carregar o save). */
export async function openCareer(rt, careerId) {
  const career = await rt.careerManager.readCareer(careerId);
  rt.activeCareerAdapter.setActiveCareer(career);
  return career;
}

/** O MESMO disparo que MissionNotificationBridge faz ao visitar /game. */
export async function visitHome(rt, profileId, eventKey = `${Date.now()}-${Math.random()}`) {
  return rt.padel.incrementMissionProgress(profileId, 'visit_career', 1, '2026-01-01', { triggerEventId: `route:${profileId}:/game:${eventKey}` });
}

/** Estado em memória (runtime atual). */
export async function memoryState(rt) {
  const player = (await rt.localGame.entities.PlayerProfile.list(null, 1))[0];
  const row = (await rt.localGame.entities.MissionProgress.filter({ mission_id: MISSION_ID }))[0] || null;
  return { coins: player?.coins, xp: player?.xp, status: row?.status || null, completed: Boolean(row?.completed), claimed: Boolean(row?.claimed), delivered: Boolean(row?.reward_delivered) };
}

/** Estado nos BYTES persistidos — sem passar por runtime nenhum. */
export function persistedState(store, careerId) {
  const raw = store.files.get(`careers/${careerId}.json`);
  if (!raw) return null;
  const career = JSON.parse(raw);
  const row = (career.entities?.MissionProgress || []).find((r) => r.mission_id === MISSION_ID) || null;
  return {
    coins: career.player?.coins,
    xp: career.player?.xp,
    status: row?.status || null,
    completed: Boolean(row?.completed),
    claimed: Boolean(row?.claimed),
    delivered: Boolean(row?.reward_delivered),
    rows: (career.entities?.MissionProgress || []).filter((r) => r.mission_id === MISSION_ID).length,
    revision: career.updated_at || null,
  };
}

let passed = 0;
export async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`PASS — ${label}`); } catch (e) { console.log(`FAIL — ${label}\n   ${e.message}`); process.exitCode = 1; throw e; }
}
export function done(name) { console.log(`${name}: ${process.exitCode ? 'FAIL' : 'PASS'} (${passed} gates)`); }
