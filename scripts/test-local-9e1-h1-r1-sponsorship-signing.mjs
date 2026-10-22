// LOCAL-9E.1-H1-R1 — assinatura de patrocínio: carência após rescisão voluntária
// (E1-01b), assinatura idempotente e integridade do saldo.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado. A data
// da carreira é posicionada direto no perfil (fixture).
//
//   T1  três renovações imediatas não pagam.
//   T2  assinar → rescindir → reassinar no mesmo dia: recusado, sem pagamento.
//   T3  89 dias bloqueia; 90 dias libera.
//   T4  rescindir A não bloqueia B.
//   T5  save/load durante a carência não contorna.
//   T6  ids novos (contrato renovado, nova assinatura) não contornam.
//   T7  assinatura repetida: nenhum contrato/pagamento novo.
//   T8  cinco assinaturas simultâneas: um contrato, um pagamento.
//   T9  assinaturas e renovação simultâneas de contratos distintos: nenhum crédito perdido.
//   T10 encerramento natural (vencimento, metas) não gera carência.
//   T11 save antigo (sem campos novos) continua legível; nada é apagado.
//   T12 mesmas ações, datas e estado → mesmo resultado.
//
// Uso: node scripts/test-local-9e1-h1-r1-sponsorship-signing.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9e1-h1-sponsorship-renewal';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9E1H1_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = saved; } };
const report = { generatedBy: 'LOCAL-9E.1-H1-R1 sponsorship signing integrity', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ''}`); };

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tryRun = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (error) { return { ok: false, error: error?.message || String(error), code: error?.code || null }; } };
const outcome = (r) => (r.ok ? 'ok' : r.code || r.error);

async function prepare(seed) {
  const booted = await quiet(() => bootCareer(`9e1h1r1-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities };
  ctx.S = await ctx.rt.load('/src/lib/sponsors.js');
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { tournaments_played: 10 });
  return ctx;
}
async function reload(ctx) {
  ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId));
  ctx.E = ctx.rt.localGame.entities;
  ctx.S = await ctx.rt.load('/src/lib/sponsors.js');
}
const fresh = async (ctx) => (ctx.profile = await ctx.E.PlayerProfile.get(ctx.profile.id));
const setDate = async (ctx, date) => (ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: date }));
const coins = async (ctx) => Number((await fresh(ctx)).coins) || 0;
const contractsOf = async (ctx, sponsorId) => ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id })) || []).filter((c) => c.sponsor_id === sponsorId);
const activeOf = async (ctx, sponsorId) => (await contractsOf(ctx, sponsorId)).filter((c) => c.is_active);
const ledger = async (ctx, prefix) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => String(t.id || '').startsWith(prefix));
const pickSponsors = (ctx, n, { anyTier = false } = {}) => {
  const out = []; const used = {};
  for (const s of ctx.S.SPONSOR_CATALOG.filter((x) => anyTier || x.tier === 'Bronze')) {
    const cat = ctx.S.getSponsorCategory(s);
    if ((used[cat] || 0) >= ctx.S.SPONSOR_SLOT_LIMITS[cat] || !ctx.S.canSign(s, ctx.profile).ok) continue;
    used[cat] = (used[cat] || 0) + 1; out.push(s);
    if (out.length === n) break;
  }
  if (out.length < n) throw new Error(`fixture: só ${out.length} patrocinador(es) assinável(is) juntos`);
  return out;
};
const signUI = (ctx, sponsor, profile = null) => tryRun(async () => ctx.S.signSponsorContract(profile || await ctx.E.PlayerProfile.get(ctx.profile.id), sponsor));
const terminateUI = (ctx, contract) => tryRun(() => ctx.S.terminateSponsorContract(contract));
async function sign(ctx, sponsor) {
  const r = await signUI(ctx, sponsor);
  if (!r.ok) throw new Error(`fixture: assinatura recusada (${r.error})`);
  await fresh(ctx);
  return (await activeOf(ctx, sponsor.id))[0];
}
const snap = async (ctx, sponsorId) => ({ coins: await coins(ctx), contracts: (await contractsOf(ctx, sponsorId)).length, active: (await activeOf(ctx, sponsorId)).length, signings: (await ledger(ctx, 'sponsor-signing-')).length });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const HAS_RULE = await (async () => { const c = await prepare('api'); const ok = typeof c.S.getSponsorResignCooldown === 'function'; await c.rt.close(); return ok; })();
report.cooldownApi = HAS_RULE;

// ── T1 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T1');
  const [s] = pickSponsors(ctx, 1);
  await sign(ctx, s);
  const deltas = [];
  for (let i = 0; i < 3; i += 1) {
    const [c] = await activeOf(ctx, s.id);
    const before = await coins(ctx);
    await tryRun(async () => ctx.S.renewContract(c, s, await fresh(ctx)));
    deltas.push((await coins(ctx)) - before);
  }
  report.cases.T1 = { deltas, contracts: (await contractsOf(ctx, s.id)).length };
  check('T1: três renovações imediatas não pagam nem criam contratos', deltas.every((d) => d === 0) && report.cases.T1.contracts === 1, report.cases.T1);
  await ctx.rt.close();
}

// ── T2 + T3 ───────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T2T3');
  const [s] = pickSponsors(ctx, 1);
  const k = await sign(ctx, s);
  const t0 = ctx.profile.career_date;
  const term = await terminateUI(ctx, k);
  const stored = (await contractsOf(ctx, s.id)).find((c) => c.id === k.id);
  const s0 = await snap(ctx, s.id);
  const sameDay = await signUI(ctx, s);
  const s1 = await snap(ctx, s.id);
  report.cases.T2 = { terminate: outcome(term), stored: { reason: stored?.termination_reason, on: stored?.voluntary_termination_on ?? null }, resign: outcome(sameDay), before: s0, after: s1 };
  check('T2: rescisão voluntária grava data da carreira e motivo', term.ok && stored && !stored.is_active && stored.termination_reason === 'Rescisão voluntária' && stored.voluntary_termination_on === t0, report.cases.T2);
  check('T2: reassinar no mesmo dia é recusado, sem pagamento e sem contrato novo', !sameDay.ok && same(s0, s1), report.cases.T2);

  await setDate(ctx, addDays(t0, 89));
  const d89 = await signUI(ctx, s);
  const s89 = await snap(ctx, s.id);
  await setDate(ctx, addDays(t0, 90));
  const before90 = await coins(ctx);
  const d90 = await signUI(ctx, s);
  const [k2] = await activeOf(ctx, s.id);
  const delta90 = (await coins(ctx)) - before90;
  report.cases.T3 = { terminatedOn: t0, day89: outcome(d89), day90: outcome(d90), delta90, newSignBonus: k2?.sign_bonus ?? null, ids: [k.id, k2?.id] };
  check('T3: 89 dias após a rescisão — bloqueado, nada muda', !d89.ok && same(s0, s89), report.cases.T3);
  check('T3: 90 dias após a rescisão — liberado, paga as luvas uma vez', d90.ok && k2 && delta90 === k2.sign_bonus && k2.id !== k.id, report.cases.T3);
  if (HAS_RULE) {
    const all = await contractsOf(ctx, s.id);
    const pure = [88, 89, 90, 91].map((d) => ctx.S.getSponsorResignCooldown(s.id, all.filter((c) => c.id === k.id), addDays(t0, d)).blocked);
    report.cases.T3.pure = pure;
    check('T3: regra pura — bloqueia até 89, libera a partir de 90', same(pure, [true, true, false, false]), pure);
  }
  await ctx.rt.close();
}

// ── T4 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T4');
  const [a, b] = pickSponsors(ctx, 2);
  const ka = await sign(ctx, a);
  await terminateUI(ctx, ka);
  const before = await coins(ctx);
  const rb = await signUI(ctx, b);
  const [kb] = await activeOf(ctx, b.id);
  const ra = await signUI(ctx, a);
  report.cases.T4 = { a: a.id, b: b.id, signB: outcome(rb), resignA: outcome(ra), deltaB: (await coins(ctx)) - before, bonusB: kb?.sign_bonus ?? null };
  check('T4: rescindir A não bloqueia B (mesmo dia); A continua bloqueado', rb.ok && kb && report.cases.T4.deltaB === kb.sign_bonus && !ra.ok, report.cases.T4);
  await ctx.rt.close();
}

// ── T5 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T5');
  const [s] = pickSponsors(ctx, 1);
  const k = await sign(ctx, s);
  const t0 = ctx.profile.career_date;
  await terminateUI(ctx, k);
  await reload(ctx);
  const s0 = await snap(ctx, s.id);
  const r0 = await signUI(ctx, s);
  await setDate(ctx, addDays(t0, 45));
  await reload(ctx);
  const r45 = await signUI(ctx, s);
  await setDate(ctx, addDays(t0, 89));
  await reload(ctx);
  const r89 = await signUI(ctx, s);
  const s1 = await snap(ctx, s.id);
  report.cases.T5 = { afterReload: [r0, r45, r89].map(outcome), before: s0, after: s1 };
  check('T5: save/load no dia 0, 45 e 89 da carência — todas recusadas, nada muda', [r0, r45, r89].every((r) => !r.ok) && same(s0, s1), report.cases.T5);
  await ctx.rt.close();
}

// ── T6 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T6');
  const [s] = pickSponsors(ctx, 1);
  const k1 = await sign(ctx, s);
  await setDate(ctx, addDays(k1.end_date, -10));
  const ren = await tryRun(async () => ctx.S.renewContract(k1, s, await fresh(ctx)));
  const [k2] = await activeOf(ctx, s.id);
  const t0 = ctx.profile.career_date;
  await terminateUI(ctx, k2);
  const r1 = await signUI(ctx, s);
  // Passa a carência, assina (id novo), rescinde de novo: nova carência pela nova data.
  await setDate(ctx, addDays(t0, 90));
  const r2 = await signUI(ctx, s);
  const [k3] = await activeOf(ctx, s.id);
  const t1 = ctx.profile.career_date;
  await terminateUI(ctx, k3);
  await setDate(ctx, addDays(t1, 30));
  const r3 = await signUI(ctx, s);
  report.cases.T6 = { renewed: outcome(ren), ids: [k1.id, k2?.id, k3?.id], afterRenewedTerminated: outcome(r1), afterCooldown: outcome(r2), afterSecondTermination: outcome(r3) };
  check('T6: rescindir o contrato renovado (id derivado) também bloqueia o patrocinador', ren.ok && k2 && k2.id !== k1.id && !r1.ok, report.cases.T6);
  check('T6: nova assinatura (id novo) rescindida reabre a carência pela nova data', r2.ok && k3 && new Set(report.cases.T6.ids).size === 3 && !r3.ok, report.cases.T6);
  await ctx.rt.close();
}

// ── T7 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T7');
  const [s] = pickSponsors(ctx, 1);
  const stale = await fresh(ctx);
  const before = await coins(ctx);
  const r1 = await signUI(ctx, s, stale);
  const s1 = await snap(ctx, s.id);
  const r2 = await signUI(ctx, s, stale);
  const r3 = await signUI(ctx, s);
  const s2 = await snap(ctx, s.id);
  const [k] = await activeOf(ctx, s.id);
  report.cases.T7 = { results: [r1, r2, r3].map(outcome), delta: s2.coins - before, bonus: k?.sign_bonus, after: s2 };
  check('T7: assinatura repetida (perfil antigo e atual) é recusada, sem contrato ou pagamento novo', r1.ok && !r2.ok && !r3.ok && same(s1, s2) && report.cases.T7.delta === k.sign_bonus && s2.contracts === 1 && s2.signings === 1, report.cases.T7);
  await ctx.rt.close();
}

// ── T8 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T8');
  const [s] = pickSponsors(ctx, 1);
  const stale = await fresh(ctx);
  const before = await coins(ctx);
  const results = await quiet(() => Promise.all(Array.from({ length: 5 }, () => ctx.S.signSponsorContract(stale, s).then(() => 'ok', (e) => e?.code || e?.message))));
  const after = await snap(ctx, s.id);
  const [k] = await activeOf(ctx, s.id);
  report.cases.T8 = { results, delta: after.coins - before, bonus: k?.sign_bonus, after };
  check('T8: 5 assinaturas simultâneas — 1 contrato, 1 pagamento, 1 linha de extrato', results.filter((r) => r === 'ok').length === 1 && after.contracts === 1 && after.signings === 1 && k && report.cases.T8.delta === k.sign_bonus, report.cases.T8);
  await ctx.rt.close();
}

// ── T9 ────────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T9');
  // Fixture: requisitos de XP/fãs/títulos cumpridos para haver 3 patrocinadores em slots livres.
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { xp: 100000, fan_appeal: 100, tournaments_won: 50 });
  const [a, b, c] = pickSponsors(ctx, 3, { anyTier: true });
  const kc = await sign(ctx, c);
  await setDate(ctx, addDays(kc.end_date, -5));
  const stale = await fresh(ctx);
  const before = Number(stale.coins) || 0;
  const results = await quiet(() => Promise.all([
    ctx.S.signSponsorContract(stale, a).then(() => 'ok', (e) => e?.code || e?.message),
    ctx.S.signSponsorContract(stale, b).then(() => 'ok', (e) => e?.code || e?.message),
    ctx.S.renewContract(kc, c, stale).then(() => 'ok', (e) => e?.code || e?.message),
  ]));
  const after = await coins(ctx);
  const [ka] = await activeOf(ctx, a.id); const [kb] = await activeOf(ctx, b.id); const [kc2] = await activeOf(ctx, c.id);
  const expected = (ka?.sign_bonus || 0) + (kb?.sign_bonus || 0) + (kc2 && kc2.id !== kc.id ? kc2.sign_bonus : 0);
  const rows = (await ledger(ctx, 'sponsor-signing-')).length + (await ledger(ctx, 'sponsor-renewal-')).length;
  report.cases.T9 = { sponsors: [a.id, b.id, c.id], results, delta: after - before, expected, ledgerRows: rows };
  check('T9: 2 assinaturas + 1 renovação simultâneas (perfil antigo) — saldo = soma de todos os créditos', results.every((r) => r === 'ok') && ka && kb && kc2 && kc2.id !== kc.id && report.cases.T9.delta === expected && expected > 0, report.cases.T9);
  check('T9: extrato com as 3 operações novas (+1 da assinatura da fixture)', rows === 4, report.cases.T9);
  await ctx.rt.close();
}

// ── T10 ───────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T10');
  const [a, b] = pickSponsors(ctx, 2);
  const ka = await sign(ctx, a);
  const kb = await sign(ctx, b);
  // Vencimento real: fechamento mensal do mês seguinte ao fim.
  const economy = await ctx.rt.load('/src/lib/economy.js');
  const lifecycle = await ctx.rt.load('/src/game-core/sponsorLifecycle.js');
  // Encerramento pelo patrocinador (metas): satisfação abaixo do limite na avaliação mensal.
  await ctx.E.PlayerContract.update(kb.id, { satisfaction_score: 0 });
  await quiet(() => lifecycle.evaluateSponsorContracts(ctx.profile));
  const kbAfter = (await contractsOf(ctx, b.id)).find((c) => c.id === kb.id);
  const rb = await signUI(ctx, b);
  const late = addDays(ka.end_date, 40);
  await setDate(ctx, late);
  await quiet(() => economy.processMonthlyFinances(ctx.profile));
  const kaAfter = (await contractsOf(ctx, a.id)).find((c) => c.id === ka.id);
  const ra = await signUI(ctx, a);
  report.cases.T10 = { sponsorTerminated: { reason: kbAfter?.termination_reason, voluntaryOn: kbAfter?.voluntary_termination_on ?? null, resign: outcome(rb) }, expired: { reason: kaAfter?.termination_reason, voluntaryOn: kaAfter?.voluntary_termination_on ?? null, resign: outcome(ra) } };
  check('T10: contrato encerrado pelo patrocinador (metas) não gera carência', kbAfter && !kbAfter.is_active && kbAfter.termination_reason !== 'Rescisão voluntária' && rb.ok, report.cases.T10);
  check('T10: contrato vencido no fechamento mensal não gera carência', kaAfter?.termination_reason === 'Contrato expirado' && ra.ok, report.cases.T10);
  await ctx.rt.close();
}

// ── T11 ───────────────────────────────────────────────────────────────────
{
  const ctx = await prepare('T11');
  const [a, b] = pickSponsors(ctx, 2);
  const date = ctx.profile.career_date;
  // Linhas no formato anterior à R1/H1: sem voluntary_termination_on nem campos de renovação.
  const legacyTerminated = await ctx.E.PlayerContract.create({ profile_id: ctx.profile.id, sponsor_id: a.id, sponsor_name: a.name, sponsor_tier: a.tier, monthly_salary: 100, sign_bonus: 100, started_date: addDays(date, -200), end_date: addDays(date, 10), is_active: false, termination_reason: 'Rescisão voluntária', is_renewable: true });
  const legacyActive = await ctx.E.PlayerContract.create({ profile_id: ctx.profile.id, sponsor_id: b.id, sponsor_name: b.name, sponsor_tier: b.tier, monthly_salary: 100, sign_bonus: 100, started_date: addDays(date, -170), end_date: addDays(date, 10), is_active: true, is_renewable: true });
  const legacyName = await ctx.E.PlayerContract.create({ profile_id: ctx.profile.id, brand_name: 'Marca Antiga', monthly_value: 50, is_active: true });
  const coinsBefore = await coins(ctx);
  const countBefore = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id })) || []).length;
  await reload(ctx);
  const countAfter = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id })) || []).length;
  const coinsAfter = await coins(ctx);
  const ids = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id })) || []).map((c) => c.id);
  const renewLegacy = await tryRun(async () => ctx.S.renewContract({ id: legacyActive.id }, b, await fresh(ctx)));
  const signA = await signUI(ctx, a);
  report.cases.T11 = { contracts: [countBefore, countAfter], coins: [coinsBefore, coinsAfter], legacyRowsKept: [legacyTerminated.id, legacyActive.id, legacyName.id].every((id) => ids.includes(id)), renewLegacyActive: outcome(renewLegacy), signAfterLegacyVoluntary: outcome(signA) };
  check('T11: save com contratos no formato antigo carrega sem apagar contratos nem dinheiro', countBefore === countAfter && coinsBefore === coinsAfter && report.cases.T11.legacyRowsKept, report.cases.T11);
  check('T11: contrato antigo ativo renova pela regra nova (janela); rescisão antiga sem data não bloqueia', renewLegacy.ok && signA.ok, report.cases.T11);
  await ctx.rt.close();
}

// ── T12 ───────────────────────────────────────────────────────────────────
{
  const script = async (tag) => {
    const ctx = await prepare('T12');
    const [s, t] = pickSponsors(ctx, 2);
    const log = [];
    const k = await sign(ctx, s);
    log.push(['sign', await coins(ctx)]);
    await terminateUI(ctx, k);
    log.push(['resign0', outcome(await signUI(ctx, s)), await coins(ctx)]);
    const kt = await sign(ctx, t);
    await setDate(ctx, addDays(kt.end_date, -3));
    log.push(['renew', outcome(await tryRun(async () => ctx.S.renewContract(kt, t, await fresh(ctx)))), await coins(ctx)]);
    await setDate(ctx, addDays(k.started_date, 90));
    log.push(['resign90', outcome(await signUI(ctx, s)), await coins(ctx)]);
    const rows = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id })) || [])
      .map(({ created_date, updated_date, signing_bonus_paid_at, ...c }) => c).sort((x, y) => String(x.id).localeCompare(String(y.id)));
    const fin = ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || [])
      .filter((r) => /^sponsor-(signing|renewal)-/.test(String(r.id))).map(({ created_date, updated_date, ...r }) => r).sort((x, y) => String(x.id).localeCompare(String(y.id)));
    await ctx.rt.close();
    return { tag, log, rows: JSON.stringify(rows), fin: JSON.stringify(fin) };
  };
  const a = await script('a');
  const b = await script('b');
  report.cases.T12 = { log: a.log, sameLog: same(a.log, b.log), sameContracts: a.rows === b.rows, sameLedger: a.fin === b.fin };
  check('T12: mesmas ações, datas e estado → mesmo saldo, contratos e extrato', report.cases.T12.sameLog && report.cases.T12.sameContracts && report.cases.T12.sameLedger, report.cases.T12);
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'r1-tests.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLOCAL-9E.1-H1-R1: ${report.summary.passed}/${report.summary.total} passaram`);
process.exit(failed.length ? 1 : 0);
