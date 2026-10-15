// Playthrough 5.24-B, Partes R/S — orçamento de performance por página.
//
// Os limites NÃO são arbitrários: derivam do baseline medido com o mesmo
// harness (scripts/perf-mobile-pages-v524b.mjs, 360px, CPU 4x, mundo pesado):
//  - nenhuma navegação grava a carreira (a causa raiz medida);
//  - Ranking e Torneios: ganho de pelo menos 50% (observado ~85-94%);
//  - demais páginas: não regridem além de +25% + 100ms de ruído do baseline.
// Também prova o comportamento: a reconciliação de torneios é no-op na 2ª
// chamada (antes regravava todos os torneios a cada visita à página).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createEntityStore } from './lib/v522eTeamRankingHarness.mjs';

let passed = 0;
const check = async (label, fn) => { await fn(); passed += 1; console.log(`PASS — ${label}`); };

// 1. Comportamento: ensureFutureTournaments idempotente sem gravar.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const career = await vite.ssrLoadModule('/src/lib/career.js');
  const store = createEntityStore({ Tournament: [], Season: [] });
  const writes = { bulkUpdate: 0, rows: 0 };
  const tournamentEntity = store.entities.Tournament;
  localGame.entities = new Proxy({}, {
    get: (_t, name) => {
      if (name !== 'Tournament') return store.entities[name];
      return {
        ...tournamentEntity,
        bulkUpdate: async (rows) => {
          writes.bulkUpdate += 1;
          writes.rows += rows.length;
          // Upsert: cria o que não existe, faz merge do que existe.
          for (const row of rows) {
            const existing = store.state.Tournament.find((t) => t.id && t.id === row.id);
            if (existing) Object.assign(existing, row);
            else store.state.Tournament.push({ ...row, id: row.id || `t-${store.state.Tournament.length + 1}` });
          }
          return rows;
        },
      };
    },
  });
  const first = await career.ensureFutureTournaments('2026-01-01');
  const afterFirst = { ...writes };
  const second = await career.ensureFutureTournaments('2026-01-01');
  await check(`1ª reconciliação cria o calendário (${first.created} torneios)`, () => {
    assert.ok(first.created > 0);
    assert.equal(afterFirst.bulkUpdate, 1);
  });
  await check('2ª reconciliação sem mudança: 0 gravações (antes: todos os torneios regravados)', () => {
    assert.equal(writes.bulkUpdate, afterFirst.bulkUpdate, `bulkUpdate extra com ${writes.rows - afterFirst.rows} linhas`);
    assert.equal(second.repaired, 0);
  });
  // Um torneio realmente divergente continua sendo reparado.
  const victim = store.state.Tournament.find((t) => t.start_date > '2026-02-01' && !t.is_exhibition);
  victim.tier = 'TIER-ERRADO';
  const third = await career.ensureFutureTournaments('2026-01-01');
  await check('torneio divergente continua sendo reparado (correção preservada)', () => {
    assert.equal(third.repaired, 1);
    assert.notEqual(victim.tier, 'TIER-ERRADO');
  });
} finally {
  await vite.close();
}

// 2. Orçamento medido.
const beforeFile = new URL('../reports/perf-524b/before-heavy-360.json', import.meta.url);
const afterFile = new URL('../reports/perf-524b/after-heavy-360.json', import.meta.url);
assert.ok(existsSync(beforeFile) && existsSync(afterFile), 'rode: node scripts/perf-mobile-pages-v524b.mjs after --heavy');
const before = JSON.parse(readFileSync(beforeFile, 'utf8')).pages;
const after = JSON.parse(readFileSync(afterFile, 'utf8')).pages;

for (const id of Object.keys(before)) {
  const b = before[id];
  const a = after[id];
  await check(`${b.label}: nenhuma gravação ao navegar (writes ${b.writesMedian} → ${a.writesMedian})`, () => {
    assert.equal(a.writesMedian, 0);
  });
  if (id === 'ranking' || id === 'tournaments') {
    await check(`${b.label}: render útil ${b.tUsefulMedian}ms → ${a.tUsefulMedian}ms (≥50% mais rápido)`, () => {
      assert.ok(a.tUsefulMedian <= b.tUsefulMedian * 0.5);
    });
  } else {
    await check(`${b.label}: render útil ${b.tUsefulMedian}ms → ${a.tUsefulMedian}ms (sem regressão)`, () => {
      assert.ok(a.tUsefulMedian <= b.tUsefulMedian * 1.25 + 100);
      assert.ok(a.tSettledMedian <= b.tSettledMedian * 1.25 + 100);
    });
  }
  await check(`${b.label}: scroll sem regressão (frames >50ms ${b.scroll.over50} → ${a.scroll.over50})`, () => {
    assert.ok(a.scroll.over50 <= b.scroll.over50 + 2);
  });
}

console.log(`test-mobile-page-performance-budget-v524b: PASS (${passed} gates)`);
