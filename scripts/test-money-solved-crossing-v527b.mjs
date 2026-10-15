// Playthrough 5.27-B, Bloco P — definição EXPLÍCITA de money-solved e cálculo
// da travessia (primeiro mês em que a condição vale e se mantém >= 6 meses).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-money-solved-crossing-v527b');
const { load, close } = await bootModules();
try {
  const Balance = await load('/src/lib/balance527.js');

  await check('isMoneySolved: exige receita >= despesa E reserva >= 12x despesa', () => {
    assert.equal(Balance.isMoneySolved({ recurringIncome: 1000, recurringExpense: 1000, cash: 12000 }), true);
    assert.equal(Balance.isMoneySolved({ recurringIncome: 900, recurringExpense: 1000, cash: 12000 }), false);
    assert.equal(Balance.isMoneySolved({ recurringIncome: 2000, recurringExpense: 1000, cash: 6000 }), false);
    assert.equal(Balance.isMoneySolved({ recurringIncome: 0, recurringExpense: 0, cash: 999999 }), false);
  });

  await check('moneySolvedCrossing: exige 6 meses consecutivos', () => {
    const solved = { month: 'm', recurringIncome: 2000, recurringExpense: 1000, cash: 20000 };
    const not = { month: 'n', recurringIncome: 500, recurringExpense: 1000, cash: 0 };
    // 5 meses resolvidos não bastam.
    assert.equal(Balance.moneySolvedCrossing([not, solved, solved, solved, solved, solved]), null);
    // 6 meses consecutivos → travessia no 1º desses meses.
    const months = [not, not, solved, solved, solved, solved, solved, solved, not];
    const crossing = Balance.moneySolvedCrossing(months);
    assert.ok(crossing, 'esperava travessia');
    assert.equal(crossing.monthIndex, 2);
  });

  await check('o ponto de travessia não é inferido de cash isolado', () => {
    const rich = { month: 'r', recurringIncome: 0, recurringExpense: 1000, cash: 999999 };
    assert.equal(Balance.moneySolvedCrossing([rich, rich, rich, rich, rich, rich, rich]), null);
  });
} finally {
  await close();
}
finish();
