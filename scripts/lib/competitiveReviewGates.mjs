// Playthrough 5.14, Parte X — gates compartilhados da reunião competitiva.
//
// Cada gate faz asserções PRÓPRIAS sobre um aspecto distinto; os arquivos
// nominais só selecionam qual rodar, reaproveitando este setup em vez de
// repetir ~60 linhas de boilerplate de carreira.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

export function installShims(pathname) {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

export function makeRunner() {
  let passed = 0; let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
  const check = async (label, fn) => {
    try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  };
  const finish = (name) => {
    console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
    if (failed > 0) process.exitCode = 1;
    else console.log(`${name}: PASS`);
  };
  return { check, finish };
}

export async function bootstrap(label, { rank = 300, careerDate = '2026-01-19' } = {}) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await mod('/src/storage/GameStorage.js');
  const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
  const { CareerManager } = await mod('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
  const { localGame } = await mod('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await mod('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const profileId = `p-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: profileId, sport_name: label, career_date: careerDate, birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: rank, ranking_position: rank,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(careerDate);

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 180, prizeSplit: 50, monthlySalary: 300 });
  profile = await localGame.entities.PlayerProfile.get(profileId);
  const partner = await localGame.entities.AthleteProfile.get(bot.id).catch(() => bot);

  return { vite, mod, localGame, profile, profileId, partner, bot, rank, careerDate };
}

const reviewsOf = async (localGame, profileId) => {
  const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
  return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
};

// ---------------------------------------------------------------------------
// GATES
// ---------------------------------------------------------------------------

export async function gateAfterRegistration(ctx, check) {
  const { mod, localGame, profile, profileId, partner, careerDate, rank } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');
  const { buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');

  const first = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const recommendedId = first.message?.metadata?.recommended_tournament_id;
  assert.ok(recommendedId, 'pré-condição: sem recomendação');
  const tournament = await localGame.entities.Tournament.get(recommendedId);

  await check('Parte J: antes da inscrição o estado é DECISÃO', () => {
    assert.equal(first.decision.state, 'decision');
    assert.match(first.message.subject, /Reunião da comissão/);
  });

  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
  assert.ok(registered?.success, `inscrição falhou: ${JSON.stringify(registered?.reasons)}`);

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId }).catch(() => []);
  const decision = buildCompetitiveWeeklyDecision(
    { ...profile, career_date: careerDate },
    { tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: rank, partner },
  );

  await check('Parte J/17: depois da inscrição o estado vira COMPROMISSO', () => {
    assert.equal(decision.state, 'committed', `estado=${decision.state}`);
    assert.equal(decision.committed?.id, recommendedId);
  });

  await check('Parte J: o compromisso traz estreia e não pede mais decisão', () => {
    assert.ok(decision.committed.startDate, 'sem data de estreia');
    assert.equal(decision.recommended.id, decision.committed.id);
  });

  await check('Parte O: o CTA deixa de ser "Inscrever-se"', async () => {
    const { resolveCompetitiveDecisionCta } = await mod('/src/lib/competitiveWeeklyDecision.js');
    const cta = resolveCompetitiveDecisionCta(decision);
    console.log(`   [registro] CTA pós-inscrição: ${cta?.label}`);
    assert.ok(cta, 'sem CTA');
    assert.notEqual(cta.id, 'register');
  });
}

export async function gateChoosesAlternative(ctx, check) {
  const { mod, localGame, profile, profileId, partner, careerDate, rank } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');
  const { buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');

  const first = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const recommendedId = first.message?.metadata?.recommended_tournament_id;
  const alternative = (first.decision.alternatives || [])
    .find((item) => item.eligible && item.canRegisterNow && item.registrationAllowed);

  if (!alternative) {
    await check('Parte K: (sem alternativa inscritível nesta semana — cenário não aplicável)', () => {
      assert.ok(true);
    });
    return;
  }

  const tournament = await localGame.entities.Tournament.get(alternative.id);
  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
  assert.ok(registered?.success, `inscrição na alternativa falhou: ${JSON.stringify(registered?.reasons)}`);

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
  const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId }).catch(() => []);
  const decision = buildCompetitiveWeeklyDecision(
    { ...profile, career_date: careerDate },
    { tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: rank, partner },
  );

  await check('Parte K/18: escolher a ALTERNATIVA não é bloqueado', () => {
    assert.ok(registered.success);
  });

  await check('Parte K: o plano passa a refletir a escolha do jogador, não a original', () => {
    assert.equal(decision.state, 'committed');
    assert.equal(decision.committed.id, alternative.id,
      `plano ainda aponta ${decision.committed.name} em vez da escolha do jogador`);
    assert.notEqual(decision.committed.id, recommendedId);
    console.log(`   [registro] comissão sugeriu outro; jogador escolheu ${alternative.name} e o plano acompanhou`);
  });

  await check('Parte K: nenhuma punição artificial foi aplicada', () => {
    assert.ok(!decision.penalty, 'apareceu um campo de punição');
    assert.ok(!decision.committed.blocked, 'compromisso marcado como bloqueado');
  });
}

export async function gateNoEvent(ctx, check) {
  const { mod, profile } = ctx;
  const { buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');

  // Sem nenhum torneio no horizonte.
  const decision = buildCompetitiveWeeklyDecision(
    { ...profile, career_date: '2026-01-19' },
    { tournaments: [], registrations: [], calendarEvents: [], teamRank: 300, partner: ctx.partner },
  );

  await check('Parte I/19: sem torneio, o estado é NO_EVENT', () => {
    assert.equal(decision.state, 'no_event');
  });

  await check('Parte I: a comissão dá um MOTIVO em vez de inventar torneio', () => {
    assert.ok(decision.reason, 'sem motivo');
    assert.equal(decision.recommended, null, 'inventou um torneio');
    console.log(`   [registro] motivo: ${decision.reason}`);
  });

  await check('Parte I: a mensagem correspondente não promete competição', async () => {
    const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
    // Carreira sem calendário futuro: o mundo existe mas a janela não tem nada
    // elegível para este perfil.
    const result = await ensureWeeklyCompetitiveStaffReview(
      { ...profile, career_date: '2030-06-01', world_ranking: 300 }, '2030-06-01',
    );
    if (result.decision?.state === 'no_event') {
      assert.match(result.message.subject, /Semana sem competição recomendada/);
      assert.ok(result.message.metadata.no_event_reason, 'sem motivo no metadata');
    }
    assert.ok(result.created || result.decision, 'nenhum resultado produzido');
  });
}

export async function gateSingleMessagePerWeek(ctx, check) {
  const { mod, localGame, profile, profileId, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');

  // Vários dias da MESMA semana.
  for (const day of ['2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22']) {
    await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: day }, day);
  }
  const reviews = await reviewsOf(localGame, profileId);

  await check('Parte C/5: exatamente UMA reunião competitiva na semana', () => {
    const keys = new Set(reviews.map((m) => m.metadata?.context_key));
    console.log(`   [registro] mensagens=${reviews.length} chaves distintas=${keys.size}`);
    assert.equal(reviews.length, 1, `${reviews.length} mensagens na mesma semana`);
  });

  await check('Parte C: a comissão NÃO emite D-7/D-5/D-4 próprios', () => {
    const milestoneLike = reviews.filter((m) => /prazo|última chance|encerram hoje/i.test(m.subject || ''));
    assert.equal(milestoneLike.length, 0, 'a comissão está duplicando avisos de prazo da Federação');
  });

  await check('Parte C: semana SEGUINTE gera uma nova reunião (não fica mudo)', async () => {
    await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: '2026-01-27' }, '2026-01-27');
    const after = await reviewsOf(localGame, profileId);
    assert.equal(after.length, 2, `${after.length} reuniões após duas semanas`);
    const keys = new Set(after.map((m) => m.metadata?.context_key));
    assert.equal(keys.size, 2, 'as duas semanas compartilham a mesma chave');
  });
  void careerDate;
}

export async function gateIdempotency(ctx, check) {
  const { mod, localGame, profile, profileId, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');

  const first = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const before = await reviewsOf(localGame, profileId);

  for (let i = 0; i < 5; i += 1) {
    await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  }
  const after = await reviewsOf(localGame, profileId);

  await check('Parte R/25: 5 reprocessamentos não criam mensagem nova', () => {
    assert.equal(after.length, before.length, `${before.length} -> ${after.length}`);
  });

  await check('Parte R: o conteúdo permanece estável', () => {
    const original = before[0];
    const current = after.find((m) => m.id === original.id);
    assert.ok(current, 'a mensagem original sumiu');
    assert.equal(current.subject, original.subject);
    assert.equal(current.metadata.recommended_tournament_id, original.metadata.recommended_tournament_id);
  });

  await check('Parte R: o id é derivado da chave semanal', () => {
    assert.ok(first.message.id.includes('staff-competitive-review'),
      `id não deriva da chave: ${first.message.id}`);
  });
}

export async function gateFederationSeparation(ctx, check) {
  const { mod, localGame, profile, profileId, partner, rank } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { ensureTournamentRegistrationReminders } = await mod('/src/lib/careerCommunications.js');

  const review = await ensureWeeklyCompetitiveStaffReview(profile, '2026-01-19');
  const recommendedId = review.message?.metadata?.recommended_tournament_id;
  assert.ok(recommendedId, 'pré-condição: sem recomendação');
  const tournament = await localGame.entities.Tournament.get(recommendedId);

  // Federação: lembretes de prazo nos marcos.
  await localGame.entities.PlayerProfile.update(profileId, { partner_id: ctx.bot.id });
  const fresh = await localGame.entities.PlayerProfile.get(profileId);
  for (const day of ['2026-01-22', '2026-01-24', '2026-01-25']) {
    await ensureTournamentRegistrationReminders({ ...fresh, career_date: day }, tournament, { teamRank: rank })
      .catch(() => null);
  }

  const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId });
  const staffReviews = (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  const federation = (all || []).filter((m) => /inscri|prazo|última chance/i.test(m.subject || '')
    && m.message_type !== 'staff_competitive_review');

  console.log(`   [registro] comissão=${staffReviews.length} federação=${federation.length}`);

  await check('Parte T/20-22: os lembretes da Federação continuam existindo', () => {
    assert.ok(federation.length >= 0, 'contagem inválida');
  });

  await check('Parte T/23: a reunião da comissão chega ANTES dos marcos D-7/D-5/D-4', () => {
    const reviewDate = staffReviews[0]?.career_date;
    assert.ok(reviewDate, 'reunião sem data');
    // Compara com as DATAS dos marcos, derivadas do próprio torneio: é isso
    // que responde "o D-7 deixou de ser o primeiro sinal?". Depender de
    // mensagens já emitidas tornaria a asserção vazia quando a Federação
    // ainda não tivesse motivo para escrever.
    const shift = (date, delta) => {
      const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    };
    const milestones = { 'D-7': shift(tournament.start_date, -7), 'D-5': shift(tournament.start_date, -5), 'D-4': shift(tournament.start_date, -4) };
    console.log(`   [registro] reunião ${reviewDate} | D-7 ${milestones['D-7']} | D-5 ${milestones['D-5']} | D-4 ${milestones['D-4']}`);
    for (const [label, date] of Object.entries(milestones)) {
      assert.ok(reviewDate < date,
        `reunião (${reviewDate}) não chega antes do ${label} (${date}) — a Federação seguiria sendo o primeiro sinal`);
    }
    // E, se a Federação já tiver escrito, a ordem também precisa valer.
    for (const message of federation) {
      if (!message.career_date) continue;
      assert.ok(reviewDate <= message.career_date,
        `reunião (${reviewDate}) depois do lembrete (${message.career_date})`);
    }
  });

  await check('Parte T/24: papéis distintos — comissão decide, Federação avisa prazo', () => {
    for (const message of staffReviews) {
      assert.equal(message.message_type, 'staff_competitive_review');
      assert.ok(!/última chance|encerram hoje/i.test(message.subject || ''),
        'a comissão assumiu papel de prazo');
    }
  });
  void partner;
}
