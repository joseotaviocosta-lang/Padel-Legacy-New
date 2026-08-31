// Fase 15.7 — Revisão completa, hardening e rebalance do sistema de torneios.
//
// Bug relatado após 15.6.2 (QA físico): Miami Cup (1º torneio da temporada)
// continuava mostrando "sorteio não realizado" no TournamentModal e em
// Torneios → Ver Chaves, mesmo com a notificação de D-3 disparando e o jogo
// funcionando normalmente por baixo. O 2º torneio da carreira sempre
// funcionou perfeitamente. Instrução explícita: não criar um patch por nome
// ("if tournament.name === 'Miami Cup'") — eliminar a diferença estrutural.
//
// Causa raiz REAL confirmada (reprodução direta com o catálogo de produção,
// via script descartável, não incluído aqui): o seed de demonstração local
// (src/local/localSeed.js, CalendarEvent 'cal-002') referenciava
// `tournaments[0].id` — literalmente o 1º torneio real da temporada gerada
// por buildSeasonTournaments (circuitCatalog.js). Quando o jogador se
// inscrevia EXATAMENTE nesse torneio (o cenário natural: é o primeiro
// disponível), duas linhas de CalendarEvent passavam a compartilhar o mesmo
// `related_id` — a demonstrativa (sem inscrição/sorteio) e a real. O
// resolvedor canônico introduzido no Hotfix 15.6.2
// (pickCanonicalTournamentEvent/resolveTournamentCampaignEvent) já resolve
// essa ambiguidade CORRETAMENTE quando testado isoladamente (ver gates T-1 a
// T-22 do hotfix anterior) — mas ele é uma correção de LEITURA (soube
// escolher a linha certa entre duas). A causa raiz real é a EXISTÊNCIA da
// segunda linha, não a leitura dela. Só o 1º torneio da temporada podia
// colidir, porque só ele é referenciado pelo seed — daí o 2º torneio nunca
// ter reproduzido o bug.
//
// Correção desta fase (arquitetural, não um patch por nome):
// 1. src/local/localSeed.js — 'cal-002' agora usa um related_id SINTÉTICO
//    ('demo-tournament-showcase') que nunca existe em Tournament, para
//    QUALQUER temporada gerada — elimina a colisão por construção, não por
//    prioridade de leitura. O evento continua existindo (ilustrativo, nunca
//    bloqueia, nunca sorteia — coberto pelos testes de 15.6.1/15.6.2).
// 2. src/lib/calendarSystem.js (cancelRegistration) — Tournament.get()
//    passou a .catch(() => null): o related_id sintético do evento
//    ilustrativo nunca corresponde a um Tournament real.
// 3. src/lib/circuitCatalog.js (WEEK_PROGRAM) — temporada inteira deslocada
//    +4 semanas (mesma cadência/contagem de torneios): o 1º torneio real
//    passa da semana 2 (~dia 7) para a semana 6 (~dia 35) — dentro da janela
//    de 30–45 dias pedida, dando tempo para onboarding, treino e evolução
//    de atributos antes da primeira competição.
//
// Este arquivo prova, com o catálogo de produção real (não sintético), que
// o 1º e o 2º torneio da temporada passam pela MESMA pipeline, produzem o
// MESMO conjunto de estados, e nenhum componente trata o 1º torneio de forma
// especial por nome/id.
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
  const { CAREER_START_DATE } = await vite.ssrLoadModule('/src/lib/career.js');
  const {
    registerTournament, resolveTournamentCampaignEvent,
  } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const {
    startTournamentMatch, getTournamentRunPhase, getCurrentTournamentMatch, completePreTournamentMeeting,
  } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { LOCAL_SEED } = await vite.ssrLoadModule('/src/local/localSeed.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Fase 15.7' });
  activeCareerAdapter.setActiveCareer(career);
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  await activeCareerAdapter.createPlayerProfile({
    id: 'p1571-player', sport_name: 'Fase 15.7', career_date: CAREER_START_DATE, birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 20000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
  });
  const profile = await localGame.entities.PlayerProfile.get('p1571-player');

  // ═══════════════ 1. Rebalance do calendário ═══════════════
  const allTournaments = (await localGame.entities.Tournament.filter({})).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const tournamentA = allTournaments[0]; // "1º torneio" (antigo cenário Miami Cup)
  const tournamentB = allTournaments.find((t) => t.start_date > tournamentA.end_date); // próximo torneio disponível cronologicamente
  const daysToFirst = Math.round((new Date(tournamentA.start_date) - new Date(CAREER_START_DATE)) / 86400000);
  gate(`Rebalance: 1º torneio da temporada ocorre dentro da janela de 30-45 dias (obtido: ${daysToFirst} dias)`, daysToFirst >= 30 && daysToFirst <= 45);
  gate('Rebalance: temporada preserva a mesma contagem de torneios de antes (32, cadência intacta)', allTournaments.length === 32);

  // ═══════════════ 2. Seed decoupled — nunca colide com NENHUM torneio real ═══════════════
  const seedDemoEvent = LOCAL_SEED.CalendarEvent.find((e) => e.id === 'cal-002');
  gate('Seed local: evento ilustrativo de torneio usa related_id sintético, nunca um id de Tournament real', !allTournaments.some((t) => t.id === seedDemoEvent.related_id));
  gate('Seed local: o mesmo vale reconstruindo a temporada do zero (não é coincidência de uma única geração)', !buildSeasonTournaments(2026, 'season-2026').some((t) => t.id === seedDemoEvent.related_id));

  // Fonte usada por TournamentModal.jsx (idêntica ao Hotfix 15.6.2).
  async function readModalState(profileId, tournamentId) {
    const calendarEvent = await resolveTournamentCampaignEvent(profileId, tournamentId);
    if (!calendarEvent) return { found: false };
    const tournamentRun = calendarEvent.metadata?.tournament_run || null;
    return { found: true, calendarEvent, tournamentRun, notDrawn: !tournamentRun };
  }

  // Fonte usada por "Ver chaves"/Tournaments.jsx (idêntica ao Hotfix 15.6.2).
  async function readVerChavesState(profileId, tournamentId) {
    const runEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId, status: 'scheduled', event_type: 'tournament' });
    const activeRunEvents = new Map((runEvents || []).filter((event) => event.metadata?.tournament_run).map((event) => [event.related_id, event]));
    return { hasActiveRun: activeRunEvents.has(tournamentId), tournamentRun: activeRunEvents.get(tournamentId)?.metadata?.tournament_run || null };
  }

  const opponentSignature = (run) => JSON.stringify((run?.matches || []).map((m) => m.opponent));

  // Exercita a campanha completa de um torneio real (registro → D-3 → D-0 →
  // Jogar → rodada seguinte → reload → avanço em lote) e devolve um
  // "fingerprint" comparável entre torneios diferentes.
  async function runFullTournamentCampaign(tournament, label) {
    const beforeRows = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id })).length;

    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < tournament.registration_open_date) current = await advanceCareerDay(current, {});
    const reg = await registerTournament({ player: current, partner, tournament, teamRank: 300 });
    assert.equal(reg.success, true, `${label}: inscrição real deve suceder`);
    current = await localGame.entities.PlayerProfile.get(profile.id);

    const rowsAfterRegistration = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id });
    const exactlyOneRow = rowsAfterRegistration.length === beforeRows + 1;

    const d3Date = new Date(new Date(tournament.start_date + 'T00:00:00Z').getTime() - 3 * 86400000).toISOString().slice(0, 10);
    while (current.career_date < d3Date) current = await advanceCareerDay(current, {});

    const modalAtD3 = await readModalState(current.id, tournament.id);
    const verChavesAtD3 = await readVerChavesState(current.id, tournament.id);
    const visibleBracket = getVisibleTournamentBracketState(await localGame.entities.Tournament.get(tournament.id), current.career_date);
    const opponentAtD3 = opponentSignature(modalAtD3.tournamentRun);

    // Bloqueio antes de jogar: tenta sair do dia da partida sem jogar.
    while (current.career_date < tournament.start_date) current = await advanceCareerDay(current, {});
    let blockedOnMatchDay = false;
    try { await advanceCareerDay(current, {}); } catch { blockedOnMatchDay = true; }

    const modalAtD0 = await readModalState(current.id, tournament.id);
    const { run: readyRun } = completePreTournamentMeeting(modalAtD0.tournamentRun, 'balanced');
    const phaseAtD0 = getTournamentRunPhase(readyRun, current.career_date);
    const startedRun = startTournamentMatch(readyRun, current.career_date);
    const liveMatch = getCurrentTournamentMatch(startedRun);
    const opponentUnchanged = opponentSignature(startedRun) === opponentAtD3;

    // Reload: releitura independente após tudo isso.
    const reloadedEvent = await localGame.entities.CalendarEvent.get(modalAtD0.calendarEvent.id);
    const reloadStable = opponentSignature(reloadedEvent.metadata.tournament_run) === opponentAtD3;

    return {
      label,
      exactlyOneRow,
      modalRecognizedDrawAtD3: modalAtD3.notDrawn === false,
      verChavesRecognizedDrawAtD3: verChavesAtD3.hasActiveRun === true,
      bracketVisibleAtD3: visibleBracket.drawn === true,
      sameStateAcrossConsumersAtD3: JSON.stringify(modalAtD3.tournamentRun) === JSON.stringify(verChavesAtD3.tournamentRun),
      blockedOnMatchDay,
      phaseAtD0,
      matchStartedStatus: liveMatch.status,
      opponentUnchangedThroughFlow: opponentUnchanged,
      reloadStable,
    };
  }

  const fingerprintA = await runFullTournamentCampaign(tournamentA, `1º torneio (${tournamentA.name})`);
  const fingerprintB = await runFullTournamentCampaign(tournamentB, `2º torneio (${tournamentB.name})`);

  // ═══════════════ 3. Paridade estrutural entre 1º e 2º torneio ═══════════════
  gate('Paridade: 1º torneio cria exatamente 1 linha de CalendarEvent (sem colisão com o seed)', fingerprintA.exactlyOneRow);
  gate('Paridade: 2º torneio também cria exatamente 1 linha (nunca teve colisão, continua assim)', fingerprintB.exactlyOneRow);
  gate('Paridade: TournamentModal reconhece o sorteio em D-3 igualmente para os dois torneios', fingerprintA.modalRecognizedDrawAtD3 === true && fingerprintB.modalRecognizedDrawAtD3 === true);
  gate('Paridade: "Ver chaves" reconhece o sorteio em D-3 igualmente para os dois torneios', fingerprintA.verChavesRecognizedDrawAtD3 === true && fingerprintB.verChavesRecognizedDrawAtD3 === true);
  gate('Paridade: bracket visível em D-3 igualmente para os dois torneios', fingerprintA.bracketVisibleAtD3 === true && fingerprintB.bracketVisibleAtD3 === true);
  gate('Paridade: TournamentModal e "Ver chaves" leem o MESMO estado em ambos os torneios', fingerprintA.sameStateAcrossConsumersAtD3 && fingerprintB.sameStateAcrossConsumersAtD3);
  gate('Paridade: avanço além do dia da partida sem jogar bloqueia em ambos os torneios', fingerprintA.blockedOnMatchDay === true && fingerprintB.blockedOnMatchDay === true);
  gate('Paridade: fase "playable" (Jogar habilitado) após a reunião pré-torneio em ambos', fingerprintA.phaseAtD0 === 'playable' && fingerprintB.phaseAtD0 === 'playable');
  gate('Paridade: "Jogar" inicia a partida (status=playing) em ambos os torneios', fingerprintA.matchStartedStatus === 'playing' && fingerprintB.matchStartedStatus === 'playing');
  gate('Paridade: adversário nunca troca durante o fluxo, em nenhum dos dois torneios', fingerprintA.opponentUnchangedThroughFlow && fingerprintB.opponentUnchangedThroughFlow);
  gate('Paridade: reload preserva o estado igualmente nos dois torneios', fingerprintA.reloadStable && fingerprintB.reloadStable);

  // ═══════════════ 4. Avanço em lote — para no primeiro compromisso, em qualquer torneio ═══════════════
  {
    const freshManager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = freshManager;
    const { career: batchCareer } = await freshManager.createCareer({ playerName: 'Fase 15.7 Batch' });
    activeCareerAdapter.setActiveCareer(batchCareer);
    const batchPartner = BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({
      id: 'p1571-batch-player', sport_name: 'Batch', career_date: CAREER_START_DATE, birth_date: '2001-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
      coins: 20000, xp: 0, morale: 70, form: 50, partner_id: batchPartner.id, weekly_training_enabled: false,
    });
    const batchProfile = await localGame.entities.PlayerProfile.get('p1571-batch-player');
    const batchTournaments = (await localGame.entities.Tournament.filter({})).sort((a, b) => a.start_date.localeCompare(b.start_date));
    const firstTournament = batchTournaments[0];
    let batchCurrent = await localGame.entities.PlayerProfile.get(batchProfile.id);
    while (batchCurrent.career_date < firstTournament.registration_open_date) batchCurrent = await advanceCareerDay(batchCurrent, {});
    await registerTournament({ player: batchCurrent, partner: batchPartner, tournament: firstTournament, teamRank: 300 });
    batchCurrent = await localGame.entities.PlayerProfile.get(batchProfile.id);
    const result = await advanceCareerDays(batchCurrent, 28); // salto que tentaria ultrapassar o 1º torneio inteiro
    gate('Avanço em lote (novo calendário): PARA exatamente no dia do 1º torneio, nunca o ultrapassa', result.finalDate === firstTournament.start_date && Boolean(result.stopReason));
  }

  // ═══════════════ 5. Nenhum tratamento especial por nome/id de torneio ═══════════════
  {
    const filesToAudit = [
      'src/components/tournaments/TournamentModal.jsx',
      'src/components/tournaments/TournamentDetailsModal.jsx',
      'src/pages/Tournaments.jsx',
      'src/lib/tournamentDraw.js',
      'src/lib/tournamentRegistration.js',
      'src/game-core/calendarLifecycle.js',
      'src/game-core/calendarAdvancePolicy.js',
      'src/lib/calendarSystem.js',
    ];
    for (const path of filesToAudit) {
      const src = read(path);
      gate(`Sem tratamento especial por nome de torneio em ${path}`, !/Miami|miami[-_ ]?cup/i.test(src));
      gate(`Sem tratamento especial por id literal de torneio em ${path}`, !/tournament\.(id|name)\s*===\s*['"]/i.test(src));
    }
  }

  console.log(`\n${gates} gates executados, todos PASS — Fase 15.7 First Tournament Parity.`);
} finally {
  await vite.close();
}
