// Playthrough 5.26 — SIMULADOR DE CARREIRA COMPLETA (auditoria, sem tuning).
//
// Uma carreira por chamada de simulateCareer(), dirigida por uma POLÍTICA
// (casual | normal | optimizer) que só usa informação visível ao jogador.
// Tudo passa pelo pipeline real (ver lib/v526CareerSim.mjs, v526Actions.mjs,
// v526Tournament.mjs). Saída: um JSON bruto por carreira em
// reports/progression-economy-526/raw/.
//
// Uso: node scripts/sim-progression-economy-v526.mjs --profile=normal --seeds=0-29 [--days=1826] [--reloadEvery=0]
import { mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, unlinkSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism, hashSeed, getLocalStoreSnapshot, restoreLocalStore } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';
import { playTournamentRound } from './lib/v526Tournament.mjs';
import { installFastClone } from './lib/v527dFastClone.mjs';
import { normalPartnerScore } from './lib/v527gPartnerScore.mjs';
import { optimizerShouldRenew, pickOptimizerPartner } from './lib/v527iOptimizerScore.mjs';

// Playthrough 5.27-D — clone rápido equivalente (opt-in, PL527D_FASTCLONE=1).
installFastClone();

// Playthrough 5.27-C — preset selecionável por ambiente, para rodar as MESMAS
// seeds nos 3 presets (comparação pareada). Precisa ser setado ANTES de
// qualquer módulo do jogo carregar (circuitCatalog monta os tiers com o
// multiplicador de prêmio no import).
if (process.env.PL527_PRESET) globalThis.__PL527_PRESET = process.env.PL527_PRESET;
// 5.27-E: candidato de núcleo competitivo da micro-calibração (JSON).
if (process.env.PL527E_COMPETITION) globalThis.__PL527E_COMPETITION_OVERRIDE = JSON.parse(process.env.PL527E_COMPETITION);

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const PROFILE = arg('profile', 'normal');
// 5.27-E: versão da política de comportamento (v1 = 5.26–5.27-D; v2 = taper de energia antes de torneio).
const POLICY_VERSION = process.env.PL527E_POLICY || 'v1';
// v3 (5.27-G) = v2 + Busca de parceiro equilibrada no normal (v527gPartnerScore).
const POLICY_V2PLUS = ['v2', 'v3', 'v4'].includes(POLICY_VERSION);
// v4 (5.27-I) = v3 + correção do OTIMIZADOR (v527iOptimizerScore); Normal/Casual idênticos à v3.
const POLICY_V3PLUS = ['v3', 'v4'].includes(POLICY_VERSION);
const OPTIMIZER_V4 = POLICY_VERSION === 'v4' && PROFILE === 'optimizer';
const [S0, S1] = arg('seeds', '0-0').split('-').map(Number);
const DAYS = Number(arg('days', 1826));
const RELOAD_EVERY = Number(arg('reloadEvery', 0));
const OUT = resolve(arg('out', 'reports/progression-economy-526/raw'));
const FORCE = process.argv.includes('--force');
// 5.26-C: checkpoint por carreira (protege contra kill externo). A cada N dias
// o estado completo vai para OUT/.checkpoints e o runtime é recarregado do
// storage — no modo contínuo E no retomado, para que os dois sejam idênticos.
const CHECKPOINT_EVERY = Number(arg('checkpointEvery', 0));
const STOP_AFTER_CHECKPOINT = Number(arg('stopAfterCheckpoint', 0)); // só para teste de resume
// --segment: o processo SEMPRE sai (código 3) após gravar um checkpoint e o
// runner o reinicia, retomando do arquivo. Assim a execução contínua e a
// interrompida/retomada seguem exatamente o mesmo caminho (retomar em
// processo novo é determinístico; recarregar dentro do mesmo processo não é).
const SEGMENT = process.argv.includes('--segment');
const STOP_AT_DAY = Number(arg('stopAtDay', 0)); // teste: simula kill no meio do segmento (sai com 4, sem checkpoint)
mkdirSync(OUT, { recursive: true });

// ── Políticas ──────────────────────────────────────────────────────────────
// Parâmetros só de COMPORTAMENTO (quando/quanto gastar), nunca de balanceamento.
export const POLICIES = {
  casual: {
    trainChance: 0.65, maxSessions: 1, intensity: () => 'moderado', minEnergyTrain: 35,
    registerChance: 0.5, tierPick: 'random',
    sponsorChance: 0.4, sponsorPick: 'first',
    coachChance: 0.3, coachIncomeShare: 0.6, coachReserveMonths: 2,
    staffChance: 0.25, staffIncomeShare: 0.5, staffReserveMonths: 2, staffPriority: null,
    shopChance: 0.3, shopMaxCashShare: 0.5, shopPick: 'random',
    invest: false, partnerPick: 'random', strategy: 'balanced', trainReserve: 0, respectMinRanking: false, pressChance: 0.3, pressStyle: 'random', coachUpgrade: false, renewChance: 0.5, renewDays: 60, renewMinPartnerShare: 0, taperDays: 0, trainReserveV2: 50,
  },
  normal: {
    trainChance: 0.95, maxSessions: 2, intensity: (p) => ((p.energy || 0) > 70 ? 'moderado' : 'leve'), minEnergyTrain: 45,
    registerChance: 1, tierPick: 'best-eligible',
    sponsorChance: 1, sponsorPick: 'best',
    coachChance: 1, coachIncomeShare: 0.4, coachReserveMonths: 3,
    staffChance: 1, staffIncomeShare: 0.3, staffReserveMonths: 3, staffPriority: ['physio', 'physical_trainer', 'manager', 'analyst', 'nutritionist', 'psychologist', 'accountant'],
    shopChance: 1, shopMaxCashShare: 0.3, shopPick: 'value',
    invest: false, partnerPick: 'compat', strategy: 'balanced', trainReserve: 50, respectMinRanking: true, pressChance: 0.8, pressStyle: 'positive', coachUpgrade: true, renewChance: 1, renewDays: 120, renewMinPartnerShare: 0.6, taperDays: 3, partnerPickV2: 'recommended', tierPickV2: 'best-fit', renewVsMarket: 0.9,
  },
  optimizer: {
    trainChance: 1, maxSessions: 3, intensity: (p) => ((p.energy || 0) > 75 && (p.fatigue || 0) < 50 ? 'intenso' : 'moderado'), minEnergyTrain: 55,
    registerChance: 1, tierPick: 'best-fit',
    sponsorChance: 1, sponsorPick: 'best',
    coachChance: 1, coachIncomeShare: 0.6, coachReserveMonths: 2,
    staffChance: 1, staffIncomeShare: 0.4, staffReserveMonths: 2, staffPriority: ['manager', 'physio', 'physical_trainer', 'accountant', 'analyst', 'nutritionist', 'psychologist'],
    shopChance: 1, shopMaxCashShare: 0.8, shopPick: 'best',
    invest: true, partnerPick: 'strongest', strategy: 'balanced', trainReserve: 40, respectMinRanking: true, pressChance: 1, pressStyle: 'appeal', coachUpgrade: true, renewChance: 1, renewDays: 180, renewMinPartnerShare: 0.6, taperDays: 4,
  },
};

const INCOME = ['prize', 'match_reward', 'sponsor_monthly', 'sponsor_signing', 'missions', 'achievements', 'investment_income', 'passive_income', 'other_income'];
const EXPENSE = ['coach', 'staff', 'club_fee', 'partner_salary', 'reward_overwrite', 'maintenance', 'training', 'equipment', 'entry_fee', 'coach_signing', 'staff_signing', 'other_expense'];

function monthKey(date) { return String(date).slice(0, 7); }

// ── Playthrough 5.27-D: checkpoint com checksum, heartbeat e watchdog ───────
// Formato: <JSON>\n#sha256:<hex do JSON>. O anterior vira .prev antes da troca
// atômica; um arquivo inválido NUNCA é retomado em silêncio: tenta-se o .prev
// (estado anterior, igualmente determinístico) e, sem nenhum válido, o processo
// sai com 5 para o orquestrador marcar o job como FAILED.
const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');
function parseCheckpointFile(file) {
  if (!existsSync(file)) return { ok: false, reason: 'missing' };
  const text = readFileSync(file, 'utf8');
  const cut = text.lastIndexOf('\n#sha256:');
  if (cut < 0) {
    // Formato antigo (5.26-C/5.27-C) só com opt-in explícito.
    if (process.env.PL527D_ALLOW_LEGACY_CKPT === '1') { try { return { ok: true, payload: JSON.parse(text) }; } catch (e) { return { ok: false, reason: e.message }; } }
    return { ok: false, reason: 'no-checksum' };
  }
  const body = text.slice(0, cut);
  if (sha256Hex(body) !== text.slice(cut + 9).trim()) return { ok: false, reason: 'checksum-mismatch' };
  try { return { ok: true, payload: JSON.parse(body) }; } catch (e) { return { ok: false, reason: e.message }; }
}
function readVerifiedCheckpoint(file) {
  if (!existsSync(file) && !existsSync(`${file}.prev`)) return null;
  const main = parseCheckpointFile(file);
  if (main.ok) return main.payload;
  const prev = parseCheckpointFile(`${file}.prev`);
  if (prev.ok) {
    console.error(`[ckpt] ${file} inválido (${main.reason}); retomando do .prev (dia ${prev.payload.day})`);
    prev.payload.out.checkpointRecoveries = (prev.payload.out.checkpointRecoveries || 0) + 1;
    return prev.payload;
  }
  console.error(`[ckpt] CHECKPOINT_CORRUPT ${file}: ${main.reason} / .prev: ${prev.reason}`);
  process.exit(5);
}
// Progresso legível pelo heartbeat (nenhuma leitura de Date/Math.random do jogo:
// o relógio real vem de __plRealDate para não avançar o relógio determinístico).
const progress = (globalThis.__pl527dProgress = { day: 0, date: null, phase: 'boot', segmentStartDay: 0 });
const realNowIso = () => new (globalThis.__plRealDate || Date)().toISOString();
function startHeartbeat() {
  // performance.now(), nunca Date.now(): Date é o relógio determinístico do jogo.
  const file = process.env.PL527D_HEARTBEAT;
  if (!file) return;
  const every = Number(process.env.PL527D_HEARTBEAT_MS || 60000);
  const stallMs = Number(process.env.PL527D_STALL_MS || 15 * 60000);
  let lastDay = -1; let lastChange = performance.now(); let stallReported = false;
  const beat = () => {
    if (progress.day !== lastDay) { lastDay = progress.day; lastChange = performance.now(); stallReported = false; }
    const mu = process.memoryUsage();
    const hb = { pid: process.pid, at: realNowIso(), job: process.env.PL527D_JOB || null, day: progress.day, date: progress.date, season: progress.date ? Number(String(progress.date).slice(0, 4)) : null, phase: progress.phase, segmentStartDay: progress.segmentStartDay, rssMB: Math.round(mu.rss / 1048576), heapMB: Math.round(mu.heapUsed / 1048576), stalledForMs: performance.now() - lastChange };
    try { writeFileSync(`${file}.tmp`, JSON.stringify(hb)); renameSync(`${file}.tmp`, file); } catch { /* heartbeat é melhor-esforço */ }
    // Soft-lock: registra estado ANTES de qualquer kill (quem decide matar é o orquestrador).
    if (!stallReported && performance.now() - lastChange >= stallMs) {
      stallReported = true;
      try { writeFileSync(resolve(dirname(file), `stall-day${progress.day}.json`), JSON.stringify({ heartbeat: hb, report: process.report?.getReport?.() ?? null }, null, 1)); } catch { /* idem */ }
    }
  };
  beat();
  setInterval(beat, every).unref();
}
startHeartbeat();

async function simulateCareer(seed) {
  const policy = POLICIES[PROFILE];
  const seedText = `${PROFILE}-526-${seed}`;
  installDeterminism(seedText);
  // RNG de política com estado exportável (mesma sequência do mulberry32).
  const rngBox = { s: hashSeed(`policy:${seedText}`) >>> 0 };
  const rng = () => { rngBox.s |= 0; rngBox.s = (rngBox.s + 0x6D2B79F5) | 0; let t = Math.imul(rngBox.s ^ (rngBox.s >>> 15), 1 | rngBox.s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ckptFile = CHECKPOINT_EVERY > 0 ? resolve(OUT, '.checkpoints', `${PROFILE}-${String(seed).padStart(3, '0')}.json`) : null;
  const resume = ckptFile && !FORCE ? readVerifiedCheckpoint(ckptFile) : null;
  // 5.27-D: o fluxo do RNG precisa ser o mesmo caminho (isolado do Vite ou não).
  if (resume && Boolean(resume.isolateViteRng) !== (process.env.PL527D_ISOLATE_VITE_RNG === '1')) {
    console.error(`[${PROFILE} ${seed}] CHECKPOINT_RNG_MODE_MISMATCH: checkpoint isolateViteRng=${Boolean(resume.isolateViteRng)}`);
    process.exit(5);
  }
  if (resume && (resume.policyVersion || 'v1') !== POLICY_VERSION) {
    console.error(`[${PROFILE} ${seed}] CHECKPOINT_POLICY_MISMATCH: checkpoint=${resume.policyVersion || 'v1'} ambiente=${POLICY_VERSION}`);
    process.exit(5);
  }
  if (resume && (resume.preset ?? null) !== (process.env.PL527_PRESET || null)) {
    console.error(`[${PROFILE} ${seed}] CHECKPOINT_PRESET_MISMATCH: checkpoint=${resume.preset} ambiente=${process.env.PL527_PRESET || null}`);
    process.exit(5);
  }
  if (resume) restoreLocalStore(resume.localStore); else restoreLocalStore({});
  const files = resume ? new Map(Object.entries(resume.files)) : new Map();
  let storage = new MemoryStorage(files);
  let rt = await bootRuntime(storage);
  let A = await act.loadActionModules(rt);
  const started = performance.now();
  let careerId; let profile; let recommended; let ledger; let out;
  if (resume) {
    // Retomada: mesma sequência do reloadRuntime() feito no checkpoint.
    careerId = resume.careerId;
    const loaded = await rt.careerManager.loadCareer(careerId);
    rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
    if (resume.detState) globalThis.__pl526Det.setState(resume.detState);
    if (resume.adapterTimers) Object.assign(rt.runtime.activeCareerAdapter, resume.adapterTimers);
    rngBox.s = resume.rngState;
    recommended = resume.recommended; ledger = resume.ledger; out = resume.out;
    profile = await rt.localGame.entities.PlayerProfile.get(out.profileId);
    out.reloads += 1; out.resumes = (out.resumes || 0) + 1;
  } else {
  const created = await createRealCareer(rt, { saveName: `Audit ${seedText}` });
  careerId = created.careerId;
  const initial = created.profile;
  const sides = ['direita', 'esquerda'];
  const styles = A.initialProfiles.PLAY_STYLE_OPTIONS.map((o) => o.id);
  const ob = await act.completeOnboarding(rt, A, initial, { side: sides[Math.floor(rng() * 2)], style: styles[Math.floor(rng() * styles.length)], name: `Atleta ${seed}` });
  profile = ob.profile;
  recommended = ob.build.recommended_attributes || [];

  ledger = {}; // month -> { opening, closing, income{}, expense{}, transfers }
  out = { profileId: profile.id, profile: PROFILE, seed, careerId, startDate: profile.career_date, birthDate: profile.birth_date, difficulty: profile.career_difficulty, archetype: ob.build.archetype_id, weekly: [], matches: [], tournaments: [], sponsors: [], coaches: [], staff: [], purchases: [], registrations: [], investments: [], partners: [], forfeits: 0, reloads: 0, errors: [], residualSites: {}, advanceFailures: [], dismissals: [], dismissalBlocked: [], partnerLog: [], resignLoopEvents: 0, resignLoopSamples: [], renewals: [], reloadMismatches: [], residualEvents: [], partnerSearchFailures: {}, press: [], registrationFailures: {}, softLock: { firstDate: null, firstDay: null, fires: 0, ids: [] } };
  }
  // 5.26-C: registro de que ALGUM segmento rodou com o shim (a re-auditoria
  // limpa exige false em todas as carreiras).
  out.shimEver = Boolean(out.shimEver) || process.env.PL526_SHIM === '1';
  const ensureMonth = (m, coins) => { if (!ledger[m]) ledger[m] = { opening: coins, closing: coins, income: Object.fromEntries(INCOME.map((k) => [k, 0])), expense: Object.fromEntries(EXPENSE.map((k) => [k, 0])), transfers: 0 }; return ledger[m]; };
  const book = (date, kind, category, amount) => {
    if (!amount) return;
    const L = ensureMonth(monthKey(date), profile.coins || 0);
    if (kind === 'income') L.income[category] = (L.income[category] || 0) + amount;
    else if (kind === 'expense') L.expense[category] = (L.expense[category] || 0) + amount;
    else L.transfers += amount;
  };
  // Atribui uma variação de moedas a categorias; o resíduo vai para other_*.
  const settle = (date, delta, parts) => {
    let explained = 0;
    for (const [kind, category, amount] of parts) {
      if (!amount) continue;
      book(date, kind, category, amount);
      explained += kind === 'income' ? amount : kind === 'expense' ? -amount : amount;
    }
    const residual = delta - explained;
    if (residual) {
      // Diagnóstico: de que passo do loop veio o resíduo (linha do chamador).
      const site = (new Error().stack.split('\n')[2] || '').match(/:(\d+):\d+\)?$/)?.[1] || '?';
      out.residualSites[site] = (out.residualSites[site] || 0) + residual;
    }
    if (residual > 0) book(date, 'income', 'other_income', residual);
    else if (residual < 0) book(date, 'expense', 'other_expense', -residual);
  };
  const refresh = async () => { profile = await rt.localGame.entities.PlayerProfile.get(profile.id); return profile; };
  const avgMonthlyIncome = () => {
    const months = Object.keys(ledger).sort().slice(-4, -1);
    if (!months.length) return 0;
    // Casual olha a receita total do mês (inclui luvas/conquistas pontuais);
    // normal/otimizador consideram só a receita RECORRENTE ao assumir salários.
    // 5.27-E (política v2): o casual também orça salários pela receita
    // RECORRENTE — luvas/conquistas pontuais não pagam folha mensal.
    const keys = PROFILE === 'casual' && !POLICY_V2PLUS ? INCOME : ['prize', 'match_reward', 'sponsor_monthly', 'investment_income', 'passive_income'];
    return months.reduce((s, m) => s + keys.reduce((a, k) => a + (Number(ledger[m].income[k]) || 0), 0), 0) / months.length;
  };
  const avgMonthlyExpense = () => {
    const months = Object.keys(ledger).sort().slice(-4, -1);
    if (!months.length) return 0;
    return months.reduce((s, m) => s + Object.values(ledger[m].expense).reduce((a, b) => a + b, 0), 0) / months.length;
  };
  let investedBalance = resume ? resume.investedBalance : 0;
  const bookedCloses = new Set(resume ? resume.bookedCloses : []);
  const difficultyConfig = await rt.load('/src/gameplay/difficulty/difficultyConfig.js');
  const difficultyCostMultiplier = (p) => Number(difficultyConfig.getDifficultyModifier(p, 'costMultiplier')) || 1;
  const bookedTx = new Set(resume ? resume.bookedTx : []);
  const seenTx = new Set(resume ? resume.seenTx : []); let dayNewTx = [];
  // Prêmios de torneio já contabilizados pelo fluxo de partida (não recontar no avanço do dia).
  const markTournamentTxBooked = async () => { for (const t of ((await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profile.id, category: 'torneio' }).catch(() => [])) || [])) bookedTx.add(t.id); }; // ids de FinancialTransaction (parceria) já contabilizados — só memória
  const startOrd = new Date(`${out.startDate}T00:00:00Z`).getTime();
  const dayOf = (date) => Math.round((new Date(`${date}T00:00:00Z`).getTime() - startOrd) / 86400000);
  // 5.27-I (PL527I_FIELD_DIAG=1): composição de cada campo montado para o
  // jogador (quantis de OVR/rank/fit/força) — só observa o jogo.
  if (process.env.PL527I_FIELD_DIAG === '1') {
    const q = (vals) => { const s = vals.filter((x) => x != null).sort((a, b) => a - b); const at = (p) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] * 10) / 10 : null); return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) }; };
    globalThis.__PL527I_FIELD_OBSERVER = (f) => {
      (out.fieldDiag ||= []).push({
        day: dayOf(profile.career_date), tournamentId: f.tournamentId, tier: f.tier, need: f.need, orderedSize: f.orderedSize, preferredSize: f.preferredSize, eligibleSize: f.eligibleSize, offset: f.offset, rescue: f.rescue,
        preferredInField: f.field.filter((x) => x.preferred).length,
        ovr: q(f.field.map((x) => x.ovr)), rank: q(f.field.map((x) => x.rank)), fit: q(f.field.map((x) => x.fit)), strength: q(f.field.map((x) => x.strength)),
      });
    };
  }
  ensureMonth(monthKey(profile.career_date), profile.coins || 0);

  // Mesma regra do jogo (partnerAthlete.js): partner_bot_id || athlete_b_id.
  async function partnerAthleteOf(partnership) {
    const id = partnership ? (partnership.partner_bot_id || partnership.athlete_b_id) : null;
    return id ? rt.localGame.entities.AthleteProfile.get(id).catch(() => null) : null;
  }

  async function snapshot() {
    const p = await refresh();
    const [wr, contracts, hires, inv, partnership] = await Promise.all([
      rt.padel.getWorldRank(p).catch(() => ({ rank: 0 })),
      rt.localGame.entities.PlayerContract.filter({ profile_id: p.id, is_active: true }).catch(() => []),
      rt.localGame.entities.PlayerStaffHire.filter({ profile_id: p.id }).catch(() => []),
      rt.localGame.entities.PlayerInventory.filter({ profile_id: p.id }).catch(() => []),
      A.partnership.getActivePartnership(p.id).catch(() => null),
    ]);
    const partnerAthlete = await partnerAthleteOf(partnership);
    const team = partnerAthlete ? await A.teamRanking.getTeamRank(p, partnerAthlete).catch(() => null) : null;
    // 5.27-J: linha do tempo da saída decidida (estado do jogo, só leitura).
    // Um episódio por decisão de saída; se a dupla volta a "não decidida"
    // (renovação), o episódio fecha como revertido.
    {
      const open = (out.exitEvents ||= []).find((e) => e.partnershipId === partnership?.id && !e.closed);
      const exitNow = partnership && ['nao_renovara', 'encerrar_ao_final', 'encerra_apos_compromisso'].includes(partnership.contract_status);
      const snap = exitNow ? { status: partnership.contract_status, separationScheduled: partnership.separation_scheduled_date || null } : null;
      if (exitNow && !open) out.exitEvents.push({ partnershipId: partnership.id, firstSeenDay: dayOf(p.career_date), exitDecidedAt: partnership.exit_decided_at || null, nominalEnd: String(partnership.contract_end_date || partnership.scheduled_end_date || '').slice(0, 10) || null, ...snap, scheduleHistory: [snap.separationScheduled].filter(Boolean) });
      else if (exitNow) { open.status = snap.status; if (snap.separationScheduled && open.scheduleHistory.at(-1) !== snap.separationScheduled) open.scheduleHistory.push(snap.separationScheduled); open.separationScheduled = snap.separationScheduled; }
      else if (open && partnership) { open.closed = true; open.revertedDay = dayOf(p.career_date); open.revertedTo = partnership.contract_status || null; }
      for (const e of out.exitEvents.filter((x) => !x.closed && x.partnershipId !== partnership?.id)) { e.closed = true; e.endedDay = dayOf(p.career_date); }
    }
    // 5.27-H (PL527H_PARTNER_QUALITY=1): qualidade do parceiro por marco
    // (início, 3m, 6m, 9m, 1a, 18m, 2a). Só lê o mercado da Busca — nada é
    // decidido e nenhum rng() é sorteado.
    if (process.env.PL527H_PARTNER_QUALITY === '1') {
      const d = dayOf(p.career_date);
      const mark = [0, 90, 180, 270, 365, 545, 730].filter((m) => d >= m && !(out.partnerQuality || []).some((q) => q.mark === m)).at(-1);
      if (mark != null) {
        const market = await act.buildSearchPool(rt, A, p).catch(() => []);
        const ovrs = market.map((r) => act.ovrOf(r.candidate));
        const bestRow = market.reduce((b, r) => (!b || act.ovrOf(r.candidate) > act.ovrOf(b.candidate) ? r : b), null);
        const relationships = partnerAthlete ? (await A.relationships.getPlayerRelationships(p.id).catch(() => [])) || [] : [];
        const cc = partnerAthlete ? A.partnership.computeCompatibility(p, partnerAthlete, relationships) : null;
        const playerOvr = act.ovrOf(p); const partnerOvr = act.ovrOf(partnerAthlete);
        (out.partnerQuality ||= []).push({
          mark, day: d, playerOvr, partnerOvr, teamOvr: partnerAthlete ? Math.round(((playerOvr + partnerOvr) / 2) * 10) / 10 : null,
          compatibility: cc ? Number(cc?.total ?? cc) || 0 : null, salary: Number(partnership?.monthly_salary ?? partnership?.salary) || 0,
          bestAttainableOvr: ovrs.length ? Math.max(...ovrs) : null, bestAttainableCompat: bestRow ? bestRow.offer.compatibility : null,
          marketSize: market.length, attainableAtLeastPlayer: ovrs.filter((o) => o >= playerOvr).length,
        });
      }
    }
    const activeHires = (hires || []).filter((h) => !['terminated', 'expired'].includes(h.contract_status));
    out.weekly.push({
      day: dayOf(p.career_date), date: p.career_date, rank: wr?.rank || null, teamRank: team?.rank || null, racePoints: Number(p.race_points) || 0,
      rankPoints: Number(p.rank_points ?? p.world_ranking_points) || 0, ovr: act.ovrOf(p), attrs: Object.fromEntries(['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'].map((k) => [k, Number(p[k]) || 0])),
      coins: Number(p.coins) || 0, invested: investedBalance, fans: Number(p.fan_appeal) || 0, reputation: Number(p.reputation) || 0, careerLevel: Number(p.career_level) || 1, xp: Number(p.xp) || 0,
      sponsors: (contracts || []).length, sponsorMonthly: (contracts || []).reduce((s, c) => s + (Number(c.monthly_salary) || 0), 0),
      coachSalary: p.coach_id && p.coach_contract_status !== 'terminated' ? Number(p.coach_monthly_salary) || 0 : 0,
      staff: activeHires.length, staffMonthly: activeHires.reduce((s, h) => s + (Number(h.monthly_cost) || 0), 0),
      gearOwned: (inv || []).length, gearEquipped: (inv || []).filter((i) => i.equipped).length,
      partnerOvr: act.ovrOf(partnerAthlete), partnerRankPts: Number(partnerAthlete?.world_ranking_points) || 0,
      energy: Number(p.energy) || 0, fatigue: Number(p.fatigue) || 0, injured: rt.padel.isInjured(p),
      // Tamanho do maior arquivo do storage (= save da carreira), em MB.
      rankingPositionField: p.ranking_position ?? null, sponsorAppeal: Number(p.sponsor_appeal) || 0,
      // 5.26-B: idade canônica (data da carreira) e maior raridade da loja liberada pelo próprio jogo.
      age: rt.padel.calculateAge(p),
      shopUnlockedRarity: ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'].filter((rar) => A.store.getShopItemAccess(p, A.store.normalizeShopItem({ rarity: rar, name: rar }))?.unlocked).at(-1) || null,
      saveMB: Math.round(Math.max(0, ...[...files.values()].map((v) => String(v).length)) / 10485.76) / 100,
    });
  }

  const pickers = {
    random: (rows) => rows[Math.floor(rng() * rows.length)],
    compat: (rows) => [...rows].sort((a, b) => (Number(b.offer.compatibility ?? b.offer.compatibility_score) || 0) - (Number(a.offer.compatibility ?? a.offer.compatibility_score) || 0))[0],
    // 5.27-E (política v2 do normal): aceita a proposta que a tela destaca como
    // recomendada (maior score real do jogo); sem destaque (busca), compatibilidade.
    recommended: (rows) => rows.find((r) => r.offer?.recommended) || (POLICY_V3PLUS ? pickers.balanced(rows) : pickers.compat(rows)),
    // 5.27-G (política v2 do normal na Busca): equilíbrio compatibilidade × força
    // relativa ao próprio nível × custo (scripts/lib/v527gPartnerScore.mjs).
    balanced: (rows) => [...rows].map((r) => {
      const terms = (() => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, r.candidate); } catch { return {}; } })();
      const compatibility = Number(r.offer?.compatibility ?? r.offer?.compatibility_snapshot?.total ?? r.offer?.compatibility_score) || 0;
      return { r, s: normalPartnerScore({ compatibility, candidateOvr: act.ovrOf(r.candidate), playerOvr: act.ovrOf(profile), coins: profile.coins, salary: terms.monthlySalary, prizeSplit: terms.prizeSplit }) };
    }).sort((a, b) => b.s - a.s)[0]?.r,
    // 5.27-I (v4, só otimizador): força da dupla entre os parceiros que o caixa sustenta.
    optimizer: (rows) => pickOptimizerPartner(rows, { coins: profile.coins, ovrOf: act.ovrOf, termsOf: (c) => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, c); } catch { return {}; } } }),
    strongest: (rows) => [...rows].sort((a, b) => (Number(b.candidate.world_ranking_points ?? b.candidate.ranking_points) || act.ovrOf(b.candidate) || 0) - (Number(a.candidate.world_ranking_points ?? a.candidate.ranking_points) || act.ovrOf(a.candidate) || 0))[0],
  };

  async function partnerStep() {
    const before = profile.coins || 0;
    const pickName = OPTIMIZER_V4 ? 'optimizer' : POLICY_V2PLUS && policy.partnerPickV2 ? policy.partnerPickV2 : policy.partnerPick;
    const r = await act.ensurePartner(rt, A, profile, pickers[pickName]);
    await refresh();
    settle(profile.career_date, (profile.coins || 0) - before, []);
    if (!r.changed) { const k = r.blocked ? `bloqueada:${r.blocked}` : r.error ? `erro:${String(r.error).slice(0, 80)}` : `pool:${r.offers ?? 0}:${r.via || 'offer'}`; out.partnerSearchFailures[k] = (out.partnerSearchFailures[k] || 0) + 1; }
    // 5.26-C: detector do laço de re-contratação (mesmo parceiro assinado de novo ≤ 2 dias depois).
    if (r.changed) {
      const pid = r.partnership ? (r.partnership.partner_bot_id || r.partnership.athlete_b_id) : null;
      const last = out.partners.at(-1);
      if (last && last.partnerId === pid && dayOf(profile.career_date) - last.day <= 2) {
        out.resignLoopEvents += 1;
        if (out.resignLoopSamples.length < 5) {
          const rows = (await rt.localGame.entities.Partnership.filter({ profile_id: profile.id }).catch(() => [])) || [];
          out.resignLoopSamples.push({ date: profile.career_date, partner: pid, rows: rows.slice(-4).map((x) => ({ id: x.id, status: x.status, contract: x.contract_status, start: x.started_career_date, end: x.contract_end_date, ended: x.ended_career_date || null, reason: x.end_reason || null })) });
        }
      }
    }
    if (r.changed) out.partners.push({ day: dayOf(profile.career_date), date: profile.career_date, offers: r.offers, partnerId: r.partnership ? (r.partnership.partner_bot_id || r.partnership.athlete_b_id) : null, via: r.via || "offer", partnerOvr: act.ovrOf(r.candidate), partnerPts: Number(r.candidate?.world_ranking_points) || 0 });
  }

  async function weeklyDecisions() {
    // Navegação: praticamente toda página chama ensureMyProfile no mount — é
    // ele que recalcula level/career_level a partir do XP (padel.js).
    await rt.padel.ensureMyProfile(await rt.localGame.auth.me()).catch(() => null);
    await refresh();
    // Imprensa (Press.jsx): única fonte de fãs do jogador.
    if (rng() < policy.pressChance) {
      const score = { random: () => rng(), positive: (a) => (a.effects?.fan_appeal || 0) + (a.effects?.reputation || 0), appeal: (a) => (a.effects?.fan_appeal || 0) + (a.effects?.sponsor_appeal || 0) }[policy.pressStyle];
      const chooseAnswer = (q) => [...(q.answers || [])].sort((x, y) => score(y) - score(x))[0];
      const before = profile.coins || 0;
      try {
        const r = await act.answerPendingInterviews(rt, A, profile, { chooseAnswer, max: 3 });
        for (const a of r.answered) out.press.push({ day: dayOf(profile.career_date), date: profile.career_date, ...a });
      } catch (e) { out.errors.push(`imprensa:${e.message}`.slice(0, 120)); }
      await refresh();
      settle(profile.career_date, (profile.coins || 0) - before, []);
    }
    const income = avgMonthlyIncome();
    const expense = avgMonthlyExpense();
    const wr = await rt.padel.getWorldRank(profile).catch(() => ({ rank: 0 }));
    // Corte de custos quando o caixa está negativo (botões Demitir/Dispensar
    // de Staff.jsx/Coaches.jsx): normal/otimizador reagem na 1ª semana
    // negativa; casual só depois de 3 semanas seguidas no vermelho.
    negativeWeeks = (profile.coins || 0) < 0 ? negativeWeeks + 1 : 0;
    if (negativeWeeks >= (PROFILE === 'casual' ? 3 : 1)) {
      const hires = ((await rt.localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id }).catch(() => [])) || [])
        .filter((h) => !['terminated', 'expired'].includes(h.contract_status)).sort((a, b) => (Number(b.monthly_cost) || 0) - (Number(a.monthly_cost) || 0));
      const coachSalary = profile.coach_id && profile.coach_contract_status !== 'terminated' ? Number(profile.coach_monthly_salary) || 0 : 0;
      const before = profile.coins || 0;
      try {
        if (hires[0] && (Number(hires[0].monthly_cost) || 0) >= coachSalary) {
          await act.fireStaffMember(rt, A, profile, hires[0]);
          out.dismissals.push({ day: dayOf(profile.career_date), date: profile.career_date, type: hires[0].staff_type || hires[0].role || 'staff', monthly: Number(hires[0].monthly_cost) || 0, coins: before });
        } else if (coachSalary > 0) {
          await act.fireCoach(rt, profile);
          out.dismissals.push({ day: dayOf(profile.career_date), date: profile.career_date, type: 'coach', monthly: coachSalary, coins: before });
        }
      } catch (e) {
        // Rescisão de staff exige pagar multa; sem caixa a tela recusa. O
        // jogador então dispensa o treinador (sem custo), se houver.
        out.dismissalBlocked.push({ date: profile.career_date, reason: String(e.message).slice(0, 80) });
        if (coachSalary > 0) {
          await act.fireCoach(rt, profile).catch(() => null);
          out.dismissals.push({ day: dayOf(profile.career_date), date: profile.career_date, type: 'coach', monthly: coachSalary, coins: before, afterBlockedStaff: true });
        }
      }
      await refresh();
      settle(profile.career_date, (profile.coins || 0) - before, []);
    }
    // Renovação da dupla (PartnerHub ContractPanel → renewPartnerContract).
    {
      const ps = await A.partnership.getActivePartnership(profile.id).catch(() => null);
      const end = String(ps?.contract_end_date || ps?.scheduled_end_date || '').slice(0, 10);
      const daysLeft = end ? Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${profile.career_date}T00:00:00Z`)) / 86400000) : null;
      if (ps && daysLeft != null && daysLeft <= 14 && A.partnerLifecycle.getContractDecisionState(ps) === A.partnerLifecycle.CONTRACT_DECISION_STATES.UNDECIDED) {
        const partner = await partnerAthleteOf(ps);
        const share = act.ovrOf(partner) / Math.max(1, act.ovrOf(profile));
        // 5.27-G (política v3 do normal): renovar também passa pela pontuação
        // equilibrada — só renova se o parceiro atual estiver a até
        // (1 − renewVsMarket) do melhor candidato da Busca. Medido na v2: a regra
        // só de razão de OVR renovava um parceiro de ~35 com o jogador em ~54 e o
        // mercado oferecendo 79–84 (diferença de 25–34 pontos aos 12 meses).
        let marketOk = true;
        // 5.27-I (v4, só otimizador): renova só se o atual estiver a até
        // OPTIMIZER_V4.renewMarginOvr do melhor parceiro alcançável e sustentável
        // da Busca; a razão de OVR (que renovava 40 com 82–91 no mercado) sai.
        let shareOk = share >= policy.renewMinPartnerShare;
        if (OPTIMIZER_V4) {
          const market = await act.buildSearchPool(rt, A, profile).catch(() => []);
          const termsOf = (c) => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, c); } catch { return {}; } };
          const v = optimizerShouldRenew({ currentOvr: act.ovrOf(partner), market, coins: profile.coins, termsOf, ovrOf: act.ovrOf });
          marketOk = v.renew; shareOk = true;
          (out.renewalMarketChecks ||= []).push({ day: dayOf(profile.career_date), current: act.ovrOf(partner), best: v.bestAffordableOvr, affordable: v.affordableCount, renew: v.renew, policy: 'optimizer-v4' });
        }
        if (POLICY_V3PLUS && policy.renewVsMarket) {
          const scoreOf = (cand, compatibility) => {
            const t = (() => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, cand); } catch { return {}; } })();
            return normalPartnerScore({ compatibility, candidateOvr: act.ovrOf(cand), playerOvr: act.ovrOf(profile), coins: profile.coins, salary: t.monthlySalary, prizeSplit: t.prizeSplit });
          };
          const market = await act.buildSearchPool(rt, A, profile).catch(() => []);
          const best = Math.max(0, ...market.map((r) => scoreOf(r.candidate, Number(r.offer?.compatibility) || 0)));
          const relationships = (await A.relationships.getPlayerRelationships(profile.id).catch(() => [])) || [];
          const cc = A.partnership.computeCompatibility(profile, partner, relationships);
          const current = scoreOf(partner, Number(cc?.total ?? cc) || 0);
          marketOk = !market.length || current >= best * policy.renewVsMarket;
          (out.renewalMarketChecks ||= []).push({ day: dayOf(profile.career_date), current: Math.round(current), best: Math.round(best), renew: marketOk });
        }
        // 5.27-H: registra TODA decisão de renovação (inclusive a recusa), só
        // leitura — o rng() continua sendo sorteado uma vez, primeiro, como antes.
        const renewRoll = rng();
        const renewDecision = renewRoll < policy.renewChance && shareOk && marketOk;
        (out.renewalDecisions ||= []).push({ day: dayOf(profile.career_date), partnershipId: ps.id || null, daysLeft, renew: renewDecision, reason: renewDecision ? 'renew' : !(renewRoll < policy.renewChance) ? 'chance' : !shareOk ? 'share' : 'market', partnerOvr: act.ovrOf(partner), playerOvr: act.ovrOf(profile) });
        if (OPTIMIZER_V4 && !renewDecision) out.optimizerLeavingPartnershipId = ps.id;
        if (renewDecision) {
          const before = profile.coins || 0;
          const res = await A.partnerLifecycle.renewPartnerContract(profile, { durationDays: policy.renewDays, prizeSplit: ps.prize_split_pct ?? 50 }).catch((e) => ({ error: e.message }));
          await refresh();
          settle(profile.career_date, (profile.coins || 0) - before, []);
          out.renewals.push({ day: dayOf(profile.career_date), date: profile.career_date, outcome: res?.decision?.outcome || (res?.error ? `erro:${res.error}`.slice(0, 60) : 'aceita'), partnerOvr: act.ovrOf(partner), share: Math.round(share * 100) / 100 });
        }
      }
    }
    // Patrocínio.
    if (rng() < policy.sponsorChance) {
      const opts = await act.sponsorOptions(rt, A, profile);
      let rows = opts.signable;
      if (policy.sponsorPick === 'best') rows = [...rows].sort((a, b) => b.offer.monthly_salary - a.offer.monthly_salary);
      for (const row of rows.slice(0, policy.sponsorPick === 'first' ? 1 : 6)) {
        const before = profile.coins || 0;
        try {
          await act.signSponsor(rt, A, profile, row);
          await refresh();
          const delta = (profile.coins || 0) - before;
          settle(profile.career_date, delta, [['income', 'sponsor_signing', row.offer.sign_bonus]]);
          out.sponsors.push({ day: dayOf(profile.career_date), date: profile.career_date, sponsor: row.sponsor.id, tier: row.sponsor.tier, monthly: row.offer.monthly_salary, signBonus: row.offer.sign_bonus, duration: row.offer.duration_months, rank: wr?.rank || null, ovr: act.ovrOf(profile), fans: Number(profile.fan_appeal) || 0, xp: Number(profile.xp) || 0, coins: before, visible: opts.visible });
        } catch (e) { /* recusado pela regra real (slot/elegibilidade) */ }
      }
    }
    // Treinador principal.
    const hasCoach = Boolean(profile.coach_id && profile.coach_contract_status !== 'terminated');
    const upgradeWeek = policy.coachUpgrade && hasCoach && Math.floor(dayOf(profile.career_date) / 7) % 4 === 0;
    if (rng() < policy.coachChance && (!hasCoach || upgradeWeek)) {
      const opts = await act.coachOptions(rt, A, profile);
      const currentOverall = hasCoach ? Number(opts.hired?.overall) || 0 : -1;
      const affordable = opts.available.filter((c) => (!hasCoach || (Number(c.overall) || 0) >= currentOverall + 8)).filter((c) => {
        const salary = A.coaches.resolveCoachCanonicalSalary(c) || 0;
        const signing = Number(c.market_signing_bonus ?? c.sign_on_bonus) || 0;
        const incomeOk = income > 0 ? salary <= income * policy.coachIncomeShare : PROFILE === 'casual' && (profile.coins || 0) > salary * 4;
        return salary > 0 && incomeOk && (profile.coins || 0) >= signing + salary * policy.coachReserveMonths;
      }).sort((a, b) => (Number(b.overall) || 0) - (Number(a.overall) || 0));
      const coach = PROFILE === 'casual' ? affordable[Math.floor(rng() * affordable.length)] : affordable[0];
      if (coach) {
        const before = profile.coins || 0;
        try {
          if (hasCoach) await act.fireCoach(rt, profile);
          await act.hireCoach(rt, A, hasCoach ? await rt.localGame.entities.PlayerProfile.get(profile.id) : opts.profile, coach);
          await refresh();
          settle(profile.career_date, (profile.coins || 0) - before, [['expense', 'coach_signing', Math.max(0, before - (profile.coins || 0))]]);
          out.coaches.push({ day: dayOf(profile.career_date), date: profile.career_date, coach: coach.id, tier: coach.tier, overall: Number(coach.overall) || null, salary: A.coaches.resolveCoachCanonicalSalary(coach), upgrade: hasCoach, rank: wr?.rank || null, ovr: act.ovrOf(profile), coins: before, incomeEst: Math.round(income) });
        } catch (e) { out.errors.push(`coach:${e.message}`.slice(0, 120)); }
      }
    }
    // Staff.
    if (rng() < policy.staffChance) {
      const opts = await act.staffOptions(rt, A, profile);
      if (opts.freeSlots > 0) {
        let rows = opts.available.filter((c) => {
          const cost = Number(c.monthlyCost) || 0;
          // Orçamento TOTAL da folha de staff (não por contratação).
          const payroll = opts.activeHires.reduce((t, h) => t + (Number(h.monthly_cost) || 0), 0);
          const incomeOk = income > 0 ? payroll + cost <= income * policy.staffIncomeShare : PROFILE === 'casual' && (profile.coins || 0) > cost * 4;
          return incomeOk && (profile.coins || 0) >= cost * policy.staffReserveMonths;
        });
        if (policy.staffPriority) rows = rows.sort((a, b) => (policy.staffPriority.indexOf(a.roleId) + 99) % 99 - (policy.staffPriority.indexOf(b.roleId) + 99) % 99 || (b.quality || 0) - (a.quality || 0));
        const cand = PROFILE === 'casual' ? rows[Math.floor(rng() * rows.length)] : rows[0];
        if (cand) {
          const before = profile.coins || 0;
          try {
            await act.hireStaffMember(rt, A, profile, cand);
            await refresh();
            settle(profile.career_date, (profile.coins || 0) - before, [['expense', 'staff_signing', Math.max(0, before - (profile.coins || 0))]]);
            out.staff.push({ day: dayOf(profile.career_date), date: profile.career_date, role: cand.roleId, quality: cand.quality, tier: cand.tier, monthly: cand.monthlyCost, rank: wr?.rank || null, ovr: act.ovrOf(profile), coins: before, incomeEst: Math.round(income) });
          } catch (e) { out.errors.push(`staff:${e.message}`.slice(0, 120)); }
        }
      }
    }
    // Loja + equipar.
    if (rng() < policy.shopChance) {
      const shop = await act.shopOptions(rt, A, profile);
      const equippedByCat = Object.fromEntries(shop.equipped.map((i) => [i.category, shop.rows.find((r) => r.item.id === i.item_id)?.bonusTotal || 0]));
      const reserve = Math.max(0, expense * 2);
      let rows = shop.rows.filter((r) => r.unlocked && r.available && !r.owned && r.price > 0 && r.bonusTotal > (equippedByCat[r.item.category] || 0));
      rows = rows.filter((r) => (PROFILE === 'optimizer' ? r.price <= (profile.coins || 0) - reserve : r.price <= (profile.coins || 0) * policy.shopMaxCashShare));
      if (policy.shopPick === 'value') rows.sort((a, b) => b.bonusTotal / b.price - a.bonusTotal / a.price);
      if (policy.shopPick === 'best') rows.sort((a, b) => b.bonusTotal - a.bonusTotal || a.price - b.price);
      const row = policy.shopPick === 'random' ? rows[Math.floor(rng() * rows.length)] : rows[0];
      if (row) {
        const before = profile.coins || 0;
        const r = await act.buyAndEquip(rt, profile, row, shop.inventory);
        await refresh();
        if (r.bought) {
          settle(profile.career_date, (profile.coins || 0) - before, [['expense', 'equipment', row.price]]);
          out.purchases.push({ day: dayOf(profile.career_date), date: profile.career_date, item: row.item.id, name: row.item.name, category: row.item.category, rarity: row.item.rarity, price: row.price, bonusTotal: row.bonusTotal, coins: before, incomeEst: Math.round(income), rank: wr?.rank || null, ovr: act.ovrOf(profile) });
        }
      }
    }
    // Investimento (só o otimizador; opção de risco BAIXO visível na tela).
    if (policy.invest) {
      const reserve = Math.max(3000, expense * 3);
      const surplus = (profile.coins || 0) - reserve;
      if (surplus >= 5000) {
        const before = profile.coins || 0;
        const amount = Math.floor(surplus * 0.5);
        await act.invest(rt, A, profile, 'cdb', amount);
        await refresh();
        const moved = before - (profile.coins || 0);
        if (moved > 0) { investedBalance += moved; settle(profile.career_date, -moved, [['transfer', 'investment', -moved]]); out.investments.push({ day: dayOf(profile.career_date), date: profile.career_date, product: 'cdb', amount: moved }); }
      }
    }
    // Inscrição em torneio.
    if (rng() < policy.registerChance) {
      const partnership = await A.partnership.getActivePartnership(profile.id).catch(() => null);
      const partner = await partnerAthleteOf(partnership);
      // 5.27-I (v4, só otimizador): não assume torneio novo com o parceiro que
      // já decidiu deixar (renovação recusada / separação agendada) — o jogo
      // permite, mas cada inscrição empurra a separação para depois do evento.
      const leaving = OPTIMIZER_V4 && partnership && (partnership.id === out.optimizerLeavingPartnershipId || ['encerra_apos_compromisso', 'encerrar_ao_final', 'nao_renovara'].includes(String(partnership.contract_status || '')));
      if (leaving) out.optimizerSkippedRegistrations = (out.optimizerSkippedRegistrations || 0) + 1;
      if (partner && !leaving) {
        // CLOUD-6H: ranking e elegibilidade da DUPLA (mesma fonte da tela e de registerTournament),
        // inclusive Gold/Platinum/Masters por qualifying. Histórico: PL526_LEGACY_INDIVIDUAL_RANK_SELECTION=1.
        const teamRank = await act.resolveGameTeamRank(A, profile);
        const sel = act.selectionRankFilter(A, profile, teamRank, wr?.rank);
        let cands = (await act.registrationCandidates(rt, A, profile)).filter((t) => (Number(t.entry_fee) || 0) <= (profile.coins || 0))
          // Ranking mínimo é exibido no card do torneio; perfis atentos o respeitam.
          .filter((t) => !policy.respectMinRanking || sel.allows(t));
        const order = (t) => A.circuit.getTournamentTierConfig(t.tier)?.order ?? 0;
        // 5.27-E (política v2 do normal): escolhe pelo encaixe de rank que o jogo
        // expõe (como o otimizador), não sempre o tier aberto mais alto.
        const tierPick = POLICY_V2PLUS && policy.tierPickV2 ? policy.tierPickV2 : policy.tierPick;
        if (tierPick === 'random') cands = cands.sort(() => rng() - 0.5);
        else if (tierPick === 'best-eligible') cands = cands.sort((a, b) => order(b) - order(a));
        else cands = cands.sort((a, b) => {
          const fit = (t) => (A.circuit.isRankInTierDiagnosticCore?.(sel.rank, t.tier) ? 1 : 0);
          return fit(b) - fit(a) || order(b) - order(a);
        });
        for (const t of cands.slice(0, 6)) {
          const before = profile.coins || 0;
          const r = await act.tryRegister(rt, A, profile, t, partner);
          if (!r.ok) { const k = `${t.tier}|${String(r.reason || '?').slice(0, 80)}`; out.registrationFailures[k] = (out.registrationFailures[k] || 0) + 1; }
          if (r.ok) {
            await refresh();
            settle(profile.career_date, (profile.coins || 0) - before, [['expense', 'entry_fee', Number(t.entry_fee) || 0]]);
            // 5.27-J: estado da parceria NO MOMENTO da inscrição (corte temporal da saída).
            out.registrations.push({ day: dayOf(profile.career_date), date: profile.career_date, tournamentId: t.id, tier: t.tier, fee: Number(t.entry_fee) || 0, rank: wr?.rank || null, ovr: act.ovrOf(profile),
              partnershipId: partnership?.id || null, partnershipStatus: partnership?.contract_status || null, exitDecidedAt: partnership?.exit_decided_at || null,
              nominalEnd: String(partnership?.contract_end_date || partnership?.scheduled_end_date || '').slice(0, 10) || null, tournamentEnd: String(t.end_date || t.start_date || '').slice(0, 10) || null });
            break;
          }
        }
      }
    }
  }

  async function dailyTraining() {
    if (rt.padel.isInjured(profile)) return;
    // Playthrough 5.27-E — política v2 (PL527E_POLICY=v2): o jogador que planeja
    // (normal/otimizador) poupa energia antes e durante um torneio inscrito, com
    // a informação que a tela mostra (inscrição + datas + energia). Medido na
    // 5.27-D: a v1 treinava até a véspera e entrava com energia ~45–61; com
    // energia 55 o motor dá ~7% de vitórias contra ~52% com energia 100.
    const taperDays = POLICY_V2PLUS ? (policy.taperDays || 0) : 0;
    if (taperDays > 0) {
      const today = profile.career_date;
      const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + taperDays * 86400000).toISOString().slice(0, 10);
      const regs = (await rt.localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }).catch(() => [])) || [];
      const upcoming = regs.some((r) => !['cancelled', 'completed', 'withdrawn'].includes(r.status) && r.effective_start_date && r.effective_start_date <= horizon && (r.effective_end_date || r.effective_start_date) >= today);
      if (upcoming) { out.taperDays = (out.taperDays || 0) + 1; return; }
    }
    if (rng() >= policy.trainChance) return;
    const coachRes = await A.coachLifecycle.resolveActiveCoach(profile).catch(() => ({ coach: null }));
    for (let s = 0; s < policy.maxSessions; s += 1) {
      if ((profile.energy || 0) < policy.minEnergyTrain || Number(profile.trainings_today || 0) >= 3) break;
      const target = recommended.length ? recommended[Math.floor(rng() * recommended.length)] : null;
      const activities = A.training.TRAINING_ACTIVITIES.filter((a) => !target || a.attribute === target || (a.attributes && a.attributes[target]));
      const activity = PROFILE === 'casual' || !activities.length ? A.training.TRAINING_ACTIVITIES[Math.floor(rng() * A.training.TRAINING_ACTIVITIES.length)] : activities[Math.floor(rng() * activities.length)];
      const intensity = policy.intensity(profile);
      const cost = A.trainingEconomy.getTrainingCost(profile, intensity) || 0;
      // Reserva comportamental: o jogador não gasta o último dinheiro da inscrição.
      const reserve = POLICY_V2PLUS ? Math.max(policy.trainReserve || 0, policy.trainReserveV2 || 0) : (policy.trainReserve || 0);
      if ((profile.coins || 0) < cost + reserve) break;
      const before = profile.coins || 0;
      const r = await act.train(rt, A, profile, activity.id, intensity, coachRes.coach);
      await refresh();
      if (r.res?.error) break;
      settle(profile.career_date, (profile.coins || 0) - before, [['expense', 'training', cost]]);
    }
  }

  // Impressão digital do estado de jogo que um save/reload NÃO pode alterar.
  async function persistedStateFingerprint() {
    const E = rt.localGame.entities;
    const p = await E.PlayerProfile.get(profile.id);
    const fields = ['coins', 'xp', 'energy', 'fatigue', 'career_date', 'partner_id', 'coach_id', 'rank_points', 'race_points', 'fan_appeal', 'career_level', 'injury_status', 'serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
    const count = async (name, q) => ((await E[name].filter(q).catch(() => [])) || []).length;
    return {
      ...Object.fromEntries(fields.map((k) => [k, p?.[k] ?? null])),
      contracts: await count('PlayerContract', { profile_id: profile.id, is_active: true }),
      staff: await count('PlayerStaffHire', { profile_id: profile.id }),
      inventory: await count('PlayerInventory', { profile_id: profile.id }),
      registrations: await count('TournamentRegistration', { profile_id: profile.id }),
      partnerships: await count('Partnership', { profile_id: profile.id }),
      transactions: await count('FinancialTransaction', { profile_id: profile.id }),
      calendar: await count('CalendarEvent', { profile_id: profile.id }),
    };
  }

  async function reloadRuntime() {
    // Parte 66: persistir → destruir runtime → recarregar do storage → seguir.
    // O estado do RNG/relógio determinístico é preservado: o boot consome
    // Math.random (ids de módulos) e deslocaria a sequência da carreira.
    const detState = globalThis.__pl526Det?.getState();
    const stateBefore = await persistedStateFingerprint();
    await rt.close();
    rt = await bootRuntime(storage);
    A = await act.loadActionModules(rt);
    const loaded = await rt.careerManager.loadCareer(careerId);
    rt.runtime.activeCareerAdapter.setActiveCareer(loaded);
    const stateAfter = await persistedStateFingerprint();
    for (const k of Object.keys(stateBefore)) if (JSON.stringify(stateBefore[k]) !== JSON.stringify(stateAfter[k])) out.reloadMismatches.push({ date: profile.career_date, field: k, before: stateBefore[k], after: stateAfter[k] });
    if (detState) globalThis.__pl526Det.setState(detState);
    await refresh();
    out.reloads += 1;
  }

  let day = 0;
  let guard = 0;
  let stalls = 0;
  let negativeWeeks = 0;
  let lastWeek = -1;
  if (resume) ({ day, guard, stalls, negativeWeeks, lastWeek } = resume);
  progress.day = day; progress.segmentStartDay = day; progress.phase = 'loop';
  // 5.26-C: grava o estado COMPLETO da carreira (save sem backups + estado do
  // harness + RNG/relógio do jogo + RNG da política), de forma atômica.
  async function writeCheckpoint() {
    for (const k of [...files.keys()]) if (k.startsWith('backups/')) files.delete(k);
    out.checkpoints = (out.checkpoints || 0) + 1;
    // 5.27-D: preset/harness no payload (resume com preset errado é recusado).
    const payload = { version: 2, harness: '5.27-D', preset: process.env.PL527_PRESET || null, isolateViteRng: process.env.PL527D_ISOLATE_VITE_RNG === '1', policyVersion: POLICY_VERSION,
      // 5.27-D: temporizadores em memória do adapter (backup de rotina / sync do
      // índice) — sem eles o 1º commit após o reboot sempre fazia backup e lia o
      // relógio determinístico a mais, deslocando ids/timestamps do jogo.
      adapterTimers: { lastRoutineBackupAt: rt.runtime.activeCareerAdapter.lastRoutineBackupAt, lastIndexSyncAt: rt.runtime.activeCareerAdapter.lastIndexSyncAt }, seed, profile: PROFILE, careerId, day, guard, stalls, negativeWeeks, lastWeek, investedBalance, rngState: rngBox.s, detState: globalThis.__pl526Det?.getState(), recommended, ledger, out, bookedCloses: [...bookedCloses], bookedTx: [...bookedTx], seenTx: [...seenTx], localStore: getLocalStoreSnapshot(), files: Object.fromEntries(files) };
    mkdirSync(dirname(ckptFile), { recursive: true });
    const body = JSON.stringify(payload);
    const sha = sha256Hex(body);
    const fd = openSync(`${ckptFile}.tmp`, 'w');
    try { writeSync(fd, body); writeSync(fd, `\n#sha256:${sha}`); fsyncSync(fd); } finally { closeSync(fd); }
    if (existsSync(ckptFile)) renameSync(ckptFile, `${ckptFile}.prev`);
    renameSync(`${ckptFile}.tmp`, ckptFile);
    writeFileSync(`${ckptFile}.meta.json`, JSON.stringify({ day, date: profile.career_date, sha256: sha, preset: payload.preset, profile: PROFILE, seed, at: realNowIso(), bytes: body.length }));
  }
  if (!resume) {
    await partnerStep();
    await snapshot();
  }
  while (day < DAYS) {
    progress.day = day; progress.date = profile.career_date;
    if (Math.floor(day / 7) !== lastWeek) {
      progress.phase = 'weekly';
      lastWeek = Math.floor(day / 7);
      try { await weeklyDecisions(); } catch (e) { out.errors.push(`weekly:${e.message}`.slice(0, 140)); }
      if (day > 0) await snapshot();
    }
    progress.phase = 'training';
    try { await dailyTraining(); } catch (e) { out.errors.push(`train:${e.message}`.slice(0, 140)); }

    const before = await refresh();
    const coinsBefore = before.coins || 0;
    const fromDate = before.career_date;
    progress.phase = 'advance';
    const result = await rt.calendar.advanceCareerDays(before, 1);
    profile = await rt.calendar.finalizeCareerAdvanceRange(result.profile, fromDate, result.profile.career_date);
    await refresh();
    // 5.26-C: retrato da população na virada do ano (Race zerada para todos?
    // população acima dos cortes de 1500 linhas?). Só leitura.
    if (fromDate.slice(0, 4) !== profile.career_date.slice(0, 4)) {
      const pop = (await rt.localGame.entities.AthleteProfile.list(null, 100000).catch(() => [])) || [];
      (out.yearTurns ||= []).push({ date: profile.career_date, athletes: pop.length, retired: pop.filter((a) => a.retired || a.career_status === 'aposentado').length, withWorldPoints: pop.filter((a) => Number(a.world_ranking_points) > 0).length, raceNonZero: pop.filter((a) => Number(a.race_points) > 0).length, playerRace: Number(profile.race_points) || 0 });
    }
    // Fechamento mensal (FinancialTransaction monthly_close) dentro do avanço.
    const parts = [];
    if (monthKey(fromDate) !== monthKey(profile.career_date)) {
      const closes = ((await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profile.id, type: 'monthly_close' }).catch(() => [])) || [])
        .filter((t) => t.month === monthKey(profile.career_date) || t.month === monthKey(fromDate));
      for (const c of closes) {
        if (bookedCloses.has(c.id)) continue;
        bookedCloses.add(c.id);
        const b = c.breakdown || {};
        parts.push(['income', 'sponsor_monthly', Number(b.sponsor_income) || 0], ['income', 'investment_income', Number(b.investment_income) || 0], ['income', 'passive_income', Number(b.passive_income) || 0]);
        const expTotal = Number(c.expenses) || 0;
        // 5.26-B: o total do fechamento é (staff + manutenção)·(1 − contador) +
        // treinador + clube; o breakdown traz staff BRUTO. Treinador e clube vêm
        // do breakdown e o staff é o resto (líquido da economia do contador).
        // Na 5.26 o staff entrava bruto e o treinador como resto: totais certos,
        // mas a divisão staff/treinador deslocada pela economia do contador.
        // breakdown.coach_salary/club_membership_fee são ANTES do multiplicador
        // de custo da dificuldade (economy.js); staff/manutenção já vêm ajustados.
        const costMult = difficultyCostMultiplier(profile);
        const maint = Number(b.maintenance_cost) || 0;
        const coachPaid = Math.round((Number(b.coach_salary) || 0) * costMult);
        const clubFee = Math.round((Number(b.club_membership_fee) || 0) * costMult);
        parts.push(['expense', 'coach', coachPaid], ['expense', 'club_fee', clubFee], ['expense', 'maintenance', maint], ['expense', 'staff', Math.max(0, expTotal - coachPaid - clubFee - maint)]);
      }
      // Ledger mensal: fecha o mês anterior.
      const prev = ensureMonth(monthKey(fromDate), coinsBefore);
      prev.closing = coinsBefore;
    }
    {
      const txs = (await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profile.id }).catch(() => [])) || [];
      dayNewTx = txs.filter((t) => !seenTx.has(t.id)).map((t) => `${t.type}:${t.category || ''}:${t.amount}`);
      for (const t of txs) seenTx.add(t.id);
      for (const t of txs) {
        if (bookedTx.has(t.id)) continue;
        if (t.category === 'parceria' && t.type === 'expense') { bookedTx.add(t.id); parts.push(['expense', 'partner_salary', Number(t.amount) || 0]); }
        // 5.26-B: finalização de torneio do jogador feita DENTRO do avanço do
        // dia (ex.: run encerrada pelo calendário) credita o prêmio aqui.
        else if (t.category === 'torneio' && t.type === 'income') { bookedTx.add(t.id); parts.push(['income', 'prize', Number(t.amount) || 0]); }
      }
    }
    const residualBefore = Object.values(out.residualSites).reduce((a, b) => a + b, 0);
    settle(profile.career_date, (profile.coins || 0) - coinsBefore, parts);
    if (Object.values(out.residualSites).reduce((a, b) => a + b, 0) !== residualBefore && out.residualEvents.length < 30) out.residualEvents.push({ date: profile.career_date, delta: (profile.coins || 0) - coinsBefore, parts: parts.filter((p) => p[2]), newTx: dayNewTx, sites: { ...out.residualSites } });
    ensureMonth(monthKey(profile.career_date), profile.coins || 0);

    if (result.blockedBy?.id) {
      guard += 1;
      if (result.blockedBy.event_type === 'tournament') {
        progress.phase = 'tournament';
        const cb = profile.coins || 0;
        const r = await playTournamentRound(rt, A, { eventId: result.blockedBy.id, strategyId: policy.strategy, seedText: `${seedText}-m${out.matches.length}` }).catch((e) => ({ outcome: 'error', error: e.message }));
        await refresh();
        const delta = (profile.coins || 0) - cb;
        await markTournamentTxBooked();
        if (r.outcome === 'played') {
          const prize = Number(r.finalization?.rewards?.coins) || 0;
          out.matches.push({ ...r.matchRow, coinDelta: delta, bookedPrize: prize, bookedMatchReward: Math.max(0, r.matchRewardCoins || 0), bookedAchievements: r.achievementsCoins || 0 });
          // Moedas creditadas antes do commit e apagadas pelo playerPatch absoluto da finalização (bug do jogo).
          const c = r.finalization?.commit;
          const overwritten = c && c.patchCoins != null ? Math.max(0, c.coinsBeforeCommit + prize - c.coinsAfterCommit) : 0;
          settle(profile.career_date, delta, [['income', 'prize', prize], ['income', 'achievements', r.achievementsCoins || 0], ['income', 'match_reward', Math.max(0, r.matchRewardCoins || 0)], ['expense', 'reward_overwrite', overwritten]]);
          if (r.finalization) out.tournaments.push({ day: dayOf(profile.career_date), date: profile.career_date, tournamentId: r.matchRow.tournamentId, tier: r.matchRow.tier, roundsWon: r.finalization.roundsWon, totalRounds: r.finalization.totalRounds, status: r.finalization.status, prize, rankPoints: Number(r.finalization.rewards?.rankPoints) || 0, xp: Number(r.finalization.rewards?.xp) || 0, commit: r.finalization.commit, achievementsCoins: r.achievementsCoins || 0 });
        } else {
          settle(profile.career_date, delta, []);
          if (r.outcome === 'forfeit') out.forfeits += 1;
          if (r.outcome === 'error') { out.errors.push(`round:${r.error}`.slice(0, 140)); await A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null); }
          if (r.outcome === 'waiting' || r.outcome === 'no-run' || r.outcome === 'done') await A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null);
        }
      } else {
        const cb = profile.coins || 0;
        await A.calendarSystem.resolveDecision(result.blockedBy.id, 'play').catch(() => A.calendarSystem.resolveDecision(result.blockedBy.id, 'skip').catch(() => null));
        await refresh();
        settle(profile.career_date, (profile.coins || 0) - cb, []);
      }
      if (guard > 20) { out.errors.push('guard: bloqueio repetido'); guard = 0; day += 1; }
      continue;
    }
    guard = 0;
    if (result.daysAdvanced === 0) {
      // Falha dentro do dia (advanceCareerDays devolve blockedBy.error sem id).
      // O jogador veria o erro e tentaria de novo; registramos e repetimos.
      const b = result.blockedBy || {};
      out.advanceFailures.push({ date: profile.career_date, code: b.code || null, title: String(b.title || '').slice(0, 200) });
      stalls += 1;
      if (stalls > 5) { out.errors.push(`sem avanço: ${b.code || '?'} ${String(b.title || '').slice(0, 100)}`); break; }
      continue;
    }
    stalls = 0;
    // 5.26-C: diário do ciclo de parceria numa janela (PL526_PARTNERLOG=AAAA-MM-DD:AAAA-MM-DD).
    if (process.env.PL526_PARTNERLOG) {
      const [from, to] = process.env.PL526_PARTNERLOG.split(':');
      if (profile.career_date >= from && profile.career_date <= to) {
        const rows = (await rt.localGame.entities.Partnership.filter({ profile_id: profile.id }).catch(() => [])) || [];
        const pf = await rt.localGame.entities.PlayerProfile.get(profile.id);
        out.partnerLog.push({ date: profile.career_date, partner_id: pf.partner_id || null, locked_until: pf.partner_locked_until || null, active: (await A.partnership.getActivePartnership(profile.id).catch(() => null))?.id || null, rows: rows.filter((r) => r.status === 'ativa' || String(r.ended_career_date || r.end_date || '') >= from || String(r.started_career_date || '') >= from).map((r) => ({ id: r.id, partner: r.partner_bot_id || r.athlete_b_id, status: r.status, contract: r.contract_status, start: r.started_career_date, end: r.contract_end_date, sched: r.scheduled_end_date, sep: r.separation_scheduled_date || null, ended: r.ended_career_date || null, reason: r.end_reason || null })) });
      }
    }
    if (process.env.PL526_DAYLOG === '1') console.log(`[day] ${profile.career_date} en ${profile.energy} fa ${profile.fatigue} tr ${profile.trainings_today ?? '-'} auto ${profile.last_automatic_training_date === profile.career_date ? profile.last_automatic_training_label : '-'} rest ${profile.last_day_was_rest ? 1 : 0} coins ${profile.coins} block ${result.blockedBy?.event_type || '-'}`);
    if (process.env.PL526_MEMLOG === '1' && day % 30 === 0) {
      const mu = process.memoryUsage();
      const saveBytes = [...files.values()].reduce((t, v) => t + String(v).length, 0);
      console.log(`[mem] dia ${day} heap ${Math.round(mu.heapUsed / 1048576)}MB rss ${Math.round(mu.rss / 1048576)}MB save ${Math.round(saveBytes / 1048576)}MB arquivos ${files.size} shim ${globalThis.__pl526SoftLock?.fires || 0}`);
    }
    // Bug P0 (soft-lock): 1º disparo do shim = dia em que o jogo real travaria.
    const sl = globalThis.__pl526SoftLock;
    if (sl && sl.fires > out.softLock.fires) { out.softLock.firstDate ||= profile.career_date; out.softLock.firstDay ??= day; out.softLock.fires = sl.fires; out.softLock.ids = [...sl.ids]; }
    day += result.daysAdvanced;
    if (!(await A.partnership.getActivePartnership(profile.id).catch(() => null))) await partnerStep();
    if (STOP_AT_DAY && day === STOP_AT_DAY) { await rt.close(); process.exit(4); }
    if (CHECKPOINT_EVERY > 0 && day % CHECKPOINT_EVERY === 0 && day < DAYS) {
      // Mesmo reload no modo contínuo e no retomado (ver resume acima).
      for (const k of [...files.keys()]) if (k.startsWith('backups/')) files.delete(k);
      progress.phase = 'checkpoint';
      await writeCheckpoint();
      if (SEGMENT || (STOP_AFTER_CHECKPOINT && out.checkpoints >= STOP_AFTER_CHECKPOINT)) { await rt.close(); process.exit(3); }
      await reloadRuntime();
    } else if (RELOAD_EVERY > 0 && day % RELOAD_EVERY === 0) await reloadRuntime();
  }
  await snapshot();
  const lastMonth = ensureMonth(monthKey(profile.career_date), profile.coins || 0);
  lastMonth.closing = profile.coins || 0;
  // Abertura de cada mês = fechamento do anterior.
  const months = Object.keys(ledger).sort();
  for (let i = 1; i < months.length; i += 1) ledger[months[i]].opening = ledger[months[i - 1]].closing;
  out.ledger = ledger;
  out.finalCoins = profile.coins || 0;
  // Livro-razão do PRÓPRIO jogo (FinancialTransaction) por tipo — conferência cruzada.
  const txs = (await rt.localGame.entities.FinancialTransaction.filter({ profile_id: profile.id }).catch(() => [])) || [];
  out.gameTx = {};
  for (const t of txs) { const k = `${t.type || '?'}:${t.category || ''}`; const e = (out.gameTx[k] ||= { n: 0, amount: 0 }); e.n += 1; e.amount += Number(t.amount) || 0; }
  // Paridade de lifecycle: o mundo andou pelos sistemas reais (torneios da IA
  // finalizados, resultados de ranking gravados, chaves canônicas do jogador).
  const tournamentsAll = (await rt.localGame.entities.Tournament.list(null, 2000).catch(() => [])) || [];
  const playedIds = new Set(out.tournaments.map((t) => t.tournamentId));
  out.world = {
    tournamentsFinished: tournamentsAll.filter((t) => t.status === 'finalizado' || t.current_phase === 'concluido').length,
    tournamentsTotal: tournamentsAll.length,
    playerCanonicalBrackets: tournamentsAll.filter((t) => playedIds.has(t.id) && Number(t.bracket_schema_version) >= 2).length,
    rankingResults: ((await rt.localGame.entities.AthleteRankingResult.list(null, 100000).catch(() => [])) || []).length,
  };
  out.invested = investedBalance;
  out.days = day;
  // --keepSave: grava o save FINAL da carreira (para a conferência manual).
  if (process.argv.includes('--keepSave')) {
    // 5.26-C: todos os arquivos da carreira num só JSON ({ caminho: conteúdo });
    // antes cada arquivo sobrescrevia o anterior e só o último sobrava.
    const save = {};
    // Inclui o índice de carreiras (fora de careers/), necessário para carregar.
    for (const [path, text] of files) if (!/backup/i.test(path)) save[path] = text;
    writeFileSync(resolve(OUT, `${PROFILE}-${String(seed).padStart(3, '0')}.save.json`), JSON.stringify(save));
  }
  out.ms = performance.now() - started;
  await rt.close();
  return { out, ckptFile };
}

for (let seed = S0; seed <= S1; seed += 1) {
  const file = resolve(OUT, `${PROFILE}-${String(seed).padStart(3, '0')}.json`);
  if (!FORCE && existsSync(file)) { console.log(`skip ${file}`); continue; }
  const t0 = performance.now();
  try {
    const { out: result, ckptFile } = await simulateCareer(seed);
    // 5.27-D: resultado gravado de forma atômica (tmp + fsync + rename) e só
    // então o checkpoint é apagado — um kill entre os dois passos nunca perde
    // a carreira (sobra o resultado OU o checkpoint).
    const fd = openSync(`${file}.tmp`, 'w');
    try { writeSync(fd, JSON.stringify(result)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(`${file}.tmp`, file);
    if (ckptFile) for (const suffix of ['', '.prev', '.meta.json']) if (existsSync(`${ckptFile}${suffix}`)) unlinkSync(`${ckptFile}${suffix}`);
    const last = result.weekly.at(-1) || {};
    console.log(`[${PROFILE} ${seed}] ${result.days}d · ${result.matches.length} partidas · rank ${last.rank} · OVR ${last.ovr} · moedas ${result.finalCoins} · ${Math.round((performance.now() - t0) / 1000)}s · erros ${result.errors.length} · reloads ${result.reloads} · rss ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
  } catch (e) {
    console.error(`[${PROFILE} ${seed}] FALHOU: ${e.stack || e.message}`);
  }
}
process.exit(0);
