// LOCAL-9E.1 — SIMULADOR DE DECISÕES ECONÔMICAS E ESPORTIVAS (linha de base).
//
// Uma carreira por seed, dirigida por um perfil de decisão (econômico,
// equilibrado, competitivo — scripts/lib/local9e1Policies.mjs). Tudo passa
// pelo pipeline real do jogo, reaproveitando o harness 5.26/5.27:
//  - boot, determinismo e criação de carreira: lib/v526CareerSim.mjs;
//  - ações do jogador (onboarding, parceiro, patrocínio, treinador, staff,
//    Loja + equipar pela 9B, investimento, treino, inscrição, imprensa):
//    lib/v526Actions.mjs, que chama as mesmas funções das páginas;
//  - rodada de torneio (motor real, atributos efetivos da 9B): lib/v526Tournament.mjs;
//  - avanço de dia e fechamento mensal: calendarLifecycle real.
// Nenhuma regra de balanceamento é reimplementada; preços, bônus, contratos,
// custos e curvas não são alterados.
//
// Pareamento: o mundo e o atleta dependem SÓ da seed (`9e1-<seed>`), nunca do
// perfil. Os três perfis começam idênticos; o que muda são as decisões.
//
// Uso: node scripts/sim-local-9e1-decisions.mjs --profile=equilibrado --seeds=1-3 --days=365 --out=<dir> [--force]
import { mkdirSync, writeFileSync, existsSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism, hashSeed, restoreLocalStore } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';
import { playTournamentRound } from './lib/v526Tournament.mjs';
import { normalPartnerScore } from './lib/v527gPartnerScore.mjs';
import { isAffordable, optimizerShouldRenew, pickOptimizerPartner } from './lib/v527iOptimizerScore.mjs';
import * as P from './lib/local9e1Policies.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const PROFILE = arg('profile', 'equilibrado');
const policy = P.getPolicy(PROFILE);
const [S0, S1] = arg('seeds', '1-1').split('-').map(Number);
const DAYS = Number(arg('days', 30));
const OUT = resolve(arg('out', 'reports/local-9e1-decision-simulator/raw'));
const FORCE = process.argv.includes('--force');
mkdirSync(OUT, { recursive: true });

const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const RECURRING_INCOME = ['torneio', 'partida', 'sponsor_monthly', 'investment_income'];
const LEAVING = new Set(['encerra_apos_compromisso', 'encerrar_ao_final', 'nao_renovara']);
const monthKey = (d) => String(d).slice(0, 7);
const r1 = (v) => Math.round(v * 10) / 10;
const avgAttrs = (o) => ATTRS.reduce((s, k) => s + (Number(o?.[k]) || 0), 0) / ATTRS.length;

async function simulateCareer(seed) {
  const seedText = `9e1-${seed}`;
  installDeterminism(seedText);
  restoreLocalStore({});
  const files = new Map();
  const storage = new MemoryStorage(files);
  let rt = await bootRuntime(storage);
  let A = await act.loadActionModules(rt);
  const eq = await rt.load('/src/lib/equipmentModifiers.js');
  const ceilingMod = await rt.load('/src/lib/attributeCeiling.js');
  const started = performance.now();

  const created = await createRealCareer(rt, { saveName: `LOCAL-9E.1 ${PROFILE} ${seed}` });
  const careerId = created.careerId;
  // Onboarding pareado: lado e estilo dependem só da seed.
  const onboard = hashSeed(`9e1-onboard-${seed}`);
  const styles = A.initialProfiles.PLAY_STYLE_OPTIONS.map((o) => o.id);
  const ob = await act.completeOnboarding(rt, A, created.profile, { side: onboard % 2 ? 'esquerda' : 'direita', style: styles[onboard % styles.length], name: `Atleta ${seed}` });
  let profile = ob.profile;
  const recommended = ob.build.recommended_attributes?.length ? ob.build.recommended_attributes : ATTRS;
  const startOrd = Date.parse(`${profile.career_date}T00:00:00Z`);
  const dayOf = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - startOrd) / 86400000);

  const out = {
    phase: 'LOCAL-9E.1', profile: PROFILE, seed, careerId, startDate: profile.career_date, difficulty: profile.career_difficulty,
    archetype: ob.build.archetype_id, playStyle: profile.play_style, potential: profile.potential ?? null, startCoins: Number(profile.coins) || 0,
    weekly: [], matches: [], tournaments: [], registrations: [], purchases: [], sponsors: [], sponsorRenewals: [], coaches: [], staff: [],
    investments: [], partners: [], partnerRenewals: [], dismissals: [], trainings: { sessions: 0, byIntensity: {}, cost: 0 },
    monthlyCloses: [], errors: [], forfeits: 0, advanceFailures: [], integrity: { violations: [], checks: 0 },
  };
  const violation = (code, detail) => { if (out.integrity.violations.length < 200) out.integrity.violations.push({ day: dayOf(profile.career_date), code, ...detail }); };

  // ── Livro-caixa: toda variação de moedas é atribuída a uma categoria ─────
  // Ações do jogador: a variação vai para a categoria da ação. Avanço de dia e
  // rodada de torneio: decompostos pelas FinancialTransaction novas do próprio
  // jogo; o que sobra vai para `nao_atribuido` (métrica de integridade).
  const ledger = {};
  const seenTx = new Set();
  const month = (date) => (ledger[monthKey(date)] ||= { income: {}, expense: {}, transfer: {}, unattributed: 0 });
  const book = (date, kind, cat, amount) => { if (!amount) return; const m = month(date)[kind]; m[cat] = (m[cat] || 0) + amount; };
  const newTx = async () => {
    const txs = (await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profile.id }).catch(() => [])) || [];
    const fresh = txs.filter((t) => !seenTx.has(t.id));
    for (const t of fresh) seenTx.add(t.id);
    return fresh;
  };
  const refresh = async () => (profile = await rt.localGame.entities.PlayerProfile.get(profile.id));
  // Executa uma ação do jogador e atribui a variação de caixa.
  async function action(kind, cat, fn) {
    const before = Number(profile.coins) || 0;
    const result = await fn();
    await refresh();
    await newTx();
    const delta = (Number(profile.coins) || 0) - before;
    if (kind === 'transfer') book(profile.career_date, 'transfer', cat, delta);
    else if (delta > 0) book(profile.career_date, 'income', cat, delta);
    else if (delta < 0) book(profile.career_date, 'expense', cat, -delta);
    return { result, delta };
  }
  // Decompõe a variação de um passo do jogo (avanço/rodada).
  async function settleGameStep(date, delta) {
    let explained = 0;
    for (const t of await newTx()) {
      if (t.type === 'monthly_close') {
        const b = t.breakdown || {};
        book(date, 'income', 'sponsor_monthly', Number(b.sponsor_income) || 0);
        book(date, 'income', 'investment_income', Number(b.investment_income) || 0);
        book(date, 'income', 'passive_income', Number(b.passive_income) || 0);
        book(date, 'expense', 'folha_mensal', Number(t.expenses) || 0);
        explained += (Number(t.net) || 0);
        out.monthlyCloses.push({ month: t.month, income: Number(t.income) || 0, expenses: Number(t.expenses) || 0, net: Number(t.net) || 0, breakdown: b });
      } else if (t.type === 'income' || t.type === 'expense') {
        const amount = Number(t.amount) || 0;
        book(date, t.type, t.category || 'outros', amount);
        explained += t.type === 'income' ? amount : -amount;
      }
    }
    const residual = delta - explained;
    if (residual) month(date).unattributed += residual;
  }

  // ── Leituras de estado (só o que a tela mostra) ──────────────────────────
  const partnerAthleteOf = async (ps) => { const id = ps ? (ps.partner_bot_id || ps.athlete_b_id) : null; return id ? rt.localGame.entities.AthleteProfile.get(id).catch(() => null) : null; };
  async function fixedMonthly() {
    const hires = ((await rt.localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id }).catch(() => [])) || []).filter((h) => !['terminated', 'expired'].includes(h.contract_status));
    const ps = await A.partnership.getActivePartnership(profile.id).catch(() => null);
    const coach = profile.coach_id && profile.coach_contract_status !== 'terminated' ? Number(profile.coach_monthly_salary) || 0 : 0;
    const staff = hires.reduce((s, h) => s + (Number(h.monthly_cost) || 0), 0);
    const partner = Number(ps?.monthly_salary ?? ps?.salary) || 0;
    return { total: coach + staff + partner, coach, staff, partner, hires };
  }
  // Receita recorrente média dos últimos 3 meses fechados.
  function recurringIncome() {
    const months = Object.keys(ledger).sort().slice(-4, -1);
    if (!months.length) return 0;
    return months.reduce((s, m) => s + RECURRING_INCOME.reduce((a, k) => a + (Number(ledger[m].income[k]) || 0), 0), 0) / months.length;
  }
  async function equipmentView() {
    const st = await A.equipment.loadEquipmentState(profile.id);
    const effective = eq.applyEquipmentModifiers(profile, st.modifiers);
    return { ...st, effective, applied: eq.totalAppliedModifier(profile, st.modifiers) };
  }

  // ── Parceiro ──────────────────────────────────────────────────────────────
  const termsOf = (c) => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, c); } catch { return {}; } };
  const compatOf = (r) => Number(r.offer?.compatibility ?? r.offer?.compatibility_snapshot?.total ?? r.offer?.compatibility_score) || 0;
  const balancedScore = (r) => { const t = termsOf(r.candidate); return normalPartnerScore({ compatibility: compatOf(r), candidateOvr: act.ovrOf(r.candidate), playerOvr: act.ovrOf(profile), coins: profile.coins, salary: t.monthlySalary, prizeSplit: t.prizeSplit }); };
  const best = (rows, score) => [...rows].map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s || String(a.r.candidate?.id).localeCompare(String(b.r.candidate?.id)))[0]?.r || null;
  const partnerPickers = {
    // Econômico: só quem o caixa sustenta por 6 meses; entre eles, o equilibrado.
    affordable: (rows) => { const pool = rows.filter((r) => isAffordable({ coins: profile.coins, salary: termsOf(r.candidate).monthlySalary }, { minMonthsCovered: 6 })); return best(pool.length ? pool : rows, balancedScore); },
    balanced: (rows) => best(rows, balancedScore),
    'strongest-affordable': (rows) => pickOptimizerPartner(rows, { coins: profile.coins, termsOf, ovrOf: act.ovrOf }),
  };
  async function partnerStep() {
    const { result: r } = await action('expense', 'parceria_assinatura', () => act.ensurePartner(rt, A, profile, partnerPickers[policy.partnerPick]));
    if (r.changed) out.partners.push({ day: dayOf(profile.career_date), via: r.via || 'offer', partnerOvr: act.ovrOf(r.candidate), salary: Number(r.partnership?.monthly_salary) || 0 });
  }
  async function partnerRenewalStep() {
    const ps = await A.partnership.getActivePartnership(profile.id).catch(() => null);
    const end = String(ps?.contract_end_date || ps?.scheduled_end_date || '').slice(0, 10);
    const daysLeft = end ? dayOf(end) - dayOf(profile.career_date) : null;
    if (!ps || daysLeft == null || daysLeft > 14 || A.partnerLifecycle.getContractDecisionState(ps) !== A.partnerLifecycle.CONTRACT_DECISION_STATES.UNDECIDED) return;
    const partner = await partnerAthleteOf(ps);
    const market = await act.buildSearchPool(rt, A, profile).catch(() => []);
    let renew;
    if (policy.partnerRenew === 'strongest-affordable') renew = optimizerShouldRenew({ currentOvr: act.ovrOf(partner), market, coins: profile.coins, termsOf, ovrOf: act.ovrOf }).renew;
    else if (policy.partnerRenew === 'balanced') {
      const rel = (await A.relationships.getPlayerRelationships(profile.id).catch(() => [])) || [];
      const cc = A.partnership.computeCompatibility(profile, partner, rel);
      const current = balancedScore({ candidate: partner, offer: { compatibility: Number(cc?.total ?? cc) || 0 } });
      const top = Math.max(0, ...market.map(balancedScore));
      renew = !market.length || current >= top * 0.9;
    } else renew = isAffordable({ coins: profile.coins, salary: Number(ps.monthly_salary) || 0 }, { minMonthsCovered: 6 });
    const durationDays = PROFILE === 'equilibrado' ? 120 : 180;
    if (renew) {
      const { result: res } = await action('expense', 'parceria_renovacao', () => A.partnerLifecycle.renewPartnerContract(profile, { durationDays, prizeSplit: ps.prize_split_pct ?? 50 }).catch((e) => ({ error: e.message })));
      out.partnerRenewals.push({ day: dayOf(profile.career_date), renew: true, outcome: res?.decision?.outcome || (res?.error ? `erro:${res.error}`.slice(0, 60) : 'aceita'), partnerOvr: act.ovrOf(partner) });
    } else out.partnerRenewals.push({ day: dayOf(profile.career_date), renew: false, partnerOvr: act.ovrOf(partner) });
  }

  // ── Decisões semanais ─────────────────────────────────────────────────────
  let negativeWeeks = 0;
  async function weeklyDecisions() {
    await rt.padel.ensureMyProfile(await rt.localGame.auth.me()).catch(() => null);
    await refresh();
    const day = dayOf(profile.career_date);
    // Imprensa (mesma escolha para os três perfis: fãs + apelo comercial).
    try {
      const { result: r } = await action('income', 'imprensa', () => act.answerPendingInterviews(rt, A, profile, { chooseAnswer: P.chooseInterviewAnswer, max: 3 }));
      out.pressAnswered = (out.pressAnswered || 0) + (r?.answered?.length || 0);
    } catch (e) { out.errors.push(`imprensa:${e.message}`.slice(0, 140)); }

    // Corte de custos com caixa negativo (Staff.jsx / Coaches.jsx).
    negativeWeeks = (Number(profile.coins) || 0) < 0 ? negativeWeeks + 1 : 0;
    if (negativeWeeks >= 1) {
      const fm = await fixedMonthly();
      const top = [...fm.hires].sort((a, b) => (Number(b.monthly_cost) || 0) - (Number(a.monthly_cost) || 0))[0];
      try {
        if (top && (Number(top.monthly_cost) || 0) >= fm.coach) { await action('expense', 'staff_rescisao', () => act.fireStaffMember(rt, A, profile, top)); out.dismissals.push({ day, type: top.staff_type || 'staff', monthly: Number(top.monthly_cost) || 0 }); }
        else if (fm.coach > 0) { await action('expense', 'treinador_rescisao', () => act.fireCoach(rt, profile)); out.dismissals.push({ day, type: 'coach', monthly: fm.coach }); }
      } catch (e) {
        if (fm.coach > 0) { await action('expense', 'treinador_rescisao', () => act.fireCoach(rt, profile)).catch(() => null); out.dismissals.push({ day, type: 'coach', monthly: fm.coach, afterBlockedStaff: String(e.message).slice(0, 60) }); }
      }
    }

    await partnerRenewalStep().catch((e) => out.errors.push(`renovacao-parceiro:${e.message}`.slice(0, 140)));
    const income = recurringIncome();

    // Patrocínio: renovar perto do fim e assinar propostas da vitrine real.
    try {
      const opts = await act.sponsorOptions(rt, A, profile);
      const ranked = P.rankSponsorOffers(opts.signable, policy);
      const contracts = (await rt.localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }).catch(() => [])) || [];
      for (const c of contracts) {
        const daysLeft = c.end_date ? dayOf(c.end_date) - day : null;
        const sponsor = A.sponsors.SPONSOR_CATALOG.find((s) => s.id === c.sponsor_id);
        if (!sponsor) continue;
        const slot = A.sponsors.getSponsorCategory(sponsor);
        const tierRank = { Bronze: 1, Prata: 2, Ouro: 3 };
        const betterTierInSlot = ranked.some((r) => A.sponsors.getSponsorCategory(r.sponsor) === slot && (tierRank[r.sponsor.tier] || 0) > (tierRank[sponsor.tier] || 0));
        const decision = P.shouldRenewSponsor({ contract: c, daysLeft, betterTierInSlot }, policy);
        if (!decision.renew) { if (decision.reason === 'tier-melhor-disponivel') out.sponsorRenewals.push({ day, sponsor: sponsor.id, renew: false, reason: decision.reason }); continue; }
        const { delta } = await action('income', 'patrocinio_renovacao', () => A.sponsors.renewContract(c, sponsor, profile));
        out.sponsorRenewals.push({ day, sponsor: sponsor.id, tier: sponsor.tier, renew: true, bonus: delta, daysLeft });
      }
      // A vitrine pode ter mudado com a renovação: reavalia as assináveis.
      const fresh = P.rankSponsorOffers((await act.sponsorOptions(rt, A, profile)).signable, policy);
      for (const row of fresh.slice(0, 6)) {
        try {
          const { delta } = await action('income', 'patrocinio_luvas', () => act.signSponsor(rt, A, profile, row));
          out.sponsors.push({ day, sponsor: row.sponsor.id, tier: row.sponsor.tier, monthly: row.offer.monthly_salary, signBonus: delta, months: row.offer.duration_months, totalValue: P.sponsorTotalValue(row.offer), ovr: act.ovrOf(profile) });
        } catch { /* recusado pela regra real (slot/elegibilidade) */ }
      }
    } catch (e) { out.errors.push(`patrocinio:${e.message}`.slice(0, 140)); }

    // Treinador (contratação ou upgrade a cada 4 semanas).
    try {
      const hasCoach = Boolean(profile.coach_id && profile.coach_contract_status !== 'terminated');
      if (!hasCoach || Math.floor(day / 7) % 4 === 0) {
        const opts = await act.coachOptions(rt, A, profile);
        const coaches = opts.available.map((coach) => ({ coach, salary: A.coaches.resolveCoachCanonicalSalary(coach) || 0, signing: Number(coach.market_signing_bonus ?? coach.sign_on_bonus) || 0 }));
        const pick = P.pickCoach({ coaches, currentOverall: hasCoach ? Number(opts.hired?.overall) || 0 : null, recurringIncome: income, coins: profile.coins }, policy);
        if (pick) {
          await action('expense', 'treinador_luvas', async () => { if (hasCoach) await act.fireCoach(rt, profile); return act.hireCoach(rt, A, hasCoach ? await rt.localGame.entities.PlayerProfile.get(profile.id) : opts.profile, pick.coach); });
          out.coaches.push({ day, coach: pick.coach.id, overall: Number(pick.coach.overall) || null, salary: pick.salary, upgrade: hasCoach, incomeEst: Math.round(income) });
        }
      }
    } catch (e) { out.errors.push(`treinador:${e.message}`.slice(0, 140)); }

    // Staff.
    try {
      const opts = await act.staffOptions(rt, A, profile);
      if (opts.freeSlots > 0) {
        const payroll = opts.activeHires.reduce((s, h) => s + (Number(h.monthly_cost) || 0), 0);
        const pick = P.pickStaff({ candidates: opts.available, payroll, recurringIncome: income, coins: profile.coins }, policy);
        if (pick) { await action('expense', 'staff_luvas', () => act.hireStaffMember(rt, A, profile, pick)); out.staff.push({ day, role: pick.roleId, quality: pick.quality, monthly: pick.monthlyCost }); }
      }
    } catch (e) { out.errors.push(`staff:${e.message}`.slice(0, 140)); }

    // Loja + equipar (uma compra por semana, no máximo).
    try {
      const fm = await fixedMonthly();
      const budget = P.planBudget({ coins: profile.coins, fixedMonthly: fm.total }, policy);
      const shop = await act.shopOptions(rt, A, profile);
      const shopItems = await rt.localGame.entities.ShopItem.list();
      const pick = P.pickEquipmentPurchase({ rows: shop.rows, profile, inventory: shop.inventory, shopItems, budget }, policy, eq);
      if (pick) {
        const baseBefore = Object.fromEntries(ATTRS.map((k) => [k, profile[k]]));
        const appliedBefore = (await equipmentView()).applied;
        const { result: r } = await action('expense', 'equipamento', () => act.buyAndEquip(rt, profile, pick.row, shop.inventory));
        if (r.bought) {
          const view = await equipmentView();
          // Invariante 9B: comprar/equipar não altera o atributo-base.
          for (const k of ATTRS) if (profile[k] !== baseBefore[k]) violation('equipar-alterou-base', { attr: k, before: baseBefore[k], after: profile[k] });
          const realized = Math.round((view.applied - appliedBefore) * 1000) / 1000;
          if (Math.abs(realized - pick.gain) > 1e-6) violation('ganho-previsto-diferente', { item: pick.row.item.id, predicted: pick.gain, realized });
          out.purchases.push({ day, item: pick.row.item.id, name: pick.row.item.name, category: pick.row.item.category, rarity: pick.row.item.rarity, price: pick.row.price, declaredBonus: pick.row.bonusTotal, gain: realized, roiPer1000: r1(pick.roi), freeCash: budget.free, coins: Number(profile.coins) || 0 });
        }
      }
    } catch (e) { out.errors.push(`loja:${e.message}`.slice(0, 140)); }

    // Investimento: produto de risco BAIXO de maior retorno que o valor alcança.
    try {
      const fm = await fixedMonthly();
      const budget = P.planBudget({ coins: profile.coins, fixedMonthly: fm.total }, policy);
      const amount = P.planInvestment({ coins: profile.coins, reserve: budget.reserve }, policy);
      const product = amount ? [...A.economy.INVESTMENTS].filter((i) => i.risk === 'Baixo' && i.min_amount <= amount).sort((a, b) => b.return_rate - a.return_rate)[0] : null;
      if (product) {
        const { delta } = await action('transfer', 'investimento', () => act.invest(rt, A, profile, product.id, amount));
        if (delta) out.investments.push({ day, product: product.id, amount: -delta });
      }
    } catch (e) { out.errors.push(`investimento:${e.message}`.slice(0, 140)); }

    // Inscrição em torneio (elegibilidade e encaixe da própria tela).
    try {
      const ps = await A.partnership.getActivePartnership(profile.id).catch(() => null);
      const partner = await partnerAthleteOf(ps);
      if (partner && !LEAVING.has(String(ps.contract_status || ''))) {
        const teamRank = await act.resolveGameTeamRank(A, profile);
        const wr = await rt.padel.getWorldRank(profile).catch(() => ({ rank: 0 }));
        const sel = act.selectionRankFilter(A, profile, teamRank, wr?.rank);
        const cands = (await act.registrationCandidates(rt, A, profile)).filter((t) => (Number(t.entry_fee) || 0) <= (Number(profile.coins) || 0) && sel.allows(t));
        const ranked = P.rankTournaments({ cands, coins: profile.coins, fit: (t) => (A.circuit.isRankInTierDiagnosticCore?.(sel.rank, t.tier) ? 1 : 0), order: (t) => A.circuit.getTournamentTierConfig(t.tier)?.order ?? 0 }, policy);
        for (const t of ranked.slice(0, 6)) {
          const { result: r } = await action('expense', 'inscricao', () => act.tryRegister(rt, A, profile, t, partner));
          if (r.ok) { out.registrations.push({ day, tournamentId: t.id, tier: t.tier, fee: Number(t.entry_fee) || 0, rank: wr?.rank || null }); break; }
        }
      }
    } catch (e) { out.errors.push(`inscricao:${e.message}`.slice(0, 140)); }
  }

  // ── Treino diário ─────────────────────────────────────────────────────────
  async function dailyTraining() {
    if (rt.padel.isInjured(profile)) return;
    const horizon = new Date(Date.parse(`${profile.career_date}T00:00:00Z`) + policy.taperDays * 86400000).toISOString().slice(0, 10);
    const regs = (await rt.localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }).catch(() => [])) || [];
    if (regs.some((r) => !['cancelled', 'completed', 'withdrawn'].includes(r.status) && r.effective_start_date && r.effective_start_date <= horizon && (r.effective_end_date || r.effective_start_date) >= profile.career_date)) { out.trainings.taperDays = (out.trainings.taperDays || 0) + 1; return; }
    const coach = (await A.coachLifecycle.resolveActiveCoach(profile).catch(() => ({ coach: null }))).coach;
    const day = dayOf(profile.career_date);
    for (let s = 0; s < policy.sessionsPerDay; s += 1) {
      if ((Number(profile.energy) || 0) < policy.minEnergyTrain || Number(profile.trainings_today || 0) >= 3) break;
      const target = recommended[(day * 3 + s) % recommended.length];
      const options = A.training.TRAINING_ACTIVITIES.filter((a) => a.attribute === target || (a.attributes && a.attributes[target]));
      const activity = (options.length ? options : A.training.TRAINING_ACTIVITIES)[day % (options.length || A.training.TRAINING_ACTIVITIES.length)];
      const intensity = policy.intensity(profile);
      const cost = A.trainingEconomy.getTrainingCost(profile, intensity) || 0;
      if ((Number(profile.coins) || 0) < cost + policy.trainReserve) { out.trainings.skippedForCash = (out.trainings.skippedForCash || 0) + 1; break; }
      const { result: r } = await action('expense', 'treino', () => act.train(rt, A, profile, activity.id, intensity, coach));
      if (r.res?.error) break;
      out.trainings.sessions += 1; out.trainings.cost += cost;
      out.trainings.byIntensity[intensity] = (out.trainings.byIntensity[intensity] || 0) + 1;
    }
  }

  // ── Integridade semanal + retrato ─────────────────────────────────────────
  async function snapshot() {
    await refresh();
    out.integrity.checks += 1;
    const view = await equipmentView();
    const [wr, contracts, inventory] = await Promise.all([
      rt.padel.getWorldRank(profile).catch(() => ({ rank: 0 })),
      rt.localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }).catch(() => []),
      rt.localGame.entities.PlayerInventory.filter({ profile_id: profile.id }).catch(() => []),
    ]);
    const fm = await fixedMonthly();
    if (!Number.isFinite(Number(profile.coins))) violation('moedas-nao-finitas', { coins: profile.coins });
    for (const k of ATTRS) {
      const base = Number(profile[k]);
      if (!Number.isFinite(base) || base < 0 || base > 100) violation('base-fora-de-0-100', { attr: k, base });
      const ceiling = ceilingMod.getAttributeDevelopmentCeiling(profile, k);
      if (base > ceiling + 1e-9 && base > (Number(profile.initial_attributes?.[k]) || 0)) violation('base-acima-do-teto', { attr: k, base, ceiling });
      if (!(view.effective[k] <= 100 && view.effective[k] >= base)) violation('efetivo-incoerente', { attr: k, base, effective: view.effective[k] });
    }
    // Um item equipado por categoria; nenhum item comprado duas vezes.
    const lookup = new Map(view.shopItems.map((s) => [s.id, s]));
    const perSlot = {};
    for (const row of inventory || []) if (row.equipped) { const c = lookup.get(row.item_id)?.category || row.category; perSlot[c] = (perSlot[c] || 0) + 1; }
    for (const [c, n] of Object.entries(perSlot)) if (n > 1) violation('slot-com-dois-equipados', { category: c, n });
    const owned = {};
    for (const row of inventory || []) owned[row.item_id] = (owned[row.item_id] || 0) + 1;
    for (const [id, n] of Object.entries(owned)) if (n > 1) violation('item-duplicado', { item: id, n });
    // Patrocínio: limites de slot, sem duplicado, sem contrato vencido há > 31 dias ativo.
    // Contrato fora do catálogo e sem categoria (semente de demonstração de
    // src/local/localSeed.js, presente em toda carreira nova): a regra real de
    // slot o ignora; aqui ele é só registrado, não contado.
    const all = (contracts || []).map(A.sponsors.normalizeSponsorshipContract).filter(Boolean);
    const isLegacy = (c) => !c.sponsor_category && !A.sponsors.SPONSOR_CATALOG.some((x) => x.id === c.sponsor_id);
    for (const c of all.filter(isLegacy)) (out.legacyContracts ||= {})[c.sponsor_id] = { name: c.sponsor_name, monthly_salary: c.monthly_salary ?? null, monthly_value: c.monthly_value ?? null, end: c.end_date || null, lastSeenDay: dayOf(profile.career_date) };
    const active = all.filter((c) => !isLegacy(c));
    const bySponsor = {}; const bySlot = {};
    for (const c of active) {
      bySponsor[c.sponsor_id] = (bySponsor[c.sponsor_id] || 0) + 1;
      const s = A.sponsors.SPONSOR_CATALOG.find((x) => x.id === c.sponsor_id);
      const slot = c.sponsor_category || A.sponsors.getSponsorCategory(s);
      bySlot[slot] = (bySlot[slot] || 0) + 1;
      if (c.end_date && dayOf(profile.career_date) - dayOf(c.end_date) > 31) violation('contrato-vencido-ativo', { sponsor: c.sponsor_id, end: c.end_date });
    }
    for (const [id, n] of Object.entries(bySponsor)) if (n > 1) violation('patrocinio-duplicado', { sponsor: id, n });
    for (const [slot, n] of Object.entries(bySlot)) if (n > (A.sponsors.SPONSOR_SLOT_LIMITS[slot] ?? 0)) violation('slot-patrocinio-excedido', { slot, n });
    const invested = ((await rt.localGame.entities.PlayerInvestment.filter({ profile_id: profile.id }).catch(() => [])) || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    out.weekly.push({
      day: dayOf(profile.career_date), date: profile.career_date, coins: Number(profile.coins) || 0, invested, rank: wr?.rank || null,
      ovrBase: r1(avgAttrs(profile)), ovrEffective: r1(avgAttrs(view.effective)), equipApplied: r1(view.applied),
      attrs: Object.fromEntries(ATTRS.map((k) => [k, Number(profile[k]) || 0])),
      careerLevel: Number(profile.career_level) || 1, xp: Number(profile.xp) || 0, fans: Number(profile.fan_appeal) || 0,
      energy: Number(profile.energy) || 0, fatigue: Number(profile.fatigue) || 0, injured: rt.padel.isInjured(profile),
      sponsors: active.length, sponsorMonthly: active.reduce((s, c) => s + (Number(c.monthly_salary) || 0), 0),
      coachSalary: fm.coach, staffMonthly: fm.staff, partnerSalary: fm.partner, staff: fm.hires.length,
      gearOwned: (inventory || []).length, gearEquipped: (inventory || []).filter((i) => i.equipped).length,
    });
  }

  // ── Laço diário ───────────────────────────────────────────────────────────
  await newTx();
  await partnerStep();
  await snapshot();
  let day = 0; let lastWeek = -1; let guard = 0; let stalls = 0;
  while (day < DAYS) {
    if (Math.floor(day / 7) !== lastWeek) {
      lastWeek = Math.floor(day / 7);
      try { await weeklyDecisions(); } catch (e) { out.errors.push(`semana:${e.message}`.slice(0, 140)); }
      if (day > 0) await snapshot();
    }
    try { await dailyTraining(); } catch (e) { out.errors.push(`treino:${e.message}`.slice(0, 140)); }
    await refresh();
    const coinsBefore = Number(profile.coins) || 0;
    const fromDate = profile.career_date;
    const result = await rt.calendar.advanceCareerDays(profile, 1);
    profile = await rt.calendar.finalizeCareerAdvanceRange(result.profile, fromDate, result.profile.career_date);
    await refresh();
    await settleGameStep(profile.career_date, (Number(profile.coins) || 0) - coinsBefore);

    if (result.blockedBy?.id) {
      guard += 1;
      const cb = Number(profile.coins) || 0;
      if (result.blockedBy.event_type === 'tournament') {
        const r = await playTournamentRound(rt, A, { eventId: result.blockedBy.id, strategyId: 'balanced', seedText: `${seedText}-${PROFILE}-m${out.matches.length}` }).catch((e) => ({ outcome: 'error', error: e.message }));
        await refresh();
        if (r.outcome === 'played') {
          const m = r.matchRow;
          out.matches.push({ day: dayOf(m.date), tier: m.tier, round: m.round, won: Boolean(m.won), playerOvr: m.playerOvr, partnerOvr: m.partnerOvr, teamStrength: m.teamStrength, oppStrength: m.oppStrength, engineDelta: m.engineDelta, energy: m.energy });
          if (r.finalization) out.tournaments.push({ day: dayOf(profile.career_date), tournamentId: m.tournamentId, tier: m.tier, roundsWon: r.finalization.roundsWon, totalRounds: r.finalization.totalRounds, status: r.finalization.status, prize: Number(r.finalization.rewards?.coins) || 0, rankPoints: Number(r.finalization.rewards?.rankPoints) || 0 });
        } else {
          if (r.outcome === 'forfeit') out.forfeits += 1;
          if (r.outcome === 'error') out.errors.push(`rodada:${r.error}`.slice(0, 140));
          if (r.outcome !== 'forfeit') await A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null);
        }
      } else {
        await A.calendarSystem.resolveDecision(result.blockedBy.id, 'play').catch(() => A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null));
        await refresh();
      }
      await settleGameStep(profile.career_date, (Number(profile.coins) || 0) - cb);
      if (guard > 20) { out.errors.push('guarda: bloqueio repetido'); guard = 0; day += 1; }
      continue;
    }
    guard = 0;
    if (result.daysAdvanced === 0) {
      const b = result.blockedBy || {};
      out.advanceFailures.push({ date: profile.career_date, code: b.code || null, title: String(b.title || '').slice(0, 160) });
      if (++stalls > 5) { out.errors.push(`sem avanço: ${b.code || '?'}`); break; }
      continue;
    }
    stalls = 0;
    day += result.daysAdvanced;
    if (!(await A.partnership.getActivePartnership(profile.id).catch(() => null))) await partnerStep().catch((e) => out.errors.push(`parceiro:${e.message}`.slice(0, 140)));
  }
  await snapshot();

  // ── Save/load: recarrega o runtime do storage e compara o estado ─────────
  async function fingerprint() {
    const E = rt.localGame.entities;
    const p = await E.PlayerProfile.get(profile.id);
    const st = await A.equipment.loadEquipmentState(p.id);
    const count = async (name, q) => ((await E[name].filter(q).catch(() => [])) || []).length;
    return {
      coins: p.coins, career_date: p.career_date, xp: p.xp, rank_points: p.rank_points, coach_id: p.coach_id || null, partner_id: p.partner_id || null,
      base: Object.fromEntries(ATTRS.map((k) => [k, p[k]])), modifiers: st.modifiers,
      effective: eq.getEffectiveAttributes(p, st.modifiers), equipped: st.inventory.filter((i) => i.equipped).map((i) => i.item_id).sort(),
      contracts: await count('PlayerContract', { profile_id: p.id, is_active: true }), inventory: st.inventory.length,
      investments: await count('PlayerInvestment', { profile_id: p.id }), transactions: await count('FinancialTransaction', { profile_id: p.id }),
    };
  }
  const before = await fingerprint();
  await rt.close();
  rt = await bootRuntime(storage);
  A = await act.loadActionModules(rt);
  rt.runtime.activeCareerAdapter.setActiveCareer(await rt.careerManager.loadCareer(careerId));
  const after = await fingerprint();
  out.saveLoad = { identical: JSON.stringify(before) === JSON.stringify(after), mismatches: Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])), fingerprint: before };
  if (!out.saveLoad.identical) violation('save-load-divergente', { fields: out.saveLoad.mismatches });

  out.ledger = ledger;
  out.days = day;
  out.finalCoins = Number(profile.coins) || 0;
  out.saveMB = Math.round(Math.max(0, ...[...files.values()].map((v) => String(v).length)) / 10485.76) / 100;
  out.ms = Math.round(performance.now() - started);
  // Impressão digital determinística da carreira: sem tempo de execução e sem
  // o careerId (UUID de crypto.randomUUID, fora do RNG determinístico).
  const { ms, careerId: _opaqueId, ...stable } = out;
  out.resultHash = createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
  await rt.close();
  return out;
}

for (let seed = S0; seed <= S1; seed += 1) {
  const file = resolve(OUT, `${PROFILE}-d${DAYS}-s${String(seed).padStart(3, '0')}.json`);
  if (!FORCE && existsSync(file)) { console.log(`skip ${file}`); continue; }
  try {
    const result = await simulateCareer(seed);
    const fd = openSync(`${file}.tmp`, 'w');
    try { writeSync(fd, JSON.stringify(result)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(`${file}.tmp`, file);
    const w = result.weekly.at(-1) || {};
    console.log(`[9E.1 ${PROFILE} s${seed}] ${result.days}d · ${result.matches.length} partidas · rank ${w.rank} · OVR ${w.ovrBase}/${w.ovrEffective} · caixa ${result.finalCoins} · erros ${result.errors.length} · violações ${result.integrity.violations.length} · save/load ${result.saveLoad.identical ? 'ok' : 'DIVERGE'} · hash ${result.resultHash} · ${Math.round(result.ms / 1000)}s`);
  } catch (e) {
    console.error(`[9E.1 ${PROFILE} s${seed}] FALHOU: ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}
// Mesmo encerramento do harness 5.26: o servidor Vite deixa handles abertos.
setTimeout(() => process.exit(process.exitCode || 0), 50);
