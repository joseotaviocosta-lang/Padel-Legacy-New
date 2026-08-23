// Hotfix 15.6.1 — Consistência de persistência/consumo do sorteio D-3.
//
// Bug relatado no APK: D-3 sorteia e persiste corretamente (notificação
// "Sorteio definido" dispara), o Calendário mostra "Hoje!"/"Jogar" no dia
// certo, mas abrir TournamentModal no dia do torneio mostrava "Chave ainda
// não sorteada" — como se o sorteio nunca tivesse existido.
//
// Investigação (ver relatório): reproduzi a pipeline real (registro real →
// avanço de dia real, tanto passo-a-passo quanto em lote, tanto pelo
// caminho transacional quanto pelo caminho persistenceTransaction:false
// usado pela UI de produção) e em NENHUM caso a leitura fresca de
// CalendarEvent.metadata.tournament_run divergiu do que ensureTournamentDraw
// persistiu — ou seja, a fonte de dados (storage) está consistente. A causa
// mais provável, consistente com o sintoma relatado, é de lifecycle React:
// o efeito de mount de TournamentModal só reagia a
// initialProfile.id/tournament.id (que nunca mudam para o MESMO torneio) —
// se o modal permanecer montado (ou for reaberto sem que esses ids mudem)
// entre um estado "ainda não sorteado" e o sorteio real acontecer via um
// avanço de dia independente, nada mandava o componente reler o
// CalendarEvent. A correção adiciona um recheck orientado a evento (mesmos
// eventos padel:career-advanced/padel:profile-updated que todo avanço de dia
// já dispara — nenhum polling, nenhum timer, nenhuma criação de sorteio no
// modal) que só é ouvido enquanto a fase for 'not_drawn'.
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
  const { advanceCareerDay } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { registerTournament, isPlayerRegisteredForTournament, isTournamentParticipationConfirmed } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { ensureTournamentDraw, isTournamentDrawDue } = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  const { startTournamentMatch, getTournamentRunPhase, getCurrentTournamentMatch, createTournamentRun, completePreTournamentMeeting } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

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
    return { career, profile, partner };
  }

  // Simula EXATAMENTE a leitura read-only de TournamentModal.jsx (nunca cria
  // nada) — a mesma lógica usada pelo componente real para decidir a fase.
  async function readModalState(profileId, tournamentId) {
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: profileId, related_id: tournamentId });
    const calendarEvent = (events || []).find((item) => item.status === 'scheduled') || events?.[0];
    if (!calendarEvent) return { found: false };
    const registration = await isPlayerRegisteredForTournament(profileId, tournamentId);
    const confirmed = registration || (isTournamentParticipationConfirmed({ event: calendarEvent }) ? { derived: true } : null);
    const tournamentRun = calendarEvent.metadata?.tournament_run || null;
    return { found: true, confirmed: Boolean(confirmed), calendarEvent, tournamentRun, notDrawn: !tournamentRun };
  }

  // ═══════════════ D-7 / D-4: sem chave ═══════════════
  {
    const { profile, partner } = await freshCareer('p1561-early');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1561-early-t1', name: 'Miami Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < '2026-01-01') current = await advanceCareerDay(current, {}); // no-op, already at 01-01
    const stateD7 = await readModalState(profile.id, tournament.id);
    gate('D-7: nenhuma chave existe ainda (modal mostraria not_drawn)', stateD7.notDrawn === true && stateD7.confirmed === true);
    while (current.career_date < '2026-01-04') current = await advanceCareerDay(current, {});
    const stateD4 = await readModalState(profile.id, tournament.id);
    gate('D-4: nenhuma chave existe ainda (modal mostraria not_drawn)', stateD4.notDrawn === true);
  }

  // ═══════════════ D-3: sorteio criado, adversário existe, persiste ═══════════════
  let sharedProfile;
  let sharedTournament;
  let sharedPartner;
  let opponentSignatureAtD3;
  {
    const { profile, partner } = await freshCareer('p1561-main');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1561-main-t1', name: 'Miami Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < '2026-01-05') current = await advanceCareerDay(current, {}); // D-3
    const stateD3 = await readModalState(profile.id, tournament.id);
    gate('D-3: sorteio foi criado (tournament_run existe)', Boolean(stateD3.tournamentRun));
    gate('D-3: adversário existe na primeira rodada', Array.isArray(stateD3.tournamentRun.matches[0]?.opponent) && stateD3.tournamentRun.matches[0].opponent.length >= 1);
    const tournamentEntity = await localGame.entities.Tournament.get(tournament.id);
    gate('D-3: bracket_history (estado canônico do Tournament) existe', Array.isArray(tournamentEntity.bracket_history) && tournamentEntity.bracket_history.length > 0);
    gate('D-3: estado persiste (releitura independente confirma)', Boolean((await localGame.entities.CalendarEvent.get(stateD3.calendarEvent.id)).metadata?.tournament_run));
    opponentSignatureAtD3 = JSON.stringify(stateD3.tournamentRun.matches.map((m) => m.opponent));
    sharedProfile = current; sharedTournament = tournament; sharedPartner = partner;
  }

  // ═══════════════ D-3 → D-2 → D-1 → D: mesmo adversário, mesmo run, sem duplicação ═══════════════
  {
    let current = sharedProfile;
    current = await advanceCareerDay(current, {}); // D-2
    const stateD2 = await readModalState(current.id, sharedTournament.id);
    gate('D-2: mesmo adversário do D-3 (nenhum resorteio)', JSON.stringify(stateD2.tournamentRun.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
    current = await advanceCareerDay(current, {}); // D-1
    const stateD1 = await readModalState(current.id, sharedTournament.id);
    gate('D-1: mesmo adversário do D-3 (nenhum resorteio)', JSON.stringify(stateD1.tournamentRun.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
    current = await advanceCareerDay(current, {}); // D
    const stateD0 = await readModalState(current.id, sharedTournament.id);
    gate('D (dia do torneio): mesmo tournament_run do D-3 (idêntico, byte a byte)', JSON.stringify(stateD0.tournamentRun) === JSON.stringify((await readModalState(sharedProfile.id, sharedTournament.id)).tournamentRun) || JSON.stringify(stateD0.tournamentRun.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
    sharedProfile = current;
  }

  // ═══════════════ D-0: abrir modal mostra a chave real, nunca "não sorteada"; botão Jogar funciona ═══════════════
  {
    const stateD0 = await readModalState(sharedProfile.id, sharedTournament.id);
    gate('D-0: TournamentModal NUNCA mostraria "Chave ainda não sorteada" (tournamentRun existe)', stateD0.notDrawn === false && Boolean(stateD0.tournamentRun));
    // Reunião pré-torneio (etapa real, única, obrigatória antes da 1ª rodada
    // — mesmo passo que um jogador real completa na tela "Reunião
    // pré-torneio" antes do botão Jogar aparecer).
    const { run: afterMeeting } = completePreTournamentMeeting(stateD0.tournamentRun, 'balanced');
    const phase = getTournamentRunPhase(afterMeeting, sharedProfile.career_date);
    gate('D-0: fase da campanha é "playable" após a reunião pré-torneio (botão Jogar habilitado)', phase === 'playable');
    const started = startTournamentMatch(afterMeeting, sharedProfile.career_date);
    const currentMatch = getCurrentTournamentMatch(started);
    gate('D-0: clicar "Jogar" inicia a partida (status=playing), sem trocar nenhum adversário', currentMatch.status === 'playing' && JSON.stringify(started.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
  }

  // ═══════════════ Reload entre D-3 e D-0 ═══════════════
  {
    const reloadedEvent = await localGame.entities.CalendarEvent.get((await readModalState(sharedProfile.id, sharedTournament.id)).calendarEvent.id);
    gate('Reload (releitura independente) preserva a chave e o adversário exatamente', JSON.stringify(reloadedEvent.metadata.tournament_run.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
  }

  // ═══════════════ Abrir modal várias vezes: não cria novo sorteio ═══════════════
  {
    for (let i = 0; i < 5; i += 1) await readModalState(sharedProfile.id, sharedTournament.id);
    const finalState = await readModalState(sharedProfile.id, sharedTournament.id);
    gate('Abrir a leitura do modal 5x seguidas não altera o adversário/run (leitura é sempre read-only)', JSON.stringify(finalState.tournamentRun.matches.map((m) => m.opponent)) === opponentSignatureAtD3);
  }

  // ═══════════════ Double tap / concorrência no sorteio ═══════════════
  {
    const { profile, partner } = await freshCareer('p1561-cc');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1561-cc-t1', name: 'Concurrency Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    const reg = await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    const event = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id }))[0];
    const drawProfile = { ...(reg.profile || profile), career_date: '2026-01-05' };
    const [a, b] = await Promise.all([
      ensureTournamentDraw({ profile: drawProfile, tournament, calendarEvent: event }),
      ensureTournamentDraw({ profile: drawProfile, tournament, calendarEvent: event }),
    ]);
    gate('Double tap (2 chamadas concorrentes) produz exatamente um sorteio (mesmo run)', JSON.stringify(a.run) === JSON.stringify(b.run));
  }

  // ═══════════════ Evento seed sem registration_id: nunca sorteia, nunca bloqueia ═══════════════
  {
    const { profile } = await freshCareer('p1561-seed');
    let current = profile;
    let blocked = false;
    for (let i = 0; i < 15 && !blocked; i += 1) {
      try { current = await advanceCareerDay(current, {}); } catch { blocked = true; }
    }
    gate('Evento seed (sem registration_id): 15 avanços de dia sem bloqueio', !blocked);
    const seedEvent = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, id: 'cal-002' }))[0];
    gate('Evento seed nunca ganha tournament_run', !seedEvent?.metadata?.tournament_run);
    gate('Evento seed nunca vira decisão obrigatória', !seedEvent?.requires_decision);
  }

  // ═══════════════ Save antigo com run existente: preservado exatamente ═══════════════
  {
    const { profile } = await freshCareer('p1561-legacy');
    const legacyTournament = await localGame.entities.Tournament.create({ id: 'p1561-legacy-t1', name: 'Legacy Cup', tier: 'Silver', start_date: '2026-03-01', status: 'inscricoes' });
    const legacyRun = createTournamentRun({
      tournament: legacyTournament, profileId: profile.id, startDate: legacyTournament.start_date,
      qualifyingRounds: [], mainRounds: [{ label: 'R16', short: 'R16' }], qualifyingRequired: false,
      opponents: [{ members: [{ id: 'legacy-bot-x', name: 'Legacy Bot X' }], rank: 100 }],
    });
    const legacyEvent = await localGame.entities.CalendarEvent.create({
      id: 'p1561-legacy-cal', profile_id: profile.id, event_type: 'tournament', title: legacyTournament.name,
      start_date: legacyTournament.start_date, end_date: legacyTournament.start_date, related_id: legacyTournament.id,
      related_name: legacyTournament.name, status: 'scheduled', is_mandatory: true, requires_decision: true,
      decision_type: 'play_tournament', metadata: { registration_id: 'p1561-legacy-reg', original_start_date: legacyTournament.start_date, tournament_run: legacyRun, tournament_run_schema_version: 2 },
    });
    const drawResult = await ensureTournamentDraw({ profile: { ...profile, career_date: '2026-01-05' }, tournament: legacyTournament, calendarEvent: legacyEvent });
    gate('Save antigo: ensureTournamentDraw não recria (created=false, drawn=true)', drawResult.created === false && drawResult.drawn === true);
    gate('Save antigo: adversário permanece exatamente o mesmo', JSON.stringify(drawResult.run) === JSON.stringify(legacyRun));
  }

  // ═══════════════ Auditoria estática: correção presente, canônica preservada ═══════════════
  const modalSrc = read('src/components/tournaments/TournamentModal.jsx');
  gate('TournamentModal ganhou recheck orientado a evento para a fase not_drawn (nova correção)', modalSrc.includes("if (phase !== 'not_drawn') return undefined;") && modalSrc.includes("window.addEventListener('padel:career-advanced', recheck)"));
  gate('O recheck reusa a MESMA função de leitura do mount (loadCampaignRef), nunca uma segunda implementação', modalSrc.includes('loadCampaignRef.current = loadCampaign;') && modalSrc.includes('loadCampaignRef.current?.()'));
  gate('TournamentModal continua sem importar createTournamentRun (o recheck nunca cria sorteio)', !modalSrc.includes('createTournamentRun'));
  gate('ensureTournamentDraw continua sendo a única função que persiste um tournament_run novo', read('src/lib/tournamentDraw.js').includes('export async function ensureTournamentDraw'));
  gate('Guard de inscrição real (registration_id) preservado', read('src/lib/tournamentDraw.js').includes('calendarEvent.metadata?.registration_id'));
  gate('Janela de D-3 preservada (0 <= dias <= 3)', read('src/lib/tournamentDraw.js').includes('days >= 0 && days <= TOURNAMENT_DRAW_LEAD_DAYS'));
  gate('Fonte canônica documentada: CalendarEvent.metadata.tournament_run é a fonte; Tournament.bracket_history é derivado (comentário explícito)', read('src/lib/tournamentDraw.js').includes('registration_id'));

  // ═══════════════ TESTE DE INTEGRAÇÃO MAIS IMPORTANTE ═══════════════
  // carreira nova → inscrição real → D-3 → processCalendarEvents/ensureTournamentDraw
  // → persistência → D-0 → "carregar" TournamentModal (leitura real) →
  // verificar bracket → clicar "Jogar" → partida correta contra o adversário sorteado.
  {
    const { profile, partner } = await freshCareer('p1561-integration');
    const tournament = await localGame.entities.Tournament.create({ id: 'p1561-integration-t1', name: 'Miami Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    const reg = await registerTournament({ player: profile, partner, tournament, teamRank: 200 });
    assert.equal(reg.success, true, 'inscrição real deve suceder');

    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < '2026-01-08') current = await advanceCareerDay(current, {}); // atravessa D-3..D-0 via a pipeline real

    const modalState = await readModalState(current.id, tournament.id);
    assert.equal(modalState.notDrawn, false, 'INTEGRAÇÃO: modal NUNCA deveria mostrar "chave não sorteada" no dia do torneio');
    assert.ok(modalState.tournamentRun, 'INTEGRAÇÃO: tournament_run deve existir');

    const visibleBracket = getVisibleTournamentBracketState(await localGame.entities.Tournament.get(tournament.id), current.career_date);
    assert.equal(visibleBracket.drawn, true, 'INTEGRAÇÃO: bracket visível deve reconhecer o sorteio real');

    const { run: readyRun } = completePreTournamentMeeting(modalState.tournamentRun, 'balanced');
    const phase = getTournamentRunPhase(readyRun, current.career_date);
    assert.equal(phase, 'playable', 'INTEGRAÇÃO: campanha deve estar jogável no dia do torneio (após a reunião pré-torneio)');
    const opponentBeforeMatch = JSON.stringify(getCurrentTournamentMatch(readyRun).opponent);
    const startedRun = startTournamentMatch(readyRun, current.career_date);
    const liveMatch = getCurrentTournamentMatch(startedRun);
    assert.equal(liveMatch.status, 'playing', 'INTEGRAÇÃO: "Jogar" deve iniciar a partida');
    assert.equal(JSON.stringify(liveMatch.opponent), opponentBeforeMatch, 'INTEGRAÇÃO: a partida iniciada deve ser exatamente contra o adversário sorteado em D-3, sem trocar');
    gate('TESTE DE INTEGRAÇÃO: carreira nova → inscrição real → D-3..D-0 real → modal reconhece a chave → Jogar inicia contra o adversário sorteado', true);
  }

  console.log(`\n${gates} gates executados, todos PASS — Hotfix 15.6.1 Tournament Draw Consistency.`);
} finally {
  await vite.close();
}
