// Playthrough 5.13 (continuação), Parte R — sanity check de CADÊNCIA.
//
// No playtest, Joaquín Vega foi de OVR 10 para 14 e depois ficou em 14 por
// alguns dias. Isso NÃO é bug: a evolução é MENSAL (evolveAthleteCareerMonth
// tem guard por `last_career_evolution_month`), não diária.
//
// Este teste apenas prova a cadência. NÃO altera a curva de desenvolvimento.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-development-cadence-v513', search: '' };
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
  const { materializePartnerAthlete } = await vite.ssrLoadModule('/src/lib/partnerAthlete.js');
  const { evolveAthleteCareerMonth } = await vite.ssrLoadModule('/src/game-core/livingCircuitRules.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.13 Cadence', playerName: 'P513K' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p513k', sport_name: 'P513K', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });

  // O caso real: parceiro iniciante, jovem, com margem de crescimento.
  const athlete = await materializePartnerAthlete({
    id: 'joaquin-vega-like', name: 'Joaquín Vega', age: 19,
    overall_rating: 10, overall: 10, potential: 40,
    country: 'Argentina', position: 'direita', play_style: 'controle',
  }, { careerDate: '2026-01-01' });

  console.log(`parceiro: ${athlete.name} OVR inicial=${athlete.overall_rating} potencial=${athlete.potential}`);

  // ---- DIAS dentro do MESMO mês ----
  let current = { ...athlete };
  const sameMonth = [];
  for (let day = 1; day <= 12; day += 1) {
    const date = `2026-01-${String(day).padStart(2, '0')}`;
    const result = evolveAthleteCareerMonth(current, date);
    if (result.changed) current = { ...current, ...result.patch };
    sameMonth.push({ date, ovr: Number(current.overall_rating), changed: result.changed });
  }
  const distinctSameMonth = new Set(sameMonth.map((s) => s.ovr));
  const evolvedDays = sameMonth.filter((s) => s.changed).length;

  console.log(`\n12 dias do MESMO mês: OVR ${sameMonth[0].ovr} -> ${sameMonth.at(-1).ovr} | dias que evoluíram=${evolvedDays}`);

  await check('Parte R/25: o OVR NÃO sobe diariamente', () => {
    assert.ok(distinctSameMonth.size <= 2,
      `o OVR mudou ${distinctSameMonth.size} vezes em 12 dias do mesmo mês`);
    assert.equal(evolvedDays, 1,
      `${evolvedDays} dias aplicaram evolução no mesmo mês — deveria ser no máximo 1`);
  });

  await check('Parte R: o guard mensal é explícito (last_career_evolution_month)', () => {
    assert.ok(current.last_career_evolution_month, 'sem marcador de mês processado');
    assert.equal(current.last_career_evolution_month, '2026-01');
  });

  await check('Parte R: permanecer com o MESMO OVR por vários dias é esperado', () => {
    const afterFirst = sameMonth.slice(1);
    const stable = afterFirst.every((s) => s.ovr === afterFirst[0].ovr);
    assert.ok(stable, 'o OVR oscilou dentro do mesmo mês');
    console.log(`   [registro] após a evolução do mês, ${afterFirst.length} dias seguidos com OVR ${afterFirst[0].ovr}`);
  });

  // ---- MESES seguintes ----
  const monthly = [];
  for (let month = 2; month <= 12; month += 1) {
    const date = `2026-${String(month).padStart(2, '0')}-15`;
    const result = evolveAthleteCareerMonth(current, date);
    if (result.changed) current = { ...current, ...result.patch };
    monthly.push({ month, ovr: Number(current.overall_rating), delta: result.delta ?? 0 });
  }
  console.log(`12 meses: OVR final=${current.overall_rating} | meses com ganho=${monthly.filter((m) => m.delta > 0).length}`);

  await check('Parte R/24: ao longo dos MESES o parceiro realmente evolui', () => {
    assert.ok(Number(current.overall_rating) > Number(athlete.overall_rating),
      `OVR não subiu em um ano: ${athlete.overall_rating} -> ${current.overall_rating}`);
  });

  await check('Parte R: a evolução mensal não é garantida todo mês (é curva, não escada)', () => {
    const gained = monthly.filter((m) => m.delta > 0).length;
    assert.ok(gained < monthly.length, `ganhou OVR em todos os ${gained} meses`);
    console.log(`   [registro] ${gained} de ${monthly.length} meses com ganho`);
  });

  await check('Parte R: o OVR nunca ultrapassa o potencial', () => {
    assert.ok(Number(current.overall_rating) <= Number(athlete.potential),
      `OVR ${current.overall_rating} > potencial ${athlete.potential}`);
  });

  await check('Parte R: a curva NÃO foi alterada (mesma entrada, mesmo resultado)', async () => {
    const twin = await materializePartnerAthlete({
      id: 'joaquin-vega-twin', name: 'Joaquín Vega Twin', age: 19,
      overall_rating: 10, overall: 10, potential: 40,
    }, { careerDate: '2026-01-01' });
    let t = { ...twin, id: 'joaquin-vega-like' }; // mesma seed de id
    for (let month = 1; month <= 12; month += 1) {
      const r = evolveAthleteCareerMonth(t, `2026-${String(month).padStart(2, '0')}-15`);
      if (r.changed) t = { ...t, ...r.patch };
    }
    assert.equal(Number(t.overall_rating), Number(current.overall_rating),
      'o resultado mudou entre execuções idênticas');
    void localGame;
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-development-cadence-v513: PASS');
} finally {
  await vite.close();
}
