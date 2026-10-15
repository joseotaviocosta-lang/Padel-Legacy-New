// Playthrough 5.27-G, Bloco B — pontuação de parceiro do perfil NORMAL (só
// harness). Medido em 25 mercados reais de Busca: escolher só por
// compatibilidade levava a parceiros de OVR mediano 39 com 88–91 disponíveis
// (razão 0,45); "o mais forte sempre" é o Otimizador.
//
// Normal = compatibilidade 50% + força relativa ao PRÓPRIO nível 40% (só
// penaliza parceiro abaixo do jogador: 4 pontos por OVR de diferença) + custo
// 10% (meses de salário que o caixa cobre, 6 = 100, menos a divisão de prêmio
// acima de 50%). Acima do nível do jogador quem decide é compatibilidade/custo.
// OVR = autoridade da UI/motor (média de atributos), nunca o `overall_rating`
// declarado do catálogo.
export const NORMAL_PARTNER_WEIGHTS = Object.freeze({ compatibility: 0.5, levelFit: 0.4, affordability: 0.1 });
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

export function normalPartnerComponents({ compatibility, candidateOvr, playerOvr, coins, salary, prizeSplit }) {
  const months = salary ? (Number(coins) || 0) / salary : 12;
  return {
    compatibility: clamp(compatibility),
    levelFit: clamp(100 - 4 * Math.max(0, (Number(playerOvr) || 0) - (Number(candidateOvr) || 0))),
    affordability: clamp((100 * months) / 6 - Math.max(0, (prizeSplit ?? 50) - 50) * 2),
  };
}
export function normalPartnerScore(input) {
  const c = normalPartnerComponents(input);
  return Object.entries(NORMAL_PARTNER_WEIGHTS).reduce((s, [k, w]) => s + w * c[k], 0);
}
