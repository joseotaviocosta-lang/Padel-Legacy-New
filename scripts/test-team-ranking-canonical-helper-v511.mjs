// Playthrough 5.11 (Parte S) — contrato do helper canônico único
// (computeCanonicalTeamRankingPoints) e prova de que TODOS os writers vivos
// usam a MESMA função, sem fórmula duplicada.
//
// Playthrough 5.22-E, Partes M/N — a REGRA mudou de média geométrica
// (`sqrt(a*b)`) para SOMA (`a + b`). Este contrato foi atualizado junto com
// a autoridade; as invariantes geométricas antigas (par equilibrado == média,
// punição de assimetria) foram substituídas pelas da regra vigente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (rel) => readFileSync(`${root}${rel}`, 'utf8');

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { computeCanonicalTeamRankingPoints: f } = await vite.ssrLoadModule('/src/lib/teamRankingFormula.js');
  const viaTeamRanking = (await vite.ssrLoadModule('/src/lib/teamRanking.js')).computeCanonicalTeamRankingPoints;

  check('Parte S: teamRanking.js reexporta exatamente a MESMA função', () => {
    assert.equal(viaTeamRanking, f, 'a reexportação não é a mesma referência');
  });

  check('Parte R: função pura, determinística e simétrica', () => {
    assert.equal(f(10000, 400), f(400, 10000), 'não é simétrica');
    assert.equal(f(1234, 5678), f(1234, 5678), 'não é determinística');
  });

  check('Parte N: TeamRankingPoints = A + B', () => {
    for (const [a, b] of [[39, 0], [0, 39], [39, 80], [300, 200], [1100, 880], [25000, 1526]]) {
      assert.equal(f(a, b), a + b, `f(${a},${b}) = ${f(a, b)}`);
    }
  });

  check('Parte N: exemplos canônicos do pedido (39+0=39, 39+80=119)', () => {
    assert.equal(f(39, 0), 39);
    assert.equal(f(39, 80), 119);
  });

  check('Parte Y: 0 + 0 -> 0, nunca NaN/Infinity/negativo', () => {
    const r = f(0, 0);
    assert.ok(Number.isFinite(r), `f(0,0) = ${r}`);
    assert.equal(r, 0);
  });

  check('membro com 0 não zera a dupla (0 + x = x)', () => {
    for (const v of [1, 39, 2500, 13266, 24900]) {
      assert.equal(f(v, 0), v, `f(${v},0) = ${f(v, 0)}`);
      assert.equal(f(0, v), v, `f(0,${v}) = ${f(0, v)}`);
    }
  });

  check('dupla equilibrada dobra de valor (a + a = 2a) — regra nova', () => {
    for (const v of [1, 100, 2500, 13266]) {
      assert.equal(f(v, v), v * 2, `f(${v},${v}) = ${f(v, v)}`);
    }
  });

  check('entradas inválidas não produzem NaN', () => {
    for (const [a, b] of [[null, 100], [undefined, 100], [NaN, 100], ['x', 100], [-50, 100]]) {
      const r = f(a, b);
      assert.ok(Number.isFinite(r) && r >= 0, `f(${a},${b}) = ${r}`);
    }
  });

  check('monotônica: melhorar um membro nunca piora a dupla', () => {
    let previous = -1;
    for (const p of [0, 18, 500, 2000, 5000, 10000, 15000, 20000, 24900]) {
      const value = f(p, 24900);
      assert.ok(value >= previous, `f(${p},24900)=${value} < anterior ${previous}`);
      previous = value;
    }
  });

  check('membro forte carrega a dupla (soma, não média)', () => {
    const star = f(24900, 1526);
    const plain = f(1526, 1526);
    console.log(`   [registro] Top1+Top100 = ${star} | Top100+Top100 = ${plain}`);
    assert.ok(star > plain, `soma não reflete o membro forte: ${star} vs ${plain}`);
  });

  // ---- Parte S: nenhum writer vivo reimplementa a fórmula ----
  const WRITERS = [
    'src/game-core/circuitLifecycle.js',
    'src/game-core/tournamentLifecycle.js',
    'src/game-core/seasonLifecycle.js',
    'src/lib/rankingPopulation.js',
    'src/lib/saveFoundation.js',
  ];
  const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  check('Parte S: todo writer vivo CHAMA o helper canônico', () => {
    for (const file of WRITERS) {
      const code = stripComments(read(file));
      assert.ok(code.includes('computeCanonicalTeamRankingPoints('),
        `${file} não chama o helper canônico`);
    }
  });

  check('Parte S: nenhum writer mantém média (simples ou geométrica) inline para ranking_points', () => {
    const SIMPLE = /ranking_points\s*:\s*Math\.round\(\([^)]*\+[^)]*\)\s*\/\s*2\)/;
    const GEOMETRIC = /ranking_points\s*:\s*Math\.round\(Math\.sqrt\(/;
    for (const file of WRITERS) {
      const code = stripComments(read(file));
      assert.ok(!SIMPLE.test(code), `${file} ainda tem a média simples inline`);
      assert.ok(!GEOMETRIC.test(code), `${file} ainda tem a média geométrica inline`);
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-canonical-helper-v511: PASS');
} finally {
  await vite.close();
}
