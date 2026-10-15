// Playthrough 5.13, Partes H/I/J/M — o caso Dubai Rising Cup.
//
// Sintoma do playtest: a mensagem "Sorteio definido" chega, o jogador
// clica em "Ver chave" e o modal mostra "Chave ainda não sorteada". Mais
// tarde (e na semana seguinte, Córdoba) funciona.
//
// Este teste separa as duas metades do problema:
//  (1) ATOMICIDADE da autoridade — no instante em que a notificação
//      existe, uma leitura NOVA do torneio já precisa reconstruir a chave;
//  (2) STALENESS da UI — um snapshot do torneio capturado ANTES do sorteio
//      não tem chave, e é exatamente esse objeto que a página passava para
//      o modal.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-bracket-atomicity-v513', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

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

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const hasUsableBracket = (t) => Number(t?.bracket_schema_version) >= 2
  && Array.isArray(t?.bracket_history) && t.bracket_history.length > 0;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { registerTournament } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { advanceCareerDays } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 DrawAtomicity', playerName: 'P513D' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p513d', sport_name: 'P513D', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-05');

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 180, prizeSplit: 50, monthlySalary: 300 });
  profile = await localGame.entities.PlayerProfile.get('p513d');

  // Escolhe um torneio com inscrição aberta e início suficientemente à
  // frente para passar por D-4 e D-3 de verdade.
  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  // O tier precisa ser compatível com o rank do jogador: a porta de
  // "overqualified" (5.5) recusa um Top-400 na base, e isso é correto.
  const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const target = tournaments.find((t) => t.start_date > '2026-01-12' && t.start_date < '2026-04-01'
    && evaluateTournamentEntry(t, { rank: 300, teamRank: 300 }).eligible);
  assert.ok(target, 'pré-condição: nenhum torneio elegível encontrado');
  console.log(`torneio: ${target.name} (${target.tier}) início=${target.start_date}`);

  const partnerAthlete = await localGame.entities.AthleteProfile.get(bot.id).catch(() => null);
  const registration = await registerTournament({
    player: profile, partner: partnerAthlete || bot, tournament: target, teamRank: 300,
  }).catch((e) => ({ error: e }));
  assert.ok(registration?.success,
    `inscrição falhou: ${registration?.error?.message || JSON.stringify(registration?.reasons)}`);

  // Avança até D-4 (véspera do sorteio).
  const drawDay = (() => {
    const d = new Date(`${target.start_date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 3);
    return d.toISOString().slice(0, 10);
  })();
  const dayBeforeDraw = (() => {
    const d = new Date(`${drawDay}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const daysTo = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);

  profile = await localGame.entities.PlayerProfile.get('p513d');
  await advanceCareerDays(profile, daysTo(profile.career_date, dayBeforeDraw));
  profile = await localGame.entities.PlayerProfile.get('p513d');
  const atDMinus4 = await localGame.entities.Tournament.get(target.id);

  console.log(`D-4 (${profile.career_date}): chave utilizável? ${hasUsableBracket(atDMinus4)}`);

  await check('Parte M: em D-4 ainda NÃO existe chave (pré-condição do cenário)', () => {
    assert.equal(hasUsableBracket(atDMinus4), false, 'a chave já existia antes do D-3');
  });

  // ESTE é o objeto que a página tinha em mãos antes do sorteio — o
  // snapshot que causava "Chave ainda não sorteada".
  const staleSnapshot = { ...atDMinus4 };

  // Tick do D-3: gera sorteio e emite a notificação.
  await advanceCareerDays(profile, 1);
  profile = await localGame.entities.PlayerProfile.get('p513d');

  const messages = await localGame.entities.CareerMessage.filter({ profile_id: 'p513d' }).catch(() => []);
  const drawMessage = (messages || []).find((m) => /sorteio definido/i.test(m.subject || m.title || ''));
  const freshRead = await localGame.entities.Tournament.get(target.id);

  console.log(`D-3 (${profile.career_date}): notificação=${drawMessage ? 'SIM' : 'não'} | leitura nova tem chave? ${hasUsableBracket(freshRead)}`);

  await check('Parte J: a notificação "Sorteio definido" existe após o tick do D-3', () => {
    assert.ok(drawMessage, 'nenhuma notificação de sorteio foi emitida');
  });

  await check('Parte J/16: no MESMO instante, uma leitura NOVA já reconstrói a chave', () => {
    assert.ok(hasUsableBracket(freshRead),
      'a notificação existe mas a autoridade ainda não serve a chave — anúncio antecipado');
  });

  await check('Parte J: a chave é consultável SEM reload, avanço de dia ou reabrir', async () => {
    // Uma segunda leitura imediata, sem nenhuma outra ação.
    const again = await localGame.entities.Tournament.get(target.id);
    assert.ok(hasUsableBracket(again));
    assert.equal(again.bracket_history.length, freshRead.bracket_history.length);
  });

  await check('Parte L (causa da UI): o SNAPSHOT pré-sorteio não tem chave — por isso o modal falhava', () => {
    assert.equal(hasUsableBracket(staleSnapshot), false);
    assert.ok(hasUsableBracket(freshRead),
      'o contraste snapshot vs leitura nova é a causa do "Chave ainda não sorteada"');
    console.log('   [registro] snapshot antigo: sem chave | leitura nova: com chave -> a página precisa reler');
  });

  await check('Parte I: a notificação carrega deep link para a chave', () => {
    const payload = JSON.stringify(drawMessage);
    assert.match(payload, /openBracket|bracket/i, 'a mensagem não aponta para a chave');
  });

  await check('Parte H: o evento de calendário do jogador tem tournament_run persistido', async () => {
    const events = await localGame.entities.CalendarEvent
      .filter({ profile_id: 'p513d', related_id: target.id }).catch(() => []);
    const withRun = (events || []).find((e) => e?.metadata?.tournament_run);
    assert.ok(withRun, 'nenhum CalendarEvent com tournament_run após o sorteio');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-bracket-atomicity-v513: PASS');
} finally {
  await vite.close();
}
