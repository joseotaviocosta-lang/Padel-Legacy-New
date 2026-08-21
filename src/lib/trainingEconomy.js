// M4.2.1 (docs/MOBILE_M4_2_1_TRAINING_ECONOMY.md, Parte 3/4/5/40/41).
//
// Fonte única de custo de treino — usada pela UI (TrainingActivityCard,
// preview ao vivo) e pela execução real (executeTraining) através da MESMA
// função, nunca calculada duas vezes (Parte 41).
//
// Auditoria (Parte 1) confirmou: treino hoje paga uma moeda fixa por
// atividade (`focus().coins = 10`) independente de intensidade/estágio —
// um incentivo puramente positivo (evolui E paga). A Parte 2 pede pra
// remover esse pagamento; a Parte 3/4 pede um CUSTO em vez disso, numa
// curva simples e previsível (baseCost × intensityMultiplier), sem
// hardcodar valores sem medir primeiro. Os valores abaixo são a hipótese
// inicial, calibrada contra dados reais já existentes (não inventados):
// carreira nova começa com 5000 moedas (localSeed.js), prêmio de 1ª rodada
// Silver é 15 moedas (career.js TIER_REWARD_TABLES), patrocinador Bronze
// paga ~1500-2000/mês (sponsors.js). Confirmados/ajustados só depois da
// simulação real (scripts/test-training-economy-balance-m4-2-1.mjs, Parte
// 39/40) — se a simulação não indicar problema, ficam como estão.
//
// Parte 5: custo acompanha o ESTÁGIO de carreira, reaproveitando
// getCareerEconomyStage (sportsEconomyV26.js) — a mesma taxonomia de 5
// estágios já usada por mercado de treinadores/patrocinadores e pela Fase
// 13 — nunca um segundo conceito de estágio paralelo.
import { getCareerEconomyStage } from './sportsEconomyV26.js';

export const TRAINING_BASE_COST_BY_STAGE = Object.freeze({
  beginner: 20,
  regional: 30,
  professional: 45,
  international: 65,
  elite: 90,
});

// Parte 4/8: mesma curva conceitual sugerida no briefing — leve mais barato
// e menos ganho, intenso mais caro e mais ganho (TRAINING_INTENSITIES em
// trainingCatalog.js já define gainMult/energyCost/fatigueCost nessa mesma
// proporção; o custo segue o mesmo espírito, não uma escala nova).
export const TRAINING_COST_INTENSITY_MULTIPLIER = Object.freeze({
  leve: 0.7,
  moderado: 1.0,
  intenso: 1.4,
});

/**
 * Custo em moedas de UMA sessão de treino, dado o estágio de carreira do
 * atleta e a intensidade escolhida. Pura e síncrona (Parte 19) — nenhuma
 * leitura de storage, nenhum efeito colateral.
 */
export function getTrainingCost(profile, intensityId = 'moderado') {
  const stage = getCareerEconomyStage(profile);
  const base = TRAINING_BASE_COST_BY_STAGE[stage] ?? TRAINING_BASE_COST_BY_STAGE.beginner;
  const multiplier = TRAINING_COST_INTENSITY_MULTIPLIER[intensityId] ?? TRAINING_COST_INTENSITY_MULTIPLIER.moderado;
  return Math.max(0, Math.round(base * multiplier));
}
