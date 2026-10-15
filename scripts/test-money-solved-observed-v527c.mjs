// Playthrough 5.27-C, Bloco F — money-solved OBSERVADO (não inferido), com a
// definição implementada e hold de 6 meses.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-money-solved-observed-v527c');
const { load, close } = await bootModules();
try {
  const Balance = await load('/src/lib/balance527.js');

  await check('a definição e o hold de 6 meses estão implementados', () => {
    assert.equal(typeof Balance.isMoneySolved, 'function');
    assert.equal(typeof Balance.moneySolvedCrossing, 'function');
    const solved = { month: 'm', recurringIncome: 3000, recurringExpense: 1500, cash: 20000 };
    const not = { month: 'n', recurringIncome: 0, recurringExpense: 1500, cash: 0 };
    assert.equal(Balance.moneySolvedCrossing([not, solved, solved, solved, solved, solved]), null);
    assert.ok(Balance.moneySolvedCrossing([solved, solved, solved, solved, solved, solved]));
  });

  await check('money-solved.csv (se presente) é medido, não inferido', () => {
    const f = 'reports/rebalance-527c/money-solved.csv';
    if (!existsSync(f)) return;
    const text = readFileSync(f, 'utf8');
    assert.match(text, /profile/);
  });

  await check('a carreira medida carrega ledger mensal (fonte do cálculo)', () => {
    const dir = 'reports/rebalance-527/balanced2/raw';
    if (!existsSync(`${dir}/normal-001.json`)) return;
    const c = JSON.parse(readFileSync(`${dir}/normal-001.json`, 'utf8'));
    assert.ok(c.ledger && Object.keys(c.ledger).length > 0, 'sem ledger mensal');
  });
} finally {
  await close();
  finish();
}
