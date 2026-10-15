// Playthrough 5.16, Partes O/P — um SAVE PRÉ-5.15 reconstruído.
//
// A 5.15 provou população coerente em mundos NOVOS. Isso não diz nada sobre
// a carreira que o jogador já tinha: se o save dele nasceu antes daquelas
// correções, ele carrega as patologias antigas e nenhum seed novo o conserta.
// Este fixture injeta exatamente as quatro patologias descritas na Parte P,
// por cima de um mundo já semeado, para que o código ATUAL seja obrigado a
// encará-las.
import { createServer } from 'vite';

export function installShims(pathname = '/ranking') {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

/**
 * Sobe um mundo semeado e devolve os handles necessários para injetar as
 * patologias legadas e reexecutar o reparo.
 */
export async function bootstrapLegacyWorld(label, { careerDate = '2026-01-19' } = {}) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await mod('/src/storage/GameStorage.js');
  const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
  const { CareerManager } = await mod('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
  const { localGame } = await mod('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
  const { getRealAthleteRegistry } = await mod('/src/players/realAthleteRegistry.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const profileId = `p-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: profileId, sport_name: label, career_date: careerDate, birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();

  const realBotIds = new Set(getRealAthleteRegistry().map((a) => a.id).filter(Boolean));
  return { vite, mod, localGame, profile, profileId, careerDate, realBotIds };
}

/**
 * Injeta as patologias da Parte P num mundo já semeado.
 *
 * Devolve a contagem do que foi injetado, para que o teste possa afirmar que
 * o estado ANTES do reparo era de fato doente — sem isso, um reparo que não
 * faz nada passaria trivialmente.
 */
export async function injectLegacyPathologies({ localGame, realBotIds }, {
  ghostPairs = 25, inflatedPairs = 6,
} = {}) {
  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const reals = athletes.filter((a) => a?.bot_id && realBotIds.has(a.bot_id));
  const injected = { ghosts: [], inflated: [], duplicatedReal: [] };

  // --- (1) GHOST RR: duplas entre atletas REAIS que não se declaram --------
  // parceiros. Embaralhamento determinístico: pega reais que JÁ têm parceiro
  // declarado e cruza com outro real qualquer — a dupla nunca existiu.
  const withPartner = reals.filter((a) => a.ai_partner_id);
  for (let i = 0; i < ghostPairs && i * 2 + 1 < withPartner.length; i += 1) {
    const a = withPartner[i];
    // Parceiro deslocado: garantidamente NÃO é o ai_partner_id de `a`.
    const b = withPartner[(i + 7) % withPartner.length];
    if (!a || !b || a.id === b.id) continue;
    if (a.ai_partner_id === b.id || b.ai_partner_id === a.id) continue;
    const row = await localGame.entities.TeamRanking.create({
      team_key: `legacy-ghost-${i}`,
      player1_id: a.id, player1_name: a.sport_name || a.name,
      player2_id: b.id, player2_name: b.sport_name || b.name,
      ranking_points: 9000 - i * 30,
      matches_played: 20, wins: 12, losses: 8, titles: [],
    });
    injected.ghosts.push(row.id);
    injected.duplicatedReal.push(a.id, b.id);
  }

  // --- (2) PP HARDCODED INFLADA: pontos sem relação com os membros --------
  const procedurals = athletes.filter((a) => !a?.bot_id || !realBotIds.has(a.bot_id));
  for (let i = 0; i < inflatedPairs && i * 2 + 1 < procedurals.length; i += 1) {
    const a = procedurals[i * 2];
    const b = procedurals[i * 2 + 1];
    if (!a || !b || a.id === b.id) continue;
    const row = await localGame.entities.TeamRanking.create({
      team_key: `legacy-inflated-${i}`,
      player1_id: a.id, player1_name: a.sport_name || a.name,
      player2_id: b.id, player2_name: b.sport_name || b.name,
      // Valor de seed antigo: alto e completamente desligado dos membros.
      ranking_points: 2240 - i * 40,
      matches_played: 30, wins: 20, losses: 10, titles: [],
    });
    injected.inflated.push({ id: row.id, a: a.id, b: b.id, stored: 2240 - i * 40 });
  }

  return injected;
}

/** Métricas de sanidade de população, iguais às da 5.15. */
export async function measurePopulation({ localGame, realBotIds }) {
  const [teams, athletes] = await Promise.all([
    localGame.entities.TeamRanking.list('-ranking_points', 5000),
    localGame.entities.AthleteProfile.list(null, 5000),
  ]);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const isReal = (id) => {
    const a = byId.get(id);
    return Boolean(a?.bot_id && realBotIds.has(a.bot_id));
  };
  const declares = (x, y) => byId.get(x)?.ai_partner_id === y;

  let ghostRR = 0;
  const realAppearances = new Map();
  for (const t of teams) {
    if (isReal(t.player1_id) && isReal(t.player2_id)) {
      if (!declares(t.player1_id, t.player2_id) && !declares(t.player2_id, t.player1_id)) ghostRR += 1;
    }
    for (const id of [t.player1_id, t.player2_id]) {
      if (isReal(id)) realAppearances.set(id, (realAppearances.get(id) || 0) + 1);
    }
  }
  const duplicatedReal = [...realAppearances.values()].filter((n) => n > 1).length;

  return { teams, athletes, byId, isReal, ghostRR, duplicatedReal, total: teams.length };
}
