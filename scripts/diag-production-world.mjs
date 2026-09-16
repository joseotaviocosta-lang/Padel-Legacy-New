// Item 3 do playthrough 4 — mede a simulação do mundo no CAMINHO DE PRODUÇÃO,
// não no harness de auditoria. Diferenças em relação ao harness:
//   - bootstrap do mundo por `ensureWorldSeed2025()` (o mesmo que
//     SaveFoundationBootstrap.jsx chama numa carreira real), não por seeding
//     manual de atletas;
//   - avanço de dia por `advanceCareerDayOnce` (dayAdvanceCoordinator, o que o
//     botão "Avançar" da UI executa), não por advanceDay+processGameStateDay.
// A única coisa que continua diferente de produção é o backend de storage:
// Tauri não roda headless, então usamos o mesmo MemoryStorage do harness por
// baixo de GameStorage/CareerRepository/CareerManager.
const DAYS = Number(process.argv[2] || 20);

// Shim headless: `ensureWorldSeed2025` e alguns lifecycles emitem eventos de
// UI via `window.dispatchEvent`. Nada disso altera estado de jogo — é só
// notificação para a tela. O shim existe para o caminho de produção rodar
// fora do browser; nenhum código de produção foi alterado para este teste.
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    CustomEvent: globalThis.CustomEvent,
    location: { pathname: '/', href: 'http://localhost/', search: '', hash: '' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
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
  async list(dir = '.') {
    const normalizedDir = String(dir).replace(/\/+$/, '');
    const prefix = normalizedDir === '' || normalizedDir === '.' ? '' : `${normalizedDir}/`;
    const entries = new Map();
    for (const filePath of this.files.keys()) {
      if (prefix && !filePath.startsWith(prefix)) continue;
      const rest = prefix ? filePath.slice(prefix.length) : filePath;
      if (!rest || rest.includes('/')) continue;
      entries.set(rest, { name: rest, isDirectory: false });
    }
    return [...entries.values()];
  }
}

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const gameCore = await vite.ssrLoadModule('/src/game-core/index.js');

  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'prod-check' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'prod-player', sport_name: 'Prod Check', career_date: '2026-01-01', birth_date: '2008-01-01',
    level: 'Iniciante', play_style: 'controle', court_side: 'direita', preferred_side: 'right',
    handedness: 'right', tactical_role: 'controlador', overall: 12, overall_rating: 12,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });

  console.log('Bootstrap do mundo (ensureWorldSeed2025)…');
  await ensureWorldSeed2025();
  const athletes0 = await localGame.entities.AthleteProfile.list('-ranking_points', 3000);
  console.log(`Atletas no mundo: ${athletes0.length}`);

  let profile = await localGame.entities.PlayerProfile.get('prod-player');
  console.log(`Avançando ${DAYS} dias por advanceCareerDayOnce (sem inscrição em nada)…`);
  const worldTourReports = [];
  for (let day = 0; day < DAYS; day += 1) {
    profile = await gameCore.advanceCareerDayOnce(profile);
    const wt = profile?.game_state_last_report?.livingWorld;
    if (wt) worldTourReports.push({ date: profile.career_date, wt });
  }
  console.log(`Data final: ${profile.career_date}`);

  const athletes = await localGame.entities.AthleteProfile.list('-ranking_points', 3000);
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const sumRace = athletes.reduce((acc, a) => acc + (Number(a.race_points) || 0), 0);
  const sumRank = athletes.reduce((acc, a) => acc + (Number(a.world_ranking_points ?? a.ranking_points) || 0), 0);
  const withRace = athletes.filter((a) => (Number(a.race_points) || 0) > 0).length;
  const champions = tournaments.filter((t) => t.champion);
  const finished = tournaments.filter((t) => t.status === 'finalizado');
  const past = tournaments.filter((t) => (t.end_date || t.start_date) < profile.career_date);

  console.log('\n================ RESULTADO (caminho de produção) ================');
  console.log(`Torneios no calendário .............. ${tournaments.length}`);
  console.log(`Torneios com data já vencida ........ ${past.length}`);
  console.log(`Torneios status=finalizado .......... ${finished.length}`);
  console.log(`Torneios COM CAMPEÃO gravado ........ ${champions.length}`);
  console.log(`SOMA de race_points (todos atletas) . ${sumRace}`);
  console.log(`Atletas com race_points > 0 ......... ${withRace}`);
  console.log(`SOMA de ranking_points .............. ${sumRank}`);
  if (champions.length) {
    console.log('\nCampeões gravados (até 5):');
    champions.slice(0, 5).forEach((t) => console.log(`  ${t.start_date} ${String(t.tier).padEnd(9)} ${t.name} -> ${t.champion}`));
  }
  const lastReport = worldTourReports[worldTourReports.length - 1];
  console.log('\nÚltimo relatório livingWorld persistido:');
  console.log(JSON.stringify(lastReport?.wt ?? null).slice(0, 600));
} catch (error) {
  console.error('FALHOU:', error?.stack || error?.message || error);
} finally {
  await vite.close();
}
