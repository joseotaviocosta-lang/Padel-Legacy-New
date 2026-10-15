// Playthrough 5.27-I, Bloco A — política do perfil OTIMIZADOR (só harness,
// PL527E_POLICY=v4 = v3 + esta correção; Normal v3 e Casual inalterados).
//
// Causa medida na 5.27-H (5 seeds): o Otimizador renovava sempre que
// `OVR parceiro / OVR jogador ≥ 0,6`, sem olhar o mercado, por 180 dias — com
// jogador 54–64 e parceiro 40–43 a razão ficava ≥ 0,6 e ele renovava com
// 82–91 alcançáveis; quando enfim recusava, continuava inscrevendo torneios
// com o parceiro que estava deixando e a troca só acontecia 155–330 dias depois.
//
// Otimizador = desempenho competitivo sujeito a custo: escolhe pela força da
// dupla resultante entre os parceiros que o caixa sustenta; compatibilidade e
// pontos de ranking só desempatam. Não é "sempre o maior OVR" (salário pesa).
export const OPTIMIZER_V4 = Object.freeze({
  minMonthsCovered: 3, // salário sustentável = caixa cobre ≥ 3 meses
  renewMarginOvr: 8, // renova se o atual estiver a até 8 OVR do melhor alcançável e sustentável
  compatWeight: 0.05, // desempate (100 de compatibilidade = 5 OVR)
  rankWeightCap: 3, // potencial de ranking (pontos mundiais), no máximo 3 OVR
});

export function isAffordable({ coins, salary }, cfg = OPTIMIZER_V4) {
  if (!salary) return true;
  return (Number(coins) || 0) / salary >= cfg.minMonthsCovered;
}

export function optimizerPartnerScore({ candidateOvr, compatibility = 0, worldPoints = 0 }, cfg = OPTIMIZER_V4) {
  return (Number(candidateOvr) || 0) + cfg.compatWeight * (Number(compatibility) || 0) + Math.min(cfg.rankWeightCap, (Number(worldPoints) || 0) / 300);
}

/** Melhor candidato entre os sustentáveis; sem nenhum sustentável, o melhor do mercado (o jogo ainda cobra o salário). */
export function pickOptimizerPartner(rows, { coins, termsOf, ovrOf }, cfg = OPTIMIZER_V4) {
  const scored = rows.map((r) => {
    const t = termsOf(r.candidate) || {};
    const compatibility = Number(r.offer?.compatibility ?? r.offer?.compatibility_snapshot?.total ?? r.offer?.compatibility_score) || 0;
    const worldPoints = Number(r.candidate?.world_ranking_points ?? r.candidate?.ranking_points) || 0;
    return { r, ovr: ovrOf(r.candidate), affordable: isAffordable({ coins, salary: t.monthlySalary }, cfg), s: optimizerPartnerScore({ candidateOvr: ovrOf(r.candidate), compatibility, worldPoints }, cfg) };
  });
  const pool = scored.filter((x) => x.affordable);
  const best = (pool.length ? pool : scored).sort((a, b) => b.s - a.s)[0];
  return best?.r ?? null;
}

/** Renovação: só se o atual estiver a até `renewMarginOvr` do melhor alcançável e sustentável (ou se não houver alternativa sustentável melhor). */
export function optimizerShouldRenew({ currentOvr, market, coins, termsOf, ovrOf }, cfg = OPTIMIZER_V4) {
  const affordable = market.filter((r) => isAffordable({ coins, salary: (termsOf(r.candidate) || {}).monthlySalary }, cfg)).map((r) => ovrOf(r.candidate));
  const bestAffordableOvr = affordable.length ? Math.max(...affordable) : null;
  const renew = bestAffordableOvr == null || (Number(currentOvr) || 0) >= bestAffordableOvr - cfg.renewMarginOvr;
  return { renew, bestAffordableOvr, affordableCount: affordable.length };
}
