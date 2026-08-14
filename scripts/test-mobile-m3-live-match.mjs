// Mobile M3 — Live Match Mobile + Match Checkpoint/Lifecycle
// (docs/MOBILE_M3_LIVE_MATCH_LIFECYCLE.md).
//
// Duas camadas, como nas fases mobile anteriores: checks estruturais (regex
// sobre o código-fonte — rápidos, mas não provam que a lógica realmente
// funciona) e checks COMPORTAMENTAIS reais (Partes 30/31 do enunciado), que
// executam o match engine e o MatchCheckpointRepository de verdade, com uma
// storage falsa em memória no lugar do plugin de FS do Tauri (indisponível
// fora do runtime Tauri) — não é possível construir aqui uma verificação
// comportamental completa de ponta a ponta de finalizePracticeMatch (ela usa
// o singleton `gameRepository`, ligado à árvore de storage real do app), mas
// o mecanismo do qual a idempotência de recompensa realmente depende
// (chave estável + checkpoint preservando o mesmo seed/match id) é
// verificado tanto estruturalmente quanto via engine real abaixo.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createMatch, playPoint } from '../src/engine/match/index.js';
import { MatchCheckpointRepository, isValidCheckpointShape, createCheckpointMatchId } from '../src/careers/MatchCheckpointRepository.js';
import { makeMatchFinalizationKey } from '../src/game-core/matchFinalization.js';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}
async function checkAsync(label, fn) {
  checks += 1;
  const ok = await fn();
  if (!ok) throw new Error(`FALHA: ${label}`);
}

const liveMatch = read('src/components/matches/LiveMatch.jsx');
const simulationModal = read('src/components/matches/SimulationModal.jsx');
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
const matchesPage = read('src/pages/Matches.jsx');
const tournamentsPage = read('src/pages/Tournaments.jsx');
const calendarPage = read('src/pages/CalendarPage.jsx');
const careerHub = read('src/pages/CareerHub.jsx');
const checkpointRepoSource = read('src/careers/MatchCheckpointRepository.js');
const pkg = JSON.parse(read('package.json'));

// ── 1. Touch targets do LiveMatch ───────────────────────────────────────────

check('tabs de painel (Jogo/Tática/Técnico/Ao vivo) perderam o marcador pl-tab-trigger', liveMatch.includes('pl-tab-trigger'));
check('botão Pausar/Continuar perdeu o marcador pl-btn-tap', /onClick=\{onTogglePlay\}[\s\S]{0,80}pl-btn-tap|pl-btn-tap[\s\S]{0,120}onTogglePlay/.test(liveMatch) || liveMatch.includes('pl-btn-tap min-h-10'));
check('botões de velocidade (1x/2x/5x/10x) perderam o marcador pl-icon-tap', liveMatch.includes('pl-icon-tap min-h-8'));
check('SkipButton (Ponto/Game/Set/Fim) perdeu o marcador pl-btn-tap', /function SkipButton[\s\S]{0,300}pl-btn-tap/.test(liveMatch));

// ── 2. Feed limitado / scoreboard e controles fora do scroll ───────────────

check('feed da narração perdeu o limite de 120 eventos renderizados', liveMatch.includes('.slice(-120)'));
check('scoreboard deixou de ficar em contêiner shrink-0 fora da área de scroll', /shrink-0[^`]*<CompactScoreboard/.test(liveMatch));
check('playback controls deixaram de ficar em contêiner shrink-0 fora da área de scroll', /shrink-0">\s*<PlaybackControls/.test(liveMatch));
check('área de conteúdo dos painéis perdeu min-h-0 flex-1 (contrato de altura que mantém placar/controles visíveis)', liveMatch.includes('min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/50'));

// ── 3. Timers / autoplay / background ───────────────────────────────────────

check('LiveMatch perdeu o listener de visibilitychange (pausa automática em background)', liveMatch.includes("addEventListener('visibilitychange'"));
check('handler de visibilitychange não pausa o autoplay ao ir para background', /handleVisibilityChange\(\)\s*\{\s*if \(document\.hidden\)\s*\{\s*setAutoPlay\(false\)/.test(liveMatch));
check('resumo de partida (initialState) não força autoPlay pausado ao retomar', liveMatch.includes('useState(!initialState)'));
check('cleanup do timer de autoplay (setTimeout) foi removido — risco de timer duplicado', /window\.setTimeout[\s\S]{0,150}return \(\) => window\.clearTimeout/.test(liveMatch));

// ── 4. Checkpoint: criação/atualização/leitura/schema ──────────────────────

check('MatchCheckpointRepository.js não existe', exists('src/careers/MatchCheckpointRepository.js'));
check('checkpoint usa localStorage.setItem/getItem em algum lugar (proibido pelo enunciado)', !/localStorage\.(setItem|getItem|removeItem)/.test(checkpointRepoSource));
check('checkpoint não usa a infraestrutura de storage existente (GameStorage)', checkpointRepoSource.includes("from '../storage/GameStorage.js'"));
check('checkpoint perdeu o campo de versão de schema próprio (não pode ficar acoplado ao CAREER_SAVE_SCHEMA_VERSION)', checkpointRepoSource.includes('CHECKPOINT_SCHEMA_VERSION'));
check('LiveMatch perdeu o gatilho de checkpoint em pontos seguros (game/set/tática), não a cada ponto', /onCheckpoint\(state\)/.test(liveMatch) && liveMatch.includes('checkpointSignatureRef'));

// ── 5. Recovery UX (treino e torneio) ───────────────────────────────────────

check('SimulationModal perdeu a detecção de checkpoint ativo (useActiveMatchCheckpoint)', simulationModal.includes('useActiveMatchCheckpoint'));
check('SimulationModal perdeu o prompt "Partida em andamento" antes de restaurar silenciosamente', simulationModal.includes('Partida em andamento') && simulationModal.includes('Continuar partida'));
check('SimulationModal perdeu a opção de descartar o checkpoint tecnicamente (sem nova penalidade esportiva)', simulationModal.includes('discardResume'));
check('TournamentModal perdeu a detecção de checkpoint casado com a rodada atual (match_id + tournament_id)', tournamentModal.includes('checkpoint.match_id === restoredMatch.id'));
check('TournamentModal perdeu o prompt "Partida em andamento" para retomar a rodada', tournamentModal.includes("phase === 'match_resume_prompt'"));
check('Matches.jsx perdeu a reabertura automática da SimulationModal quando existe checkpoint de treino', matchesPage.includes('activeMatchCheckpoint?.type'));
check('Tournaments.jsx perdeu a reabertura automática do torneio certo quando existe checkpoint', tournamentsPage.includes('activeMatchCheckpoint.tournament_id'));
check('CareerHub perdeu o aviso global de partida em andamento (ActiveMatchRecoveryBanner)', careerHub.includes('ActiveMatchRecoveryBanner'));

// ── 6. Idempotência (mecanismo pré-existente, preservado) ───────────────────

check('finalizePracticeMatch perdeu a chave de idempotência derivada de seed (permanece estável após recovery)', read('src/game-core/matchFinalization.js').includes('matchState?.seed'));
check('CareerEntityRepository perdeu a checagem de processed_match_finalizations (idempotência de recompensa)', read('src/gameplay/repositories/CareerEntityRepository.js').includes('processed_match_finalizations'));
check('SimulationModal parou de limpar o checkpoint ao finalizar a partida', simulationModal.includes('getMatchCheckpointRepository().clear(careerId)'));
check('TournamentModal parou de limpar o checkpoint ao finalizar a rodada', tournamentModal.includes('getMatchCheckpointRepository().clear(careerId)'));

// ── 7. Android Back / fechar durante partida ────────────────────────────────

check('SimulationModal perdeu a proteção contra fechar (backdrop/Escape/Android Back) durante a partida', simulationModal.includes("closeOnBackdrop={phase !== 'live'}") && simulationModal.includes("closeOnEscape={phase !== 'live'}"));
check('TournamentModal nunca ganhou a proteção contra fechar durante a partida (gap real encontrado na auditoria)', tournamentModal.includes("closeOnBackdrop={phase !== 'match'}") && tournamentModal.includes("closeOnEscape={phase !== 'match'}"));

// ── 8. Freezes — não alterar lógica esportiva/engine ────────────────────────

for (const fn of ['createMatch', 'playPoint', 'applyMatchTactic']) {
  check(`MatchEngine.js não exporta mais ${fn} (lógica esportiva não deveria ter sido tocada)`, read('src/engine/match/MatchEngine.js').includes(`export function ${fn}`));
}

check('script registrado', pkg.scripts?.['test:mobile-m3-live-match'] === 'node scripts/test-mobile-m3-live-match.mjs');

// ═══════════════════════════════════════════════════════════════════════════
// COMPORTAMENTAL — engine real + MatchCheckpointRepository real (storage
// falsa em memória; sem depender do plugin Tauri, indisponível em Node puro).
// ═══════════════════════════════════════════════════════════════════════════

class FakeStorage {
  constructor() { this.files = new Map(); }
  async initialize() {}
  async ensureDirectory() {}
  async exists(p) { return this.files.has(p); }
  async readJsonIfExists(p, defaultValue) { return this.files.has(p) ? JSON.parse(this.files.get(p)) : defaultValue; }
  async writeJson(p, data) { this.files.set(p, JSON.stringify(data)); return data; }
  async remove(p) { return this.files.delete(p); }
}

function fakePlayer(id, name) {
  return { id, name, attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 }, energy: 90, fatigue: 10 };
}

// Parte 30 — lifecycle: start → play N pontos → checkpoint → "unmount" →
// "remount" (round-trip JSON puro, como um restart real de app) → restore →
// continue → finish. Compara com uma partida equivalente SEM interrupção
// (mesmo seed) — objetivo do enunciado: "recovery não altera lógica".
await checkAsync('checkpoint + resume produz sequência diferente de uma partida sem interrupção (mesmo seed)', async () => {
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  const seed = 'm3-lifecycle-test-seed';

  let reference = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed });
  for (let i = 0; i < 40 && !reference.finished; i += 1) reference = playPoint(reference);

  let interrupted = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed });
  for (let i = 0; i < 12 && !interrupted.finished; i += 1) interrupted = playPoint(interrupted);

  // "unmount"/"remount": round-trip por JSON puro, exatamente como um
  // checkpoint persistido em disco e lido de volta depois de reabrir o app.
  const restored = JSON.parse(JSON.stringify(interrupted));
  let resumed = restored;
  for (let i = 12; i < 40 && !resumed.finished; i += 1) resumed = playPoint(resumed);

  return resumed.pointsA === reference.pointsA
    && resumed.pointsB === reference.pointsB
    && resumed.gamesA === reference.gamesA
    && resumed.gamesB === reference.gamesB
    && resumed.setsA === reference.setsA
    && resumed.setsB === reference.setsB
    && resumed.pointNumber === reference.pointNumber
    && resumed.narration.length === reference.narration.length;
});

await checkAsync('checkpoint restaurado não é JSON-serializável (persistência quebraria em disco)', async () => {
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  let state = createMatch(teamA, teamB, { initialTacticId: 'agressivo', seed: 'm3-serialize-test' });
  for (let i = 0; i < 8; i += 1) state = playPoint(state);
  const serialized = JSON.stringify(state);
  const parsed = JSON.parse(serialized);
  return typeof serialized === 'string' && parsed.pointNumber === state.pointNumber && Array.isArray(parsed.narration);
});

await checkAsync('MatchCheckpointRepository não grava/lê/limpa um checkpoint válido corretamente', async () => {
  const repo = new MatchCheckpointRepository(new FakeStorage());
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  const state = playPoint(createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-repo-test' }));
  const matchId = createCheckpointMatchId();

  const before = await repo.read('career-1');
  await repo.save('career-1', { match_id: matchId, type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: state });
  const found = await repo.read('career-1');
  await repo.clear('career-1');
  const afterClear = await repo.read('career-1');

  return before === null
    && found?.match_id === matchId
    && found?.engine_state?.pointNumber === state.pointNumber
    && found?.career_id === 'career-1'
    && afterClear === null;
});

await checkAsync('checkpoint pertencente a outra carreira vaza para a carreira errada', async () => {
  const repo = new MatchCheckpointRepository(new FakeStorage());
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  const state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-isolation-test' });
  await repo.save('career-A', { match_id: 'm-1', type: 'practice', tournament_id: null, started_at: new Date().toISOString(), engine_state: state });
  const other = await repo.read('career-B');
  return other === null;
});

// Parte 12 — checkpoint corrompido/incompatível nunca deve quebrar a leitura
// nem vazar para a UI; deve ser tratado como "sem checkpoint" e descartado.
await checkAsync('checkpoint com schema_version incompatível não é descartado com segurança', async () => {
  const storage = new FakeStorage();
  const repo = new MatchCheckpointRepository(storage);
  await storage.writeJson('active-matches/career-1.json', { checkpoint_schema_version: 999, career_id: 'career-1', match_id: 'x', type: 'practice', engine_state: {} });
  const result = await repo.read('career-1');
  const stillExists = await storage.exists('active-matches/career-1.json');
  return result === null && stillExists === false;
});

await checkAsync('checkpoint com engine_state incompleto (JSON válido, forma inválida) não é descartado com segurança', async () => {
  const storage = new FakeStorage();
  const repo = new MatchCheckpointRepository(storage);
  await storage.writeJson('active-matches/career-1.json', { checkpoint_schema_version: 1, career_id: 'career-1', match_id: 'x', type: 'practice', engine_state: { pointNumber: 'not-a-number' } });
  const result = await repo.read('career-1');
  return result === null;
});

await checkAsync('checkpoint de uma partida já finalizada (finished:true) continua sendo oferecido como "em andamento"', async () => {
  const storage = new FakeStorage();
  const repo = new MatchCheckpointRepository(storage);
  const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
  const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
  let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-finished-test' });
  let safety = 3000;
  while (!state.finished && safety-- > 0) state = playPoint(state);
  await storage.writeJson('active-matches/career-1.json', { checkpoint_schema_version: 1, career_id: 'career-1', match_id: 'x', type: 'practice', engine_state: state });
  const result = await repo.read('career-1');
  return result === null;
});

check('isValidCheckpointShape não está exportado (necessário para os testes acima e para reuso)', typeof isValidCheckpointShape === 'function');

// ── 9. Idempotência — chave estável sobrevive ao ciclo de checkpoint ───────

check(
  'makeMatchFinalizationKey produziria chaves diferentes para o mesmo profile+seed após um round-trip de checkpoint (quebraria a idempotência)',
  (() => {
    const profile = { id: 'p1', career_date: '2026-06-01' };
    const teamA = [fakePlayer('p1', 'Jogador'), fakePlayer('p2', 'Parceiro')];
    const teamB = [fakePlayer('p3', 'Rival 1'), fakePlayer('p4', 'Rival 2')];
    let state = createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed: 'm3-idempotency-test' });
    const keyBeforeInterruption = makeMatchFinalizationKey(profile, state);
    const restored = JSON.parse(JSON.stringify(state));
    const keyAfterRoundTrip = makeMatchFinalizationKey(profile, restored);
    return keyBeforeInterruption === keyAfterRoundTrip;
  })(),
);

console.log(`test:mobile-m3-live-match OK — ${checks} verificações (estruturais + comportamentais: engine real + checkpoint real).`);
