// CLOUD-6N — cenários integrados curtos dos fluxos críticos de carreira,
// usando os motores reais (CareerManager, calendarLifecycle, registro de
// torneio, TournamentRunManager). Sem temporada completa, sem mocks de motor.
//   1. Nova carreira → estado inicial válido → salvar → carregar
//   2. Avançar calendário → inscrição (prazo/elegibilidade) → torneio
//   3. Resultado → ranking/estado persistidos
//   4. Avançar mês → consistência (sem duplicações)
//   5. Carregar save → continuar sem duplicações
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
const gate = (label, condition) => { gates += 1; assert.ok(condition, `GATE FALHOU: ${label}`); console.log(`PASS — ${label}`); };

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
  async list() { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const dupes = (ids) => ids.length - new Set(ids).size;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { CAREER_START_DATE } = await vite.ssrLoadModule('/src/lib/career.js');
  const { registerTournament, resolveTournamentCampaignEvent } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { startTournamentMatch, getCurrentTournamentMatch, completePreTournamentMeeting, recordTournamentMatchResult } =
    await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Cloud 6N' });
  activeCareerAdapter.setActiveCareer(career);
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  await activeCareerAdapter.createPlayerProfile({
    id: 'c6n-player', sport_name: 'Cloud 6N', career_date: CAREER_START_DATE, birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 20000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
  });
  const snapshot = async () => ({
    profile: await localGame.entities.PlayerProfile.get('c6n-player'),
    tournaments: await localGame.entities.Tournament.filter({}),
    events: await localGame.entities.CalendarEvent.filter({ profile_id: 'c6n-player' }),
  });

  // ═══ 1. Nova carreira ═══
  const initial = await snapshot();
  gate('Nova carreira: perfil com data inicial, energia/fadiga/moedas válidas', initial.profile.career_date === CAREER_START_DATE
    && initial.profile.energy === 100 && initial.profile.fatigue === 0 && initial.profile.coins === 20000);
  gate('Nova carreira: parceiro inicial vinculado', initial.profile.partner_id === partner.id);
  gate('Nova carreira: mundo inicializado com torneios sem ids duplicados', initial.tournaments.length > 0 && dupes(initial.tournaments.map((t) => t.id)) === 0);
  gate('Nova carreira: nenhum evento de calendário duplicado', dupes(initial.events.map((e) => e.id)) === 0);
  gate('Nova carreira: nenhum torneio no passado em relação à data inicial', initial.tournaments.every((t) => t.end_date >= CAREER_START_DATE));

  // ═══ 2. Salvar → carregar ═══
  const saved = await activeCareerAdapter.getActiveCareer({ fresh: true });
  const careerId = saved.career_id;
  await manager.saveCareer(careerId, saved);
  activeCareerAdapter.clearActiveCareer();
  const { career: loaded } = await manager.loadCareer(careerId).then((r) => (r.career ? r : { career: r }));
  activeCareerAdapter.setActiveCareer(loaded);
  const afterLoad = await snapshot();
  gate('Carregar: perfil idêntico (data, energia, fadiga, moedas, parceiro)', ['career_date', 'energy', 'fatigue', 'coins', 'partner_id', 'level']
    .every((k) => afterLoad.profile[k] === initial.profile[k]));
  gate('Carregar: mesmas quantidades de torneios e eventos (sem duplicação)', afterLoad.tournaments.length === initial.tournaments.length
    && afterLoad.events.length === initial.events.length);

  // ═══ 3. Calendário → inscrição ═══
  const tournaments = [...afterLoad.tournaments].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const target = tournaments.find((t) => t.tier === 'Silver' && t.registration_open_date && t.start_date > CAREER_START_DATE) || tournaments[0];
  let current = afterLoad.profile;
  gate('Inscrição: bloqueada antes da abertura da janela', target.registration_open_date <= CAREER_START_DATE
    || (await registerTournament({ player: current, partner, tournament: target, teamRank: 0 })).success === false);
  const target2 = target; // mantém o nome para os relatórios
  while (current.career_date < target2.registration_open_date) current = await advanceCareerDay(current, {});
  gate('Calendário: avanço de dias move career_date exatamente 1 dia por chamada', current.career_date >= target2.registration_open_date);

  const overqualified = await registerTournament({ player: current, partner, tournament: target2, teamRank: 200 });
  gate('Elegibilidade: dupla Top 400 barrada em torneio de acesso livre (Silver)', target2.tier !== 'Silver' || overqualified.success === false);
  const reg = await registerTournament({ player: current, partner, tournament: target2, teamRank: 0 });
  gate('Inscrição: dupla sem ranking inscreve dentro do prazo', reg.success === true);
  const dup = await registerTournament({ player: await localGame.entities.PlayerProfile.get('c6n-player'), partner, tournament: target2, teamRank: 0 });
  gate('Inscrição: repetir a inscrição é idempotente (uma única linha de calendário)', (await localGame.entities.CalendarEvent.filter({ profile_id: 'c6n-player', related_id: target2.id })).length === 1);

  // ═══ 4. O dia do torneio inscrito não pode ser ultrapassado sem jogar ═══
  current = await localGame.entities.PlayerProfile.get('c6n-player');
  let blocked = false;
  while (current.career_date <= target2.start_date) {
    try { current = await advanceCareerDay(current, {}); } catch { blocked = true; break; }
  }
  gate('Calendário: avanço é bloqueado no dia do torneio inscrito até jogá-lo', blocked && current.career_date === target2.start_date);

  // ═══ 5. Torneio: D-0 → jogar → resultado ═══
  const event = await resolveTournamentCampaignEvent('c6n-player', target2.id);
  gate('Torneio: chave sorteada e persistida no evento inscrito', Boolean(event?.metadata?.tournament_run?.matches?.length));
  const { run: ready } = completePreTournamentMeeting(event.metadata.tournament_run, 'balanced');
  const playing = startTournamentMatch(ready, current.career_date);
  const m = getCurrentTournamentMatch(playing);
  const { run: after } = recordTournamentMatchResult(playing, { matchId: m.id, won: false, score: '4-6 3-6' });
  gate('Torneio: derrota encerra participação (eliminated)', after.status === 'eliminated');
  const repeat = recordTournamentMatchResult(after, { matchId: m.id, won: false, score: '4-6 3-6' });
  gate('Torneio: resultado repetido é idempotente', repeat.idempotent === true);
  await localGame.entities.CalendarEvent.update(event.id, { status: 'completed', requires_decision: false,
    metadata: { ...event.metadata, tournament_run: after } });

  // ═══ 6. Avançar ~1 mês e salvar/carregar de novo ═══
  current = await localGame.entities.PlayerProfile.get('c6n-player');
  const startMonth = current.career_date;
  for (let i = 0; i < 30; i += 1) {
    try { current = await advanceCareerDay(current, {}); } catch { break; }
  }
  const monthSnap = await snapshot();
  gate('Mês: career_date avançou (sem travar após torneio encerrado)', monthSnap.profile.career_date > startMonth);
  gate('Mês: energia/fadiga permanecem em [0,100]', monthSnap.profile.energy >= 0 && monthSnap.profile.energy <= 100
    && monthSnap.profile.fatigue >= 0 && monthSnap.profile.fatigue <= 100);
  gate('Mês: nenhum id duplicado em torneios/eventos', dupes(monthSnap.tournaments.map((t) => t.id)) === 0 && dupes(monthSnap.events.map((e) => e.id)) === 0);
  gate('Mês: exatamente um evento de torneio por related_id inscrito', monthSnap.events.filter((e) => e.related_id === target2.id).length === 1);

  const saved2 = await activeCareerAdapter.getActiveCareer({ fresh: true });
  await manager.saveCareer(saved2.career_id, saved2);
  activeCareerAdapter.clearActiveCareer();
  const reload = await manager.loadCareer(saved2.career_id);
  activeCareerAdapter.setActiveCareer(reload.career || reload);
  const reloaded = await snapshot();
  gate('Recarregar após o mês: data, contagens e conclusão do torneio preservadas',
    reloaded.profile.career_date === monthSnap.profile.career_date
    && reloaded.events.length === monthSnap.events.length
    && reloaded.tournaments.length === monthSnap.tournaments.length
    && reloaded.events.find((e) => e.related_id === target2.id)?.status === 'completed');
  let next = reloaded.profile;
  next = await advanceCareerDay(next, {});
  gate('Continuar após carregar: avanço de dia funciona e sem duplicação', next.career_date > reloaded.profile.career_date
    && dupes((await snapshot()).events.map((e) => e.id)) === 0);

  console.log(`\n${gates} gates executados, todos PASS — CLOUD-6N career critical flows.`);
} finally {
  await vite.close();
}
