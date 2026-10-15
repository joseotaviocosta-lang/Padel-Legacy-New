// Playthrough 4.6, itens 4/5 — BYEs devem favorecer os seeds superiores
// (nunca sortear bye pra dupla inferior enquanto um top seed joga rodada
// extra), e os NÃO-seeds precisam variar entre torneios/carreiras mas
// continuar 100% determinísticos pro MESMO torneio (reload nunca gera um
// draw diferente) — nunca Math.random().
import assert from 'node:assert/strict';
import { buildSeededDrawSlots, seedCountForDrawSize } from '../src/gameplay/worldTour/tournamentSettlement.js';

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function teams(n) {
  return Array.from({ length: n }, (_, i) => ({ name: `Dupla ${i + 1}`, strength: 1000 - i }));
}

// ── Item 4 — BYEs favorecem os seeds superiores.
for (const size of [17, 20, 23, 24]) {
  check(`4. draw de ${size}: BYEs vão prioritariamente aos cabeças de chave`, () => {
    const { slots, bracketSize, seedCount } = buildSeededDrawSlots({ entrants: teams(size), tournamentId: `bye-seed-${size}` });
    const byeCount = bracketSize - size;
    // Quem recebe bye: entrantes cujo slot-parceiro (round 0) é fantasma.
    const byeNames = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      if (a && !b) byeNames.push(a.name);
      if (b && !a) byeNames.push(b.name);
    }
    assert.equal(byeNames.length, byeCount, `${byeCount} byes esperados para ${size} entrantes num bracket de ${bracketSize}`);
    const topSeedNames = new Set(Array.from({ length: Math.min(byeCount, seedCount) }, (_, i) => `Dupla ${i + 1}`));
    const byeNameSet = new Set(byeNames);
    for (const name of topSeedNames) {
      assert.ok(byeNameSet.has(name), `${name} (top seed) deveria receber bye — byes concedidos a: ${byeNames.join(', ')}`);
    }
    // Além dos seeds protegidos, byes extras (quando byeCount > seedCount)
    // vêm do pool embaralhado deterministicamente (item 5 — variedade
    // proposital entre não-seeds); a garantia "prioritariamente aos
    // cabeças de chave" já foi provada acima (top seeds ⊆ byes) e não
    // exige ordem estrita além disso.
  });
}

// ── Item 5 — randomização determinística dos não-seeds: mesma chamada,
// mesmo torneio => sempre o mesmo resultado (reload-safe); torneios
// diferentes => resultado pode variar.
check('5. mesmo tournamentId produz sempre o mesmo posicionamento (reload não regenera)', () => {
  const entrants = teams(24);
  const first = buildSeededDrawSlots({ entrants, tournamentId: 'stable-draw-2026' });
  const second = buildSeededDrawSlots({ entrants, tournamentId: 'stable-draw-2026' });
  assert.deepEqual(first.slots.map((s) => s?.name || null), second.slots.map((s) => s?.name || null));
});

check('5. tournamentId diferente pode variar o posicionamento dos NÃO-seeds (nunca dos seeds protegidos)', () => {
  const entrants = teams(24);
  const a = buildSeededDrawSlots({ entrants, tournamentId: 'tournament-a-2026' });
  const b = buildSeededDrawSlots({ entrants, tournamentId: 'tournament-b-2026' });
  // Os seeds protegidos (1-8) ocupam sempre a MESMA posição estrutural
  // (seed 1 sempre no slot 0, etc.) — só os não-seeds podem variar.
  const seedCount = seedCountForDrawSize(24);
  const topNames = new Set(Array.from({ length: seedCount }, (_, i) => `Dupla ${i + 1}`));
  const namesAtSameSlot = a.slots.map((s, i) => [s?.name, b.slots[i]?.name]);
  for (const [nameA, nameB] of namesAtSameSlot) {
    if (nameA && topNames.has(nameA)) assert.equal(nameA, nameB, `seed protegido ${nameA} não pode mudar de slot entre torneios diferentes`);
  }
  const differsSomewhere = a.slots.some((s, i) => (s?.name || null) !== (b.slots[i]?.name || null));
  assert.ok(differsSomewhere, 'não-seeds variam entre torneios diferentes (nunca a mesma "chave fixa" sempre)');
});

check('5. nunca usa Math.random (determinismo via hash, não aleatoriedade real)', () => {
  const entrants = teams(24);
  const originalRandom = Math.random;
  let randomCalled = false;
  Math.random = () => { randomCalled = true; return originalRandom(); };
  try {
    buildSeededDrawSlots({ entrants, tournamentId: 'no-math-random-check' });
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(randomCalled, false, 'buildSeededDrawSlots não pode chamar Math.random');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-seeding-non-power-of-two: PASS');
