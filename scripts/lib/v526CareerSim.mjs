// Playthrough 5.26 — fundação do simulador de carreira para a auditoria de
// progressão/economia. Usa SOMENTE o pipeline real de produção:
//  - criação de carreira = o que a tela "Nova carreira" faz
//    (CareerManager.createCareer → ensureMyProfile → ensureWorldSeed2025);
//  - avanço de dia = advanceCareerDays/finalizeCareerAdvanceRange reais (que
//    rodam simulateWorldDay, mercado de duplas da IA, world tour, staff,
//    patrocínio, finanças mensais...);
//  - decisões do jogador = as MESMAS funções que as páginas chamam
//    (registerTournament, signSponsorContract, hireStaff/coach, compra na
//    loja, executeTraining, resolveDecision, partidas pelo motor real).
// Nenhuma fórmula de balanceamento é reimplementada aqui.
import { createServer } from 'vite';

export function hashSeed(text) {
  let value = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) { value ^= String(text).charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Determinismo por carreira: Math.random e o relógio passam a ser
 * determinísticos a partir da seed (o mesmo recurso usado pelos testes de
 * estabilidade populacional). Sem isso, duas execuções da mesma seed
 * divergem e o determinismo da auditoria não pode ser provado.
 */
export function installDeterminism(seedString) {
  const seedInt = hashSeed(seedString);
  // Gerador com estado exportável: o reload do runtime salva/restaura o estado
  // para que o boot (que também consome Math.random) não desloque a sequência.
  let rngState = seedInt >>> 0;
  // Playthrough 5.27-D: o module runner do Vite (nanoid dos ids de RPC, ~21
  // chamadas por módulo carregado pela 1ª vez no processo) também usa
  // Math.random. Sem isolar, cada carregamento preguiçoso consumia o fluxo do
  // JOGO; num processo retomado os módulos carregam em outros momentos e a
  // carreira divergia logo após o checkpoint. Com PL527D_ISOLATE_VITE_RNG=1, o
  // chamador imediato em node_modules/vite recebe um fluxo próprio (irrelevante
  // para o jogo) e o fluxo do jogo só avança com chamadas do jogo.
  const isolateVite = process.env.PL527D_ISOLATE_VITE_RNG === '1';
  let viteState = (seedInt ^ 0x9E3779B9) >>> 0;
  const step = (s) => {
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const callerIsVite = () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 1;
    const holder = {};
    Error.captureStackTrace(holder, Math.random);
    Error.stackTraceLimit = limit;
    return holder.stack.includes('node_modules/vite/');
  };
  Math.random = function deterministicRandom() {
    if (isolateVite && callerIsVite()) { viteState = (viteState + 0x6D2B79F5) | 0; return step(viteState); }
    rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
    return step(rngState);
  };
  const RealDate = globalThis.__plRealDate || Date;
  globalThis.__plRealDate = RealDate;
  // Base = data REAL do playtest (04/10/2026). Algumas regras do jogo usam o
  // relógio do computador em vez da data da carreira (ex.: idade em
  // sponsors.js:calculateAge) — com a base no dia real, o harness reproduz o
  // que um jogador vive hoje. O relógio avança 1s por leitura (determinístico).
  let fakeClockMs = new RealDate('2026-10-04T12:00:00.000Z').getTime() + (seedInt % 100000);
  function tick() { fakeClockMs += 1000; return fakeClockMs; }
  class DeterministicDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(tick()); else super(...args); }
    static now() { return tick(); }
  }
  globalThis.Date = DeterministicDate;
  globalThis.__pl526Det = {
    getState: () => ({ rngState, fakeClockMs }),
    setState: (st) => { rngState = st.rngState; fakeClockMs = st.fakeClockMs; },
  };
}

export class MemoryStorage {
  constructor(files = new Map()) { this.files = files; this.directories = new Set(); }
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
  // Mesmo contrato do TauriStorage.list: entradas DIRETAS do diretório como
  // { name, isDirectory }. (Devolver todos os caminhos fazia a rotação de
  // backups do BackupManager nunca achar nada → backups acumulavam em RAM.)
  async list(dir = '.') {
    const base = !dir || dir === '.' ? '' : `${String(dir).replace(/\/+$/, '')}/`;
    const entries = new Map();
    for (const p of [...this.files.keys(), ...this.directories]) {
      if (!p.startsWith(base) || p === base.slice(0, -1)) continue;
      const rest = p.slice(base.length);
      if (!rest) continue;
      const [name, ...more] = rest.split('/');
      const isDirectory = more.length > 0 || (this.directories.has(p) && !this.files.has(p));
      if (!entries.has(name) || isDirectory) entries.set(name, { name, isDirectory });
    }
    return [...entries.values()];
  }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

/**
 * Shim mínimo de navegador para o Node: alguns lifecycles reais (ex.:
 * saveFoundation) publicam eventos em `window` e leem localStorage. Sem isto
 * a fundação do mundo aborta em Node; com ele, o MESMO código roda.
 */
// 5.26-C: `fresh` recria o `window` (sem os listeners do runtime anterior),
// mas o localStorage sobrevive — exatamente como reabrir o app no aparelho.
// O conteúdo do localStorage entra no checkpoint (getLocalStoreSnapshot).
export function installBrowserShim({ fresh = false } = {}) {
  if (!fresh && globalThis.window && globalThis.window.__pl526Shim) return;
  const target = new EventTarget();
  const store = (globalThis.__pl526LocalStore ||= new Map());
  target.__pl526Shim = true;
  target.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  target.location = { pathname: '/game', search: '', hostname: 'localhost', href: 'http://localhost/game' };
  target.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  target.setTimeout = setTimeout; target.clearTimeout = clearTimeout;
  target.setInterval = setInterval; target.clearInterval = clearInterval;
  globalThis.window = target;
  globalThis.localStorage = target.localStorage;
}

export function getLocalStoreSnapshot() { return Object.fromEntries(globalThis.__pl526LocalStore || new Map()); }
export function restoreLocalStore(entries = {}) { globalThis.__pl526LocalStore = new Map(Object.entries(entries || {})); }

/**
 * SHIM CONTRAFACTUAL (só no harness, nunca em src/) — bug P0 achado na 5.26:
 * verifySaveFoundation/ensureWorldSeed2025 (saveFoundation.js) leem só os 500
 * primeiros AthleteProfile por pontos; quando um atleta REAL do registro cai
 * para fora desse top 500, a "reparação" tenta CRIAR de novo o mesmo id
 * (ex.: real_franco_renato_dal_bianco) → "AthleteProfile já existe" → a
 * transação do dia falha SEMPRE e a carreira trava para sempre (~dia 366–431).
 * Para medir 5–15 temporadas, o create de AthleteProfile com id existente
 * devolve a linha existente em vez de lançar. Cada disparo é contado em
 * globalThis.__pl526SoftLock — a data do 1º disparo é o dia em que o jogo
 * real travaria.
 * Playthrough 5.26-B: o bug foi corrigido na origem (saveFoundation.js) e o
 * shim passou a ser OPT-IN (PL526_SHIM=1), só para reproduzir o build antigo.
 * Sem a variável, o harness roda o jogo real, sem nenhum contorno.
 */
async function installSoftLockShim(load) {
  globalThis.__pl526SoftLock ||= { fires: 0, ids: [] };
  if (process.env.PL526_SHIM !== '1') return;
  const { CareerEntityRepository } = await load('/src/gameplay/repositories/CareerEntityRepository.js');
  const proto = CareerEntityRepository.prototype;
  if (proto.__pl526Shim) return;
  const originalCreate = proto.create;
  proto.create = async function shimmedCreate(entityName, data = {}) {
    if (entityName === 'AthleteProfile' && data?.id) {
      const existing = await this.get(entityName, data.id).catch(() => null);
      if (existing) {
        globalThis.__pl526SoftLock.fires += 1;
        if (globalThis.__pl526SoftLock.ids.length < 20) globalThis.__pl526SoftLock.ids.push(data.id);
        return existing;
      }
    }
    return originalCreate.call(this, entityName, data);
  };
  proto.__pl526Shim = true;
}

/** Sobe um runtime novo (todos os módulos reais) sobre um storage. */
export async function bootRuntime(storage) {
  installBrowserShim({ fresh: true });
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
  const load = (p) => server.ssrLoadModule(p);
  const m = {
    GameStorage: (await load('/src/storage/GameStorage.js')).GameStorage,
    CareerRepository: (await load('/src/careers/CareerRepository.js')).CareerRepository,
    CareerManager: (await load('/src/careers/CareerManager.js')).CareerManager,
    runtime: await load('/src/gameplay/services/runtime.js'),
    localGame: (await load('/src/api/localGameClient.js')).localGame,
    padel: await load('/src/lib/padel.js'),
    saveFoundation: await load('/src/lib/saveFoundation.js'),
    calendar: await load('/src/game-core/calendarLifecycle.js'),
    missions: await load('/src/missions/missionSystem.js'),
  };
  await installSoftLockShim(load);
  const careerManager = new m.CareerManager(new m.CareerRepository(new m.GameStorage(storage)));
  m.runtime.activeCareerAdapter.careerManager = careerManager;
  m.missions.missionRuntime.setHydrationStatus('ready');
  return { server, load, careerManager, ...m, close: () => server.close() };
}

/** Mesma sequência da tela "Nova carreira" + boot da fundação do save. */
export async function createRealCareer(rt, { saveName, difficulty = 'normal' } = {}) {
  const { career } = await rt.careerManager.createCareer({ saveName, playerName: 'Novo Atleta', careerType: 'normal' });
  const loaded = await rt.careerManager.loadCareer(career.career_id);
  rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
  const user = await rt.localGame.auth.me();
  let profile = await rt.padel.ensureMyProfile(user);
  const status = await rt.saveFoundation.verifySaveFoundation().catch(() => ({ ok: false }));
  if (!status.ok) await rt.saveFoundation.ensureWorldSeed2025();
  if (difficulty && profile.career_difficulty !== difficulty) {
    profile = await rt.localGame.entities.PlayerProfile.update(profile.id, { career_difficulty: difficulty });
  }
  return { careerId: career.career_id, profile };
}
