// Playthrough 5.27-M — reprodução headless do primeiro playtest físico.
//
// Carreira nova real (mesmo caminho da tela "Nova carreira"), tutorial na
// ordem da UI (incrementMissionProgress com os mesmos objective types das
// telas + reconcilePersistedTutorial como o OnboardingGuide faz a cada
// navegação), dupla, treinador, treino, inscrição na Pré-Temporada, avanço
// dia a dia por ~14 dias jogando as rodadas (playTournamentRound, espelho do
// TournamentModal) e abertura da tela de Conquistas (AchievementsPanel).
//
// Instrumentação:
//  - livro de moedas: toda escrita que muda PlayerProfile.coins (update,
//    upsert, create, batch) vira uma linha {rótulo da ação, antes, depois,
//    origem no código}. Ao fim, soma das linhas == saldo final − inicial.
//  - chave da Pré-Temporada em cada momento (pré-sorteio, pós-sorteio,
//    pré-partida, pós-partida, pós-settlement, histórico final) — grafo cru
//    persistido E a projeção que a UI renderiza (getVisibleTournamentBracketState).
//
// Uso: node scripts/repro-onboarding-v527m.mjs [--reload] [--days=14] [--out=arquivo]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';
import { playTournamentRound } from './lib/v526Tournament.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const RELOAD = Boolean(args.reload);
const DAYS = Number(args.days || 14);
const OUT = resolve(args.out || `reports/release-527m/onboarding-${RELOAD ? 'reload' : 'continuous'}.json`);
const SEED = String(args.seed || 'v527m-playtest');

installDeterminism(SEED);
const storage = new MemoryStorage(new Map());
let rt = await bootRuntime(storage);
let A = await act.loadActionModules(rt);

const ledger = [];
const daily = [];
const bracketMoments = [];
const tutorialLog = [];
let label = 'boot';
let profileId = null;

function codeSite() {
  const lines = String(new Error().stack).split('\n').slice(2);
  const hit = lines.find((l) => /\/src\//.test(l) && !/localGameClient|entities|GameStorage|CareerRepository/.test(l)) || lines.find((l) => /scripts\//.test(l) && !/repro-onboarding/.test(l));
  return (hit || '').trim().replace(/^at /, '').replace(/\(?[A-Za-z]:[^)]*?\/(src|scripts)\//, '$1/').replace(/\)$/, '').slice(0, 160);
}
async function coinsNow() {
  if (!profileId) return null;
  const p = await rt.localGame.entities.PlayerProfile.get(profileId).catch(() => null);
  return p ? Number(p.coins) || 0 : null;
}
async function instrument() {
  const { CareerEntityRepository } = await rt.load('/src/gameplay/repositories/CareerEntityRepository.js');
  const P = CareerEntityRepository.prototype;
  if (P.__pl527m) return;
  P.__pl527m = true;
  const PA = rt.localGame.entities.PlayerProfile;
  for (const method of Object.keys(PA).filter((k) => typeof PA[k] === 'function' && !['get', 'list', 'filter', 'count', 'subscribe'].includes(k))) {
    const orig = PA[method];
    PA[method] = async (...a) => {
      const before = await coinsNow();
      const res = await orig(...a);
      if (!profileId && res?.id) profileId = res.id;
      const after = await coinsNow();
      if (before != null && after != null && after !== before) ledger.push({ date: res?.career_date || null, label, via: 'PlayerProfile.' + method, before, after, delta: after - before, site: codeSite() });
      return res;
    };
  }
  const origBatch = P.batch;
  P.batch = async function (ops, ...rest) {
    const before = await coinsNow();
    const res = await origBatch.call(this, ops, ...rest);
    const after = await coinsNow();
    if (before != null && after != null && after !== before) {
      const kinds = (ops || []).map((o) => o.type + ':' + (o.entityName || '')).filter((k, i, a) => a.indexOf(k) === i).join(',');
      ledger.push({ date: null, label, via: ('batch[' + kinds + ']').slice(0, 160), before, after, delta: after - before, site: codeSite() });
    }
    return res;
  };
}
await instrument();

const created = await createRealCareer(rt, { saveName: 'Repro 527M' });
profileId = created.profile.id;
const careerId = created.careerId;
const startCoins = Number(created.profile.coins) || 0;
const startDate = created.profile.career_date;
let profile = created.profile;
const refresh = async () => { profile = await rt.localGame.entities.PlayerProfile.get(profileId); return profile; };

let tbv = await rt.load('/src/lib/tournamentBracketView.js');
let tutorialRecon = await rt.load('/src/onboarding/tutorialReconciliation.js');
let padel = rt.padel;

async function reloadRuntime(why) {
  if (!RELOAD) return;
  // Mesmo protocolo do simulador (reloadRuntime): o boot consome Math.random;
  // o estado determinístico é preservado para não deslocar a sequência do jogo.
  const detState = globalThis.__pl526Det?.getState();
  await rt.close();
  rt = await bootRuntime(storage);
  A = await act.loadActionModules(rt);
  await instrument();
  const loaded = await rt.careerManager.loadCareer(careerId);
  rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
  if (detState) globalThis.__pl526Det.setState(detState);
  // Módulos do runtime NOVO (os antigos escreveriam na carreira em memória descartada).
  tbv = await rt.load('/src/lib/tournamentBracketView.js');
  tutorialRecon = await rt.load('/src/onboarding/tutorialReconciliation.js');
  padel = rt.padel;
  await refresh();
  tutorialLog.push({ date: profile.career_date, event: `reload:${why}` });
}

// OnboardingGuide.load() — roda a cada navegação.
async function navigate(route) {
  const prev = label; label = `nav:${route}`;
  await refresh();
  if (route.startsWith('/tournaments')) await A.career.ensureFutureTournaments(profile.career_date).catch(() => null); // Tournaments.jsx no mount
  const [registrations, matches, trainings] = await Promise.all([
    rt.localGame.entities.CalendarEvent.filter({ profile_id: profileId, event_type: 'tournament' }).catch(() => []),
    rt.localGame.entities.Match.list('-created_date', 20).catch(() => []),
    rt.localGame.entities.TrainingSession.filter({ profile_id: profileId }).catch(() => []),
  ]);
  const missions = await padel.ensureTutorialMissionCatalog().catch(() => []);
  const rows = await rt.localGame.entities.MissionProgress.filter({ profile_id: profileId }).catch(() => []);
  await tutorialRecon.reconcilePersistedTutorial(profile, { registrations, matches, trainings }, missions, rows);
  await refresh();
  label = prev;
}
async function objective(type, why) {
  const prev = label; label = `tutorial:${type}${why ? `(${why})` : ''}`;
  await padel.incrementMissionProgress(profileId, type, 1, profile.career_date);
  label = prev;
  await refresh();
}
async function tutorialSnapshot(event) {
  await refresh();
  const rows = await rt.localGame.entities.MissionProgress.filter({ profile_id: profileId }).catch(() => []);
  const missions = await rt.localGame.entities.Mission.filter({ mission_type: 'tutorial' }).catch(() => []);
  const byId = new Map(missions.map((m) => [m.id, m]));
  const rewarded = rows.filter((r) => byId.has(r.mission_id) && r.claimed).map((r) => ({ key: byId.get(r.mission_id).catalog_key, silent: Boolean(r.migration_recognized) }));
  tutorialLog.push({ date: profile.career_date, event, coins: Number(profile.coins) || 0, currentStepId: profile.tutorial_onboarding?.currentStepId || null, rewarded });
}

async function exhibition() {
  const all = await rt.localGame.entities.Tournament.list('start_date', 3000).catch(() => []);
  return all.find((t) => t.tier === 'Exibição' && String(t.start_date).slice(0, 4) === String(startDate).slice(0, 4)) || null;
}
const slim = (rounds) => (rounds || []).map((r) => ({ round: r.round, date: r.date || null, is_final: r.is_final ?? null, byes: r.byes || [], matches: (r.matches || []).map((m) => ({ match_id: m.match_id || null, team_a: m.team_a || null, team_b: m.team_b || null, winner: m.winner || null, score: m.score || null, status: m.status || null, source_match_ids: m.source_match_ids || [], player_match: m.player_match ?? null })) }));
async function captureBracket(moment) {
  await refresh();
  const t = await exhibition();
  if (!t) return;
  const fresh = await rt.localGame.entities.Tournament.get(t.id).catch(() => t);
  const view = tbv.getVisibleTournamentBracketState(fresh, profile.career_date);
  const regs = await rt.localGame.entities.TournamentRegistration.filter({ profile_id: profileId, tournament_id: t.id }).catch(() => []);
  const event = (await rt.localGame.entities.CalendarEvent.filter({ profile_id: profileId, related_id: t.id }).catch(() => []))[0] || null;
  const run = event?.metadata?.tournament_run || null;
  bracketMoments.push({
    moment, careerDate: profile.career_date, tournamentId: t.id, name: t.name, status: fresh.status, current_phase: fresh.current_phase,
    bracket_schema_version: fresh.bracket_schema_version ?? null, champion: fresh.champion || null, runner_up: fresh.runner_up || null,
    registrationRoster: regs.map((r) => ({ id: r.id, status: r.status, partner_id: r.partner_id, partner_name: r.partner_name || null })),
    drawPairIds: fresh.draw_pair_ids || fresh.draw_field_pair_ids || null,
    runMatches: run ? (run.matches || []).map((m) => ({ id: m.id, round: m.round, stage: m.stage, date: m.date, status: m.status, opponent: (m.opponent || []).map((o) => o?.name), won: m.result?.won ?? null, score: m.result?.score || null })) : null,
    raw: slim(fresh.bracket_history),
    view: { drawn: view.drawn, completed: view.completed, champion: view.champion, rounds: slim(view.rounds) },
    viewPlaceholders: view.rounds.flatMap((r) => r.matches.flatMap((m) => [m.team_a, m.team_b])).filter((n) => /^(Vencedor Jogo \d+|Participante a definir)$/.test(String(n))).length,
  });
}

// ── Dia 1: tutorial na ordem da UI ─────────────────────────────────────────
label = 'tutorial'; await navigate('/game');
await objective('visit_career', 'Começar tutorial'); await tutorialSnapshot('career-created');
label = 'onboarding';
const ob = await act.completeOnboarding(rt, A, profile, { side: 'direita', style: (A.initialProfiles.PLAY_STYLE_OPTIONS[1] || A.initialProfiles.PLAY_STYLE_OPTIONS[0]).id, name: 'Atleta Repro' });
profile = ob.profile;
await objective('choose_career_difficulty'); await tutorialSnapshot('identity');
await navigate('/character'); await objective('visit_character');
await navigate('/profile'); await objective('review_profile');
await navigate('/partners'); await objective('review_partner_offer');
label = 'partner';
const pr = await act.ensurePartner(rt, A, profile, (rows) => rows[0]);
await refresh(); await navigate('/partners'); await tutorialSnapshot('partner');
label = 'coach';
const co = await act.coachOptions(rt, A, profile);
const cheapest = [...(co.available || [])].sort((a, b) => (Number(a.monthly_salary || a.salary) || 0) - (Number(b.monthly_salary || b.salary) || 0))[0];
if (cheapest) await act.hireCoach(rt, A, co.profile, cheapest);
await refresh(); await navigate('/coaches'); await tutorialSnapshot('coach');
label = 'training';
const activity = A.training.TRAINING_ACTIVITIES[0];
await act.train(rt, A, profile, activity.id, 'moderada', null);
await refresh(); await navigate('/training'); await tutorialSnapshot('training');
await navigate('/game/calendar'); await objective('visit_calendar');

// Inscrição na Pré-Temporada (dia 1, como no playtest).
label = 'registration';
await navigate('/tournaments');
await captureBracket('pre-registration');
const ex = await exhibition();
const partnerBot = A.career.getPartnerBot(await refresh());
const reg = ex ? await act.tryRegister(rt, A, profile, ex, partnerBot) : { ok: false, reason: 'sem exibição' };
await refresh(); await navigate('/tournaments'); await tutorialSnapshot('registered');
await captureBracket('pre-draw');
await reloadRuntime('after-registration');

// Visitas restantes (VISIT auto-complete ao abrir a rota).
for (const [route, type] of [['/staff', 'visit_staff'], ['/game/economy?view=dashboard', 'visit_economy'], ['/game/economy?view=sponsors', 'visit_sponsors'], ['/game/economy?view=opportunities', 'visit_opportunities'], ['/game/shop', 'visit_shop'], ['/game/inventory', 'visit_equipment'], ['/athletes', 'visit_athletes'], ['/ranking', 'visit_ranking_page'], ['/world', 'visit_world'], ['/journal', 'visit_news'], ['/press', 'visit_press_room'], ['/communications', 'visit_notifications']]) {
  await navigate(route); await objective(type);
}
await tutorialSnapshot('visits-done');
// Economia → Patrocínios: o jogador assina a(s) proposta(s) disponível(is).
label = 'sponsor';
const sponsorRows = await act.sponsorOptions(rt, A, await refresh());
const signedSponsors = [];
for (const row of sponsorRows.signable.slice(0, 3)) {
  const b = await coinsNow();
  await act.signSponsor(rt, A, await refresh(), row).catch((e) => signedSponsors.push({ id: row.sponsor.id, error: e.message }));
  signedSponsors.push({ id: row.sponsor.id, name: row.sponsor.name, delta: (await coinsNow()) - b, offer: row.offer });
}
await refresh(); await tutorialSnapshot('sponsors');

// Tela de Conquistas (AchievementsPanel: reconciliação única + sync).
async function openAchievements(why) {
  const prev = label; label = `achievements-panel:${why}`;
  await refresh();
  const wr = await padel.getWorldRank(profile).catch(() => ({ rank: 0 }));
  const ctx = await A.achievementContext.buildAchievementContext(profile, { worldRank: wr });
  const needsReconciliation = !profile.achievements_v2_reconciled;
  await A.achievements.syncPlayerAchievements(profile, ctx, { localGame: rt.localGame, reconciliation: needsReconciliation }).catch(() => null);
  if (needsReconciliation) await rt.localGame.entities.PlayerProfile.update(profileId, { achievements_v2_reconciled: true }).catch(() => {});
  label = prev; await refresh();
}
if (!args['no-panel']) await openAchievements('day1');

// ── Avanço dia a dia ───────────────────────────────────────────────────────
const dayOf = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
let drawnCaptured = false; let guard = 0; let matchNo = 0;
while (dayOf(profile.career_date) < DAYS && guard < 60) {
  guard += 1;
  const before = await refresh();
  label = `advance:${before.career_date}`;
  const from = before.career_date;
  const result = await rt.calendar.advanceCareerDays(before, 1);
  profile = await rt.calendar.finalizeCareerAdvanceRange(result.profile, from, result.profile.career_date);
  await refresh();
  await navigate('/game');
  const t = await exhibition();
  if (!drawnCaptured && t && Array.isArray((await rt.localGame.entities.Tournament.get(t.id)).bracket_history) && (await rt.localGame.entities.Tournament.get(t.id)).bracket_history.length) {
    drawnCaptured = true; await captureBracket('post-draw'); await reloadRuntime('after-draw'); await captureBracket('post-draw-reload');
  }
  if (result.blockedBy?.id && result.blockedBy.event_type === 'tournament') {
    await captureBracket(`pre-match-${matchNo}`);
    label = `tournament-match:${profile.career_date}`;
    const r = await playTournamentRound(rt, A, { eventId: result.blockedBy.id, strategyId: 'balanced', seedText: `${SEED}-m${matchNo}` }).catch((e) => ({ outcome: 'error', error: e.message }));
    await refresh(); await navigate('/tournaments');
    await captureBracket(`post-match-${matchNo}${r.finalization ? '-settled' : ''}`);
    tutorialLog.push({ date: profile.career_date, event: `match-${matchNo}`, outcome: r.outcome, won: r.matchRow?.won ?? null, error: r.error || null, finalization: r.finalization ? { status: r.finalization.status, coins: r.finalization.rewards?.coins ?? null } : null });
    await tutorialSnapshot(`after-match-${matchNo}`);
    matchNo += 1;
    if (r.finalization) await reloadRuntime('after-settlement');
    if (r.outcome !== 'played') await A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null);
    continue;
  }
  if (result.blockedBy?.id) { await A.calendarSystem.resolveDecision(result.blockedBy.id, 'play').catch(() => A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null)); continue; }
  const p = await refresh();
  const progressRows = await rt.localGame.entities.MissionProgress.filter({ profile_id: profileId }).catch(() => []);
  const partnership = (await rt.localGame.entities.Partnership.filter({ profile_id: profileId, status: 'ativa' }).catch(() => []))[0] || null;
  const ev = t ? (await rt.localGame.entities.CalendarEvent.filter({ profile_id: profileId, related_id: t.id }).catch(() => []))[0] : null;
  daily.push({ day: dayOf(p.career_date), date: p.career_date, coins: Number(p.coins) || 0, tutorialStep: p.tutorial_onboarding?.currentStepId || null, tutorialCompleted: (p.tutorial_onboarding?.completedStepIds || []).length, missionsRewarded: progressRows.filter((r) => r.claimed).length, partner: partnership ? { name: partnership.partner_name, status: partnership.contract_status } : null, tournament: ev ? { status: ev.status, run: ev.metadata?.tournament_run?.status || null } : null });
}
await openAchievements('end');
await navigate('/tournaments');
await captureBracket('historical-final');
await reloadRuntime('final');
await captureBracket('historical-final-after-reload');

// (resíduos por rótulo registrados em checkpoint())
// ── Fechamento do livro ────────────────────────────────────────────────────
const endCoins = await coinsNow();
const sumLedger = ledger.reduce((s, l) => s + l.delta, 0);
const bySource = {};
for (const l of ledger) {
  const k = l.label.startsWith('advance:') ? `advance:${/coins|monthly|economy/.test(l.site) ? 'economy' : l.site.split(':')[0]}` : l.label.replace(/:\d{4}-\d{2}-\d{2}$/, '');
  bySource[k] = (bySource[k] || 0) + l.delta;
}
const txs = await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profileId }).catch(() => []);
const ach = await rt.localGame.entities.PlayerAchievement?.filter?.({ profile_id: profileId }).catch(() => []) || [];
// Extrato exibido (mesma função do Fluxo Financeiro) × variação real do saldo.
const flowLib = await rt.load('/src/lib/financialFlow.js');
const flow = flowLib.buildMonthlyFinancialFlow(txs);
const flowNet = flow.reduce((s, m) => s + m.net, 0);
const undatedTx = txs.filter((t) => !flowLib.financialTransactionMonth(t)).length;
const out = {
  phase: '5.27-M', seed: SEED, reload: RELOAD, startDate, endDate: profile.career_date, days: dayOf(profile.career_date),
  financialFlow: flow, financialFlowNet: flowNet, financialFlowReconciled: flowNet === endCoins - startCoins, undatedTransactions: undatedTx,
  startCoins, endCoins, delta: endCoins - startCoins, ledgerSum: sumLedger, reconciled: sumLedger === endCoins - startCoins,
  registration: reg?.ok ? 'ok' : reg?.reason, signedSponsors, partner: pr?.candidate?.name || pr?.partnership?.partner_name || null, coach: cheapest?.name || null,
  bySource, ledger, daily, tutorialLog, bracketMoments,
  financialTransactions: txs.map((t) => ({ id: t.id, type: t.type, category: t.category || null, date: t.date || null, month: t.month || null, amount: t.amount ?? null, net: t.net ?? null, description: t.description || null })),
  achievementsUnlocked: (ach || []).map((a) => ({ id: a.achievement_id || a.id, name: a.name || a.achievement_name || null, coins: a.reward_coins ?? null, unlocked: a.unlocked_date || a.unlocked_at || null })),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ out: OUT, startCoins, endCoins, delta: out.delta, ledgerSum: sumLedger, reconciled: out.reconciled, flowNet, flowReconciled: out.financialFlowReconciled, undatedTx, registration: out.registration, bySource, moments: bracketMoments.map((b) => `${b.moment}:${b.careerDate}:ph=${b.viewPlaceholders}:champ=${b.view.champion}`) }, null, 2));
await rt.close();
process.exit(0);
