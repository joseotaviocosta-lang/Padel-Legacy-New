// Playthrough 5.14 (continuação), Partes A/B/E/F — o bug do playtest: a
// mesma reunião competitiva reaparecendo TODO DIA.
//
// Este teste usa o fluxo REAL (processStaffDay, dia a dia, relendo o save a
// cada passo), não só a chamada direta da autoridade.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-staff-weekly-review-real-dedupe-v514', search: '' };
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

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { formPartnerContract } = await vite.ssrLoadModule('/src/game-core/partnerLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { processStaffDay } = await vite.ssrLoadModule('/src/game-core/staffLifecycle.js');
  const { competitiveWeekKey } = await vite.ssrLoadModule('/src/game-core/competitiveStaffReview.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.14 RealDedupe', playerName: 'P514D' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p514d', sport_name: 'P514D', career_date: '2026-01-19', birth_date: '2001-01-01',
    level: 'Avançado', coins: 200000, xp: 50000, morale: 70, form: 60, energy: 100,
    rank_points: 900, world_ranking: 300, ranking_position: 300,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-19');
  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await formPartnerContract(profile, bot, { durationDays: 180, prizeSplit: 50, monthlySalary: 300 });

  const reviews = async () => {
    const all = await localGame.entities.CareerMessage.filter({ profile_id: 'p514d' }).catch(() => []);
    return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  };

  // ---- 7 dias da MESMA semana, relendo o save a cada passo ----
  const DAYS = ['2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24', '2026-01-25'];
  const timeline = [];
  let previous = '2026-01-18';
  for (const day of DAYS) {
    profile = await localGame.entities.PlayerProfile.get('p514d');
    await localGame.entities.PlayerProfile.update('p514d', { career_date: day });
    profile = await localGame.entities.PlayerProfile.get('p514d');
    await processStaffDay(profile, previous, day);
    previous = day;
    const rows = await reviews();
    // Simula o jogador LENDO a reunião no primeiro dia. A pergunta da Parte
    // F é se os ticks seguintes a trazem de volta como não lida — não se ela
    // nasce não lida (isso é esperado).
    if (day === DAYS[0] && rows[0]) {
      await localGame.entities.CareerMessage.update(rows[0].id, {
        is_read: true, is_new: false, status: 'lida',
      });
    }
    timeline.push({
      day, count: rows.length,
      unread: rows.filter((m) => m.is_read === false || m.status === 'nao_lida').length,
      isNew: rows.filter((m) => m.is_new).length,
      careerDates: rows.map((m) => m.career_date).join(','),
      ids: rows.map((m) => m.id).join(','),
    });
  }

  console.log('=== 7 dias da mesma semana (fluxo real, save relido) ===');
  console.log('dia          msgs  não-lidas  is_new  career_date da mensagem');
  for (const t of timeline) {
    console.log(`${t.day}   ${String(t.count).padStart(4)} ${String(t.unread).padStart(10)} ${String(t.isNew).padStart(7)}  ${t.careerDates}`);
  }

  const final = timeline.at(-1);
  const week = competitiveWeekKey('2026-01-19');
  console.log(`\nsemana: ${week}`);

  await check('Parte A/6: 7 dias na MESMA semana produzem exatamente 1 mensagem', () => {
    assert.equal(final.count, 1, `${final.count} mensagens na mesma semana`);
  });

  await check('Parte B/3: o id da mensagem permanece o MESMO todos os dias', () => {
    const ids = new Set(timeline.map((t) => t.ids));
    assert.equal(ids.size, 1, `ids mudaram ao longo da semana: ${[...ids].join(' | ')}`);
  });

  await check('Parte B/2: o context_key permanece o mesmo', async () => {
    const rows = await reviews();
    assert.equal(rows[0].metadata.context_key, `staff-competitive-review:${week}`);
  });

  await check('Parte F/11: a mensagem NÃO volta a "não lida" todo dia', () => {
    // Era isso que fazia parecer que a reunião era recriada diariamente: a
    // linha é a mesma, mas era remarcada como nova a cada tick.
    const afterFirstDay = timeline.slice(1);
    const rebounced = afterFirstDay.filter((t) => t.isNew > 0).length;
    console.log(`   [registro] dias em que a mensagem voltou a "nova": ${rebounced} de ${afterFirstDay.length}`);
    assert.equal(rebounced, 0,
      'a reunião é remarcada como nova a cada dia — aparece como mensagem repetida na Central');
  });

  await check('Parte B: a data da mensagem NÃO é reescrita para "hoje" todo dia', () => {
    const dates = new Set(timeline.map((t) => t.careerDates));
    console.log(`   [registro] datas distintas observadas: ${[...dates].join(' | ')}`);
    assert.equal(dates.size, 1,
      'a data da reunião muda a cada dia — ela sobe de novo no topo da Central');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-staff-weekly-review-real-dedupe-v514: PASS');
} finally {
  await vite.close();
}
