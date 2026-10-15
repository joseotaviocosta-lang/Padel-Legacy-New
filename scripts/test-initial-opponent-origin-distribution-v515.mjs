// Playthrough 5.15, Partes T/U/V — os adversários iniciais do jogador.
//
// No playtest apareciam duplas procedurais rotuladas como #20/#30/#40/#50.
// A Parte U é explícita: o problema NÃO é enfrentar bot; é um bot aparecer
// como "#25 mundial" sem sustentação nenhuma.
//
// Este teste mede de onde vêm esses adversários e o que o número ao lado
// deles realmente significa.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildOriginIndex, ORIGIN } from './lib/originClassifier.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-initial-opponent-origin-distribution-v515', search: '' };
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
  const { generateTournamentOpponent } = await vite.ssrLoadModule('/src/lib/career.js');
  const { getCanonicalTeamWorldRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.15 Opponents', playerName: 'P515O' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p515o', sport_name: 'P515O', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 10000, xp: 0, ranking_position: 900, world_ranking: 900,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const { originById } = await buildOriginIndex(vite, athletes);
  const worldIds = new Set(athletes.map((a) => a.id));

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const base = tournaments.filter((t) => ['Bronze', 'Silver'].includes(t.tier)).slice(0, 50);
  assert.ok(base.length > 0, 'pré-condição: sem torneios de base');

  // 200 campanhas iniciais: primeiro adversário de cada.
  const samples = [];
  for (let i = 0; i < 200; i += 1) {
    const tournament = base[i % base.length];
    const members = generateTournamentOpponent(tournament, { ...profile, id: `p515o-${i}` }, 0, [], 900, 'main');
    if (members.length !== 2) continue;
    samples.push({ tournament, members });
  }

  const inWorld = samples.filter((s) => s.members.every((m) => worldIds.has(m.id))).length;
  const realMembers = samples.filter((s) => s.members.every((m) => originById.get(m.id) === ORIGIN.REAL)).length;
  const ovrs = samples.map((s) => Math.round((Number(s.members[0].overall_rating) + Number(s.members[1].overall_rating)) / 2));
  const avgOvr = ovrs.reduce((a, b) => a + b, 0) / Math.max(1, ovrs.length);

  console.log('=== PARTE T: 200 primeiros adversários ===');
  console.log(`  amostras .................................. ${samples.length}`);
  console.log(`  duplas cujos DOIS membros existem no mundo  ${inWorld}`);
  console.log(`  duplas formadas por atletas REAIS ......... ${realMembers}`);
  console.log(`  OVR médio do adversário ................... ${avgOvr.toFixed(1)}`);
  console.log(`  exemplo: ${samples[0].members.map((m) => `${m.name} (OVR ${m.overall_rating})`).join(' / ')}`);

  await check('Parte T/33 (achado): os adversários vêm do CATÁLOGO, não da população do mundo', () => {
    // Este é o dado central: eles não são duplas do TeamRanking; são bots
    // do catálogo (BOTS_BY_DIFFICULTY), um universo separado.
    console.log(`   [registro] ${inWorld}/${samples.length} adversários existem como AthleteProfile do mundo`);
    assert.equal(inWorld, 0,
      'alguns adversários agora vêm do mundo — a premissa do teste mudou');
  });

  await check('Parte U: nenhum adversário inicial é uma dupla real de elite', () => {
    assert.equal(realMembers, 0, `${realMembers} adversários iniciais são atletas reais`);
  });

  await check('Parte U/V (achado): o adversário do catálogo NÃO tem ranking mundial real', async () => {
    // Se ele não é uma dupla canônica do circuito, a fonte canônica precisa
    // dizer "sem ranking" — e não inventar uma posição.
    const sample = samples[0];
    const rank = await getCanonicalTeamWorldRank(sample.members.map((m) => m.id));
    console.log(`   [registro] getCanonicalTeamWorldRank -> rank=${rank.rank} unranked=${rank.unranked} display=${rank.displayRank}`);
    assert.equal(rank.unranked, true,
      'a fonte canônica atribuiu posição mundial a um bot de catálogo');
    assert.equal(rank.displayRank, '—');
  });

  await check('Parte U: o OVR do adversário inicial é compatível com um iniciante', () => {
    assert.ok(avgOvr < 60, `OVR médio ${avgOvr.toFixed(1)} alto demais para adversário de base`);
  });

  await check('Parte V: a dificuldade acompanha o tier do torneio', () => {
    const bronze = samples.filter((s) => s.tournament.tier === 'Bronze');
    const silver = samples.filter((s) => s.tournament.tier === 'Silver');
    if (!bronze.length || !silver.length) { console.log('   (amostra sem os dois tiers)'); return; }
    const mean = (list) => list.reduce((sum, s) => sum + (Number(s.members[0].overall_rating) + Number(s.members[1].overall_rating)) / 2, 0) / list.length;
    console.log(`   [registro] OVR médio Bronze=${mean(bronze).toFixed(1)} Silver=${mean(silver).toFixed(1)}`);
    assert.ok(mean(silver) >= mean(bronze) - 5, 'Silver mais fraco que Bronze');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-initial-opponent-origin-distribution-v515: PASS');
} finally {
  await vite.close();
}
