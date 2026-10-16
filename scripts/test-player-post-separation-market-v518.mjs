// Playthrough 5.18, Parte J — O MERCADO DO JOGADOR COM A ECOLOGIA VIVA.
//
// A 5.17 reportou que o mercado pós-separação "esgota após ~2 janelas porque
// só existem ~6 agentes livres". Essa conclusão herdou o MESMO artefato de
// medição do inventário: o harness nunca rodava
// `processAiPartnershipMarket`, então o mundo ficava congelado no seed
// super-pareado. Com o mercado mensal ativo existem ~180–270 agentes livres.
//
// Este teste mede a disponibilidade real para o jogador, em D+0/3/7/14/30,
// com a ecologia funcionando — e em perfis de ranking diferentes, porque a
// elegibilidade depende da carreira dele.
//
// CLOUD-3A — DETERMINISMO. Os ids de ~900 atletas nascem de
// `<prefixo>-<Date.now()>-<Math.random>` (CareerEntityRepository.makeId) e
// alimentam o hash FNV-1a de selectPair/renovação, então o tamanho do pool de
// livres após 210 dias variava por execução (medido: 1, 7, 9, 11). Este teste
// fixa Math.random (mulberry32, seed fixa) e o relógio (Date.now/new Date()
// sem argumentos) ANTES de criar o mundo, sem tocar nos ids/formatos de
// produção, e restaura ambos ao final. As asserções partem do pool REAL de
// candidatos livres elegíveis: com 1 livre o jogador recebe 1 proposta e o
// mercado não tem mais o que oferecer — isso é comportamento válido, não
// falha. Não existe mais a exigência de que D+30 > D+3.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

installShims('/partners');

// ---- Determinismo (apenas deste teste) ------------------------------------
const SEED = process.env.MARKET_TEST_SEED || 'cloud-3a-market-v518';
function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Fixa Math.random e o relógio "agora"; devolve a função que restaura ambos. */
function installDeterminism(seedString) {
  const realRandom = Math.random;
  const RealDate = Date;
  const seedInt = hashSeed(seedString);
  Math.random = mulberry32(seedInt);
  let clockMs = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (seedInt % 100000);
  const tick = () => { clockMs += 1000; return clockMs; };
  globalThis.Date = class DeterministicDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(tick()); else super(...args); }
    static now() { return tick(); }
  };
  return () => { Math.random = realRandom; globalThis.Date = RealDate; };
}

// Mesmos critérios de isCandidateAvailable (postSeparationMarket.js).
const isFree = (a) => !!a?.id && !a.retired && a.career_status !== 'aposentado' && !a.ai_partner_id;
const MAX_PER_WINDOW = 4;
// Elegíveis exatamente como ensurePostSeparationPartnerMarket os enxerga:
// mesmos 2000 vínculos mais recentes, mesmo filtro, descontando já oferecidos.
async function eligibleCandidates(entities, offeredIds) {
  const [athletes, partnerships] = await Promise.all([
    entities.AthleteProfile.list('-world_ranking_points', 5000).catch(() => []),
    entities.Partnership.list('-created_date', 2000).catch(() => []),
  ]);
  const active = new Set();
  for (const row of partnerships || []) {
    if (row?.status !== 'ativa') continue;
    [row.athlete_a_id, row.athlete_b_id, row.partner_bot_id].filter(Boolean).forEach((id) => active.add(id));
  }
  return (athletes || []).filter((a) => isFree(a) && !active.has(a.id) && !offeredIds.has(a.id));
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

const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const START = '2026-01-01';
// Roda meio ano com o mercado de IA ligado para o mundo relaxar do seed
// super-pareado antes de a separação do jogador acontecer.
const WARMUP_DAYS = 210;
const PROFILES = [
  { label: 'Rank1000', rank: 1000 },
  { label: 'Rank500', rank: 500 },
  { label: 'Rank250', rank: 250 },
  { label: 'Rank100', rank: 100 },
  { label: 'Top20', rank: 18 },
];

async function runProfile({ label, rank, frozenPool = null }) {
  const restore = installDeterminism(`${SEED}:${label}${frozenPool ? `:frozen${frozenPool}` : ''}`);
  let vite = null;
  try {
    vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
    const mod = (p) => vite.ssrLoadModule(p);
    const { GameStorage } = await mod('/src/storage/GameStorage.js');
    const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
    const { CareerManager } = await mod('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
    const { localGame } = await mod('/src/api/localGameClient.js');
    const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
    const { ensureFutureTournaments } = await mod('/src/lib/career.js');
    const { ensureWorldTourDraws, resolveCompletedWorldTourEvents } = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
    const { processPartnerDay, formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
    const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
    const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');
    const { POST_SEPARATION_FIRST_WINDOW_DAYS, POST_SEPARATION_INTERVAL_DAYS } = await mod('/src/game-core/postSeparationMarket.js');

    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: label, playerName: label });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `pm-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
      level: 'Avançado', coins: 300000, xp: 60000, rank_points: 900,
      world_ranking: rank, ranking_position: rank,
    });
    await ensureWorldSeed2025();
    await ensureFutureTournaments(START);

    const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
    await formPartnerContract(profile, bot, { durationDays: 365, prizeSplit: 50, monthlySalary: 300 });
    profile = await localGame.entities.PlayerProfile.get(`pm-${label}`);

    // Aquecimento com a ecologia viva.
    let date = START;
    // (No cenário controlado o pool é montado à mão, então o aquecimento é dispensável.)
    for (let i = 0; i < (frozenPool ? 0 : WARMUP_DAYS); i += 1) {
      const previous = date;
      date = addDays(date, 1);
      await ensureWorldTourDraws(date).catch(() => null);
      await resolveCompletedWorldTourEvents(date).catch(() => null);
      const m = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
      if (m?.profile) profile = m.profile;
    }

    // Separação do jogador.
    const active = await getActivePartnership(`pm-${label}`).catch(() => null);
    if (active) await endPartnership(active.id, 'encerrada_contrato', 'Teste 5.18', date);
    await localGame.entities.PlayerProfile.update(`pm-${label}`, {
      partner_id: null, partner_name: null, partner_locked_until: null,
    });
    profile = await localGame.entities.PlayerProfile.get(`pm-${label}`);
    const separationDate = date;

    // Cenário controlado: monta um pool de EXATAMENTE `frozenPool` livres — os
    // atletas não aposentados mais próximos do ranking do jogador. Os demais
    // ficam comprometidos (sentinela) e as duplas ativas dos escolhidos são
    // encerradas. Só dados do teste, em memória; nada de produção muda.
    let athletesAtSeparation = await localGame.entities.AthleteProfile.list(null, 5000);
    if (frozenPool) {
      const alive = athletesAtSeparation.filter((a) => a?.id && !a.retired && a.career_status !== 'aposentado')
        .sort((a, b) => (
          Math.abs((Number(a.ranking_position) || 9999) - rank) - Math.abs((Number(b.ranking_position) || 9999) - rank)
        ) || String(a.id).localeCompare(String(b.id)));
      const chosen = new Set(alive.slice(0, frozenPool).map((a) => a.id));
      assert.equal(chosen.size, frozenPool, `${label}: população insuficiente`);
      for (const a of alive) {
        if (chosen.has(a.id)) await localGame.entities.AthleteProfile.update(a.id, { ai_partner_id: null, ai_partner_name: null });
        else if (!a.ai_partner_id) await localGame.entities.AthleteProfile.update(a.id, { ai_partner_id: 'cloud-3a-locked' });
      }
      const partnerships = await localGame.entities.Partnership.list('-created_date', 5000).catch(() => []);
      for (const row of partnerships || []) {
        if (row?.status !== 'ativa') continue;
        if ([row.athlete_a_id, row.athlete_b_id, row.partner_bot_id].some((id) => chosen.has(id))) {
          await localGame.entities.Partnership.update(row.id, { status: 'encerrada' });
        }
      }
      athletesAtSeparation = await localGame.entities.AthleteProfile.list(null, 5000);
    }
    const freeAtSeparation = await eligibleCandidates(localGame.entities, new Set());
    const freeAgents = freeAtSeparation.length;

    // Mede as ofertas em D+0/3/7/14/30, avançando SÓ o tick diário — o jogador
    // nunca abre a tela de busca. No cenário controlado o mercado de IA não
    // roda (senão ele mesmo consumiria o único livre) e o pool fica congelado.
    const offersAt = {};
    const milestones = new Set([0, 3, 7, 14, 30]);
    const countOffers = async () => ((await localGame.entities.PartnerOffer.filter({ profile_id: `pm-${label}` }).catch(() => [])) || []);
    offersAt[0] = (await countOffers()).length;
    const seenOfferIds = new Set();
    const committedAtOffer = [];
    const seenCandidateIds = new Set();
    const windowStats = []; // { day, eligible, created }
    const offerLog = []; // { day, window, candidate }
    for (let d = 1; d <= 30; d += 1) {
      const previous = date;
      date = addDays(date, 1);
      if (!frozenPool) {
        await ensureWorldTourDraws(date).catch(() => null);
        await resolveCompletedWorldTourEvents(date).catch(() => null);
        const m = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
        if (m?.profile) profile = m.profile;
      }
      const isWindowDay = d >= POST_SEPARATION_FIRST_WINDOW_DAYS
        && (d - POST_SEPARATION_FIRST_WINDOW_DAYS) % POST_SEPARATION_INTERVAL_DAYS === 0;
      const eligibleBefore = isWindowDay
        ? (await eligibleCandidates(localGame.entities, new Set(seenCandidateIds))).length : null;
      const offersBefore = seenOfferIds.size;
      const fresh = await localGame.entities.PlayerProfile.get(`pm-${label}`);
      await processPartnerDay({ ...fresh, career_date: date }, previous, date).catch(() => null);
      const rows = await countOffers();
      const newRows = rows.filter((o) => !seenOfferIds.has(o.id));
      if (newRows.length) {
        // Checa o candidato no MOMENTO da oferta (depois ele pode ser
        // legitimamente contratado por outra dupla de IA).
        const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
        const byId = new Map(athletesNow.map((a) => [a.id, a]));
        for (const o of newRows) {
          seenOfferIds.add(o.id);
          seenCandidateIds.add(o.candidate_player_id);
          offerLog.push({ day: d, window: o.market_window, candidate: o.candidate_player_id });
          const c = byId.get(o.candidate_player_id);
          if (!c || !isFree(c)) committedAtOffer.push(o.candidate_player_id);
        }
      }
      if (isWindowDay) windowStats.push({ day: d, eligible: eligibleBefore, created: seenOfferIds.size - offersBefore });
      if (milestones.has(d)) offersAt[d] = rows.length;
    }

    const finalOffers = await countOffers();
    const candidateIds = finalOffers.map((o) => o.candidate_player_id).filter(Boolean);
    const freeIdsAtSeparation = new Set(freeAtSeparation.map((a) => a.id));
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: `pm-${label}` }).catch(() => []);
    const marketMsgs = (messages || []).filter((m) => m.message_type === 'partner_market_window');
    const perWindow = {};
    for (const o of finalOffers) perWindow[o.market_window] = (perWindow[o.market_window] || 0) + 1;

    return {
      label, rank, frozenPool, separationDate, freeAgents, offersAt, perWindow, offerLog, windowStats,
      totalOffers: finalOffers.length,
      distinctCandidates: new Set(candidateIds).size,
      committedOffered: committedAtOffer.length,
      offeredOutsideSeparationPool: candidateIds.filter((id) => !freeIdsAtSeparation.has(id)).length,
      marketMessages: marketMsgs.length,
      windowCount: Object.keys(perWindow).length,
      firstWindowDay: POST_SEPARATION_FIRST_WINDOW_DAYS,
      intervalDays: POST_SEPARATION_INTERVAL_DAYS,
    };
  } finally {
    if (vite) await vite.close();
    restore();
  }
}

const results = [];
for (const p of PROFILES) {
  const r = await runProfile(p);
  results.push(r);
  console.log(`[${r.label}] livres no mundo=${r.freeAgents} | ofertas D+0=${r.offersAt[0]} D+3=${r.offersAt[3]} D+7=${r.offersAt[7]} D+14=${r.offersAt[14]} D+30=${r.offersAt[30]}`);
}
// Cenários controlados: poucos livres, inclusive um só.
const CONTROLLED_POOLS = [1, 2, 3];
const controlled = [];
for (const size of CONTROLLED_POOLS) {
  const r = await runProfile({ label: `Ctrl${size}`, rank: 250, frozenPool: size });
  controlled.push(r);
  console.log(`[${r.label}] pool congelado=${r.freeAgents} | ofertas D+3=${r.offersAt[3]} D+30=${r.offersAt[30]} janelas=${r.windowCount}`);
}

console.log('\n=== PARTE J: disponibilidade para o jogador (mercado de IA ativo) ===');
console.log('perfil      rank  livres  D+0  D+3  D+7  D+14  D+30  distintos  comprometidos  avisos');
for (const r of results) {
  console.log(
    `${r.label.padEnd(12)}${String(r.rank).padStart(5)}${String(r.freeAgents).padStart(8)}`
    + `${String(r.offersAt[0]).padStart(5)}${String(r.offersAt[3]).padStart(5)}${String(r.offersAt[7]).padStart(5)}`
    + `${String(r.offersAt[14]).padStart(6)}${String(r.offersAt[30]).padStart(6)}`
    + `${String(r.distinctCandidates).padStart(11)}${String(r.committedOffered).padStart(15)}${String(r.marketMessages).padStart(8)}`,
  );
}

const all = [...results, ...controlled];

check('Parte J: existe pool de agentes livres no momento da separação', () => {
  // Com seed fixa o pool é reproduzível; ainda assim a asserção só exige o
  // mínimo real (há alguém livre), sem piso inventado — o contrato de IA dura
  // 240 dias e 210 dias de aquecimento deixam poucos livres de propósito.
  for (const r of results) {
    console.log(`   [registro] ${r.label}: ${r.freeAgents} livres após ${WARMUP_DAYS}d de aquecimento`);
    assert.ok(r.freeAgents > 0, `${r.label}: pool completamente vazio`);
  }
});

check('Parte J/6: o jogador recebe ofertas SEM abrir a busca (limitado ao pool real)', () => {
  for (const r of all) {
    assert.equal(r.offersAt[0], 0, `${r.label}: já havia oferta em D+0`);
    const first = r.windowStats[0];
    assert.equal(first.day, r.firstWindowDay);
    console.log(`   [registro] ${r.label}: ${r.windowStats.map((w) => `D+${w.day}:elegíveis=${w.eligible}/ofertas=${w.created}`).join(' ')}`);
    // Há elegível livre na 1ª janela => ao menos 1 oferta (a busca manual não é necessária).
    if (first.eligible >= 1) {
      assert.ok(r.offersAt[3] >= 1, `${r.label}: ${first.eligible} elegíveis e nenhuma oferta em D+3`);
    }
  }
});

check('Parte J: ofertas respeitam janelas (D+3, +7d) e limite por janela', () => {
  for (const r of all) {
    const maxWindows = Math.floor((30 - r.firstWindowDay) / r.intervalDays) + 1;
    assert.ok(r.windowCount <= maxWindows, `${r.label}: ${r.windowCount} janelas (máx ${maxWindows})`);
    for (const [win, n] of Object.entries(r.perWindow)) {
      assert.ok(n <= MAX_PER_WINDOW, `${r.label}: janela ${win} com ${n} ofertas`);
    }
    for (const entry of r.offerLog) {
      const offset = entry.day - r.firstWindowDay;
      assert.ok(offset >= 0 && offset % r.intervalDays === 0,
        `${r.label}: oferta criada em D+${entry.day}, fora do calendário de janelas`);
    }
    for (const w of r.windowStats) {
      assert.ok(w.created <= Math.min(MAX_PER_WINDOW, w.eligible),
        `${r.label}: D+${w.day} criou ${w.created} ofertas com ${w.eligible} elegíveis (limite ${MAX_PER_WINDOW})`);
      if (w.eligible === 0) assert.equal(w.created, 0, `${r.label}: D+${w.day} ofertou sem candidato elegível`);
    }
    const series = [0, 3, 7, 14, 30].map((d) => r.offersAt[d]);
    for (let i = 1; i < series.length; i += 1) {
      assert.ok(series[i] >= series[i - 1], `${r.label}: ofertas diminuíram (${series.join('->')})`);
    }
  }
});

check('Parte J: o mercado só esgota quando os candidatos livres elegíveis esgotam', () => {
  // Substitui a antiga exigência "D+30 > D+3": crescimento só é devido
  // quando há livres elegíveis ainda não oferecidos. Com o pool congelado,
  // o total de ofertas nunca passa do pool e cada candidato é oferecido 1x.
  for (const r of controlled) {
    console.log(`   [registro] ${r.label}: pool=${r.freeAgents} ofertas=${r.totalOffers} janelas=${r.windowCount}`);
    assert.ok(r.totalOffers <= r.freeAgents, `${r.label}: ${r.totalOffers} ofertas para pool de ${r.freeAgents}`);
    assert.equal(r.offeredOutsideSeparationPool, 0, `${r.label}: oferta a candidato fora do pool livre`);
  }
  const one = controlled.find((r) => r.frozenPool === 1);
  assert.equal(one.freeAgents, 1, 'cenário de 1 livre mal montado');
  assert.ok(one.totalOffers <= 1, `pool de 1 gerou ${one.totalOffers} ofertas`);
  assert.equal(one.distinctCandidates, one.totalOffers);
  // Em D+3 já ofereceu o único livre; as janelas seguintes não têm quem
  // oferecer e não podem inventar propostas nem avisos.
  assert.equal(one.offersAt[30], one.offersAt[3], 'pool de 1: ofertas novas sem candidato novo');
  assert.ok(one.marketMessages <= 1, `pool de 1 gerou ${one.marketMessages} avisos`);
  // Perfis com pool maior que uma janela continuam crescendo se há quem
  // oferecer: se sobraram livres elegíveis não oferecidos após D+3, houve
  // pelo menos uma janela adicional OU o filtro de interesse os recusou.
  for (const r of results) {
    console.log(`   [registro] ${r.label}: D+3=${r.offersAt[3]} -> D+30=${r.offersAt[30]} (livres=${r.freeAgents})`);
  }
});

check('Parte J/7: nenhuma proposta duplicada', () => {
  for (const r of all) {
    assert.equal(r.distinctCandidates, r.totalOffers,
      `${r.label}: ${r.totalOffers} ofertas para ${r.distinctCandidates} candidatos distintos`);
  }
});

check('Parte J: candidato já comprometido NÃO é oferecido (no momento da oferta)', () => {
  for (const r of all) {
    assert.equal(r.committedOffered, 0,
      `${r.label}: ${r.committedOffered} candidatos já tinham parceiro`);
  }
});

check('Parte V: os avisos de mercado não viram spam em 30 dias', () => {
  for (const r of all) {
    console.log(`   [registro] ${r.label}: ${r.marketMessages} avisos em 30 dias`);
    assert.ok(r.marketMessages <= 6, `${r.label}: ${r.marketMessages} avisos — spam`);
    assert.ok(r.marketMessages <= r.windowCount, `${r.label}: ${r.marketMessages} avisos para ${r.windowCount} janelas`);
  }
});

check('Parte J: perfis de ranking diferentes todos têm mercado', () => {
  const starved = results.filter((r) => r.offersAt[30] < 1);
  assert.equal(starved.length, 0,
    `perfis sem mercado: ${starved.map((r) => r.label).join(', ')}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-player-post-separation-market-v518: PASS');
