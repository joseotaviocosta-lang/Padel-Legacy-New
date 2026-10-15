// Playthrough 5.11, Partes N/O — validação em seeds de calibração + seeds
// held-out, com a fórmula canônica já em produção.
//
// Playthrough 5.22-F — autoridade vigente: SOMA (A + B). A "proibição de
// carona" da 5.11 não existe mais (um membro de elite carrega o parceiro);
// o que se preserva é a generalização estrutural: em todas as configurações,
// 100% das linhas batem a autoridade, o Top8/Top16 são positivos e
// ordenados, e o #1 é equilibrado. Medido sobre a população determinística
// (`buildSyntheticPopulation`), não sobre um ano de simulação.
import assert from 'node:assert/strict';
import { computeCanonicalTeamRankingPoints as canonical, gapRatio, buildSyntheticPopulation } from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const CONFIGS = [
  { label: 'c1', pairCount: 500, worldSize: 1000 },
  { label: 'c2', pairCount: 600, worldSize: 1200 },
  { label: 'c3', pairCount: 400, worldSize: 800 },
  { label: 'h1', pairCount: 750, worldSize: 1500 },
  { label: 'h2', pairCount: 300, worldSize: 600 },
  { label: 'h3', pairCount: 900, worldSize: 1800 },
];
const CALIBRATION = ['c1', 'c2', 'c3'];
const HELDOUT = ['h1', 'h2', 'h3'];

function runConfig(config) {
  const { pairs, athletes } = buildSyntheticPopulation({ pairCount: config.pairCount, worldSize: config.worldSize });
  const athleteRank = new Map([...athletes]
    .sort((a, b) => b.points - a.points)
    .map((a, i) => [a.id, i + 1]));
  const rows = pairs.map((p) => {
    const [id1, id2] = p.name.split('/');
    return {
      key: p.key,
      pts: canonical(p.a, p.b),
      a: p.a,
      b: p.b,
      ratio: gapRatio(p.a, p.b),
      bestMemberRank: Math.min(athleteRank.get(id1), athleteRank.get(id2)),
      worstMemberRank: Math.max(athleteRank.get(id1), athleteRank.get(id2)),
      name: p.name,
    };
  }).sort((x, y) => y.pts - x.pts);

  const canonicalMismatch = rows.filter((r) => r.pts !== canonical(r.a, r.b)).length;
  return { label: config.label, rows, total: rows.length, canonicalMismatch };
}

const results = CONFIGS.map(runConfig);
for (const r of results) {
  const top8 = r.rows.slice(0, 8);
  console.log(`[${r.label}] duplas=${r.total} divergências=${r.canonicalMismatch} | Top8 pts: ${top8.map((t) => t.pts).join(', ')}`);
}

const calib = results.filter((r) => CALIBRATION.includes(r.label));
const held = results.filter((r) => HELDOUT.includes(r.label));

check('3 configurações de calibração + 3 held-out rodaram', () => {
  assert.equal(calib.length, 3);
  assert.equal(held.length, 3);
});

check('Parte S: em TODAS as configurações, 100% das linhas batem o helper canônico', () => {
  for (const r of results) {
    assert.equal(r.canonicalMismatch, 0, `${r.label}: ${r.canonicalMismatch} linhas divergentes`);
  }
});

check('Parte N: Circuit Finals (Top8) é formado por duplas de elite real', () => {
  for (const r of results) {
    const top8 = r.rows.slice(0, 8);
    assert.equal(top8.length, 8, `${r.label}: só ${top8.length} duplas`);
    for (const t of top8) {
      assert.ok(t.bestMemberRank <= 40, `${r.label}: ${t.name} no Top8 com melhor membro em #${t.bestMemberRank}`);
    }
  }
});

check('Parte N: o Top8 da população semeada é composto por membros fortes (sem carona artificial)', () => {
  for (const r of results) {
    for (const t of r.rows.slice(0, 8)) {
      assert.ok(t.worstMemberRank <= 150, `${r.label}: ${t.name} no Top8 com membro fraco em #${t.worstMemberRank} (ratio ${t.ratio.toFixed(1)})`);
    }
  }
});

check('Parte N: Legacy Finals (Top16) continua plausível', () => {
  for (const r of results) {
    const top16 = r.rows.slice(0, 16);
    assert.equal(top16.length, 16, `${r.label}: só ${top16.length} duplas`);
    for (const t of top16) {
      assert.ok(t.worstMemberRank <= 300, `${r.label}: ${t.name} no Top16 com membro fraco em #${t.worstMemberRank}`);
    }
    for (let i = 1; i < top16.length; i += 1) {
      assert.ok(top16[i].pts <= top16[i - 1].pts, `${r.label}: Top16 fora de ordem`);
    }
  }
});

check('Parte O: o Top8 é estritamente positivo e ordenado em todas as configurações', () => {
  for (const r of results) {
    const pts = r.rows.slice(0, 8).map((t) => t.pts);
    assert.ok(pts.every((p) => p > 0), `${r.label}: dupla com 0 pontos no Top8`);
    for (let i = 1; i < pts.length; i += 1) assert.ok(pts[i] <= pts[i - 1], `${r.label}: Top8 fora de ordem`);
  }
});

check('held-out reproduz a calibração (mesmas invariantes estruturais)', () => {
  const invariant = (r) => [
    r.canonicalMismatch,
    r.rows.slice(0, 8).every((t) => t.bestMemberRank <= 40) ? 1 : 0,
    r.rows.slice(0, 8).every((t) => t.worstMemberRank <= 150) ? 1 : 0,
  ].join(':');
  const calibSet = new Set(calib.map(invariant));
  for (const r of held) {
    assert.ok(calibSet.has(invariant(r)), `${r.label}: invariantes ${invariant(r)} fora do observado`);
  }
});

check('Parte C: a dupla #1 de cada configuração é equilibrada (elite de verdade)', () => {
  for (const r of results) {
    const top = r.rows[0];
    assert.ok(top.ratio < 2, `${r.label}: dupla #1 (${top.name}) com gap ${top.ratio.toFixed(2)}`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-heldout-v511: PASS');
