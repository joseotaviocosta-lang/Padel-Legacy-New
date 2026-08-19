// Hotfix crítico pré-beta — Tournament round state (docs/TOURNAMENT_ROUND_STATE_HOTFIX.md).
//
// QA real relatou: jogador vence R32, dá entrevista, avança o dia até a data
// da próxima rodada (R16), tenta avançar de novo — o bloqueio funciona
// corretamente ("Você precisa disputar R16 de Doha Platinum Open antes de
// avançar o dia") e o CTA "Ir para o torneio" abre o torneio certo, mas o
// TournamentModal continua mostrando "R16 agendada" / "17 de abr. de 2026"
// sem nenhum botão para jogar — mesmo com a data já tendo chegado.
//
// Causa raiz encontrada por leitura de código (não suposição): o efeito de
// montagem do TournamentModal (`src/components/tournaments/TournamentModal.jsx`)
// nunca busca o perfil do jogador de novo no storage — ele confia inteiramente
// na prop `profile` (renomeada `initialProfile`), que só passa por
// `resolveActiveCoach(initialProfile)`. Quando o jogador já tem treinador
// ativo (`isCoachActive`), `resolveActiveCoach` devolve `{ profile, ... }`
// com a MESMA referência recebida — nunca relê o storage. Essa `initialProfile`
// vem de qualquer página-pai que renderiza o modal (Tournaments.jsx,
// CareerHub.jsx) — e essas páginas buscam o perfil UMA VEZ no mount
// (`useEffect(..., [])`) e nunca escutam o evento global `padel:profile-updated`
// que `CareerDayControl` (cabeçalho global, `dayAdvanceCoordinator.js`)
// dispara a cada avanço de dia. Resultado: se o jogador avança o dia pelo
// controle GLOBAL enquanto permanece na mesma rota (Tournaments ou Home —
// nenhuma delas remonta com uma navegação só de query string, como faz o CTA
// "Ir para o torneio"), o `career_date` local da página-pai fica desatualizado,
// e o TournamentModal herda essa data velha — `getTournamentRunPhase` compara
// corretamente (`careerDate < match.date`), mas com uma `careerDate` errada.
//
// Este teste prova o mecanismo com as funções REAIS do pipeline (sem mocks,
// sem duplicar a lógica) e depois guarda estaticamente que a composição
// corrigida (buscar perfil fresco antes de calcular fase) está presente nos
// arquivos reais — únca forma de "regression-proof" um bug de efeito React
// sem jsdom neste projeto.
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readSrc = (relPath) => readFileSync(path.join(ROOT, 'src', relPath), 'utf8');

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const {
    createTournamentRun, getTournamentRunPhase, getCurrentTournamentMatch, recordTournamentMatchResult,
  } = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { resolveActiveCoach, ensureCoachCatalog } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');
  const { canAdvanceDay } = await server.ssrLoadModule('/src/lib/calendarSystem.js');
  const { describeCalendarBlock, getTournamentNextAction, buildTournamentPlayRoute, TOURNAMENT_NEXT_ACTION } = await server.ssrLoadModule('/src/lib/tournamentNextAction.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-round-availability', name: 'QA Round Availability' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const tournament = { id: 'doha-platinum-open', name: 'Doha Platinum Open', tier: 'Platinum' };
  await localGame.entities.Tournament.create({ id: tournament.id, ...tournament, status: 'inscricoes' });

  const coaches = await ensureCoachCatalog();
  gate('Catálogo de treinadores carregou (>0)', coaches.length > 0);
  const starterCoach = coaches[0];

  const R32_DATE = '2026-04-10';

  const baseProfileFields = {
    sport_name: 'QA Player', partner_id: 'bot-partner', energy: 90, fatigue: 10,
    coach_id: starterCoach.id, coach_contract_status: 'active',
  };

  const profile = await localGame.entities.PlayerProfile.create({ id: 'qa-player', ...baseProfileFields, career_date: R32_DATE });

  // Torneio com R32 já vencida (currentRound aponta para R16).
  let run = createTournamentRun({
    tournament, profileId: profile.id, startDate: R32_DATE,
    mainRounds: [
      { label: 'R32', short: 'R32' },
      { label: 'R16', short: 'R16' },
      { label: 'Quartas de Final', short: 'QF' },
    ],
    opponents: [[{ id: 'opp-1', name: 'Adversário 1' }], [{ id: 'opp-2', name: 'Adversário 2' }], [{ id: 'opp-3', name: 'Adversário 3' }]],
  });
  const r16Match = run.matches[1];
  const R16_DATE = r16Match.date;
  gate('Rodada R16 agendada num dia após a R32 (addTournamentDays consistente)', R16_DATE === '2026-04-11');

  // Vence R32 (preparação + resultado) — currentRound avança para R16.
  run = { ...run, meetingsCompleted: { preTournament: true, rounds: [] } };
  run.matches[0].preparationCompleted = true;
  const afterR32 = recordTournamentMatchResult(run, { matchId: run.matches[0].id, won: true, score: '6-4 6-3', tournament });
  run = afterR32.run;
  gate('Após vencer R32, currentRound aponta para R16', getCurrentTournamentMatch(run)?.id === r16Match.id);
  // A reunião de preparação da rodada já foi feita (cenário do QA: o
  // bloqueio real testado aqui é o de DATA, não o de preparação pendente).
  run.matches[1].preparationCompleted = true;

  const calendarEvent = await localGame.entities.CalendarEvent.create({
    id: 'evt-doha-r16', profile_id: profile.id, event_type: 'tournament', related_id: tournament.id, related_name: tournament.name,
    title: `${tournament.name} — R16`, status: 'scheduled', requires_decision: true,
    start_date: r16Match.date, end_date: r16Match.date,
    metadata: { tournament_run: run, tournament_run_schema_version: 2 },
  });

  // ── Cenários 14/15/16 — comparação de data em getTournamentRunPhase ──────
  gate('Data futura (careerDate < roundDate) → waiting (agendada)', getTournamentRunPhase(run, R32_DATE) === 'waiting');
  gate('Data igual (careerDate === roundDate) → playable (jogável)', getTournamentRunPhase(run, R16_DATE) === 'playable');
  gate('Data passada sem jogar (careerDate > roundDate) → missed', getTournamentRunPhase(run, '2026-04-12') === 'missed');

  // ── Reprodução do bug real: perfil desatualizado herdado pelo modal ──────
  // `profile` (variável local) ainda tem career_date = R32_DATE — é
  // exatamente a `initialProfile` que uma página-pai desatualizada passaria
  // para o TournamentModal depois que o avanço de dia (pelo cabeçalho
  // global) já levou o career_date real, no storage, até R16_DATE.
  await localGame.entities.PlayerProfile.update(profile.id, { career_date: R16_DATE });

  const staleStarter = await resolveActiveCoach(profile);
  gate('resolveActiveCoach devolve a MESMA referência quando já há treinador ativo (mecanismo real do bug)', staleStarter.profile === profile);
  const staleLoadedProfile = staleStarter.profile || profile;
  gate(
    'BUG REPRODUZIDO: com o perfil desatualizado (career_date antigo), a fase calculada fica "waiting" mesmo com a rodada já disponível no storage',
    getTournamentRunPhase(run, staleLoadedProfile.career_date) === 'waiting',
  );

  // ── Correção: buscar o perfil fresco do storage antes de calcular a fase ─
  const freshProfile = await localGame.entities.PlayerProfile.get(profile.id);
  gate('Perfil fresco reflete o career_date real (R16_DATE) já persistido', freshProfile.career_date === R16_DATE);
  const freshStarter = await resolveActiveCoach(freshProfile);
  const freshLoadedProfile = freshStarter.profile || freshProfile;
  gate(
    'CORREÇÃO CONFIRMADA: com o perfil fresco, a fase calculada é "playable" — R16 jogável no dia certo',
    getTournamentRunPhase(run, freshLoadedProfile.career_date) === 'playable',
  );

  // ── Cadeia completa do bloqueio: canAdvanceDay → describeCalendarBlock ──
  const blockCheck = await canAdvanceDay(profile.id, R16_DATE);
  gate('canAdvanceDay bloqueia corretamente no dia da rodada pendente', blockCheck.canAdvance === false);
  gate('canAdvanceDay aponta o CalendarEvent certo como bloqueio', blockCheck.blockingEvent?.id === calendarEvent.id);
  const block = describeCalendarBlock(blockCheck.blockingEvent);
  gate('describeCalendarBlock aponta destino para o torneio certo', block.destination === buildTournamentPlayRoute(tournament.id));

  // ── getTournamentNextAction também fica correto com a careerDate certa ──
  const nextAction = getTournamentNextAction({ careerDate: R16_DATE, tournament, run });
  gate('getTournamentNextAction reporta PLAY_MATCH quando a rodada está disponível hoje', nextAction.type === TOURNAMENT_NEXT_ACTION.PLAY_MATCH);
  const nextActionFuture = getTournamentNextAction({ careerDate: R32_DATE, tournament, run });
  gate('getTournamentNextAction reporta ADVANCE_TO_ROUND quando a rodada ainda é futura', nextActionFuture.type === TOURNAMENT_NEXT_ACTION.ADVANCE_TO_ROUND);

  // ── Reload: reler tudo do storage do zero ainda dá "playable" ───────────
  const reloadedProfile = await localGame.entities.PlayerProfile.get(profile.id);
  const reloadedEvent = await localGame.entities.CalendarEvent.get(calendarEvent.id);
  const reloadedRun = reloadedEvent.metadata?.tournament_run;
  gate('Reload: run persistido no CalendarEvent bate com o run em memória', getCurrentTournamentMatch(reloadedRun)?.id === r16Match.id);
  gate('Reload: fase recalculada do zero continua "playable"', getTournamentRunPhase(reloadedRun, reloadedProfile.career_date) === 'playable');

  // ── Guardas estáticas: a composição corrigida está de fato no código ────
  const tournamentModalSrc = readSrc('components/tournaments/TournamentModal.jsx');
  const persistRunIndex = tournamentModalSrc.indexOf('async function persistRun');
  const mountEffectSrc = tournamentModalSrc.slice(0, persistRunIndex);
  gate(
    'TournamentModal busca o perfil fresco no storage ANTES de calcular fase/treinador (não confia só na prop)',
    /PlayerProfile\.get\(initialProfile\.id\)/.test(mountEffectSrc),
  );
  const freshProfileFetchIndex = mountEffectSrc.indexOf('PlayerProfile.get(initialProfile.id)');
  const resolveActiveCoachIndex = mountEffectSrc.indexOf('resolveActiveCoach(');
  gate('A busca do perfil fresco acontece ANTES de resolveActiveCoach (ordem importa)', freshProfileFetchIndex >= 0 && freshProfileFetchIndex < resolveActiveCoachIndex);

  const careerHubSrc = readSrc('pages/CareerHub.jsx');
  gate('CareerHub.jsx (Home) escuta padel:profile-updated (banner "Dia de torneio" não fica desatualizado)', /addEventListener\(\s*['"]padel:profile-updated['"]/.test(careerHubSrc));
  gate('CareerHub.jsx (Home) escuta padel:career-advanced', /addEventListener\(\s*['"]padel:career-advanced['"]/.test(careerHubSrc));

  const tournamentsPageSrc = readSrc('pages/Tournaments.jsx');
  gate('Tournaments.jsx escuta padel:profile-updated (lista de torneios não fica desatualizada)', /addEventListener\(\s*['"]padel:profile-updated['"]/.test(tournamentsPageSrc));
  gate('Tournaments.jsx escuta padel:career-advanced', /addEventListener\(\s*['"]padel:career-advanced['"]/.test(tournamentsPageSrc));

  const calendarPageSrc = readSrc('pages/CalendarPage.jsx');
  gate('CalendarPage.jsx escuta padel:profile-updated (evento do dia não fica desatualizado)', /addEventListener\(\s*['"]padel:profile-updated['"]/.test(calendarPageSrc));

  const bellSrc = readSrc('components/communications/CommunicationBell.jsx');
  gate('CommunicationBell.jsx já escutava padel:profile-updated antes deste hotfix (sino já estava correto)', /addEventListener\(\s*['"]padel:profile-updated['"]/.test(bellSrc));

  console.log(`\n${gates} gates executados, todos PASS.`);
} finally {
  await server.close();
}
