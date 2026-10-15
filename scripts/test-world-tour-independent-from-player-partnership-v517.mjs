// Playthrough 5.17, Parte G — o World Tour de IA NÃO pode depender do estado
// da parceria do jogador.
//
// Playtest: depois de ficar sem dupla, apareceram torneios sem sorteio e
// torneios cancelados, enquanto outros seguiam normais.
//
// Achado na leitura do código (WorldTourLifecycle.js:437-440 e :494): o
// filtro `due` do sorteio automático EXCLUI todo torneio presente em
// `playerTournamentIds` — o conjunto das inscrições do jogador em estado
// 'pending'/'confirmed'. A intenção é não sortear por cima do caminho do
// jogador. O efeito colateral é que, se aquele compromisso deixa de ser
// jogável, ninguém mais sorteia o evento: nem o mundo (excluído), nem o
// jogador (sem dupla).
//
// Este A/B mede isso com o MESMO mundo, variando só o estado do jogador.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims, makeRunner } from './lib/competitiveReviewGates.mjs';

const { check, finish } = makeRunner();
installShims('/tournaments');

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
const WEEKS = 12;

/**
 * Roda o MESMO mundo por 12 semanas. `playerRegisters` é a única variável:
 * no cenário A o jogador tem parceria e se inscreve; no B ele não tem dupla.
 */
async function runScenario(label, { playerRegisters, endPartnershipAfterRegistering = false }) {
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
  const { BOTS_BY_DIFFICULTY } = await mod('/src/lib/bots.js');
  const { formPartnerContract } = await mod('/src/game-core/partnerLifecycle.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: label, playerName: label });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: `ab-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
    level: 'Avançado', coins: 300000, xp: 50000, rank_points: 900,
    world_ranking: 500, ranking_position: 500,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments(START);

  const registeredIds = [];
  if (playerRegisters) {
    const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
    await formPartnerContract(profile, bot, { durationDays: 365, prizeSplit: 50, monthlySalary: 300 });
    profile = await localGame.entities.PlayerProfile.get(`ab-${label}`);
    const partner = await localGame.entities.AthleteProfile.get(bot.id).catch(() => bot);
    const all = await localGame.entities.Tournament.list('start_date', 3000);
    // Inscreve em alguns eventos dentro da janela de 12 semanas.
    for (const t of all) {
      if (registeredIds.length >= 4) break;
      if (t.start_date <= START || t.start_date > addDays(START, WEEKS * 7)) continue;
      const res = await registerTournament({ player: profile, partner, tournament: t, teamRank: 500 });
      if (res?.success) registeredIds.push(t.id);
    }
    if (endPartnershipAfterRegistering) {
      // O caso EXATO do playtest: compromissos assumidos e, depois, a
      // parceria acaba. Isola a variável "estado da parceria" mantendo as
      // inscrições idênticas ao cenário A.
      const { getActivePartnership, endPartnership } = await mod('/src/lib/partnershipSystem.js');
      const active = await getActivePartnership(`ab-${label}`).catch(() => null);
      if (active) await endPartnership(active.id, 'encerrada_contrato', 'Teste 5.17', addDays(START, 7));
      await localGame.entities.PlayerProfile.update(`ab-${label}`, {
        partner_id: null, partner_name: null, partner_locked_until: null,
      });
    }
  }

  let date = START;
  for (let i = 0; i < WEEKS * 7; i += 1) {
    date = addDays(date, 1);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
  }

  const tournaments = await localGame.entities.Tournament.list('start_date', 5000);
  const inWindow = tournaments.filter((t) => t.start_date > START && t.start_date <= date);
  const drawn = inWindow.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
  const cancelled = inWindow.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
  const noDraw = inWindow.filter((t) => !t.world_tour_cancelled && t.status !== 'cancelado'
    && !(Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length));

  const byTier = {};
  for (const t of cancelled) byTier[t.tier] = (byTier[t.tier] || 0) + 1;

  await vite.close();
  return {
    label, registeredIds, endDate: date,
    total: inWindow.length,
    drawn: drawn.length,
    cancelled: cancelled.length,
    noDraw: noDraw.length,
    cancelledByTier: byTier,
    entrantsTotal: drawn.reduce((sum, t) => sum + t.draw_pair_ids.length, 0),
    noDrawNames: noDraw.slice(0, 6).map((t) => `${t.name}(${t.tier})`),
    cancelledNames: cancelled.slice(0, 6).map((t) => `${t.name}(${t.tier})`),
  };
}

const withPartner = await runScenario('CenarioA', { playerRegisters: true });
const withoutPartner = await runScenario('CenarioB', { playerRegisters: false });
// Cenário C isola a variável que a Parte G realmente pergunta: MESMAS
// inscrições do cenário A, mas a parceria termina depois de assumidas.
const separated = await runScenario('CenarioC', { playerRegisters: true, endPartnershipAfterRegistering: true });

console.log('\n=== PARTE G: A/B do World Tour (12 semanas, mesmo mundo) ===');
console.log('cenário                      eventos  sorteados  cancelados  sem sorteio  entrantes');
for (const r of [withPartner, withoutPartner, separated]) {
  console.log(`${r.label.padEnd(28)}${String(r.total).padStart(8)}${String(r.drawn).padStart(11)}${String(r.cancelled).padStart(12)}${String(r.noDraw).padStart(13)}${String(r.entrantsTotal).padStart(11)}`);
}
console.log(`\nA: jogador inscrito em ${withPartner.registeredIds.length} eventos`);
console.log(`A cancelados por tier: ${JSON.stringify(withPartner.cancelledByTier)}`);
console.log(`B cancelados por tier: ${JSON.stringify(withoutPartner.cancelledByTier)}`);
if (withPartner.noDrawNames.length) console.log(`A sem sorteio: ${withPartner.noDrawNames.join(', ')}`);
if (withoutPartner.noDrawNames.length) console.log(`B sem sorteio: ${withoutPartner.noDrawNames.join(', ')}`);

await check('Parte G: os dois cenários viram o MESMO calendário', () => {
  assert.equal(withPartner.total, withoutPartner.total,
    `A viu ${withPartner.total} eventos e B viu ${withoutPartner.total}`);
});

await check('Parte G/14: o estado do jogador não muda o total de sorteios do mundo', () => {
  // Desconta os eventos do próprio jogador: a presença da dupla dele é a
  // ÚNICA diferença legítima (Parte G).
  const diff = Math.abs(withPartner.drawn - withoutPartner.drawn);
  const allowance = withPartner.registeredIds.length;
  console.log(`   [registro] sorteados A=${withPartner.drawn} B=${withoutPartner.drawn} (tolerância=${allowance})`);
  assert.ok(diff <= allowance,
    `diferença de ${diff} sorteios excede os ${allowance} eventos do jogador`);
});

await check('Parte G: o estado do jogador não cria torneios SEM SORTEIO', () => {
  const extra = withPartner.noDraw - withoutPartner.noDraw;
  console.log(`   [registro] sem sorteio A=${withPartner.noDraw} B=${withoutPartner.noDraw}`);
  assert.ok(extra <= withPartner.registeredIds.length,
    `${extra} eventos a mais ficaram sem sorteio só porque o jogador se inscreveu`);
});

await check('Parte G/12-13: o estado do jogador não aumenta cancelamentos', () => {
  const extra = withPartner.cancelled - withoutPartner.cancelled;
  console.log(`   [registro] cancelados A=${withPartner.cancelled} B=${withoutPartner.cancelled}`);
  assert.ok(extra <= withPartner.registeredIds.length,
    `${extra} cancelamentos a mais com o jogador inscrito`);
});

// --- A pergunta central da Parte G -----------------------------------------
// A vs C: MESMAS inscrições, única diferença é a parceria ter terminado.
// Aqui NÃO há tolerância: se o estado da parceria mexesse no mundo de IA,
// apareceria exatamente neste par.
await check('Parte G/14: separar a dupla NÃO muda o sorteio do mundo de IA', () => {
  console.log(`   [registro] sorteados A=${withPartner.drawn} C=${separated.drawn}`);
  assert.equal(separated.drawn, withPartner.drawn,
    'o fim da parceria alterou quantos torneios de IA foram sorteados');
});

await check('Parte G: separar a dupla NÃO cria torneio sem sorteio', () => {
  console.log(`   [registro] sem sorteio A=${withPartner.noDraw} C=${separated.noDraw}`);
  assert.equal(separated.noDraw, withPartner.noDraw,
    'o fim da parceria deixou torneios sem chave');
});

await check('Parte G/12-13: separar a dupla NÃO cancela torneios', () => {
  console.log(`   [registro] cancelados A=${withPartner.cancelled} C=${separated.cancelled}`);
  assert.equal(separated.cancelled, withPartner.cancelled,
    'o fim da parceria aumentou cancelamentos');
});

await check('Parte G: o campo de IA é idêntico com e sem parceria ativa', () => {
  const delta = Math.abs(separated.entrantsTotal - withPartner.entrantsTotal) / Math.max(1, withPartner.entrantsTotal);
  console.log(`   [registro] entrantes A=${withPartner.entrantsTotal} C=${separated.entrantsTotal} (delta ${(delta * 100).toFixed(1)}%)`);
  assert.ok(delta < 0.02, `campo divergiu ${(delta * 100).toFixed(1)}% só por causa da separação`);
});

await check('Parte G: o campo agregado de IA é equivalente nos dois cenários', () => {
  const a = withPartner.entrantsTotal;
  const b = withoutPartner.entrantsTotal;
  const delta = Math.abs(a - b) / Math.max(1, b);
  console.log(`   [registro] entrantes A=${a} B=${b} (delta ${(delta * 100).toFixed(1)}%)`);
  assert.ok(delta < 0.10, `campo agregado divergiu ${(delta * 100).toFixed(1)}%`);
});

finish('test-world-tour-independent-from-player-partnership-v517');
