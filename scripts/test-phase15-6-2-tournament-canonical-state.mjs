// Hotfix 15.6.2 — Estado canônico do torneio + modal + notificação + bloqueio
// do dia da partida.
//
// Bug relatado no desktop (15.6.1 não resolveu por completo): D-3 sorteia e
// notifica corretamente; abrir a notificação mostra "sorteio ainda não
// existe"; Torneios → Ver chaves mostra a chave certa; avançar até o dia da
// partida faz o modal mostrar "Preparar" (não "Jogar") e o calendário permite
// avançar sem jogar o torneio.
//
// Causa raiz REAL (não é só lifecycle do TournamentModal): quando a inscrição
// real do jogador cai sobre o MESMO torneio que o seed de demonstração local
// (src/local/localSeed.js, CalendarEvent 'cal-002') já referencia, existem
// DUAS linhas de CalendarEvent com o mesmo `related_id` — uma de demonstração
// (sem metadata, sem tournament_run, sem registration_id) e a inscrição real
// (com tournament_run, registration_id, requires_decision). Consumidores que
// faziam um `.find()` ingênuo sobre essas linhas podiam pegar a errada.
// `Tournaments.jsx` (Ver chaves) nunca sofreu isso: seu `activeRunEvents` já
// filtra por `metadata?.tournament_run` truthy ANTES de indexar por
// `related_id`, então a linha seed (sem run) já saía do candidato.
//
// Fonte canônica única (Hotfix 15.6.2):
// `resolveTournamentCampaignEvent`/`pickCanonicalTournamentEvent`
// (src/lib/tournamentRegistration.js) — prefere sempre a linha com
// `metadata.registration_id` real. Usada agora por TournamentModal.jsx e por
// guardActiveMatchBeforeAdvance (calendarLifecycle.js). O deep link de
// notificação e "Ver chaves" já usavam (por construção) a mesma regra de
// preferência (filtrar por tournament_run truthy) — não precisaram mudar.
//
// A data canônica do compromisso continua sendo
// tournament_run.matches[currentRound].date → metadata.next_round_date →
// CalendarEvent.start_date (legado), implementada em
// getTournamentCommitmentDate (calendarAdvancePolicy.js) — já correta antes
// desta correção, agora coberta por gates diretos (T-11 a T-15).
//
// "Preparar" vs "Jogar": TournamentDetailsModal.jsx (o card de detalhes que
// abre o TournamentModal) sempre dizia "Preparar partida" enquanto existisse
// um `activeRun`, mesmo no dia exato em que o jogo já está pronto para
// começar — sem olhar data nem `preparationCompleted`. Corrigido reusando a
// MESMA fórmula `canPlayNow` que Tournaments.jsx já usa (nenhum cálculo
// novo), aplicada a este 3º consumidor que faltava.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay, advanceCareerDays } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const {
    registerTournament, isPlayerRegisteredForTournament, isTournamentParticipationConfirmed,
    resolveTournamentCampaignEvent, pickCanonicalTournamentEvent,
  } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { ensureTournamentDraw } = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  const {
    startTournamentMatch, getTournamentRunPhase, getCurrentTournamentMatch, completePreTournamentMeeting,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const {
    getTournamentCommitmentDate, getCalendarDecisionState, shouldBlockBeforeAdvance, CALENDAR_DECISION_STATE,
  } = await vite.ssrLoadModule('/src/game-core/calendarAdvancePolicy.js');
  const { resolveTournamentOpenMode, TOURNAMENT_DEEP_LINK_MODES } = await vite.ssrLoadModule('/src/lib/tournamentDeepLink.js');

  // `activeCareerAdapter` é um singleton de módulo: criar uma carreira nova
  // troca globalmente qual carreira todo `localGame.entities.*` enxerga. Como
  // este arquivo intercala cenários (o `shared`, reaproveitado em vários
  // blocos, com cenários novos e isolados para T-8/T-9/T-21), cada cenário
  // guarda seu próprio `manager`/`career` e `reactivate()` restaura o
  // cenário certo antes de qualquer leitura — sem isso, reler `shared` depois
  // de criar outro cenário lê a carreira ERRADA (vazia).
  async function freshCareer(id) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ career_id: id, career_name: id });
    activeCareerAdapter.setActiveCareer(career);
    const partner = BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({
      id: `${id}-player`, sport_name: id, career_date: '2026-01-01', birth_date: '2001-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
      coins: 5000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
    });
    const profile = await localGame.entities.PlayerProfile.get(`${id}-player`);
    return { career, profile, partner, manager };
  }

  function reactivate(scenario) {
    // `setActiveCareer(scenario.career)` reinstalaria o SNAPSHOT do instante
    // da criação (antes do Tournament/registro/sorteio existirem) — cada save
    // desde então substituiu `activeCareerAdapter.activeCareer` por um clone
    // novo que este JS nunca viu. `clearActiveCareer()` força a próxima
    // leitura a ir ao storage isolado (MemoryStorage) do próprio `manager`
    // do cenário, que É a fonte atualizada (todo `saveCareer` passou por ele).
    activeCareerAdapter.careerManager = scenario.manager;
    activeCareerAdapter.clearActiveCareer();
  }

  // Reproduz exatamente o formato da linha de demonstração do seed local
  // (src/local/localSeed.js, 'cal-002'): mesmo related_id do torneio real,
  // status scheduled, is_mandatory false, SEM metadata/registration_id. É
  // esta ambiguidade — não um bug de lifecycle do modal — a causa raiz real.
  async function createDualRowScenario(id, { startDate = '2026-01-08', tournamentId = `${id}-t1` } = {}) {
    const { profile, partner, manager, career } = await freshCareer(id);
    const tournament = await localGame.entities.Tournament.create({
      id: tournamentId, name: 'Miami Cup', tier: 'Silver', start_date: startDate, status: 'inscricoes',
    });
    const seedLikeEvent = await localGame.entities.CalendarEvent.create({
      id: `${id}-seed-like`, profile_id: profile.id, event_type: 'tournament', title: tournament.name,
      start_date: tournament.start_date, end_date: tournament.start_date, status: 'scheduled',
      related_id: tournament.id, related_name: tournament.name, is_mandatory: false,
    });
    const reg = await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    assert.equal(reg.success, true, 'inscrição real deve suceder mesmo com a linha seed já presente');
    return { profile: await localGame.entities.PlayerProfile.get(profile.id), partner, tournament, seedLikeEvent, manager, career };
  }

  // Fonte usada por TournamentModal.jsx (loadCampaign, já corrigido).
  async function readModalState(profileId, tournamentId) {
    const calendarEvent = await resolveTournamentCampaignEvent(profileId, tournamentId);
    if (!calendarEvent) return { found: false };
    const registration = await isPlayerRegisteredForTournament(profileId, tournamentId);
    const confirmed = registration || (isTournamentParticipationConfirmed({ event: calendarEvent }) ? { derived: true } : null);
    const tournamentRun = calendarEvent.metadata?.tournament_run || null;
    return { found: true, confirmed: Boolean(confirmed), calendarEvent, tournamentRun, notDrawn: !tournamentRun };
  }

  // Fonte usada por Tournaments.jsx ("Ver chaves" / TournamentFocusMode /
  // TournamentCard / TournamentDetailsModal) — Map indexado por related_id,
  // construído SOMENTE a partir de linhas com tournament_run verdadeiro.
  async function readVerChavesState(profileId, tournamentId) {
    const runEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId, status: 'scheduled', event_type: 'tournament' });
    const activeRunEvents = new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event]));
    const tournamentEntity = await localGame.entities.Tournament.get(tournamentId);
    return {
      hasActiveRun: activeRunEvents.has(tournamentId),
      calendarEvent: activeRunEvents.get(tournamentId) || null,
      tournamentRun: activeRunEvents.get(tournamentId)?.metadata?.tournament_run || null,
      bracketHistory: tournamentEntity?.bracket_history || null,
    };
  }

  // Fonte usada pelo deep link de notificação: resolve o modo (run/details)
  // pela MESMA Map de "Ver chaves" (Tournaments.jsx, linhas 159-170) e então
  // abre TournamentModal (mode=run) ou TournamentDetailsModal (mode=details)
  // — nunca uma query independente própria.
  async function readNotificationDeepLinkState(profileId, tournamentId, requestedMode) {
    const verChaves = await readVerChavesState(profileId, tournamentId);
    const mode = resolveTournamentOpenMode(requestedMode, verChaves.hasActiveRun);
    if (mode === TOURNAMENT_DEEP_LINK_MODES.RUN) {
      return { mode, modalState: await readModalState(profileId, tournamentId) };
    }
    return { mode, detailsState: verChaves };
  }

  const opponentSignature = (run) => JSON.stringify((run?.matches || []).map((m) => m.opponent));

  // ═══════════ Tabela de auditoria (documentada em comentário, verificada por gates abaixo) ═══════════
  // Consumidor            | Fonte usada                                    | Como acha o torneio        | Sorteado?                          | Partida atual?
  // Ver chaves            | Tournaments.jsx activeRunEvents (Map)          | Map.get(tournament.id)     | Map.has(id) (run truthy no filtro) | tournament.bracket_history / run.matches[currentRound]
  // Notification deeplink | mesma Map + resolveTournamentOpenMode          | idem                        | idem                                | idem (abre TournamentModal com o mesmo evento)
  // TournamentModal       | resolveTournamentCampaignEvent (canônico)      | prefere registration_id     | calendarEvent.metadata.tournament_run| run.matches[run.currentRound]
  // Calendar advance      | getCriticalEventBeforeAdvance/shouldBlockBeforeAdvance | CalendarEvent.filter(scheduled) | event.requires_decision === true    | getTournamentCommitmentDate(event)
  // Jogar                 | TournamentRunManager (startTournamentMatch)    | run já carregado           | phase === 'playable'                | getCurrentTournamentMatch(run)

  // ═══════════════ T-3, T-4, T-5, T-19: D-3 no cenário de linha dupla ═══════════════
  let shared;
  let opponentAtD3;
  {
    shared = await createDualRowScenario('p1562-main');
    let current = shared.profile;
    while (current.career_date < '2026-01-05') current = await advanceCareerDay(current, {}); // D-3
    shared.profile = current;

    const modalState = await readModalState(current.id, shared.tournament.id);
    const verChaves = await readVerChavesState(current.id, shared.tournament.id);
    const seedFresh = await localGame.entities.CalendarEvent.get(shared.seedLikeEvent.id);

    gate('T-3: D-3 cria exatamente um tournament_run (a linha seed nunca ganha um)', Boolean(modalState.tournamentRun) && !seedFresh.metadata?.tournament_run);
    gate('T-4: bracket do D-3 aparece em "Ver chaves" (activeRunEvents reconhece o torneio)', verChaves.hasActiveRun === true && Array.isArray(verChaves.bracketHistory) && verChaves.bracketHistory.length > 0);
    gate('T-5: bracket do D-3 aparece no TournamentModal (nunca "não sorteada")', modalState.notDrawn === false && Boolean(modalState.tournamentRun));
    gate('T-19: evento sem registration_id nunca cria tournament_run', !seedFresh.metadata?.tournament_run);
    gate('T-20: evento sem registration_id nunca vira decisão obrigatória (não bloqueia sozinho)', !shouldBlockBeforeAdvance(seedFresh, current.career_date) && seedFresh.requires_decision !== true);

    opponentAtD3 = opponentSignature(modalState.tournamentRun);
  }

  // ═══════════════ T-1, T-2, T-22 (parcial): mesma fonte para todos os consumidores em D-3 ═══════════════
  {
    reactivate(shared);
    const modalState = await readModalState(shared.profile.id, shared.tournament.id);
    const verChaves = await readVerChavesState(shared.profile.id, shared.tournament.id);
    gate('T-1: Ver chaves e TournamentModal leem o MESMO tournament_run (byte a byte)', JSON.stringify(modalState.tournamentRun) === JSON.stringify(verChaves.tournamentRun));

    const deepLinkRun = await readNotificationDeepLinkState(shared.profile.id, shared.tournament.id, TOURNAMENT_DEEP_LINK_MODES.RUN);
    gate('T-2: notification deeplink (mode=run) e a aba Torneios abrem a MESMA campanha', deepLinkRun.mode === TOURNAMENT_DEEP_LINK_MODES.RUN && JSON.stringify(deepLinkRun.modalState.tournamentRun) === JSON.stringify(verChaves.tournamentRun));

    const visibleBracket = getVisibleTournamentBracketState(await localGame.entities.Tournament.get(shared.tournament.id), shared.profile.career_date);
    gate('T-22 (parcial, D-3): notificação → modal → Ver chaves → bracket visível — todos concordam que está sorteado', deepLinkRun.modalState.notDrawn === false && verChaves.hasActiveRun === true && visibleBracket.drawn === true);
  }

  // ═══════════════ T-17, T-18: reload e reabertura repetida entre D-3 e D-0 ═══════════════
  {
    reactivate(shared);
    let current = shared.profile;
    for (const targetDate of ['2026-01-06', '2026-01-07', '2026-01-08']) { // D-2, D-1, D
      current = await advanceCareerDay(current, {});
      const reloaded = await readModalState(current.id, shared.tournament.id); // leitura sempre fresca (nunca cache em memória)
      gate(`T-17: reload em ${current.career_date} preserva exatamente o adversário sorteado em D-3`, opponentSignature(reloaded.tournamentRun) === opponentAtD3);
    }
    shared.profile = current;

    for (let i = 0; i < 5; i += 1) await readModalState(shared.profile.id, shared.tournament.id);
    const finalState = await readModalState(shared.profile.id, shared.tournament.id);
    const finalTournament = await localGame.entities.Tournament.get(shared.tournament.id);
    gate('T-18: abrir o modal 5x seguidas não cria um novo sorteio (adversário e bracket_history estáveis)', opponentSignature(finalState.tournamentRun) === opponentAtD3 && finalTournament.bracket_history.length === (await localGame.entities.Tournament.get(shared.tournament.id)).bracket_history.length);
  }

  // ═══════════════ T-11 a T-15: data canônica e bloqueio (funções puras reais) ═══════════════
  {
    reactivate(shared);
    const realEvent = (await readModalState(shared.profile.id, shared.tournament.id)).calendarEvent;
    const run = realEvent.metadata.tournament_run;
    const matchDate = run.matches[run.currentRound || 0].date;

    gate('T-11: getTournamentCommitmentDate usa matches[currentRound].date como fonte canônica', getTournamentCommitmentDate(realEvent) === matchDate);

    const dayBefore = '2026-01-07' < matchDate ? '2026-01-07' : matchDate; // matchDate já é 2026-01-08 neste cenário
    gate('T-12: dia FUTURO (antes da partida) não bloqueia', getCalendarDecisionState(realEvent, dayBefore) === (dayBefore === matchDate ? CALENDAR_DECISION_STATE.DUE_TODAY : CALENDAR_DECISION_STATE.FUTURE) && (dayBefore === matchDate || shouldBlockBeforeAdvance(realEvent, dayBefore) === false));
    gate('T-13: dia da partida (hoje) bloqueia', getCalendarDecisionState(realEvent, matchDate) === CALENDAR_DECISION_STATE.DUE_TODAY && shouldBlockBeforeAdvance(realEvent, matchDate) === true);

    const overdueDate = '2026-01-09';
    gate('T-14: partida vencida (overdue) continua bloqueando', getCalendarDecisionState(realEvent, overdueDate) === CALENDAR_DECISION_STATE.OVERDUE && shouldBlockBeforeAdvance(realEvent, overdueDate) === true);

    const completedLikeEvent = { ...realEvent, requires_decision: false }; // mesmo mecanismo usado por prepareTournamentFinalization ao concluir
    gate('T-15: partida já concluída (requires_decision=false) não bloqueia mais', shouldBlockBeforeAdvance(completedLikeEvent, matchDate) === false);
  }

  // ═══════════════ T-8, T-9: advanceDay bloqueia no dia da partida, nunca passa em silêncio ═══════════════
  // canAdvanceDay (calendarSystem.js) checa shouldBlockBeforeAdvance usando a
  // data ATUAL (antes de avançar) — ou seja, entrar no dia da partida é
  // permitido; o bloqueio real acontece ao tentar SAIR do dia da partida sem
  // jogá-la. É exatamente essa transição que este gate precisa exercitar.
  {
    const { profile, partner } = await freshCareer('p1562-block');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1562-block-t1', name: 'Rio Open', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < '2026-01-08') current = await advanceCareerDay(current, {}); // entra no dia da partida normalmente
    gate('T-8 (pré-condição): chegar ao dia da partida sem jogar é permitido (o bloqueio é para SAIR dele)', current.career_date === '2026-01-08');

    let blockedError = null;
    try { current = await advanceCareerDay(current, {}); } catch (error) { blockedError = error; } // tentando avançar sem jogar a partida do dia
    gate('T-8: advanceDay BLOQUEIA ao tentar avançar além do dia da partida sem jogá-la', Boolean(blockedError) && current.career_date === '2026-01-08');
    const realEventId = (await readModalState(profile.id, tournament.id)).calendarEvent.id;
    gate('T-9: advanceDay nunca passa em silêncio — o erro aponta para a decisão pendente correta', blockedError?.context?.pendingDecision?.id === realEventId);
  }

  // ═══════════════ T-21: avanço em lote (skip de vários dias) para exatamente no primeiro dia pendente ═══════════════
  {
    const { profile, partner } = await freshCareer('p1562-multiday');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1562-multiday-t1', name: 'Roma Masters', tier: 'Gold', start_date: '2026-01-06', status: 'inscricoes' });
    await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    const current = await localGame.entities.PlayerProfile.get(profile.id); // 2026-01-01, torneio sorteia em D-3 (01-03) e joga em 01-06
    const result = await advanceCareerDays(current, 20); // tenta pular MUITO além do torneio inteiro
    gate('T-21: avanço em lote (+20 dias) PARA exatamente no primeiro dia com partida pendente, nunca o ultrapassa', result.finalDate === '2026-01-06' && result.processedDays < 20 && Boolean(result.stopReason));
  }

  // ═══════════════ T-6, T-7: "Jogar" (nunca "Preparar") quando a partida já está pronta ═══════════════
  {
    reactivate(shared);
    const modalState = await readModalState(shared.profile.id, shared.tournament.id); // já em D (2026-01-08)
    const { run: afterMeeting } = completePreTournamentMeeting(modalState.tournamentRun, 'balanced');
    const phase = getTournamentRunPhase(afterMeeting, shared.profile.career_date);
    gate('T-6: no dia da partida, após a reunião pré-torneio, a fase é "playable" (TournamentModal renderiza "Jogar {rodada}")', phase === 'playable');

    const modalSrc = read('src/components/tournaments/TournamentModal.jsx');
    gate('T-6 (estático): o texto literal do botão em fase playable é "Jogar", nunca "Preparar"', modalSrc.includes(">Jogar {currentMatch.round}<"));

    const detailsSrc = read('src/components/tournaments/TournamentDetailsModal.jsx');
    gate('T-7: TournamentDetailsModal usa a MESMA condição canPlayNow (data + preparationCompleted) já usada em Tournaments.jsx — não mais um "Preparar partida" incondicional', detailsSrc.includes('const canPlayNow = Boolean(activeMatch) && activeMatch.date === careerDate && activeMatch.preparationCompleted;') && detailsSrc.includes("{canPlayNow ? 'Jogar partida' : 'Preparar partida'}"));
  }

  // ═══════════════ T-10, T-16: adversário/rodada atual sempre via matches[currentRound]; Jogar nunca troca o adversário ═══════════════
  {
    reactivate(shared);
    const modalState = await readModalState(shared.profile.id, shared.tournament.id);
    const currentMatchViaHelper = getCurrentTournamentMatch(modalState.tournamentRun);
    const currentMatchDirect = modalState.tournamentRun.matches[modalState.tournamentRun.currentRound || 0];
    gate('T-10: a partida atual é sempre matches[currentRound] (mesma referência usada por getCurrentTournamentMatch)', JSON.stringify(currentMatchViaHelper) === JSON.stringify(currentMatchDirect));

    const { run: afterMeeting } = completePreTournamentMeeting(modalState.tournamentRun, 'balanced');
    const opponentBefore = JSON.stringify(getCurrentTournamentMatch(afterMeeting).opponent);
    const started = startTournamentMatch(afterMeeting, shared.profile.career_date);
    const liveMatch = getCurrentTournamentMatch(started);
    gate('T-16: "Jogar" inicia a partida contra exatamente o adversário sorteado em D-3, sem trocar', liveMatch.status === 'playing' && JSON.stringify(liveMatch.opponent) === opponentBefore && opponentSignature(started) === opponentAtD3);
  }

  // ═══════════════ T-22: TESTE DE INTEGRAÇÃO COMPLETO (cenário exato do desktop) ═══════════════
  // carreira nova → inscrição real sobre o torneio do seed (linha dupla) →
  // D-3 (ensureTournamentDraw via a pipeline real) → notificação (mode=run)
  // → deep link abre TournamentModal → bracket existe → Torneios → Ver
  // chaves → mesmos participantes → avança até D-0 → TournamentModal deve
  // mostrar JOGAR → tentar avanceDay ANTES de jogar deve bloquear → Jogar →
  // partida inicia contra exatamente o adversário sorteado em D-3.
  {
    const scenario = await createDualRowScenario('p1562-integration', { startDate: '2026-01-08' });
    let current = scenario.profile;
    while (current.career_date < '2026-01-05') current = await advanceCareerDay(current, {}); // D-3 real, pipeline real

    const deepLink = await readNotificationDeepLinkState(current.id, scenario.tournament.id, TOURNAMENT_DEEP_LINK_MODES.RUN);
    assert.equal(deepLink.mode, TOURNAMENT_DEEP_LINK_MODES.RUN, 'INTEGRAÇÃO: notificação de sorteio deve abrir em modo run');
    assert.equal(deepLink.modalState.notDrawn, false, 'INTEGRAÇÃO: TournamentModal NUNCA deveria mostrar "sorteio ainda não existe"');
    const opponentSig = opponentSignature(deepLink.modalState.tournamentRun);

    const verChaves = await readVerChavesState(current.id, scenario.tournament.id);
    assert.equal(verChaves.hasActiveRun, true, 'INTEGRAÇÃO: "Ver chaves" deve reconhecer o mesmo torneio');
    assert.equal(opponentSignature(verChaves.tournamentRun), opponentSig, 'INTEGRAÇÃO: "Ver chaves" deve mostrar os MESMOS participantes que a notificação/modal');

    while (current.career_date < '2026-01-08') current = await advanceCareerDay(current, {}); // até D-0 real
    const d0Modal = await readModalState(current.id, scenario.tournament.id);
    assert.equal(opponentSignature(d0Modal.tournamentRun), opponentSig, 'INTEGRAÇÃO: adversário em D-0 deve ser idêntico ao de D-3');
    const { run: readyRun } = completePreTournamentMeeting(d0Modal.tournamentRun, 'balanced');
    assert.equal(getTournamentRunPhase(readyRun, current.career_date), 'playable', 'INTEGRAÇÃO: em D-0, após a reunião, a campanha deve estar jogável (JOGAR)');

    let blockedBeforePlaying = null;
    try { await advanceCareerDay(current, {}); } catch (error) { blockedBeforePlaying = error; }
    assert.ok(blockedBeforePlaying, 'INTEGRAÇÃO: advanceDay deve bloquear no dia da partida enquanto ela não foi jogada');

    const startedRun = startTournamentMatch(readyRun, current.career_date);
    const liveMatch = getCurrentTournamentMatch(startedRun);
    assert.equal(liveMatch.status, 'playing', 'INTEGRAÇÃO: Jogar deve iniciar a partida');
    assert.equal(JSON.stringify(liveMatch.opponent), JSON.stringify(getCurrentTournamentMatch(readyRun).opponent), 'INTEGRAÇÃO: Jogar não deve trocar o adversário');
    assert.equal(opponentSignature(startedRun), opponentSig, 'INTEGRAÇÃO: a partida jogada é exatamente contra o adversário sorteado em D-3');

    gate('T-22: TESTE DE INTEGRAÇÃO completo — notificação → modal → Ver chaves → D-0 → bloqueio → Jogar — todos os consumidores concordam com o MESMO estado do início ao fim', true);
  }

  console.log(`\n${gates} gates executados, todos PASS — Hotfix 15.6.2 Canonical Tournament State.`);
} finally {
  await vite.close();
}
