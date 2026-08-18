// M3.5 — Render Storm + Long Tasks (docs/MOBILE_M3_5_RENDER_STORM.md).
//
// Profiling real de Android físico mostrou CommunicationBell renderizando
// 80x, BottomNav 43x, AppLayout 40x, CareerHud 37x parado numa única tela —
// e Missions/Matches a 14/8 FPS mesmo com DOM modesto. Causa raiz encontrada
// por leitura direta do código (não suposição): AppLayout.jsx re-renderiza
// com frequência (useCareerHeaderData faz um setProfile síncrono seguido de
// um setRanking assíncrono — dois commits por evento em vez de um), e nada
// abaixo dele era memoizado — incluindo a PÁGINA roteada via <Outlet/>, que
// o React reinvoca a cada re-render do ancestral mesmo sem props mudarem.
// Esta suíte não pode medir FPS real (isso exige o Android físico — ver
// relatório final), mas prova estruturalmente que as correções estão no
// lugar e comportamentalmente que elas não mudam resultado nenhum (engine
// determinística, storage, avanço de dia).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const read = (relPath) => readFileSync(relPath, 'utf8');

// ---------------------------------------------------------------------------
// 1) Shell: os 4 componentes do storm real (Ação) + as 2 páginas roteadas
//    mais afetadas (Missions/Matches) ficaram memoizados.
// ---------------------------------------------------------------------------
const communicationBell = read('src/components/communications/CommunicationBell.jsx');
const bottomNav = read('src/components/BottomNav.jsx');
const floatingUtilityRail = read('src/components/system/FloatingUtilityRail.jsx');
const careerHud = read('src/components/career/CareerHud.jsx');
const appLayout = read('src/components/AppLayout.jsx');
const missions = read('src/pages/Missions.jsx');
const matches = read('src/pages/Matches.jsx');
const liveMatch = read('src/components/matches/LiveMatch.jsx');
const careerEntityRepository = read('src/gameplay/repositories/CareerEntityRepository.js');
const dayAdvanceCoordinator = read('src/game-core/dayAdvanceCoordinator.js');
const performanceProbe = read('src/dev/performanceProbe.js');
const mobilePerformanceMonitor = read('src/dev/MobilePerformanceMonitor.jsx');

gate('CommunicationBell perdeu o React.memo (voltaria a renderizar em cascata)', communicationBell.includes('export default React.memo(CommunicationBell)'));
gate('BottomNav perdeu o React.memo', bottomNav.includes('export default React.memo(BottomNav)'));
gate('FloatingUtilityRail perdeu o React.memo', floatingUtilityRail.includes('export default React.memo(FloatingUtilityRail)'));
gate('CareerHud perdeu o React.memo com comparador dedicado', /export default React\.memo\(CareerHud, areEqual\)/.test(careerHud));
gate('Comparador de CareerHud continua restrito aos campos que ele exibe (energy/fatigue/coins/rank)', careerHud.includes('Number(prev.profile?.energy) === Number(next.profile?.energy)') && careerHud.includes("(prev.ranking?.rank || null) === (next.ranking?.rank || null)"));
gate('Missions.jsx perdeu o React.memo (página roteada via <Outlet/>)', missions.includes('export default React.memo(Missions)'));
gate('Matches.jsx perdeu o React.memo', matches.includes('export default React.memo(Matches)'));

// ---------------------------------------------------------------------------
// 2) useCareerHeaderData: profile+ranking devem ser commitados juntos (1
//    render), não em duas atualizações separadas (setProfile síncrono +
//    setRanking dentro de um .then() assíncrono).
// ---------------------------------------------------------------------------
gate('applyProfile voltou a disparar setProfile antes de aguardar getWorldRank (2 commits por evento)', !/setProfile\([^)]*\);\s*void getWorldRank/.test(appLayout));
gate('applyProfile aguarda getWorldRank antes de gravar profile/ranking (commit único por evento)', /await getWorldRank\(nextProfile\)\.catch\(\(\) => null\);\s*setProfile\(nextProfile\);\s*setRanking\(nextRanking\);/.test(appLayout));

// ---------------------------------------------------------------------------
// 3) Missions.jsx: as 3 computações caras do corpo de render viraram useMemo.
// ---------------------------------------------------------------------------
gate('anticipatedCompleted deixou de ser memoizado (refaria o filtro em toda renderização)', /const anticipatedCompleted = useMemo\(/.test(missions));
gate('categoryPool deixou de ser memoizado', /const categoryPool = useMemo\(/.test(missions));
gate('filtered (deterministicMissionSelection) deixou de ser memoizado', /const filtered = useMemo\(/.test(missions));

// ---------------------------------------------------------------------------
// 4) LiveMatch: autoplay em alta velocidade deixou de agrupar pontos por
//    commit (pointsPerTick).
// ---------------------------------------------------------------------------
gate('LiveMatch perdeu o agrupamento de pontos por commit em velocidades altas (pointsPerTick)', liveMatch.includes('pointsPerTick') && liveMatch.includes('MIN_TICK_MS'));
gate('o loop de pontos por tick para corretamente ao terminar a partida no meio do lote', /for \(let i = 0; i < pointsPerTick && !next\.finished; i \+= 1\) next = playPoint\(next\);/.test(liveMatch));

// ---------------------------------------------------------------------------
// 5) Instrumentação nova: storage IO e breakdown de advance-day.
// ---------------------------------------------------------------------------
gate('CareerEntityRepository perdeu o contador de IO (careerIOStats)', careerEntityRepository.includes('export const careerIOStats') && careerEntityRepository.includes('export function resetCareerIOStats'));
gate('dayAdvanceCoordinator parou de passar um profiler real para processGameStateDay', dayAdvanceCoordinator.includes('createStageProfiler()') && dayAdvanceCoordinator.includes('processGameStateDay(fresh, previousDate, currentDate, { profiler })'));
gate('performanceProbe perdeu createStageProfiler/getLastAdvanceDayBreakdown', performanceProbe.includes('export function createStageProfiler') && performanceProbe.includes('export function getLastAdvanceDayBreakdown'));
gate('MobilePerformanceMonitor parou de exibir o breakdown do advance-day', mobilePerformanceMonitor.includes('advanceDayBreakdown'));
gate('MobilePerformanceMonitor parou de exibir os contadores de storage IO', mobilePerformanceMonitor.includes('ioStats.reads') && mobilePerformanceMonitor.includes('ioStats.writes'));
gate('"zerar contadores" parou de zerar também o storage IO', mobilePerformanceMonitor.includes('resetCareerIOStats()'));

// ---------------------------------------------------------------------------
// 6) Comportamental: engine real (sem mock) via Vite SSR.
// ---------------------------------------------------------------------------
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');

  // 6a. O agrupamento de pontos por commit não pode mudar o resultado da
  // partida: joga a MESMA seed ponto-a-ponto (referência) e em lotes de
  // tamanho variável, e compara o estado final byte a byte.
  function playFull(state) {
    let next = state;
    let safety = 4000;
    while (!next.finished && safety-- > 0) next = playPoint(next);
    if (!next.finished) throw new Error('Partida não terminou dentro do limite de segurança.');
    return next;
  }
  function playBatched(state, batchSize) {
    let next = state;
    let safety = 4000;
    while (!next.finished && safety-- > 0) {
      for (let i = 0; i < batchSize && !next.finished; i += 1) next = playPoint(next);
    }
    if (!next.finished) throw new Error('Partida (lote) não terminou dentro do limite de segurança.');
    return next;
  }
  const fakePlayer = (id, name) => ({
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, partner_chemistry: 60, partner_trust: 60, partner_morale: 60, matches_played: 0,
  });
  const teamA = [fakePlayer('me', 'Jogador'), fakePlayer('partner', 'Parceiro')];
  const teamB = [fakePlayer('bot1', 'Rival1'), fakePlayer('bot2', 'Rival2')];
  const seed = 'mobile-m3-5-batch-determinism';
  const reference = playFull(createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed }));
  for (const batchSize of [1, 2, 5, 10]) {
    const batched = playBatched(createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed }), batchSize);
    gate(`lote de ${batchSize} ponto(s)/commit produz o MESMO placar final que ponto-a-ponto`, batched.setsA === reference.setsA && batched.setsB === reference.setsB && batched.winner === reference.winner);
    gate(`lote de ${batchSize} ponto(s)/commit produz a MESMA narração final que ponto-a-ponto`, JSON.stringify(batched.narration) === JSON.stringify(reference.narration));
  }

  // 6b. advance-day: o profiler real (mesmo usado por dayAdvanceCoordinator)
  // devolve um breakdown coerente das etapas de processGameStateDay. Mesmo
  // padrão de storage em memória de scripts/test-notification-100day-simulation-rc.mjs
  // (monkeypatch do singleton gameRepository) — sem isso, cada subsistema
  // tenta acessar o plugin de FS do Tauri (indisponível fora do runtime
  // Tauri) e só mede o tempo até falhar, não trabalho real.
  const { gameRepository } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const fakeCareer = { entities: {} };
  gameRepository.ensureActiveCareer = async () => fakeCareer;
  gameRepository.mutateActiveCareer = async (mutator) => ({ result: await mutator(fakeCareer), career: fakeCareer });
  const { processGameStateDay } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { createStageProfiler, getLastAdvanceDayBreakdown } = await server.ssrLoadModule('/src/dev/performanceProbe.js');
  const profile = { id: 'm3-5-profile', career_date: '2026-01-01', energy: 90, fatigue: 10, coins: 1000, xp: 0 };
  const profiler = createStageProfiler();
  await processGameStateDay(profile, '2026-01-01', '2026-01-02', { profiler });
  const breakdown = profiler.finish();
  const expectedStages = ['partner', 'world', 'aiPartnerships', 'aiCareerStrategy', 'circuit', 'circuitLife', 'athleteIntelligence', 'medical', 'relationships', 'staff', 'livingWorld'];
  gate('o profiler real de advance-day mede todas as etapas esperadas de processGameStateDay', expectedStages.every((name) => Object.prototype.hasOwnProperty.call(breakdown.stages, name)));
  gate('cada etapa medida tem uma duração numérica não negativa', Object.values(breakdown.stages).every((ms) => typeof ms === 'number' && ms >= 0));
  gate('getLastAdvanceDayBreakdown() devolve o mesmo snapshot que profiler.finish()', getLastAdvanceDayBreakdown()?.at === breakdown.at);

  // 6c. Storage IO: contadores reais via CareerEntityRepository, com o
  // mesmo padrão de storage em memória usado no resto da suíte.
  const { GameRepository } = await server.ssrLoadModule('/src/gameplay/repositories/GameRepository.js');
  const { ActiveCareerAdapter } = await server.ssrLoadModule('/src/gameplay/adapters/ActiveCareerAdapter.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerEntityRepository, careerIOStats, resetCareerIOStats } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');

  function createMemoryStorage() {
    const files = new Map();
    return {
      isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
      async writeText(p, c) { files.set(p, String(c)); },
      async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
      async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
      async copy(s, d) { files.set(d, files.get(s)); return d; },
      async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
      async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; },
      getDataDirectoryDescription: () => 'memory',
    };
  }
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'm3-5-io-career', name: 'M3.5 IO' });
  const adapter = new ActiveCareerAdapter(careerManager);
  await adapter.getActiveCareer();
  const entityRepo = new CareerEntityRepository(new GameRepository(adapter));

  resetCareerIOStats();
  await entityRepo.list('Mission');
  await entityRepo.filter('Mission', {});
  await entityRepo.create('Mission', { title: 'Teste M3.5' });
  gate('careerIOStats conta pelo menos as leituras realizadas', careerIOStats.reads >= 1);
  gate('careerIOStats conta a gravação realizada', careerIOStats.writes === 1);
  gate('careerIOStats acumula tempo total > 0 após operações reais', careerIOStats.totalMs > 0);
  resetCareerIOStats();
  gate('resetCareerIOStats() zera leituras/gravações/tempo', careerIOStats.reads === 0 && careerIOStats.writes === 0 && careerIOStats.totalMs === 0 && careerIOStats.maxMs === 0);
} finally {
  await server.close();
}

console.log(`\n${gates} gates executados, todos PASS — Mobile M3.5 (render storm + long tasks).`);
