// Playthrough 5.26-B — `ranking_position` do jogador gravado pela autoridade
// canônica (buildWorldRankingSnapshot, a mesma da tela de Ranking) na escrita
// semanal do circuito, e lido pelos gates (loja, estágio de patrocínio).
import { makeSuite, bootCareer, reloadCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-ranking-gating-current-position-v526b');
let { rt, storage, careerId, profile: p0 } = await bootCareer('ranking-gating-526b');
try {
  const circuit = await rt.load('/src/game-core/circuitLifecycle.js');
  const store = await rt.load('/src/lib/storeCatalog.js');
  const raro = store.normalizeShopItem({ rarity: 'raro', name: 'raro' });
  const fresh = () => rt.localGame.entities.PlayerProfile.get(p0.id);
  // Requisitos de raro que NÃO são ranking já satisfeitos (nível 8, reputação 8):
  // isola o efeito do ranking no gate.
  await rt.localGame.entities.PlayerProfile.update(p0.id, { career_level: 12, reputation: 20 });

  // Semana 1: sem pontos nem partidas oficiais → sem ranking.
  let p = await fresh();
  await circuit.processWorldCircuit(p, '2026-01-04', '2026-01-05');
  p = await fresh();
  await check('sem ranking: ranking_position = null (não um número inventado)', () => assert.equal(p.ranking_position ?? null, null));
  await check('sem ranking: loja raro bloqueada só pelo ranking', () => {
    const access = store.getShopItemAccess(p, raro);
    assert.equal(access.unlocked, false); assert.ok(access.reasons.some((r) => /Top 500/.test(r)), JSON.stringify(access.reasons));
  });

  // Jogador melhora no ranking (pontos + atividade oficial) → próxima semana.
  await rt.localGame.entities.PlayerProfile.update(p0.id, { rank_points: 4000, world_ranking_points: 4000, matches_played: 20, tournaments_played: 5 });
  p = await fresh();
  await circuit.processWorldCircuit(p, '2026-01-11', '2026-01-12');
  p = await fresh();
  const canonical = await rt.padel.getWorldRank(p);
  await check('posição gravada = posição canônica da tela de Ranking (getWorldRank)', () => {
    assert.ok(Number(p.ranking_position) > 0, `ranking_position=${p.ranking_position}`);
    assert.equal(Number(p.ranking_position), canonical.rank);
  });
  await check('gate da loja reflete a nova faixa (raro liberado, rank ≤ 500)', () => {
    assert.ok(Number(p.ranking_position) <= 500);
    assert.equal(store.getShopItemAccess(p, raro).unlocked, true);
  });
  const econ = await rt.load('/src/lib/sportsEconomyV26.js');
  await check('estágio de patrocínio usa a posição gravada (sai do teto "regional")', () => {
    assert.ok(['professional', 'international', 'elite'].includes(econ.getCareerEconomyStage(p)), econ.getCareerEconomyStage(p));
  });

  rt = await reloadCareer(rt, storage, careerId);
  await check('após destroy runtime → reload: posição e gate continuam corretos', async () => {
    const q = await rt.localGame.entities.PlayerProfile.get(p0.id);
    const store2 = await rt.load('/src/lib/storeCatalog.js');
    assert.equal(Number(q.ranking_position), canonical.rank);
    assert.equal(store2.getShopItemAccess(q, store2.normalizeShopItem({ rarity: 'raro', name: 'raro' })).unlocked, true);
  });
} finally {
  await rt.close();
}
finish();
