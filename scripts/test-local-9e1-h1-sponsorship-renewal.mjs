// LOCAL-9E.1-H1 — integridade da renovação de patrocínio (E1-01).
//
// Roda os MÓDULOS REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
//
//   P  sonda original da 9E.1: assinar e renovar 3× no mesmo dia.
//   A  renovação repetida no mesmo dia (objeto atual e objeto desatualizado).
//   B  contrato ainda fora da janela.
//   C  save/load entre renovações.
//   D  dois contratos distintos.
//   E  renovação futura legítima (segundo ciclo).
//   F  contrato vencido, rescindido e encerrado pelo fechamento mensal.
//   G  falha no meio da gravação (lote atômico) e nova tentativa.
//   H  operação de domínio sem a tela (resultado explícito, patrocinador forjado).
//   I  cinco chamadas simultâneas sobre o mesmo contrato.
//   X  achado fora do escopo: rescindir e reassinar paga luvas de novo (registro).
//
// A data da carreira é posicionada direto no perfil (fixture), para não simular
// meses de calendário; o avanço real de dias com renovações fica no simulador.
//
// Uso: node scripts/test-local-9e1-h1-sponsorship-renewal.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9e1-h1-sponsorship-renewal';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9E1H1_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error] = saved; } };
const report = { generatedBy: 'LOCAL-9E.1-H1 sponsorship renewal integrity', checks: [], cases: {}, findings: [] };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ''}`); };

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tryRun = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (error) { return { ok: false, error: error?.message || String(error), code: error?.code || null }; } };

async function prepare(seed) {
  const booted = await quiet(() => bootCareer(`9e1h1-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities };
  ctx.S = await ctx.rt.load('/src/lib/sponsors.js');
  // Prova de carreira cumprida (fixture) para poder assinar.
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
const renewalLedger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => String(t.id || '').startsWith('sponsor-renewal-'));
const renewalEvents = async (ctx) => ((await ctx.E.WorldEvent.filter({ profile_id: ctx.profile.id })) || []).filter((e) => String(e.title || '').includes(' renova com '));
const pickSponsors = (ctx, n) => {
  // Patrocinadores distintos que cabem juntos nos slots (comercial tem 2 vagas).
  const out = []; const used = {};
  for (const s of ctx.S.SPONSOR_CATALOG.filter((x) => x.tier === 'Bronze')) {
    const cat = ctx.S.getSponsorCategory(s);
    if ((used[cat] || 0) >= ctx.S.SPONSOR_SLOT_LIMITS[cat] || !ctx.S.canSign(s, ctx.profile).ok) continue;
    used[cat] = (used[cat] || 0) + 1; out.push(s);
    if (out.length === n) break;
  }
  if (out.length < n) throw new Error(`fixture: só ${out.length} patrocinador(es) Bronze assinável(is) juntos`);
  return out;
};
async function sign(ctx, sponsor) {
  await quiet(() => ctx.S.signSponsorContract(ctx.profile, sponsor));
  await fresh(ctx);
  return (await activeOf(ctx, sponsor.id))[0];
}
// Renovação pela mesma porta da tela (Economy.jsx → renewContract).
const renewUI = (ctx, contract, sponsor) => tryRun(async () => ctx.S.renewContract(contract, sponsor, await ctx.E.PlayerProfile.get(ctx.profile.id)));
const snapshot = async (ctx, sponsorId) => ({ coins: await coins(ctx), contracts: JSON.stringify((await contractsOf(ctx, sponsorId)).map(({ updated_date, ...c }) => c)), ledger: (await renewalLedger(ctx)).length, events: (await renewalEvents(ctx)).length });
const sameSnap = (a, b) => a.coins === b.coins && a.contracts === b.contracts && a.ledger === b.ledger && a.events === b.events;

const hasDomain = async () => { const ctx = await prepare('probe-api'); const ok = typeof ctx.S.renewSponsorContract === 'function' && typeof ctx.S.getSponsorRenewalEligibility === 'function'; await ctx.rt.close(); return ok; };
const DOMAIN = await hasDomain();
report.domainApi = DOMAIN;

// ── P. Sonda original da 9E.1 ─────────────────────────────────────────────
{
  const ctx = await prepare('P');
  const [sponsor] = pickSponsors(ctx, 1);
  const c0 = await coins(ctx);
  await sign(ctx, sponsor);
  const signBonus = (await coins(ctx)) - c0;
  const bonuses = []; const outcomes = [];
  for (let i = 0; i < 3; i += 1) {
    const [contract] = await activeOf(ctx, sponsor.id);
    const before = await coins(ctx);
    const r = await renewUI(ctx, contract, sponsor);
    outcomes.push(r.ok ? 'renovado' : `recusado:${r.code || r.error}`);
    bonuses.push((await coins(ctx)) - before);
  }
  report.cases.P = { sponsor: sponsor.id, signBonus, renewalBonusesSameDay: bonuses, outcomes, activeAfter: (await activeOf(ctx, sponsor.id)).length, contractsAfter: (await contractsOf(ctx, sponsor.id)).length };
  check('P: sonda 9E.1 — 3 renovações no dia da assinatura não pagam luvas', bonuses.every((b) => b === 0), report.cases.P);
  check('P: sonda 9E.1 — continua 1 contrato ativo e nenhum contrato novo', report.cases.P.activeAfter === 1 && report.cases.P.contractsAfter === 1, report.cases.P);
  await ctx.rt.close();
}

// ── A + B. Fora da janela, depois renovação legítima e repetições ──────────
{
  const ctx = await prepare('AB');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  // B — fora da janela (dia da assinatura e 31 dias antes do fim).
  const snapB0 = await snapshot(ctx, sponsor.id);
  const b1 = await renewUI(ctx, c1, sponsor);
  await setDate(ctx, addDays(c1.end_date, -31));
  const b2 = await renewUI(ctx, c1, sponsor);
  const snapB1 = await snapshot(ctx, sponsor.id);
  report.cases.B = { endDate: c1.end_date, attempts: [b1, b2].map((r) => (r.ok ? 'renovado' : r.code || r.error)) };
  check('B: renovação antes da janela é recusada', !b1.ok && !b2.ok, report.cases.B);
  check('B: recusa sem pagamento, sem mudança contratual, sem extrato e sem notícia', sameSnap({ ...snapB0, coins: snapB1.coins }, snapB1) && snapB0.coins === snapB1.coins, { snapB0, snapB1 });

  // A — janela aberta (30 dias antes do fim).
  await setDate(ctx, addDays(c1.end_date, -30));
  const before = await coins(ctx);
  const a1 = await renewUI(ctx, c1, sponsor);
  const afterFirst = await coins(ctx);
  const [c2] = await activeOf(ctx, sponsor.id);
  const legitBonus = afterFirst - before;
  const snapA1 = await snapshot(ctx, sponsor.id);
  const stale1 = await renewUI(ctx, c1, sponsor); // objeto antigo (tela desatualizada)
  const stale2 = await renewUI(ctx, { ...c1, is_active: true, end_date: c1.end_date }, sponsor);
  const again = await renewUI(ctx, c2, sponsor); // contrato novo, recém-renovado
  const again2 = await renewUI(ctx, c2, sponsor);
  const snapA2 = await snapshot(ctx, sponsor.id);
  report.cases.A = {
    legit: a1.ok ? 'renovado' : a1.error, legitBonus, expectedBonus: c2 ? c2.sign_bonus : null,
    repeats: [stale1, stale2, again, again2].map((r) => (r.ok ? 'renovado' : r.code || r.error)),
    renewedContract: c2 ? { id: c2.id, started: c2.started_date, end: c2.end_date, from: c2.renewed_from_contract_id ?? null } : null,
  };
  check('A: renovação dentro da janela é aceita e paga as luvas de renovação uma vez', a1.ok && legitBonus > 0 && c2 && legitBonus === c2.sign_bonus, report.cases.A);
  check('A: repetir (objeto antigo, objeto forjado, contrato novo ×2) não produz nenhum efeito', [stale1, stale2, again, again2].every((r) => !r.ok) && sameSnap(snapA1, snapA2), { repeats: report.cases.A.repeats, snapA1, snapA2 });
  check('A: 1 linha de extrato e 1 notícia de renovação; 2 contratos (1 ativo)', snapA2.ledger === 1 && snapA2.events === 1 && (await contractsOf(ctx, sponsor.id)).length === 2 && (await activeOf(ctx, sponsor.id)).length === 1, snapA2);
  const old = (await contractsOf(ctx, sponsor.id)).find((c) => c.id === c1.id);
  check('A: contrato anterior fica inativo, "Renovado", ligado ao novo', old && !old.is_active && old.termination_reason === 'Renovado' && (!DOMAIN || old.renewed_to_contract_id === c2.id), old && { is_active: old.is_active, reason: old.termination_reason, to: old.renewed_to_contract_id });
  const ledgerRow = (await renewalLedger(ctx))[0];
  check('A: linha do extrato = luvas pagas (valor, data, categoria)', ledgerRow && ledgerRow.amount === legitBonus && ledgerRow.date === ctx.profile.career_date && ledgerRow.category === 'patrocinio' && ledgerRow.type === 'income', ledgerRow);
  await ctx.rt.close();
}

// ── C. Save/load entre renovações ─────────────────────────────────────────
{
  const ctx = await prepare('C');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  await setDate(ctx, addDays(c1.end_date, -10));
  const r1 = await renewUI(ctx, c1, sponsor);
  const snap1 = await snapshot(ctx, sponsor.id);
  await reload(ctx);
  const snapReload = await snapshot(ctx, sponsor.id);
  const [c2] = await activeOf(ctx, sponsor.id);
  const r2 = await renewUI(ctx, c1, sponsor); // repete a renovação anterior após load
  const r3 = await renewUI(ctx, c2, sponsor);
  await reload(ctx);
  const snap2 = await snapshot(ctx, sponsor.id);
  report.cases.C = { first: r1.ok, afterReload: [r2, r3].map((r) => (r.ok ? 'renovado' : r.code || r.error)), coins: [snap1.coins, snapReload.coins, snap2.coins], ledger: snap2.ledger };
  check('C: renovação legítima persiste após save/load (saldo, contratos, extrato)', r1.ok && sameSnap(snap1, snapReload), { snap1, snapReload });
  check('C: repetir após load é recusado e nada muda após novo load', !r2.ok && !r3.ok && sameSnap(snap1, snap2), report.cases.C);
  await ctx.rt.close();
}

// ── D. Contratos distintos ────────────────────────────────────────────────
{
  const ctx = await prepare('D');
  const [s1, s2] = pickSponsors(ctx, 2);
  const k1 = await sign(ctx, s1);
  // Durações diferentes: assina o segundo mais tarde para os fins ficarem próximos.
  const d2 = new Date(`${k1.end_date}T00:00:00Z`); d2.setUTCMonth(d2.getUTCMonth() - s2.contract_duration_months);
  await setDate(ctx, d2.toISOString().slice(0, 10) > ctx.profile.career_date ? d2.toISOString().slice(0, 10) : ctx.profile.career_date);
  const k2 = await sign(ctx, s2);
  const end = [k1.end_date, k2.end_date].sort()[0];
  await setDate(ctx, addDays(end, -5));
  const elig = (k) => addDays(k.end_date, -30) <= ctx.profile.career_date && ctx.profile.career_date <= k.end_date;
  const c0 = await coins(ctx);
  const r1 = await renewUI(ctx, k1, s1);
  const c1 = await coins(ctx);
  const r1b = await renewUI(ctx, k1, s1);
  const r2 = await renewUI(ctx, k2, s2);
  const c2 = await coins(ctx);
  const [n1] = await activeOf(ctx, s1.id); const [n2] = await activeOf(ctx, s2.id);
  report.cases.D = { sponsors: [s1.id, s2.id], ends: [k1.end_date, k2.end_date], date: ctx.profile.career_date, bothInWindow: elig(k1) && elig(k2), results: [r1, r1b, r2].map((r) => (r.ok ? 'renovado' : r.code || r.error)), deltas: [c1 - c0, c2 - c1] };
  check('D: os dois contratos estão na janela no mesmo dia', report.cases.D.bothInWindow, report.cases.D);
  check('D: renovar um não bloqueia o outro; repetição do primeiro recusada', r1.ok && !r1b.ok && r2.ok, report.cases.D);
  check('D: cada contrato paga só as próprias luvas', n1 && n2 && c1 - c0 === n1.sign_bonus && c2 - c1 === n2.sign_bonus && n1.id !== n2.id, report.cases.D);
  check('D: 2 linhas de extrato, uma por contrato', (await renewalLedger(ctx)).length === 2);
  await ctx.rt.close();
}

// ── E. Renovação futura legítima ──────────────────────────────────────────
{
  const ctx = await prepare('E');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  await setDate(ctx, addDays(c1.end_date, -20));
  const r1 = await renewUI(ctx, c1, sponsor);
  const [c2] = await activeOf(ctx, sponsor.id);
  await setDate(ctx, addDays(c2.end_date, -31));
  const early = await renewUI(ctx, c2, sponsor);
  await setDate(ctx, addDays(c2.end_date, -3));
  const before = await coins(ctx);
  const r2 = await renewUI(ctx, c2, sponsor);
  const delta = (await coins(ctx)) - before;
  const r2b = await renewUI(ctx, c2, sponsor);
  const [c3] = await activeOf(ctx, sponsor.id);
  report.cases.E = { first: r1.ok, earlySecond: early.ok ? 'renovado' : early.code || early.error, second: r2.ok, repeatSecond: r2b.ok ? 'renovado' : r2b.code || r2b.error, ids: [c1.id, c2?.id, c3?.id], delta, ledger: (await renewalLedger(ctx)).length };
  check('E: segundo ciclo — fora da janela recusado, dentro aceito', r1.ok && !early.ok && r2.ok, report.cases.E);
  check('E: segundo ciclo paga uma vez; repetição recusada; 3 contratos com ids distintos', delta > 0 && c3 && delta === c3.sign_bonus && !r2b.ok && new Set(report.cases.E.ids).size === 3 && report.cases.E.ledger === 2, report.cases.E);
  if (DOMAIN) check('E: cadeia de renovação rastreável (origem, raiz, sequência)', c3.renewed_from_contract_id === c2.id && c3.renewal_root_id === c1.id && c3.renewal_sequence === 2 && c2.renewal_sequence === 1, { c2: { id: c2.id, root: c2.renewal_root_id, seq: c2.renewal_sequence }, c3: { id: c3.id, from: c3.renewed_from_contract_id, root: c3.renewal_root_id, seq: c3.renewal_sequence } });
  await ctx.rt.close();
}

// ── F. Vencido, rescindido, encerrado no fechamento mensal ────────────────
{
  const ctx = await prepare('F');
  const [s1, s2] = pickSponsors(ctx, 2);
  const k1 = await sign(ctx, s1);
  const k2 = await sign(ctx, s2);
  // Vencido mas ainda ativo (antes do fechamento do mês seguinte).
  await setDate(ctx, addDays(k1.end_date, 1));
  const snapE0 = await snapshot(ctx, s1.id);
  const expired = await renewUI(ctx, k1, s1);
  const snapE1 = await snapshot(ctx, s1.id);
  // Rescindido pelo jogador.
  await quiet(() => ctx.S.terminateSponsorContract(k2, 'Rescisão voluntária'));
  await setDate(ctx, addDays(k2.end_date, -5));
  const terminated = await renewUI(ctx, k2, s2);
  // Encerrado pelo fechamento mensal (expiração real do jogo).
  const economy = await ctx.rt.load('/src/lib/economy.js');
  await setDate(ctx, addDays(k1.end_date, 40));
  await quiet(() => economy.processMonthlyFinances(ctx.profile));
  const k1Closed = (await contractsOf(ctx, s1.id)).find((c) => c.id === k1.id);
  const closed = await renewUI(ctx, k1Closed, s1);
  report.cases.F = { expired: expired.ok ? 'renovado' : expired.code || expired.error, terminated: terminated.ok ? 'renovado' : terminated.code || terminated.error, closedByMonthly: { reason: k1Closed?.termination_reason, result: closed.ok ? 'renovado' : closed.code || closed.error }, ledger: (await renewalLedger(ctx)).length };
  check('F: contrato vencido (ainda ativo) não renova e não paga', !expired.ok && snapE0.coins === snapE1.coins && sameSnap(snapE0, snapE1), report.cases.F);
  check('F: contrato rescindido não renova', !terminated.ok, report.cases.F);
  check('F: contrato encerrado pelo fechamento mensal não renova', k1Closed?.termination_reason === 'Contrato expirado' && !closed.ok, report.cases.F);
  check('F: nenhuma linha de renovação no extrato', report.cases.F.ledger === 0, report.cases.F);
  await ctx.rt.close();
}

// ── G. Falha no meio da gravação ──────────────────────────────────────────
if (DOMAIN) {
  const ctx = await prepare('G');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  await setDate(ctx, addDays(c1.end_date, -7));
  const snap0 = await snapshot(ctx, sponsor.id);
  const lg = ctx.rt.localGame; const originalBatch = lg.batch;
  // Falha DENTRO do lote: as operações reais são aplicadas ao rascunho e uma
  // operação extra inválida derruba a gravação inteira.
  lg.batch = (ops, opts) => originalBatch([...ops, { type: 'update', entityName: 'PlayerContract', id: '__falha_injetada__', data: {} }], opts);
  const failed = await renewUI(ctx, c1, sponsor);
  lg.batch = originalBatch;
  const snap1 = await snapshot(ctx, sponsor.id);
  // Falha ANTES do lote (ex.: exceção na camada de gravação).
  lg.batch = async () => { throw new Error('falha de gravação injetada'); };
  const failed2 = await renewUI(ctx, c1, sponsor);
  lg.batch = originalBatch;
  const snap2 = await snapshot(ctx, sponsor.id);
  await reload(ctx);
  const snapReload = await snapshot(ctx, sponsor.id);
  const retry = await renewUI(ctx, c1, sponsor);
  const snap3 = await snapshot(ctx, sponsor.id);
  const retry2 = await renewUI(ctx, c1, sponsor);
  const snap4 = await snapshot(ctx, sponsor.id);
  report.cases.G = { failedInside: failed.ok ? 'renovado' : failed.error, failedBefore: failed2.ok ? 'renovado' : failed2.error, retry: retry.ok, retry2: retry2.ok ? 'renovado' : retry2.code || retry2.error, coins: [snap0.coins, snap1.coins, snap2.coins, snapReload.coins, snap3.coins, snap4.coins] };
  check('G: falha dentro do lote não deixa efeito parcial (saldo, contratos, extrato, notícia)', !failed.ok && sameSnap(snap0, snap1), { snap0, snap1 });
  check('G: falha antes do lote não deixa efeito', !failed2.ok && sameSnap(snap0, snap2) && sameSnap(snap0, snapReload));
  check('G: nova tentativa após a falha renova uma vez; a seguinte é recusada', retry.ok && snap3.coins > snap0.coins && snap3.ledger === 1 && !retry2.ok && sameSnap(snap3, snap4), report.cases.G);
  await ctx.rt.close();
}

// ── H. Domínio sem a tela ─────────────────────────────────────────────────
if (DOMAIN) {
  const ctx = await prepare('H');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  const S = ctx.S;
  const early = await quiet(() => S.renewSponsorContract(ctx.profile.id, c1.id));
  const missing = await quiet(() => S.renewSponsorContract(ctx.profile.id, 'contrato-inexistente'));
  const wrongProfile = await quiet(() => S.renewSponsorContract('perfil-inexistente', c1.id));
  const pure = {
    tooEarly: S.getSponsorRenewalEligibility(c1, ctx.profile.career_date, { profileId: ctx.profile.id }),
    windowOpen: S.getSponsorRenewalEligibility(c1, addDays(c1.end_date, -30), { profileId: ctx.profile.id }),
    lastDay: S.getSponsorRenewalEligibility(c1, c1.end_date, { profileId: ctx.profile.id }),
    dayAfter: S.getSponsorRenewalEligibility(c1, addDays(c1.end_date, 1), { profileId: ctx.profile.id }),
    otherProfile: S.getSponsorRenewalEligibility(c1, c1.end_date, { profileId: 'outro' }),
    notRenewable: S.getSponsorRenewalEligibility({ ...c1, is_renewable: false }, c1.end_date, { profileId: ctx.profile.id }),
    noEnd: S.getSponsorRenewalEligibility({ ...c1, end_date: null }, c1.end_date, { profileId: ctx.profile.id }),
    renewed: S.getSponsorRenewalEligibility({ ...c1, renewed_to_contract_id: 'x' }, c1.end_date, { profileId: ctx.profile.id }),
    unknownSponsor: S.getSponsorRenewalEligibility({ ...c1, sponsor_id: 'nao-existe', sponsor_name: 'Nao Existe' }, c1.end_date, { profileId: ctx.profile.id }),
  };
  const codes = Object.fromEntries(Object.entries(pure).map(([k, v]) => [k, v.ok ? 'ok' : v.code]));
  report.cases.H = { early: { ok: early.ok, status: early.status, code: early.code }, missing: { status: missing.status, code: missing.code }, wrongProfile: { status: wrongProfile.status, code: wrongProfile.code }, eligibility: codes, window: { opensOn: pure.tooEarly.opensOn, endDate: pure.tooEarly.endDate, days: S.SPONSOR_RENEWAL_WINDOW_DAYS } };
  check('H: domínio devolve resultado explícito (sem exceção) para recusa', early.ok === false && early.status === 'refused' && early.code === 'too-early' && missing.code === 'missing-contract' && wrongProfile.status === 'refused', report.cases.H);
  check('H: regra pura — janela [fim−30, fim], recusa antes/depois, perfil, flags e catálogo', codes.tooEarly === 'too-early' && codes.windowOpen === 'ok' && codes.lastDay === 'ok' && codes.dayAfter === 'expired' && codes.otherProfile === 'wrong-profile' && codes.notRenewable === 'not-renewable' && codes.noEnd === 'no-end-date' && codes.renewed === 'already-renewed' && codes.unknownSponsor === 'unknown-sponsor', codes);
  // Patrocinador forjado pelo chamador: a renovação usa o catálogo, não o objeto recebido.
  await setDate(ctx, addDays(c1.end_date, -1));
  const forged = await renewUI(ctx, c1, { ...sponsor, id: 'outro-id', renewal_bonus_pct: 5000 });
  const forgedSameId = await renewUI(ctx, c1, { ...sponsor, renewal_bonus_pct: 5000, base_sign_bonus: 999999 });
  const [c2] = await activeOf(ctx, sponsor.id);
  const expected = Math.round(S.negotiateOffer(sponsor, await fresh(ctx)).sign_bonus * (1 + (sponsor.renewal_bonus_pct || 10) / 100));
  report.cases.H.forged = { otherId: forged.ok ? 'renovado' : forged.code || forged.error, sameIdInflated: forgedSameId.ok, paid: c2?.sign_bonus, expected };
  check('H: patrocinador de outro id é recusado; valores inflados pelo chamador são ignorados', !forged.ok && forgedSameId.ok && c2 && c2.sign_bonus === expected, report.cases.H.forged);
  await ctx.rt.close();
}

// ── I. Chamadas simultâneas ──────────────────────────────────────────────
{
  const ctx = await prepare('I');
  const [sponsor] = pickSponsors(ctx, 1);
  const c1 = await sign(ctx, sponsor);
  await setDate(ctx, addDays(c1.end_date, -2));
  const before = await coins(ctx);
  const stale = await ctx.E.PlayerProfile.get(ctx.profile.id);
  // Cinco handlers com o MESMO estado (perfil e contrato lidos antes de qualquer gravação).
  const results = await quiet(() => Promise.all(Array.from({ length: 5 }, () => ctx.S.renewContract(c1, sponsor, stale).then(() => 'renovado', (e) => e?.code || e?.message))));
  const after = await coins(ctx);
  const [c2] = await activeOf(ctx, sponsor.id);
  report.cases.I = { results, delta: after - before, contracts: (await contractsOf(ctx, sponsor.id)).length, active: (await activeOf(ctx, sponsor.id)).length, ledger: (await renewalLedger(ctx)).length };
  check('I: 5 chamadas simultâneas — exatamente 1 renovação', results.filter((r) => r === 'renovado').length === 1, report.cases.I);
  check('I: luvas pagas uma vez, 1 contrato novo, 1 linha de extrato', c2 && report.cases.I.delta === c2.sign_bonus && report.cases.I.contracts === 2 && report.cases.I.active === 1 && report.cases.I.ledger === 1, report.cases.I);
  await ctx.rt.close();
}

// ── X. Rescindir e reassinar (E1-01b; corrigido na H1-R1) ────────────────
{
  const ctx = await prepare('X');
  const [sponsor] = pickSponsors(ctx, 1);
  const deltas = []; const outcomes = [];
  for (let i = 0; i < 3; i += 1) {
    const before = await coins(ctx);
    const r = await tryRun(async () => ctx.S.signSponsorContract(await ctx.E.PlayerProfile.get(ctx.profile.id), sponsor));
    outcomes.push(r.ok ? 'assinado' : r.code || r.error);
    deltas.push((await coins(ctx)) - before);
    const [k] = await activeOf(ctx, sponsor.id);
    if (k) await quiet(() => ctx.S.terminateSponsorContract(k, 'Rescisão voluntária'));
  }
  const finding = { id: 'E1-01b', sponsor: sponsor.id, signBonusesSameDay: deltas, outcomes, note: 'Rescindir e reassinar o mesmo patrocinador no mesmo dia. Antes da H1-R1 pagava as luvas de novo a cada ciclo; com a carência de 90 dias, só a primeira assinatura paga.' };
  report.findings.push(finding);
  console.log(`INFO — E1-01b: luvas de reassinatura no mesmo dia = ${JSON.stringify(deltas)} · ${JSON.stringify(outcomes)}`);
  check('X: rescindir e reassinar no mesmo dia — só a primeira assinatura paga (E1-01b)', deltas[0] > 0 && deltas[1] === 0 && deltas[2] === 0, finding);
  await ctx.rt.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'tests.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nLOCAL-9E.1-H1: ${report.summary.passed}/${report.summary.total} passaram`);
process.exit(failed.length ? 1 : 0);
