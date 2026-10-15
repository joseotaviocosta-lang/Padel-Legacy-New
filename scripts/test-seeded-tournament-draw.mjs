// Playthrough 4.6, itens 1/2/3/8/16 — seeding esportivo verdadeiro.
//
// Causa exata do bug relatado ("Coello/Tapia #1 vs Galán/Chingotto #2 já
// na 1ª rodada de Doha"): buildCanonicalTournamentBracket pareava
// SEQUENCIALMENTE a lista já ordenada por força (`pairPool[index]` vs
// `pairPool[index+1]`) — índice 0 (mais forte) contra índice 1 (2º mais
// forte), sempre, na rodada 0. Nenhum seeding de verdade existia.
//
// Corrigido com `buildSeededDrawSlots` (posicionamento clássico de cabeças
// de chave: seed k sempre encontra o "espelho" bracketSize+1-k na rodada
// 0 — por construção, seed1/seed2 só se encontram na final, seeds 1-4 só
// a partir da semifinal).
import assert from 'node:assert/strict';
import {
  buildCanonicalTournamentBracket, buildSeededDrawSlots, seedCountForDrawSize, validateCanonicalBracketGraph,
} from '../src/gameplay/worldTour/tournamentSettlement.js';

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function teams(n) {
  // strength descendente: teams[0] é sempre o mais forte (seed 1 esperado).
  return Array.from({ length: n }, (_, i) => ({ name: `Seed ${i + 1}`, strength: 1000 - i }));
}

function roundIndexOfMatch(bracket, predicate) {
  return bracket.bracket_history.findIndex((round) => (round.matches || []).some(predicate));
}

// ── Item 2 — número de seeds por tamanho de draw.
check('2. seedCountForDrawSize segue a tabela pedida (8→4, 16/24/32→8)', () => {
  assert.equal(seedCountForDrawSize(8), 4);
  assert.equal(seedCountForDrawSize(16), 8);
  assert.equal(seedCountForDrawSize(24), 8);
  assert.equal(seedCountForDrawSize(32), 8);
});

// ── Item 8 — matriz de tamanhos: invariantes de proteção de seed.
for (const size of [8, 16, 20, 23, 24, 32]) {
  check(`8. draw de ${size}: Seed 1 e Seed 2 não se enfrentam antes da final`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `seed-protect-${size}`, participants: teams(size), date: '2026-05-01' });
    const clash = roundIndexOfMatch(bracket, (m) => [m.team_a, m.team_b].includes('Seed 1') && [m.team_a, m.team_b].includes('Seed 2'));
    const finalRoundIndex = bracket.bracket_history.length - 1;
    assert.ok(clash === -1 || clash === finalRoundIndex, `Seed 1 x Seed 2 só pode ocorrer na final (rodada ${finalRoundIndex}), ocorreu na rodada ${clash}`);
  });

  check(`8. draw de ${size}: Seeds 1-4 não se enfrentam antes da semifinal`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `seed-protect4-${size}`, participants: teams(size), date: '2026-05-01' });
    const top4 = new Set(['Seed 1', 'Seed 2', 'Seed 3', 'Seed 4']);
    const semiRoundIndex = bracket.bracket_history.length - 2; // penúltima rodada = semifinal.
    for (let roundIndex = 0; roundIndex < semiRoundIndex; roundIndex += 1) {
      for (const match of bracket.bracket_history[roundIndex].matches || []) {
        const bothTop4 = top4.has(match.team_a) && top4.has(match.team_b);
        assert.equal(bothTop4, false, `Seeds 1-4 se enfrentaram na rodada ${roundIndex} (antes da SF, rodada ${semiRoundIndex}): ${match.team_a} x ${match.team_b}`);
      }
    }
  });

  check(`8. draw de ${size}: cabeças de chave protegidas não se enfrentam na primeira rodada`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `seed-protect8-${size}`, participants: teams(size), date: '2026-05-01' });
    // Só os seeds REALMENTE protegidos (seedCountForDrawSize, item 2) valem
    // essa garantia — draw 8 protege só 4 seeds (Seed 5-8 são entrantes
    // comuns, sem proteção), então "Seed 1 x Seed 8" na 1ª rodada é
    // esperado e correto nesse tamanho, não uma violação.
    const protectedSeeds = Math.min(seedCountForDrawSize(size), size);
    const top8 = new Set(Array.from({ length: protectedSeeds }, (_, i) => `Seed ${i + 1}`));
    for (const match of bracket.bracket_history[0].matches || []) {
      const bothTop8 = top8.has(match.team_a) && top8.has(match.team_b);
      assert.equal(bothTop8, false, `Seeds do top 8 se enfrentaram na 1ª rodada: ${match.team_a} x ${match.team_b}`);
    }
  });

  check(`8. draw de ${size}: Seed 1 e Seed 2 não dividem a mesma metade da chave`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `seed-half-${size}`, participants: teams(size), date: '2026-05-01' });
    // "Metade da chave" = lado da rodada 0 (primeira metade dos confrontos
    // vs segunda metade) — só se encontram de novo na final se vierem de
    // metades diferentes.
    const round0 = bracket.bracket_history[0];
    const half = Math.ceil(round0.matches.length / 2);
    const sideOf = (name) => {
      const matchIndex = round0.matches.findIndex((m) => m.team_a === name || m.team_b === name);
      if (matchIndex >= 0) return matchIndex < half ? 'A' : 'B';
      const byeIndex = (round0.byes || []).indexOf(name);
      return byeIndex < 0 ? null : (byeIndex < (round0.byes.length / 2) ? 'A' : 'B');
    };
    const seed1Side = sideOf('Seed 1');
    const seed2Side = sideOf('Seed 2');
    if (seed1Side && seed2Side) assert.notEqual(seed1Side, seed2Side, 'Seed 1 e Seed 2 precisam estar em metades opostas da chave');
  });

  check(`8. draw de ${size}: grafo estrutural válido com seeding`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `seed-graph-${size}`, participants: teams(size), date: '2026-05-01' });
    const graph = validateCanonicalBracketGraph(bracket);
    assert.equal(graph.valid, true, JSON.stringify(graph.errors));
  });
}

// ── Item 16 — reprodução real de Doha: Coello/Tapia (força mais alta) e
// Galán/Chingotto (2ª mais alta) precisam ser Seed 1/Seed 2 e ficar
// separados até uma potencial final.
check('16. Doha real: Coello/Tapia = Seed 1, Galán/Chingotto = Seed 2, separados até a final', () => {
  const field = [
    { name: 'Arturo Coello & Agustín Tapia', strength: 190 },
    { name: 'Alejandro Galán & Federico Chingotto', strength: 185 },
    ...Array.from({ length: 22 }, (_, i) => ({ name: `Dupla ${i + 3}`, strength: 150 - i })),
  ];
  const { slots, seedCount } = buildSeededDrawSlots({ entrants: field, tournamentId: 'doha-real-2026' });
  assert.equal(seedCount, 8, 'Doha (draw 24) usa 8 cabeças de chave');
  assert.equal(slots[0].name, 'Arturo Coello & Agustín Tapia', 'Coello/Tapia ocupam o slot de Seed 1');
  const seed2Index = slots.length - 1; // espelho de seed1 no algoritmo clássico (bracketSize+1-1 = bracketSize).
  // Seed 2 fica no slot que só encontra Seed 1 na última rodada (metade oposta).
  const half = slots.length / 2;
  const seed1Half = slots.findIndex((s) => s?.name === 'Arturo Coello & Agustín Tapia') < half ? 'A' : 'B';
  const seed2Half = slots.findIndex((s) => s?.name === 'Alejandro Galán & Federico Chingotto') < half ? 'A' : 'B';
  assert.notEqual(seed1Half, seed2Half, 'Coello/Tapia e Galán/Chingotto ficam em metades opostas da chave');

  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'doha-real-2026', participants: field, date: '2026-04-15' });
  const clash = roundIndexOfMatch(bracket, (m) => [m.team_a, m.team_b].includes('Arturo Coello & Agustín Tapia') && [m.team_a, m.team_b].includes('Alejandro Galán & Federico Chingotto'));
  const finalRoundIndex = bracket.bracket_history.length - 1;
  assert.ok(clash === -1 || clash === finalRoundIndex, `Coello/Tapia só podem encontrar Galán/Chingotto na final (rodada ${finalRoundIndex}) — ocorreu na rodada ${clash}`);
  console.log(`   rodada 0 de Doha: ${bracket.bracket_history[0].matches.map((m) => `${m.team_a} x ${m.team_b}`).join(' | ')}`);
  void seed2Index;
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-seeded-tournament-draw: PASS');
