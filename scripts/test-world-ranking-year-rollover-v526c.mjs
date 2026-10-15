// Playthrough 5.26-C, Bloco A — salto de ranking na virada 2026 → 2027.
// Causa medida (ranking-rollover-before.json): os pontos iniciais do mundo são
// âncoras `legacy_seed` com a MESMA data (1ª semana de circuito). Todas saíam
// da janela no mesmo dia: −64% dos pontos do mundo e o jogador parado subindo
// ~300 posições sem resultado novo. Correção: a âncora perde valor
// linearmente ao longo da janela (rankingWindow.effectiveResultPoints).
// Este teste usa as âncoras REAIS da semeadura do mundo e a regra real
// (computeRollingPoints), dia a dia em torno do vencimento, com o jogador
// congelado em 117 pontos; a regra antiga (valor cheio até expirar) é
// avaliada ao lado para mostrar o penhasco que o teste pega.
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-world-ranking-year-rollover-v526c');
const { rt } = await bootCareer('rank-rollover-test-526c');
try {
  const W = await rt.load('/src/game-core/rankingWindow.js');
  const E = rt.localGame.entities;
  const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  // A semeadura do World acontece no 1º recálculo semanal; força-o pelo
  // caminho real (avanço de dias) até existirem âncoras.
  let profile = (await E.PlayerProfile.list(null, 1))[0];
  let rows = [];
  for (let i = 0; i < 14 && !rows.length; i += 1) {
    const r = await rt.calendar.advanceCareerDays(profile, 1);
    profile = r.profile || await E.PlayerProfile.get(profile.id);
    rows = ((await E.AthleteRankingResult.list(null, 200000)) || []).filter((x) => x.is_legacy_seed || x.finish === 'legacy_seed');
  }
  const byAthlete = W.groupResultsByAthlete(rows);
  const dates = [...new Set(rows.map((r) => r.date))];
  const anchorDate = dates.sort()[0];
  const expiry = add(anchorDate, 365);
  const PLAYER = 117;
  const legacyRolling = (list, date) => list.filter((r) => !W.isResultExpired(r, date)).map((r) => Number(r.points) || 0).sort((a, b) => b - a).slice(0, 22).reduce((a, b) => a + b, 0);
  const day = (date, rule) => {
    const pts = [...byAthlete.values()].map((list) => rule(list, date)).filter((p) => p > 0);
    return { date, world: pts.reduce((a, b) => a + b, 0), playerRank: pts.filter((p) => p > PLAYER).length + 1, ranked: pts.length };
  };
  const window = Array.from({ length: 9 }, (_, i) => add(expiry, i - 4));
  const fixed = window.map((d) => day(d, (list, date) => W.computeRollingPoints(list, [], date)));
  const legacy = window.map((d) => day(d, legacyRolling));
  const maxJump = (s) => Math.max(...s.slice(1).map((x, i) => Math.abs(s[i].playerRank - x.playerRank)));
  // Queda diária relativa ao total INICIAL do mundo (perto do vencimento o
  // total das âncoras já é ~0, e uma razão sobre ele não mede nada).
  const startWorld = day(anchorDate, (l, d) => W.computeRollingPoints(l, [], d)).world;
  const maxDrop = (s) => Math.max(...s.slice(1).map((x, i) => (s[i].world - x.world) / Math.max(1, startWorld)));

  await check(`pré-condição: ${rows.length} âncoras reais, ${dates.length} data(s), vencimento ${expiry}`, () => {
    assert.ok(rows.length > 500);
    assert.ok(expiry >= '2027-01-01' && expiry <= '2027-01-31', 'o vencimento cai na virada do ano');
  });
  await check(`regra antiga reproduz o penhasco (salto ${maxJump(legacy)} posições, queda ${(maxDrop(legacy) * 100).toFixed(0)}% do total inicial)`, () => {
    assert.ok(maxJump(legacy) > 100);
    assert.ok(maxDrop(legacy) > 0.5);
  });
  await check(`regra corrigida: jogador parado não salta (máx ${maxJump(fixed)} posição/dia)`, () => assert.ok(maxJump(fixed) <= 5));
  await check(`regra corrigida: pontos do mundo sem queda brusca (máx ${(maxDrop(fixed) * 100).toFixed(2)}% do total inicial/dia)`, () => assert.ok(maxDrop(fixed) <= 0.01));
  await check('31/12 → 01/01: posição do jogador estável', () => {
    const a = day('2026-12-31', (l, d) => W.computeRollingPoints(l, [], d));
    const b = day('2027-01-01', (l, d) => W.computeRollingPoints(l, [], d));
    assert.ok(Math.abs(a.playerRank - b.playerRank) <= 5, `${a.playerRank} → ${b.playerRank}`);
  });
  await check('ao longo do ano a âncora some gradualmente (mundo em ~50% no meio da janela)', () => {
    const start = day(anchorDate, (l, d) => W.computeRollingPoints(l, [], d)).world;
    const mid = day(add(anchorDate, 182), (l, d) => W.computeRollingPoints(l, [], d)).world;
    assert.ok(mid / start > 0.4 && mid / start < 0.6, `${mid}/${start}`);
  });
} finally {
  await rt.close();
}
finish();
