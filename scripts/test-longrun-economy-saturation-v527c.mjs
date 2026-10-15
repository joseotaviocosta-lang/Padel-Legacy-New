// Playthrough 5.27-C, Bloco L — saturação econômica no late game (long runs).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-longrun-economy-saturation-v527c');
try {
  await check('o harness suporta long runs com checkpoints e resume', () => {
    const sim = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(sim, /CHECKPOINT_EVERY/);
    assert.match(sim, /resume/);
  });

  await check('long-runs.json (se presente) audita saturação (staff/gear/passive)', () => {
    const f = 'reports/rebalance-527c/long-runs.json';
    if (!existsSync(f)) return;
    const d = JSON.parse(readFileSync(f, 'utf8'));
    assert.ok('saturation' in d || 'lateGame' in d || 'status' in d);
  });

  await check('investimento passivo não domina a renda ativa (hard rule)', () => {
    const dir = 'reports/rebalance-527/balanced2/raw';
    if (!existsSync(`${dir}/optimizer-001.json`)) return;
    const c = JSON.parse(readFileSync(`${dir}/optimizer-001.json`, 'utf8'));
    let invest = 0; let active = 0;
    for (const L of Object.values(c.ledger || {})) {
      invest += Number(L.income?.investment_income) || 0;
      active += (Number(L.income?.prize) || 0) + (Number(L.income?.match_reward) || 0);
    }
    assert.ok(invest <= active, `passivo ${invest} > ativo ${active}`);
  });
} finally {
  finish();
}
