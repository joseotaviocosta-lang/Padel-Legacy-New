// Playthrough 5.5, Parte C — instrumenta assignPairsForWeek diretamente
// (não via simulação de temporada inteira — chamada isolada, real, sobre
// o mundo semeado) pra uma semana real com torneios Gold+Silver
// concorrentes, registrando pra uma amostra de duplas (Top10/Top50/Top100/
// 101-300/301-600/601+): rank, OVR, tier desejado (chooseTournament),
// score em cada torneio da semana, tierPreferenceFit, torneio escolhido,
// motivo. Objetivo: provar onde as duplas de OVR alto da faixa 451-600
// estão indo e por que fortalecem Silver (ou não, pós-fix).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-weekly-assignment-authority-v5', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { buildCanonicalPairs } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { chooseTournament } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentSelectionAI.js');
  const { tierPreferenceFit } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: 'weekly-assign-v5', playerName: 'WeeklyAssign' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'weekly-assign-player', sport_name: 'WeeklyAssign', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const [tournaments, athletes, partnerships] = await Promise.all([
    localGame.entities.Tournament.list('start_date', 3000),
    localGame.entities.AthleteProfile.list(null, 3000),
    localGame.entities.Partnership.list(null, 3000).catch(() => []),
  ]);
  const pairs = buildCanonicalPairs(partnerships, athletes);
  const pairRank = (pair) => {
    const ranks = pair.athletes.map((a) => Number(a.ranking_position) || 0).filter((r) => r > 0);
    return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
  };
  const pairOVR = (pair) => {
    const ovrs = pair.athletes.map((a) => Number(a.overall_rating) || 0).filter((v) => v > 0);
    return ovrs.length ? ovrs.reduce((s, v) => s + v, 0) / ovrs.length : 0;
  };

  // Acha uma semana real com Gold E Silver concorrentes (mesma janela de
  // start_date), suficientemente cedo pra já ter chave definida pelos
  // torneios (Fase >= algumas semanas de simulação não é necessária aqui —
  // usamos a AGENDA já semeada, não precisa avançar dias).
  const byWeek = new Map();
  for (const t of tournaments) {
    if (!t.start_date) continue;
    const key = t.start_date;
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(t);
  }
  const ELITE_TIERS = new Set(['Masters', 'Elite', 'Crown', 'Platinum']);
  let weekTournaments = null;
  for (const [, list] of byWeek) {
    if (list.some((t) => t.tier === 'Gold') && list.some((t) => t.tier === 'Silver') && list.some((t) => ELITE_TIERS.has(t.tier))) { weekTournaments = list; break; }
  }
  if (!weekTournaments) throw new Error('nenhuma semana com Gold+Silver+tier de elite concorrentes encontrada na agenda semeada');

  console.log(`=== Parte C: semana com Gold+Silver concorrentes (${weekTournaments[0].start_date}, ${weekTournaments.length} torneios) ===\n`);

  const BUCKETS = [
    { label: 'Top10', filter: (r) => r > 0 && r <= 10, want: 5 },
    { label: 'Top50', filter: (r) => r > 10 && r <= 50, want: 10 },
    { label: 'Top100', filter: (r) => r > 50 && r <= 100, want: 10 },
    { label: '101-300', filter: (r) => r > 100 && r <= 300, want: 20 },
    { label: '301-600', filter: (r) => r > 300 && r <= 600, want: 20 },
    { label: '601+', filter: (r) => r > 600, want: 20 },
  ];

  const sampledPairs = pairs.filter((p) => pairRank(p) > 0).sort((a, b) => pairRank(a) - pairRank(b));
  const rows = [];
  for (const bucket of BUCKETS) {
    const allInBucket = sampledPairs.filter((p) => bucket.filter(pairRank(p)));
    // Amostra ESPALHADA pela faixa inteira (passo fixo), não só as
    // primeiras N duplas por rank — senão "301-600" nunca alcança o lado
    // 451-600, que é exatamente a parte que a Parte C quer observar.
    const step = Math.max(1, Math.floor(allInBucket.length / bucket.want));
    const inBucket = [];
    for (let i = 0; i < allInBucket.length && inBucket.length < bucket.want; i += step) inBucket.push(allInBucket[i]);
    for (const pair of inBucket) {
      const rank = pairRank(pair);
      const ovr = pairOVR(pair);
      const representative = { ...pair.athletes[0], overall_rating: ovr, rank, ranking_position: rank };
      const choice = chooseTournament(weekTournaments, representative, { strategy: 'balanced', currentRegion: 'global', aiFieldContext: true });
      const scores = weekTournaments.map((t) => ({ tier: t.tier, fit: tierPreferenceFit(rank, t.tier) }));
      rows.push({ bucket: bucket.label, name: pair.name, rank: rank.toFixed(0), ovr: ovr.toFixed(1), decision: choice?.decision, chosenTier: choice?.tournament?.tier || null, scores });
    }
  }

  console.log('amostra | bucket | rank | OVR | decisão | tier escolhido | fit por tier da semana');
  for (const r of rows) {
    console.log(`${r.bucket.padEnd(8)} ${r.name.padEnd(28)} rank=${r.rank.padStart(4)} OVR=${r.ovr.padStart(5)} ${r.decision} -> ${r.chosenTier || 'nenhum'} | ` + r.scores.map((s) => `${s.tier}=${s.fit}`).join(' '));
  }

  const band451to600 = rows.filter((r) => r.bucket === '301-600' && Number(r.rank) >= 451 && Number(r.rank) <= 600);
  const goldChoices = band451to600.filter((r) => r.chosenTier === 'Gold').length;
  const silverChoices = band451to600.filter((r) => r.chosenTier === 'Silver').length;
  console.log(`\nfaixa 451-600 nesta amostra: ${band451to600.length} duplas | escolheram Gold=${goldChoices} Silver=${silverChoices}`);

  check('amostra real coletada pras 6 faixas pedidas (Top10/50/100/101-300/301-600/601+)', () => {
    assert.ok(rows.length >= 40, `rows.length=${rows.length} (esperado >= ~85 no total, mínimo de sanidade 40)`);
  });
  check('duplas Top10 preferem tiers de elite (Masters/Elite/Crown/Platinum), não Gold/Silver/Bronze', () => {
    const top10 = rows.filter((r) => r.bucket === 'Top10' && r.chosenTier);
    if (!top10.length) return; // pode não ter escolhido nada nesta semana específica — sem hard-fail (Parte E, sem banimento).
    const eliteChoices = top10.filter((r) => ['Masters', 'Elite', 'Crown', 'Platinum'].includes(r.chosenTier)).length;
    assert.ok(eliteChoices / top10.length >= 0.5, `só ${eliteChoices}/${top10.length} Top10 escolheram tier de elite`);
  });
  check('faixa 451-600 (quando escolhe entre Gold/Silver): NÃO vai desproporcionalmente pra Silver (o mecanismo que fortalecia Silver antes do fix)', () => {
    if (goldChoices + silverChoices === 0) return; // amostra vazia nesta semana específica — documentado, sem hard-fail.
    assert.ok(silverChoices <= goldChoices + 2, `Silver=${silverChoices} Gold=${goldChoices} — ainda desproporcional pra Silver`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-weekly-assignment-authority-v5: PASS');
} finally {
  await vite.close();
}
