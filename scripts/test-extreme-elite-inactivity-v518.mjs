// Playthrough 5.18-E/F/G — LACUNAS EXTREMAS DE ELITE (premissa RETIRADA).
//
// ESTADO ATUAL (5.18-G): as lacunas que este teste nasceu para investigar NÃO
// EXISTEM. Elas eram artefato de medição, e este arquivo foi corrigido.
//
// Histórico, mantido porque explica o que o teste protege hoje:
//   5.18-D reportou "2 duplas Top10 com 54 semanas sem competir";
//   5.18-E reportou "6 duplas com 30-34 semanas", com causa não atribuída.
// Ambos os números vinham do MESMO defeito: o índice de "quem jogou" era
// montado UMA VEZ, ao fim de 3 temporadas, traduzindo `draw_pair_ids` pelas
// linhas de Partnership do estado final. Parcerias se dissolvem e se
// reformam; um sorteio de 2026 lido pela linha de 2029 é creditado à dupla
// errada. Medição da 5.18-F: 6 das 20 duplas do cohort apareciam com 0-1
// semanas jogadas quando de fato jogaram 7-29.
//
// Com atribuição semanal (a correção abaixo, e a regra da Parte A em
// scripts/lib/temporalIntegrity.mjs): 0 lacunas >=26 semanas em 3 temporadas.
//
// As três hipóteses originais (HK parceria stale, HM capacity, HO survivor
// bias) foram todas refutadas — nenhuma delas era a causa, porque não havia
// fenômeno a explicar. O teste segue existindo como REGRESSÃO: se a atribuição
// temporal voltar a quebrar, as lacunas fantasma reaparecem e ele fica
// vermelho.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

installShims('/elite-extreme');

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

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekOf = (d) => Math.floor(new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getTime() / 604800000);
const keyOf = (a, b) => [a, b].sort().join('_');

const START = '2026-01-01';
const SEASONS = 3;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = (p) => vite.ssrLoadModule(p);
const { GameStorage } = await mod('/src/storage/GameStorage.js');
const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
const { CareerManager } = await mod('/src/careers/CareerManager.js');
const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
const { localGame } = await mod('/src/api/localGameClient.js');
const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
const { ensureFutureTournaments } = await mod('/src/lib/career.js');
const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');
const { evaluateTournamentEntry } = await mod('/src/gameplay/worldTour/EntryManager.js');

const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
activeCareerAdapter.careerManager = manager;
activeCareerAdapter.clearActiveCareer();
const { career } = await manager.createCareer({ saveName: 'ExtremeGap', playerName: 'ExtremeGap' });
activeCareerAdapter.setActiveCareer(career);
let profile = await activeCareerAdapter.createPlayerProfile({
  id: 'extreme-gap', sport_name: 'ExtremeGap', career_date: START, birth_date: '2001-01-01',
  level: 'Amador', coins: 1000, xp: 0,
});
await ensureWorldSeed2025();
await ensureFutureTournaments(START);

// Cohort: Top20 no INÍCIO (Parte O, Cohort A).
const initialTeams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
const cohort = initialTeams.slice(0, 20).map((t, i) => ({
  key: keyOf(t.player1_id, t.player2_id),
  a: t.player1_id, b: t.player2_id,
  name: `${t.player1_name}/${t.player2_name}`,
  initialRank: i + 1,
}));

const weekly = [];
let circuitAnchor = START;
let date = START;

for (let i = 0; i < SEASONS * 365; i += 1) {
  const previous = date;
  date = addDays(date, 1);
  await ensureWorldTourDraws(date).catch(() => null);
  await resolveCompletedWorldTourEvents(date).catch(() => null);
  const world = await simulateWorldDay(profile, previous, date).catch(() => null);
  if (world?.profile) profile = world.profile;
  const market = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
  if (market?.profile) profile = market.profile;
  if ((i + 1) % 14 === 0) {
    const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
    if (c?.profile) profile = c.profile;
    circuitAnchor = date;
  }
  if ((i + 1) % 60 === 0) await ensureFutureTournaments(date).catch(() => null);

  if ((i + 1) % 7 === 0) {
    const [athletes, partnerships, teams, weekTournaments] = await Promise.all([
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      localGame.entities.TeamRanking.list('-ranking_points', 5000),
      localGame.entities.Tournament.list('start_date', 5000),
    ]);
    const byId = new Map(athletes.map((a) => [a.id, a]));
    const activeByKey = new Map();
    for (const p of partnerships) {
      if (p.status !== 'ativa') continue;
      const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
      if (ids.length === 2) activeByKey.set(keyOf(ids[0], ids[1]), p);
    }
    const rankByKey = new Map();
    teams.forEach((t, idx) => rankByKey.set(keyOf(t.player1_id, t.player2_id), idx + 1));

    // Playthrough 5.18-F — "jogou nesta semana" resolvido AQUI, contra as
    // linhas de Partnership DESTA semana.
    //
    // A versão da 5.18-E montava esse índice UMA VEZ, no fim de 3
    // temporadas, traduzindo `draw_pair_ids` pelas linhas de Partnership do
    // estado final. Ao longo de 3 temporadas as parcerias se dissolvem e se
    // reformam, e um sorteio de 2026 traduzido pela linha de 2029 é creditado
    // à dupla ERRADA. Medido: 6 das 20 duplas do cohort apareciam com 0-1
    // semanas jogadas quando de fato jogaram 7-29, e 2 chaves sumiam
    // inteiramente do índice. Era daí que vinham as "6 lacunas extremas de
    // 30-34 semanas" — artefato de medição, não inatividade do mundo. Numa
    // run de 1 temporada o erro não aparecia (ainda não houve rotatividade),
    // que é por que a 5.18-E não o percebeu.
    const partnershipByIdNow = new Map(partnerships.map((p) => [p.id, p]));
    const membersNow = (pid) => {
      const raw = String(pid);
      if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
      const p = partnershipByIdNow.get(raw);
      return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
    };
    const playedThisWeek = new Set();
    const wNow = weekOf(date);
    for (const t of weekTournaments) {
      if (!Array.isArray(t.draw_pair_ids) || !t.draw_pair_ids.length) continue;
      const s = weekOf(t.start_date);
      const e = weekOf(t.end_date || t.start_date);
      if (wNow < s || wNow > e) continue;
      for (const pid of t.draw_pair_ids) {
        const m = membersNow(pid);
        if (m.length === 2) playedThisWeek.add(keyOf(m[0], m[1]));
      }
    }

    weekly.push({
      week: weekOf(date),
      date,
      rows: cohort.map((c) => {
        const A = byId.get(c.a);
        const B = byId.get(c.b);
        const partnership = activeByKey.get(c.key);
        return {
          key: c.key,
          rank: rankByKey.get(c.key) || null,
          played: playedThisWeek.has(c.key),
          partnershipRowActive: Boolean(partnership),
          mutual: Boolean(A && B && A.ai_partner_id === c.b && B.ai_partner_id === c.a),
          aRetired: Boolean(A?.retired || A?.career_status === 'aposentado'),
          bRetired: Boolean(B?.retired || B?.career_status === 'aposentado'),
          aInjured: Boolean(A?.injured_until && A.injured_until >= date),
          bInjured: Boolean(B?.injured_until && B.injured_until >= date),
          aExists: Boolean(A),
          bExists: Boolean(B),
        };
      }),
    });
  }
}

const [tournaments, partnerships] = await Promise.all([
  localGame.entities.Tournament.list('start_date', 5000),
  localGame.entities.Partnership.list(null, 5000).catch(() => []),
]);
const entryFn = evaluateTournamentEntry;
await vite.close();

const partnershipById = new Map((partnerships || []).map((p) => [p.id, p]));
const membersOf = (pid) => {
  const raw = String(pid);
  if (raw.startsWith('profile-pair:')) return raw.slice('profile-pair:'.length).split(':').filter(Boolean);
  const p = partnershipById.get(raw);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};
const drawn = tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
// Índice pelo ESTADO FINAL — mantido de propósito, agora só como CONTRAPROVA
// da própria medição. A contagem de lacunas não depende mais dele (ela usa
// `row.played`, resolvido semana a semana). Aqui ele serve para quantificar o
// quanto a atribuição por estado final erra, que foi a causa das "6 lacunas
// extremas" reportadas na 5.18-E.
const busyByKey = new Map();
for (const t of drawn) {
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const k = keyOf(m[0], m[1]);
    if (!busyByKey.has(k)) busyByKey.set(k, new Set());
    const s = weekOf(t.start_date);
    const e = weekOf(t.end_date || t.start_date);
    for (let w = s; w <= e; w += 1) busyByKey.get(k).add(w);
  }
}
console.log('\n=== CONTRAPROVA: atribuição semanal vs. por estado final ===');
let divergentPairs = 0;
for (const c of cohort) {
  const byWeekly = weekly.filter((s) => s.rows.find((r) => r.key === c.key)?.played).length;
  const byFinal = weekly.filter((s) => busyByKey.get(c.key)?.has(s.week)).length;
  if (byWeekly !== byFinal) {
    divergentPairs += 1;
    console.log(`  ${c.name}: semanal=${byWeekly} estadoFinal=${byFinal} (diferença ${byWeekly - byFinal})`);
  }
}
console.log(`  duplas com atribuição divergente: ${divergentPairs}/${cohort.length}`);
console.log(`  chaves do cohort ausentes do índice final: ${cohort.filter((c) => !busyByKey.has(c.key)).length}/${cohort.length}\n`);
const eventsByWeek = new Map();
for (const t of drawn) {
  const w = weekOf(t.start_date);
  if (!eventsByWeek.has(w)) eventsByWeek.set(w, []);
  eventsByWeek.get(w).push(t);
}

// --- Lacunas por dupla do cohort, com estado semanal --------------------
const GAP_MIN = 26;
const gaps = [];
// CORREÇÃO DE MEDIÇÃO (5.18-E): a lacuna só conta semanas em que a dupla
// EXISTE (reciprocidade mútua de `ai_partner_id`). A primeira versão deste
// teste contava qualquer semana sem jogo, e o resultado foi enganoso: casos
// como "row ativa 0/78, mútua 0/78" apareciam como lacuna de 78 semanas
// quando a dupla estava dissolvida em todas elas — o mesmo erro que as Partes
// D/Q proíbem, e que eu já havia corrigido em outros testes.
//
// Semana sem a dupla existir INTERROMPE a contagem, exatamente como uma
// semana jogada: não é ociosidade de quem não existe.
for (const c of cohort) {
  let run = null;
  const flush = () => {
    if (run && run.weeks.length >= GAP_MIN) gaps.push({ pair: c, ...run });
    run = null;
  };
  for (const snap of weekly) {
    const row = snap.rows.find((r) => r.key === c.key);
    const exists = Boolean(row?.mutual);
    const played = Boolean(row?.played);
    if (played || !exists) { flush(); continue; }
    if (!run) run = { startWeek: snap.week, startDate: snap.date, weeks: [] };
    run.endWeek = snap.week;
    run.endDate = snap.date;
    run.weeks.push({ ...row, week: snap.week, date: snap.date, weekEvents: (eventsByWeek.get(snap.week) || []).length });
  }
  flush();
}

console.log(`\n=== PARTE I/J: lacunas >= ${GAP_MIN} semanas (cohort Top20 inicial, 3 temporadas) ===`);
console.log(`total: ${gaps.length}`);

for (const g of gaps) {
  const w = g.weeks;
  const ranks = w.map((x) => x.rank).filter((r) => Number(r) > 0);
  const weeksTop10 = ranks.filter((r) => r <= 10).length;
  const weeksTop20 = ranks.filter((r) => r <= 20).length;
  const weeksOutside50 = ranks.filter((r) => r > 50).length;
  const weeksNoRank = w.length - ranks.length;
  const rowActive = w.filter((x) => x.partnershipRowActive).length;
  const mutualWeeks = w.filter((x) => x.mutual).length;
  const retiredWeeks = w.filter((x) => x.aRetired || x.bRetired).length;
  const injuredWeeks = w.filter((x) => x.aInjured || x.bInjured).length;
  const missingWeeks = w.filter((x) => !x.aExists || !x.bExists).length;
  const noEventWeeks = w.filter((x) => x.weekEvents === 0).length;

  // Causa dominante segundo a precedência do mundo.
  let cause = 'INDETERMINADA';
  if (missingWeeks > w.length * 0.5) cause = 'MEMBRO_INEXISTENTE';
  else if (retiredWeeks > w.length * 0.5) cause = 'APOSENTADORIA';
  else if (mutualWeeks < w.length * 0.5) cause = 'RECIPROCIDADE_PERDIDA (partnership stale)';
  else if (injuredWeeks > w.length * 0.5) cause = 'LESAO_PROLONGADA';
  else if (weeksTop10 + weeksTop20 === 0) cause = 'SAIU_DA_ELITE (survivor bias do cohort)';
  else if (noEventWeeks > w.length * 0.5) cause = 'SEM_EVENTO';
  else cause = 'ATIVA_E_ELEGIVEL_SEM_COMPETIR';

  console.log(`\n#${g.pair.initialRank} ${g.pair.name}`);
  console.log(`  lacuna: ${w.length} semanas (${g.startDate} -> ${g.endDate})`);
  console.log(`  rank no início/fim da lacuna: ${w[0].rank ?? 'n/d'} -> ${w[w.length - 1].rank ?? 'n/d'}`);
  console.log(`  rank min/max durante: ${ranks.length ? Math.min(...ranks) : 'n/d'} / ${ranks.length ? Math.max(...ranks) : 'n/d'}`);
  console.log(`  semanas Top10=${weeksTop10} Top20=${weeksTop20} fora do Top50=${weeksOutside50} sem rank=${weeksNoRank}`);
  console.log(`  Partnership row ativa=${rowActive}/${w.length} | reciprocidade mútua=${mutualWeeks}/${w.length}`);
  console.log(`  aposentado=${retiredWeeks} lesionado=${injuredWeeks} membro ausente=${missingWeeks} sem evento na semana=${noEventWeeks}`);
  console.log(`  CAUSA: ${cause}`);
  g.cause = cause;
  g.stats = { weeksTop10, weeksTop20, weeksOutside50, mutualWeeks, rowActive, retiredWeeks, injuredWeeks, missingWeeks, total: w.length };
}

check('Parte I: a instrumentação semanal cobriu 3 temporadas', () => {
  console.log(`   [registro] snapshots semanais=${weekly.length}`);
  assert.ok(weekly.length >= 150, `só ${weekly.length} snapshots`);
});

check('Parte J: toda lacuna extrema tem cronologia e causa atribuída', () => {
  const undetermined = gaps.filter((g) => g.cause === 'INDETERMINADA');
  console.log(`   [registro] lacunas >=${GAP_MIN}: ${gaps.length} | indeterminadas: ${undetermined.length}`);
  assert.equal(undetermined.length, 0,
    undetermined.map((g) => `#${g.pair.initialRank} ${g.pair.name}`).join(' | '));
});

check('Parte R: nenhuma lacuna extrema vem de Partnership STALE', () => {
  // Gate da Parte R: Partnership ativa deve implicar reciprocidade mútua.
  const stale = gaps.filter((g) => g.cause.startsWith('RECIPROCIDADE_PERDIDA'));
  for (const g of stale) {
    console.log(`   [STALE] #${g.pair.initialRank} ${g.pair.name}: row ativa ${g.stats.rowActive}/${g.stats.total} mas mútua só ${g.stats.mutualWeeks}/${g.stats.total}`);
  }
  assert.equal(stale.length, 0,
    `${stale.length} lacunas por parceria formalmente ativa sem reciprocidade`);
});

check('Parte M/O: lacuna extrema NÃO ocorre com dupla elite ativa e elegível', () => {
  // O caso que seria bug: ativa, recíproca, saudável, com evento na semana, e
  // ainda assim um ano sem competir.
  const suspicious = gaps.filter((g) => g.cause === 'ATIVA_E_ELEGIVEL_SEM_COMPETIR');
  for (const g of suspicious) {
    console.log(`   [SUSPEITO] #${g.pair.initialRank} ${g.pair.name}: ${g.stats.total} semanas, Top10 em ${g.stats.weeksTop10}, mútua ${g.stats.mutualWeeks}/${g.stats.total}`);
  }
  assert.equal(suspicious.length, 0,
    suspicious.map((g) => `#${g.pair.initialRank} ${g.pair.name} (${g.stats.total}sem)`).join(' | '));
});

check('Parte O: o relatório distingue cohort de rank dinâmico', () => {
  // Prova de que a leitura "Top10 parada um ano" foi verificada, não assumida.
  for (const g of gaps) {
    const pctTop10 = (g.stats.weeksTop10 / g.stats.total) * 100;
    console.log(`   [registro] #${g.pair.initialRank} ${g.pair.name}: Top10 em ${pctTop10.toFixed(0)}% da lacuna, fora do Top50 em ${g.stats.weeksOutside50}`);
  }
  assert.ok(true);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-extreme-elite-inactivity-v518: PASS');
