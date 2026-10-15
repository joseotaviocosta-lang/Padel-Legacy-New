// Playthrough 5.27-G, Bloco B (itens 9 e 15) — compatibilidade continua mudando
// a decisão quando a diferença de força é pequena; força decide quando a
// diferença é enorme.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { normalPartnerScore } from './lib/v527gPartnerScore.mjs';

const { check, finish } = makeSuite('test-partner-choice-compatibility-preserved-v527g');
const pick = (player, cands) => [...cands].sort((a, b) => normalPartnerScore({ ...b, playerOvr: player, coins: 6000 }) - normalPartnerScore({ ...a, playerOvr: player, coins: 6000 }))[0].id;
try {
  await check('diferença pequena (OVR 70/compat 90 × OVR 73/compat 65, jogador 70): compatibilidade decide → 70', () => {
    assert.equal(pick(70, [{ id: 'a', candidateOvr: 70, compatibility: 90, salary: 272 }, { id: 'b', candidateOvr: 73, compatibility: 65, salary: 296 }]), 'a');
  });
  await check('diferença enorme (OVR 40/compat 95 × OVR 85/compat 75, jogador 80): força decide → 85', () => {
    assert.equal(pick(80, [{ id: 'a', candidateOvr: 40, compatibility: 95, salary: 89 }, { id: 'b', candidateOvr: 85, compatibility: 75, salary: 401 }]), 'b');
  });
  await check('caso real 5.27-F (jogador 59: "65" que joga como 38, compat 87 × 91, compat 68) → o 91', () => {
    assert.equal(pick(59, [{ id: 'fake65', candidateOvr: 38, compatibility: 87, salary: 80 }, { id: 'real91', candidateOvr: 91, compatibility: 68, salary: 460 }]), 'real91');
  });
  await check('acima do nível do jogador a força não ganha extra: 80/compat 88 × 91/compat 70 (jogador 78) → 80', () => {
    assert.equal(pick(78, [{ id: 'a', candidateOvr: 80, compatibility: 88, salary: 356 }, { id: 'b', candidateOvr: 91, compatibility: 70, salary: 460 }]), 'a');
  });
} finally {
  finish();
}
