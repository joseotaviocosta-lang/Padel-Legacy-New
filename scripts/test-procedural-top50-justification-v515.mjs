// Playthrough 5.15 (continuação), Partes M/N — cada dupla PROCEDURAL que
// alcança o Top50 precisa ter origem explicável.
//
// JUSTIFIED     : os pontos derivam dos rolling points reais dos membros
//                 (fórmula canônica), que por sua vez vêm de resultados.
// SEED_INFLATED : os pontos não batem com os membros — sobra de valor
//                 congelado da semeadura.
//
// Playthrough 5.22-F — a autoridade canônica passou de MÉDIA GEOMÉTRICA
// (`Math.round(Math.sqrt(a*b))`, 5.11) para SOMA (`Math.round(a+b)`,
// 5.22-E). O objetivo desta suíte NÃO mudou: nenhuma dupla procedural pode
// entrar no Top50 com valor que os membros não sustentem. O que mudou é o
// baseline numérico: a 5.11 calibrou "PP nunca supera a melhor dupla real"
// e "Top50 majoritariamente RR" porque a geométrica SUPRIMIA assimetrias.
// Sob a SOMA uma dupla procedural de dois membros fortes soma mais e pode
// legitimamente alcançar/ultrapassar o Top50 real — desde que JUSTIFICADA.
// Por isso as checagens foram reescritas para o invariante de origem
// (sustentação pela soma dos membros), não para um teto geométrico.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildOriginIndex, classifyPair, ORIGIN } from './lib/originClassifier.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-procedural-top50-justification-v515', search: '' };
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
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
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
  const { computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.15 PPJust', playerName: 'P515J' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p515j', sport_name: 'P515J', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();

  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  const { originById } = await buildOriginIndex(vite, athletes);
  const byId = new Map(athletes.map((a) => [a.id, a]));

  const top50 = teams.slice(0, 50);
  const procedural = top50
    .map((t, i) => ({ row: t, rank: i + 1, cls: classifyPair(originById, t.player1_id, t.player2_id) }))
    .filter((x) => x.cls === 'PP');

  console.log(`=== PARTE M/20: duplas PROCEDURAIS no Top50 (seed) ===`);
  console.log(`  total: ${procedural.length}\n`);

  const verdicts = [];
  for (const entry of procedural) {
    const a = byId.get(entry.row.player1_id);
    const b = byId.get(entry.row.player2_id);
    const pa = Number(a?.world_ranking_points) || 0;
    const pb = Number(b?.world_ranking_points) || 0;
    const expected = computeCanonicalTeamRankingPoints(pa, pb);
    const stored = Number(entry.row.ranking_points) || 0;
    const justified = stored === expected;
    verdicts.push({ ...entry, a, b, pa, pb, expected, stored, justified });

    console.log(`  #${entry.rank} ${a?.name} / ${b?.name}`);
    console.log(`      membros: ${pa} + ${pb} pts de circuito`);
    console.log(`      OVR: ${a?.overall_rating} / ${b?.overall_rating}`);
    console.log(`      rank individual: #${a?.ranking_position ?? '—'} / #${b?.ranking_position ?? '—'}`);
    console.log(`      dupla: ${stored} pts | canônico dos membros: ${expected}`);
    console.log(`      veredito: ${justified ? 'JUSTIFIED' : 'SEED_INFLATED'} | origin=${entry.row.origin || 'n/d'} seed_version=${entry.row.ranking_seed_version ?? 'n/d'} circuit_cat=${entry.row.circuit_category || 'n/d'}`);
  }

  check('Parte M: existem poucas duplas procedurais no Top50', () => {
    console.log(`   [registro] PP no Top50: ${procedural.length}/50`);
    assert.ok(procedural.length <= 10, `${procedural.length} duplas procedurais no Top50`);
  });

  check('Parte N/21-22 (critério 4): toda PP do Top50 é JUSTIFIED pelos membros', () => {
    const inflated = verdicts.filter((v) => !v.justified);
    console.log(`   [registro] JUSTIFIED=${verdicts.length - inflated.length} SEED_INFLATED=${inflated.length}`);
    assert.equal(inflated.length, 0,
      `${inflated.length} duplas procedurais com pontos que não derivam dos membros`);
  });

  check('Parte N: os membros dessas duplas têm pontos de circuito reais', () => {
    for (const v of verdicts) {
      assert.ok(v.pa > 0 && v.pb > 0,
        `#${v.rank}: membro sem pontos de circuito (${v.pa}/${v.pb})`);
    }
  });

  check('Parte N: nenhuma PP do Top50 excede o que seus membros sustentam', () => {
    // A regra vigente (5.22-E) é a SOMA. Seja qual for a posição que uma
    // dupla procedural alcance — inclusive acima de uma dupla real — sua
    // pontuação tem de ser exatamente a soma dos rolling points dos membros.
    const unsupported = verdicts.filter((v) => v.stored !== v.expected);
    assert.equal(unsupported.length, 0,
      `${unsupported.length} duplas procedurais acima da soma dos membros`);
    const asymmetric = verdicts.filter((v) => v.pa !== v.pb && v.pa > 0 && v.pb > 0);
    const geometricMatch = asymmetric.filter(
      (v) => v.expected === Math.round(Math.sqrt(v.pa * v.pb)),
    );
    console.log(`   [registro] PP no Top50: ${verdicts.length}, assimétricas=${asymmetric.length}, `
      + `coincidem com a geométrica antiga=${geometricMatch.length}`);
    // Para membros positivos e desiguais, soma > geométrica sempre; nenhuma
    // assimétrica pode ser explicada pela regra superada.
    assert.equal(geometricMatch.length, 0,
      `${geometricMatch.length} PP assimétricas ainda explicadas pela média geométrica`);
  });

  check('Parte W: o Top50 tem distribuição reportável e não é dominado por procedurais', () => {
    // Sem teto geométrico: sob a SOMA, procedurais justificadas podem
    // subir. O invariante preservado é que elas não DOMINAM o Top50.
    const rr = top50.filter((t) => classifyPair(originById, t.player1_id, t.player2_id) === 'RR').length;
    const rp = top50.filter((t) => classifyPair(originById, t.player1_id, t.player2_id) === 'RP').length;
    const pp = procedural.length;
    console.log(`   [registro] Top50: RR=${rr} RP=${rp} PP=${pp}`);
    assert.equal(rr + rp + pp, top50.length, 'Top50 com origens não classificadas');
    assert.ok(pp <= Math.floor(top50.length / 2),
      `${pp}/${top50.length} duplas procedurais dominam o Top50`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-procedural-top50-justification-v515: PASS');
} finally {
  await vite.close();
}
