// CLOUD-2 — observabilidade do sorteio no avanço de dia (calendarSystem.js).
//
// Antes, `ensureTournamentDraw(...).catch(() => null)` descartava qualquer
// falha do sorteio em silêncio. Agora ela vira um diagnóstico rastreável
// (reportTournamentDrawFailure), sem mudar o fluxo do dia.
//
// Falhas CONTROLADAS (injeção na escrita update:CalendarEvent do sorteio):
//  1. falha antes de escrever (transação do dia intacta): o dia avança, o
//     evento fica sem run (nada incompleto), o diagnóstico é registrado sem
//     dados pessoais e nada aparece ao jogador; no dia seguinte o sorteio é
//     refeito, com UMA notificação de sorteio só;
//  2. falha DENTRO da transação do dia (a escrita invalida o draft): o dia
//     inteiro é desfeito (data, evento e torneio como antes), o diagnóstico
//     do sorteio fica registrado e um novo avanço sem falha sorteia normal.
//
// Storage em memória; nenhum save real é tocado.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
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
  async list(dir = '.') { const prefix = dir && dir !== '.' ? `${dir}/` : ''; return [...this.files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)).filter((r) => r && !r.includes('/')).map((name) => ({ name, isDirectory: false })); }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const ATHLETE_NAME = 'Atleta Observabilidade';
const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDay } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { registerTournament } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { buildBetaDiagnosticReport } = await vite.ssrLoadModule('/src/lib/betaDiagnostics.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { buildStableMessageId } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  // Injeção: envolve a porta única de escrita do adapter. `mode`:
  //  'outside' → lança antes de entrar na transação (nada escrito);
  //  'inside'  → executa um mutator que lança DENTRO da transação.
  const originalMutate = activeCareerAdapter.mutateActiveCareer.bind(activeCareerAdapter);
  let armed = null;
  let injected = 0;
  activeCareerAdapter.mutateActiveCareer = (mutator, options = {}) => {
    if (armed && options.caller === 'CareerEntityRepository.update:CalendarEvent') {
      const mode = armed;
      armed = null;
      injected += 1;
      const failure = Object.assign(new Error('QA: falha injetada na escrita do sorteio'), { code: 'QA_INJECTED' });
      if (mode === 'outside') return Promise.reject(failure);
      return originalMutate(async () => { throw failure; }, options);
    }
    return originalMutate(mutator, options);
  };

  async function setup(id) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: ATHLETE_NAME });
    activeCareerAdapter.setActiveCareer(career);
    const partner = BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({ id: `${id}-player`, sport_name: ATHLETE_NAME, career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false });
    const profile = await localGame.entities.PlayerProfile.get(`${id}-player`);
    const tournament = await localGame.entities.Tournament.create({ id: `${id}-t`, name: 'Draw QA Cup', tier: 'Silver', start_date: '2026-01-08', status: 'inscricoes' });
    const registration = await registerTournament({ player: profile, partner, tournament, teamRank: 600 });
    gate(`[${id}] inscrição elegível aceita`, registration?.success === true);
    let current = await localGame.entities.PlayerProfile.get(profile.id);
    while (current.career_date < '2026-01-04') current = await advanceCareerDay(current, {});
    return { manager, career, profile: current, tournament };
  }
  const eventOf = async (profileId, tournamentId) => (await localGame.entities.CalendarEvent.filter({ profile_id: profileId })).find((e) => e.related_id === tournamentId && e.event_type === 'tournament');
  const drawDiagnostics = (tournamentId) => buildBetaDiagnosticReport().runtimeErrors.filter((e) => e.type === 'tournament-draw' && e.context?.tournamentId === tournamentId);
  // Id estável da notificação "Sorteio definido" (careerCommunications.js):
  // buildStableMessageId(profile, 'federation-tournament:<id>:upcoming:<N>-days').
  const drawMessages = async (profileId, tournamentId) => {
    const prefix = buildStableMessageId(profileId, `federation-tournament:${tournamentId}:upcoming`);
    return (await localGame.entities.CareerMessage.filter({ profile_id: profileId })).filter((m) => String(m.id).startsWith(prefix));
  };

  // ── 1. Falha antes de escrever: dia avança, sorteio refeito no dia seguinte ─
  {
    const { manager, career, profile, tournament } = await setup('outside');
    armed = 'outside';
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args); };
    let day = null;
    let threw = null;
    try { day = await advanceCareerDay(profile, {}); } catch (error) { threw = error; } finally { console.warn = originalWarn; }
    gate('[outside] a falha injetada de fato ocorreu', injected === 1);
    gate('[outside] o avanço de dia NÃO falha (sorteio é opcional naquele dia)', !threw && day?.career_date === '2026-01-05');
    const event = await eventOf(profile.id, tournament.id);
    gate('[outside] evento continua íntegro e sem run (nenhum evento incompleto)', event?.status === 'scheduled' && !event?.metadata?.tournament_run && Boolean(event?.metadata?.registration_id));
    const diags = drawDiagnostics(tournament.id);
    gate('[outside] falha virou diagnóstico rastreável TOURNAMENT_DRAW_FAILED', diags.length === 1 && diags[0].code === 'TOURNAMENT_DRAW_FAILED' && diags[0].errorCode === 'QA_INJECTED');
    gate('[outside] diagnóstico tem contexto técnico (evento, torneio, tier, data, inscrição)', diags[0]?.context?.calendarEventId === event.id && diags[0].context.tier === 'Silver' && diags[0].context.careerDate === '2026-01-05' && diags[0].context.hadRegistration === true);
    gate('[outside] diagnóstico não expõe o nome do atleta', !JSON.stringify(diags[0]).includes(ATHLETE_NAME));
    gate('[outside] log técnico marcado [TournamentDraw] (console, não UI)', warnings.some((w) => w[0] === '[TournamentDraw]'));
    gate('[outside] nenhuma notificação de sorteio criada para um sorteio que não aconteceu', (await drawMessages(profile.id, tournament.id)).length === 0);

    const nextDay = await advanceCareerDay(day, {});
    const healed = await eventOf(profile.id, tournament.id);
    gate('[outside] dia seguinte (D-2): sorteio refeito sozinho', nextDay.career_date === '2026-01-06' && Boolean(healed?.metadata?.tournament_run));
    gate('[outside] nenhum diagnóstico novo no dia em que funcionou', drawDiagnostics(tournament.id).length === 1);
    const afterThird = await advanceCareerDay(nextDay, {});
    gate('[outside] notificação de sorteio: exatamente UMA, mesmo com retry e dias seguintes', afterThird.career_date === '2026-01-07' && (await drawMessages(profile.id, tournament.id)).length === 1);
    const reloaded = await manager.loadCareer(career.career_id);
    gate('[outside] após reload: o run refeito persiste', Boolean((reloaded.entities.CalendarEvent || []).find((e) => e.related_id === tournament.id)?.metadata?.tournament_run));
  }

  // ── 2. Falha DENTRO da transação: o dia inteiro é desfeito (atomicidade) ───
  {
    const { manager, career, profile, tournament } = await setup('inside');
    const before = await manager.loadCareer(career.career_id);
    const tournamentBefore = (before.entities.Tournament || []).find((t) => t.id === tournament.id);
    armed = 'inside';
    const originalWarn = console.warn;
    const originalError = console.error;
    console.warn = () => {};
    console.error = () => {};
    let threw = null;
    try { await advanceCareerDay(profile, {}); } catch (error) { threw = error; } finally { console.warn = originalWarn; console.error = originalError; }
    gate('[inside] a falha injetada de fato ocorreu', injected === 2);
    gate('[inside] avanço de dia falha (transação invalidada não é mascarada)', Boolean(threw));
    const after = await manager.loadCareer(career.career_id);
    gate('[inside] atomicidade: data do save não avançou', after.player?.career_date === '2026-01-04');
    const eventAfter = (after.entities.CalendarEvent || []).find((e) => e.related_id === tournament.id);
    gate('[inside] atomicidade: nenhum run parcial gravado no save', !eventAfter?.metadata?.tournament_run);
    const tournamentAfter = (after.entities.Tournament || []).find((t) => t.id === tournament.id);
    gate('[inside] atomicidade: torneio no save igual ao de antes (sem chaveamento parcial)', tournamentAfter?.status === tournamentBefore?.status && !tournamentAfter?.draw_date);
    gate('[inside] o diagnóstico do sorteio foi registrado antes do rollback', drawDiagnostics(tournament.id).some((d) => d.code === 'TOURNAMENT_DRAW_FAILED'));
    gate('[inside] o rollback do dia também é diagnosticado (career-day-advance)', buildBetaDiagnosticReport().runtimeErrors.some((e) => e.type === 'career-day-advance'));

    activeCareerAdapter.clearActiveCareer?.();
    activeCareerAdapter.setActiveCareer(after);
    const reloadedProfile = await localGame.entities.PlayerProfile.get(profile.id);
    const retried = await advanceCareerDay(reloadedProfile, {});
    const event = await eventOf(profile.id, tournament.id);
    gate('[inside] novo avanço sem falha: dia avança e sorteio acontece normalmente', retried.career_date === '2026-01-05' && Boolean(event?.metadata?.tournament_run));
  }

  activeCareerAdapter.mutateActiveCareer = originalMutate;
  console.log(`\n${gates} gates executados, todos PASS — CLOUD-2 tournament draw observability.`);
} finally {
  await vite.close();
}
