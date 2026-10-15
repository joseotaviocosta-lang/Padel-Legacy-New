// Playthrough 5.27-M — primeiros 14 dias de uma carreira nova: toda moeda
// tem origem. Livro instrumentado (toda escrita que muda o saldo) fecha com
// o saldo, e as conquistas do "kit de partida" (contrato/fundo/grip de
// demonstração) não pagam mais (eram ~4.800 das ~6.400 moedas do playtest).
import { gateRunner, onboarding } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-reward-ledger-balance-v527m');
const STARTER_ACHIEVEMENTS = ['Rainbow Collection', 'Investidor', 'Primeiro Patrocinador'];

for (const variant of ['continuous', 'no-panel-after', 'reload']) {
  const run = onboarding(variant);
  gate(`1. [${variant}] carreira de ${run.days} dias (≥ 14)`, run.days >= 14);
  gate(`2. [${variant}] livro fecha: saldo inicial + Σ movimentos = saldo final (${run.startCoins} + ${run.ledgerSum} = ${run.endCoins})`, run.reconciled && run.startCoins + run.ledgerSum === run.endCoins);
  gate(`3. [${variant}] toda linha do livro tem rótulo de ação e origem no código`, run.ledger.every((l) => l.label && l.site));
  const names = (run.achievementsUnlocked || []).map((a) => a.name);
  gate(`4. [${variant}] conquistas do kit de partida não desbloqueiam (${STARTER_ACHIEVEMENTS.join('/')})`, STARTER_ACHIEVEMENTS.every((n) => !names.includes(n)), names.join(', '));
  gate(`5. [${variant}] saldo do dia 14 sem salto de milhares (< 3.000)`, run.endCoins < 3000, String(run.endCoins));
}
const a = onboarding('continuous'); const b = onboarding('no-panel-after');
gate('6. abrir Conquistas no dia 1 ou não abrir dá o MESMO saldo (sem caminho que zera ou que paga a mais)', a.endCoins === b.endCoins, `${a.endCoins} × ${b.endCoins}`);
finish();
