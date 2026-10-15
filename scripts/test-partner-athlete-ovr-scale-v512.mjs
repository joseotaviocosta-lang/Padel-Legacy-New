// Playthrough 5.12, Partes A/U/V — AUDITORIA DE ESCALA antes de qualquer
// materialização.
//
// O briefing marca isto como crítico: se o OVR 13 de um bot e o OVR 70 de
// um atleta do World Tour estiverem em escalas diferentes, materializar 13
// diretamente seria um erro grave. Este teste responde com dados, não com
// leitura de código.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-ovr-scale-v512', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

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
  const { BOTS_BY_DIFFICULTY, BOT_DIFFICULTIES } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { overallRating, ATTRIBUTE_KEYS } = await vite.ssrLoadModule('/src/lib/padel.js');
  const { buildAthleteCatalog } = await vite.ssrLoadModule('/src/players/athleteCatalog.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');

  console.log('=== Atributos que definem o OVR ===');
  console.log(`  ATTRIBUTE_KEYS (${ATTRIBUTE_KEYS.length}): ${ATTRIBUTE_KEYS.join(', ')}`);
  console.log('\n=== Faixas de dificuldade dos bots ===');
  for (const t of BOT_DIFFICULTIES) console.log(`  ${t.id.padEnd(13)} ${String(t.min).padStart(3)}–${String(t.max).padStart(3)} (base ${t.base})`);

  await check('Parte U/3: existe UMA função de OVR, derivada dos mesmos atributos', () => {
    assert.ok(Array.isArray(ATTRIBUTE_KEYS) && ATTRIBUTE_KEYS.length > 0);
    const probe = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 50]));
    assert.equal(overallRating(probe), 50, 'overallRating não é a média dos ATTRIBUTE_KEYS');
  });

  await check('Parte U/1: as faixas de bot cobrem 1–100 de forma CONTÍNUA (uma escala só)', () => {
    const sorted = [...BOT_DIFFICULTIES].sort((a, b) => a.min - b.min);
    assert.equal(sorted[0].min, 1, `a faixa mais baixa começa em ${sorted[0].min}`);
    assert.equal(sorted.at(-1).max, 100, `a faixa mais alta termina em ${sorted.at(-1).max}`);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.equal(sorted[i].min, sorted[i - 1].max + 1,
        `buraco/sobreposição entre ${sorted[i - 1].id} e ${sorted[i].id}`);
    }
  });

  // --- os bots SÃO atletas do catálogo? ---
  const catalog = buildAthleteCatalog();
  const catalogById = new Map(catalog.map((a) => [a.template_id ?? a.id, a]));
  const allBots = Object.values(BOTS_BY_DIFFICULTY).flat();
  console.log(`\ncatálogo: ${catalog.length} atletas | bots expostos: ${allBots.length}`);

  await check('Parte A/U: todo bot é uma PROJEÇÃO de um atleta do catálogo (mesmo template_id)', () => {
    let matched = 0;
    for (const bot of allBots.slice(0, 300)) {
      if (catalogById.has(bot.bot_id)) matched += 1;
    }
    assert.ok(matched > 250, `só ${matched}/300 bots resolvem para um atleta do catálogo`);
  });

  await check('Parte U/2: o OVR do bot é o MESMO do atleta de catálogo', () => {
    let checked = 0;
    for (const bot of allBots.slice(0, 200)) {
      const source = catalogById.get(bot.bot_id);
      if (!source) continue;
      assert.equal(bot.overall_rating, source.overall_rating, `${bot.name}: OVR divergente`);
      checked += 1;
    }
    console.log(`   [registro] bots verificados: ${checked}`);
    assert.ok(checked > 100);
  });

  // ACHADO (Partes G/V) — o vocabulário de atributos do bot NÃO é o de
  // ATTRIBUTE_KEYS, e `attributes` vem vazio. Uma versão anterior deste
  // teste comparava `Number(bot[k])` com `Number(source.attributes[k])` e
  // passava sem medir nada: com os dois lados `undefined`, o resultado é
  // NaN dos dois lados, e `assert/strict` trata NaN como igual a NaN.
  // Agora o vocabulário é medido explicitamente.
  const sampleBot = allBots.find((b) => ATTRIBUTE_KEYS.some((k) => Number.isFinite(Number(b[k]))));
  const botAttrKeys = sampleBot
    ? Object.keys(sampleBot).filter((k) => Number.isFinite(Number(sampleBot[k])) && !['overall', 'overall_rating', 'potential', 'age', 'ranking_position', 'world_rank'].includes(k))
    : [];
  const missingInBot = ATTRIBUTE_KEYS.filter((k) => !botAttrKeys.includes(k));
  console.log('\n=== Parte V: vocabulário de atributos ===');
  console.log(`  ATTRIBUTE_KEYS ausentes no bot: ${missingInBot.join(', ') || 'nenhum'}`);
  console.log(`  chaves numéricas do bot: ${botAttrKeys.join(', ') || 'nenhuma'}`);

  await check('Parte V/3 (achado): bot e ATTRIBUTE_KEYS usam vocabulários DIFERENTES', () => {
    assert.ok(missingInBot.length > 0,
      'os vocabulários passaram a coincidir — rever o mapeamento documentado em partnerAthlete.js');
    console.log(`   [registro] ${ATTRIBUTE_KEYS.length - missingInBot.length} de ${ATTRIBUTE_KEYS.length} chaves em comum`);
  });

  await check('Parte G/2 (achado): overallRating() NÃO é a autoridade de OVR de atleta', () => {
    // Para PlayerProfile o OVR é derivado dos atributos; para bot/atleta do
    // mundo ele é o campo persistido. Medir isso evita que alguém aplique a
    // função errada num parceiro materializado e o veja virar OVR 1.
    let worst = 0;
    for (const bot of allBots.slice(0, 200)) {
      worst = Math.max(worst, Math.abs(overallRating(bot) - bot.overall_rating));
    }
    console.log(`   [registro] divergência máxima entre overallRating() e overall_rating: ${worst}`);
    assert.ok(worst > 10,
      'overallRating() passou a reproduzir overall_rating — a autoridade mudou, rever partnerAthlete.js');
  });

  // --- e os atletas persistidos do mundo? ---
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Scale', playerName: 'P512S' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p512s', sport_name: 'P512S', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();
  const worldAthletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const worldOvrs = worldAthletes.map((a) => Number(a.overall_rating) || 0).filter((v) => v > 0).sort((x, y) => x - y);
  const botOvrs = allBots.map((b) => Number(b.overall_rating) || 0).filter((v) => v > 0).sort((x, y) => x - y);
  const pct = (arr, p) => arr[Math.floor((arr.length - 1) * p)];

  console.log('\n=== Distribuição de OVR ===');
  console.log(`  atletas do MUNDO (${worldOvrs.length}): min ${worldOvrs[0]} | p50 ${pct(worldOvrs, 0.5)} | max ${worldOvrs.at(-1)}`);
  console.log(`  bots do CATÁLOGO (${botOvrs.length}): min ${botOvrs[0]} | p50 ${pct(botOvrs, 0.5)} | max ${botOvrs.at(-1)}`);

  await check('Parte U/4: mundo e bots NÃO são sistemas distintos — as faixas se sobrepõem', () => {
    const overlapLow = Math.max(worldOvrs[0], botOvrs[0]);
    const overlapHigh = Math.min(worldOvrs.at(-1), botOvrs.at(-1));
    console.log(`   [registro] sobreposição de OVR: ${overlapLow}–${overlapHigh}`);
    assert.ok(overlapHigh > overlapLow, 'as faixas não se sobrepõem — seriam escalas distintas');
  });

  await check('Parte U/7: OVR 13 é um valor LEGÍTIMO da mesma escala (Iniciante), não outra unidade', () => {
    const band = BOT_DIFFICULTIES.find((t) => 13 >= t.min && 13 <= t.max);
    assert.ok(band, 'OVR 13 não cai em nenhuma faixa');
    console.log(`   [registro] OVR 13 pertence à faixa "${band.label}" (${band.min}–${band.max}) da MESMA escala 1–100`);
    assert.equal(band.id, 'iniciante');
  });

  // --- o parceiro já existe como AthleteProfile persistido? ---
  const worldByBotId = new Set(worldAthletes.map((a) => a.bot_id).filter(Boolean));
  const sampleBots = (BOTS_BY_DIFFICULTY.iniciante || []).slice(0, 50);
  const persisted = sampleBots.filter((b) => worldByBotId.has(b.bot_id)).length;
  console.log(`\n=== Parte A/8: bots "iniciante" que JÁ existem como AthleteProfile ===`);
  console.log(`  ${persisted} de ${sampleBots.length}`);

  await check('Parte A/8 (achado): o parceiro inicial NÃO existe como AthleteProfile persistido', () => {
    // Este é o problema que a 5.12 precisa resolver. Se um dia passar a
    // existir, o teste falha de propósito para forçar revisão.
    assert.equal(persisted, 0,
      `${persisted} bots iniciantes já estão persistidos — a premissa da fase mudou`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-ovr-scale-v512: PASS');
} finally {
  await vite.close();
}
