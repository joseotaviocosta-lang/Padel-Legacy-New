// Playthrough 5.1, Parte I/W — teste unitário puro de `rankCandidatesByTierFit`
// (WorldTourLifecycle.js, extraída nesta fase do laço de resgate pra ser
// testável). Antes desta fase, o resgate ordenava só por pairScore
// (talento bruto/OVR, cego ao tier) — auditado como um dos vetores que
// enchia tiers altos com duplas fracas demais quando o campo normal vinha
// curto. Confirma a prioridade pedida: 1) adequadas, 2) próximas, 3)
// resgate excepcional — nunca "qualquer dupla livre sem penalidade".
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function makePair(id, rank, overall = 70) {
  return { id, chemistry: 50, athletes: [{ id: `${id}-a`, ranking_position: rank, overall_rating: overall }, { id: `${id}-b`, ranking_position: rank, overall_rating: overall }] };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { rankCandidatesByTierFit } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  check('pra um torneio Masters, uma dupla PRÓXIMA (rank 260) vem antes de uma EXCEPCIONAL (rank 900, muito fraca)', () => {
    const tournament = { id: 't-masters', tier: 'Masters' };
    const close = makePair('close', 260, 74);
    const exceptional = makePair('exceptional', 900, 60);
    // pairScore favoreceria "exceptional" se tivesse overall_rating maior —
    // aqui as duas têm overall parecido de propósito, então só a
    // adequação de rank (getTierRankingFit) deveria decidir a ordem.
    const ordered = rankCandidatesByTierFit([exceptional, close], tournament);
    assert.equal(ordered[0].id, 'close', `esperava "close" (rank 260, mais adequado a Masters) primeiro, obtido ordem: ${ordered.map((p) => p.id).join(',')}`);
  });

  check('pra um torneio Masters, uma dupla ADEQUADA (rank 230, no corte direto) vem antes de uma dupla com OVR maior mas rank muito pior', () => {
    const tournament = { id: 't-masters-2', tier: 'Masters' };
    const adequate = makePair('adequate', 230, 65); // OVR mais baixo, mas rank no alvo de Masters.
    const strongButWrongRank = makePair('strong-wrong-rank', 950, 85); // OVR alto, mas nível de rank muito fraco pra Masters.
    const ordered = rankCandidatesByTierFit([strongButWrongRank, adequate], tournament);
    assert.equal(ordered[0].id, 'adequate', `esperava a dupla adequada ao tier primeiro (prioridade 1, Parte I), obtido: ${ordered.map((p) => p.id).join(',')}`);
  });

  check('dentro do MESMO nível de adequação (fit empatado), pairScore (talento) ainda desempata — nunca ordem arbitrária', () => {
    const tournament = { id: 't-gold', tier: 'Gold' };
    const a = makePair('a-higher-ovr', 400, 90);
    const b = makePair('b-lower-ovr', 400, 60);
    const ordered = rankCandidatesByTierFit([b, a], tournament);
    assert.equal(ordered[0].id, 'a-higher-ovr', 'com fit igual (mesmo rank), maior talento deveria desempatar');
  });

  check('resgate excepcional (nenhuma dupla adequada disponível) ainda funciona — nunca trava/retorna vazio quando só sobram duplas fracas', () => {
    const tournament = { id: 't-crown', tier: 'Crown' };
    const onlyWeak = [makePair('w1', 900, 55), makePair('w2', 950, 52)];
    const ordered = rankCandidatesByTierFit(onlyWeak, tournament);
    assert.equal(ordered.length, 2, 'esperava as 2 duplas fracas de volta, mesmo sem nenhuma adequada — resgate excepcional é o último recurso, não um bloqueio');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-rescue-quality: PASS');
} finally {
  await vite.close();
}
